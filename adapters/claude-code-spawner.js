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
function buildClaudeArgs(provider, prompt, { model, extraArgs = [] } = {}) {
  const isSkill = provider && provider.type === 'skill';
  const finalPrompt = isSkill ? `/${provider.name}\n${prompt}` : prompt;
  const args = ['-p', finalPrompt, '--output-format', 'json'];
  if (provider && provider.type === 'agent' && provider.name && provider.name !== 'claude') {
    args.push('--agent', provider.name);
  }
  if (model) args.push('--model', model);
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
  return async function spawn({ type, provider, prompt }) {
    const effectiveProvider = provider || { type: 'agent', name: 'claude' };
    const args = buildClaudeArgs(effectiveProvider, prompt, { model });
    const stdout = await Promise.resolve(exec('claude', args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }));
    const payload = parseClaudeResult(stdout);
    // Normalize the minimal shapes the pipeline asserts per stage.
    if (type === 'reviewer' && payload.approved === undefined) {
      return { reviewer: effectiveProvider.name, approved: false, findings: payload.findings || [] };
    }
    return payload;
  };
}

// Convenience: build the full seam bundle for executePipeline().
function makeClaudeCodeSeams({ exec = defaultExec, model } = {}) {
  return {
    runner: makeGitRunner({ exec }),
    gh: makeGhRunner({ exec }),
    spawn: makeClaudeSpawner({ exec, model }),
  };
}

module.exports = { makeGitRunner, makeGhRunner, makeClaudeSpawner, makeClaudeCodeSeams, buildClaudeArgs, parseClaudeResult, defaultExec };
