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
// `exec(cmd, args, opts) -> stdout` is injected (default: child_process
// execFileSync) so the whole adapter is unit-testable without spawning claude.

const { execFileSync } = require('node:child_process');
const { makeCodexSpawner } = require('./codex-spawner');

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
function buildClaudeArgs(provider, prompt, { model, extraArgs = [], tools = [] } = {}) {
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
  return args.concat(extraArgs);
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

function makeClaudeSpawner({ exec = defaultExec, model, timeoutMs = 600000 } = {}) {
  return async function spawn({ type, provider, prompt, tools, cwd }) {
    const effectiveProvider = provider || { type: 'agent', name: 'claude' };
    const args = buildClaudeArgs(effectiveProvider, prompt, { model, tools });
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
function makeDecisionsFetcher({ root = process.cwd() } = {}) {
  const { selectDecisionsForTask } = require('../decision-engine/decisions');
  return async function fetchDecisions(task) {
    try {
      return selectDecisionsForTask(root, task);
    } catch {
      return [];
    }
  };
}

// Convenience: build the full seam bundle for executePipeline(). The `spawn`
// seam is harness-aware: claude-harness providers (implementer + advisory
// stages) run on `claude -p`; codex-harness providers (the cross-harness review
// team) run on `codex exec`. codexModel overrides the Codex model.
function makeClaudeCodeSeams({ exec = defaultExec, model, codexModel, codexReasoningEffort = 'high', workDir } = {}) {
  const claudeSpawn = makeClaudeSpawner({ exec, model });
  // codexModel stays unset by default — a ChatGPT-login account rejects explicit
  // models (HTTP 400). codexReasoningEffort defaults to 'high': reviewers are the
  // only codex-harness stage and Codex's own default effort ('none') is too weak
  // to reliably surface bugs. This knob IS allowed on a ChatGPT account.
  const codexSpawn = makeCodexSpawner({ exec, model: codexModel, reasoningEffort: codexReasoningEffort });
  return {
    runner: makeGitRunner({ exec }),
    gh: makeGhRunner({ exec }),
    spawn: makeHarnessSpawner({ spawners: { claude: claudeSpawn, codex: codexSpawn } }),
    fetchCxpak: makeCxpakFetcher({ exec, workDir }),
    fetchDecisions: makeDecisionsFetcher({ root: workDir || process.cwd() }),
  };
}

module.exports = { makeGitRunner, makeGhRunner, makeClaudeSpawner, makeHarnessSpawner, makeCxpakFetcher, makeDecisionsFetcher, makeClaudeCodeSeams, buildClaudeArgs, parseClaudeResult, defaultExec };
