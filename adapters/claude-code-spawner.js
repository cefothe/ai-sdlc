// Claude Code adapter — binds the pipeline's injected seams (spawn / runner /
// gh) to real tools so executePipeline() can run unattended (CI / cron / the
// autonomous orchestrator). In an INTERACTIVE Claude Code session the operator
// instead runs the /ai-sdlc:execute slash command, which dispatches the same
// stages via the Task tool (and Native Teams for the 3-reviewer stage).
//
//   makeGitRunner({ exec })    -> runner(args,{cwd}) for git (Step 3/11)
//   makeGhRunner({ exec })     -> gh(args) for PR creation (Step 11/12)
//   makeClaudeSpawner({ exec }) -> async spawn({type,provider,prompt}) that maps
//        a CapabilityMap provider to a `claude -p` invocation and parses the
//        agent's JSON return into the shape the pipeline expects.
//
// `exec(cmd, args, opts) -> stdout | Promise<stdout>` is injected so the whole
// adapter is unit-testable without spawning claude. git/gh stay synchronous
// (steps.js consumes their stdout inline); the agent spawners default to the
// non-blocking asyncExec so Promise.all over a panel/team truly runs in parallel.

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { makeCodexSpawner } = require('./codex-spawner');
const { asyncExec } = require('./async-exec');

// MCP servers every headless agent gets regardless of its stage grant — cxpak is
// the mandated pre-action context source (CLAUDE.md "Context Acquisition").
const ALWAYS_MCP = ['cxpak'];

function defaultExec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function makeGitRunner({ exec = defaultExec } = {}) {
  return (args, opts = {}) => ({ stdout: exec('git', args, opts) });
}

function makeGhRunner({ exec = defaultExec } = {}) {
  return (args, opts = {}) => ({ stdout: exec('gh', args, opts) });
}

// Build the argv for a `claude -p` headless call from a provider + prompt.
// Contract (adjust to your claude version if flags differ):
//   - agent provider -> `--agent <name>` selects the specialized subagent
//   - skill provider -> the prompt is prefixed with `/<skill>` so the session
//     invokes that skill
//   - JSON output is requested so we can parse a structured return
function buildClaudeArgs(provider, prompt, { model, extraArgs = [], tools = [], mcpConfig } = {}) {
  const isSkill = provider && provider.type === 'skill';
  const finalPrompt = isSkill ? `/${provider.name}\n${prompt}` : prompt;
  const args = ['-p', finalPrompt, '--output-format', 'json'];
  if (provider && provider.type === 'agent' && provider.name && provider.name !== 'claude') {
    args.push('--agent', provider.name);
  }
  if (model) args.push('--model', model);
  // Per-stage external-capability grant -> pre-approved tool allowlist. Passing
  // the granted MCP servers (mcp__firecrawl, mcp__postgres-ro), web tools, and
  // Skill invoker as --allowedTools is what actually lets a headless design/review
  // agent call them without a permission prompt. Empty grant -> no restriction added.
  if (Array.isArray(tools) && tools.length) args.push('--allowedTools', tools.join(','));
  // Per-stage MCP scoping: a headless `claude -p` otherwise boots EVERY server in
  // .mcp.json + the plugin (npx firecrawl, uv clickhouse, postgres…) on each
  // spawn, paying their cold start even when the stage can't use them.
  // --strict-mcp-config + an inline config limits it to the granted subset.
  // ${VAR} placeholders are left unexpanded — Claude Code expands them from the
  // child's env, so no secret ever lands in argv.
  if (mcpConfig) args.push('--strict-mcp-config', '--mcp-config', JSON.stringify(mcpConfig));
  return args.concat(extraArgs);
}

// Load MCP server definitions from .mcp.json files (later files win on a name
// clash, so pass plugin-level first and project-level last). Missing or
// unparseable files are skipped — scoping then simply has fewer servers to offer.
function loadMcpServers(paths = []) {
  const servers = {};
  for (const p of paths) {
    if (!p || !existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      Object.assign(servers, (raw && raw.mcpServers) || {});
    } catch {
      /* malformed .mcp.json — skip it */
    }
  }
  return servers;
}

// The MCP subset a spawn is entitled to: servers named by its tool grant
// (`mcp__<server>` or `mcp__<server>__<tool>`) plus ALWAYS_MCP, restricted to
// servers that are actually defined. Returns { mcpServers } (possibly empty —
// an empty strict config is the point: a stage with no grant boots no servers).
function scopeMcpConfig(servers, tools = [], always = ALWAYS_MCP) {
  const wanted = new Set(always);
  for (const t of tools || []) {
    const m = /^mcp__(.+?)(?:__|$)/.exec(t);
    if (m) wanted.add(m[1]);
  }
  const mcpServers = {};
  for (const name of wanted) if (servers[name]) mcpServers[name] = servers[name];
  return { mcpServers };
}

// Parse claude -p --output-format json. The outer envelope carries a `result`
// string; the agent's structured payload is JSON inside it. Falls back
// gracefully so a non-JSON agent reply still surfaces as { summary }.
function parseClaudeResult(stdout) {
  let outer;
  try {
    outer = JSON.parse(stdout);
  } catch {
    return { summary: String(stdout || '').trim() };
  }
  // Already the structured payload?
  if (outer && (outer.commitSha || outer.approved !== undefined || outer.plan)) return outer;
  const inner = outer && typeof outer.result === 'string' ? outer.result : null;
  if (inner === null) return outer;
  try {
    return JSON.parse(inner);
  } catch {
    return { summary: inner.trim() };
  }
}

// mcpServers: server definitions (loadMcpServers) to scope per spawn; null keeps
// the legacy behavior (the child loads every configured server).
function makeClaudeSpawner({ exec = asyncExec, model, timeoutMs = 600000, mcpServers = null, alwaysMcp = ALWAYS_MCP } = {}) {
  return async function spawn({ type, provider, prompt, tools, cwd }) {
    const effectiveProvider = provider || { type: 'agent', name: 'claude' };
    const mcpConfig = mcpServers ? scopeMcpConfig(mcpServers, tools, alwaysMcp) : undefined;
    const args = buildClaudeArgs(effectiveProvider, prompt, { model, tools, mcpConfig });
    // cwd roots the agent in the worktree so the implementer mutates the right
    // tree and a reviewer can read every file in the change. Omitted -> process cwd.
    const execOpts = { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 };
    if (cwd) execOpts.cwd = cwd;
    const stdout = await Promise.resolve(exec('claude', args, execOpts));
    const payload = parseClaudeResult(stdout);
    // Normalize the minimal shapes the pipeline asserts per stage.
    if (type === 'reviewer' && payload.approved === undefined) {
      return { reviewer: effectiveProvider.name, approved: false, findings: payload.findings || [] };
    }
    return payload;
  };
}

// Harness router — the seam that makes `harness: codex` real. Each resolved
// provider carries a `harness` (claude | codex …); this dispatcher sends the
// spawn to the matching CLI spawner so a codex reviewer physically runs on
// Codex (not on claude). Without this, the cross-harness attestation is
// cryptographically checkable but not physically true. Unknown/absent harness
// falls back to the claude spawner (the default implementer harness).
function makeHarnessSpawner({ spawners, fallbackHarness = 'claude' } = {}) {
  if (!spawners || typeof spawners !== 'object') throw new Error('makeHarnessSpawner requires a spawners map');
  return async function spawn(opts = {}) {
    const provider = opts.provider || {};
    const harness = provider.harness || fallbackHarness;
    const target = spawners[harness] || spawners[fallbackHarness];
    if (!target) throw new Error(`no spawner registered for harness "${harness}" (and no "${fallbackHarness}" fallback)`);
    return target(opts);
  };
}

// Fetch token-budgeted pre-action context for the implementer via cxpak — the
// UNATTENDED counterpart to the interactive step-4c `cxpak_context` call. The
// pipeline itself stays pure; this seam does the I/O. Uses the `cxpak overview`
// CLI (the `overview` capability): a one-shot, token-budgeted structural summary
// (architecture, module map, conventions) — the R8 d=1.82 lever. Requires `cxpak`
// on PATH and a built `.cxpak/` index (init / SessionStart warm it). Any failure,
// or a cold "indexing" index, degrades to null — advisory, never blocks the run.
function makeCxpakFetcher({ exec = defaultExec, workDir = process.cwd(), tokens = '6k' } = {}) {
  return async function fetchCxpak(task) {
    let text = '';
    try {
      text = String(exec('cxpak', ['overview', '--tokens', tokens], { cwd: workDir, timeout: 60000 }) || '');
    } catch (err) {
      // execFileSync throws on a non-zero exit but still exposes captured stdout.
      text = String((err && err.stdout) || '');
    }
    text = text.trim();
    if (!text || /indexing in progress/i.test(text)) return null;
    const title = task && task.frontmatter && task.frontmatter.title;
    const header = title
      ? `Structured context (cxpak overview) — read before implementing "${title}":`
      : 'Structured context (cxpak overview):';
    return `${header}\n\n${text}`;
  };
}

// Load the ADRs an implementer must honor for a task (project-scope + task-
// referenced DECs) from the on-disk decision store. The UNATTENDED counterpart
// to execute.md's "load architectural decisions" step. Any failure degrades to
// an empty set — advisory input, never blocks the run.
// Returns the relevance partition { selected, omitted } (see
// partitionDecisionsForTask) — formatDecisionsContext renders both.
function makeDecisionsFetcher({ root = process.cwd() } = {}) {
  const { partitionDecisionsForTask } = require('../decision-engine/decisions');
  return async function fetchDecisions(task) {
    try {
      return partitionDecisionsForTask(root, task);
    } catch {
      return { selected: [], omitted: [] };
    }
  };
}

// Convenience: build the full seam bundle for executePipeline(). The `spawn`
// seam is harness-aware: claude-harness providers (implementer + advisory
// stages) run on `claude -p`; codex-harness providers (the cross-harness review
// team) run on `codex exec`. codexModel overrides the Codex model.
//
// `exec` (when injected, e.g. by tests) drives everything; otherwise git/gh use
// the synchronous runner and the agent spawners the non-blocking one.
// scopeMcp (default true) boots only each stage's granted MCP servers.
function makeClaudeCodeSeams({ exec, model, codexModel, codexReasoningEffort = 'high', workDir, scopeMcp = true, pluginRoot = join(__dirname, '..') } = {}) {
  const syncExec = exec || defaultExec;
  const agentExec = exec || asyncExec;
  const root = workDir || process.cwd();
  const mcpServers = scopeMcp ? loadMcpServers([join(pluginRoot, '.mcp.json'), join(root, '.mcp.json')]) : null;
  const claudeSpawn = makeClaudeSpawner({ exec: agentExec, model, mcpServers });
  // codexModel stays unset by default — a ChatGPT-login account rejects explicit
  // models (HTTP 400). codexReasoningEffort defaults to 'high': reviewers are the
  // only codex-harness stage and Codex's own default effort ('none') is too weak
  // to reliably surface bugs. This knob IS allowed on a ChatGPT account.
  const codexSpawn = makeCodexSpawner({ exec: agentExec, model: codexModel, reasoningEffort: codexReasoningEffort });
  return {
    runner: makeGitRunner({ exec: syncExec }),
    gh: makeGhRunner({ exec: syncExec }),
    spawn: makeHarnessSpawner({ spawners: { claude: claudeSpawn, codex: codexSpawn } }),
    fetchCxpak: makeCxpakFetcher({ exec: syncExec, workDir }),
    fetchDecisions: makeDecisionsFetcher({ root }),
  };
}

module.exports = { makeGitRunner, makeGhRunner, makeClaudeSpawner, makeHarnessSpawner, makeCxpakFetcher, makeDecisionsFetcher, makeClaudeCodeSeams, buildClaudeArgs, parseClaudeResult, loadMcpServers, scopeMcpConfig, defaultExec, ALWAYS_MCP };
