// Codex CLI spawner — the cross-harness counterpart to makeClaudeSpawner.
//
// The framework declares reviewers with `harness: codex` and enforces (at
// resolve time + cryptographically in attestation) that a reviewer never shares
// the implementer's harness. That guarantee is only *real* if codex-harness
// providers are actually executed on Codex. This adapter is that execution path:
// it shells out to `codex exec` (the headless entrypoint) exactly the way
// makeClaudeSpawner shells `claude -p`, then normalizes Codex's JSONL output
// into the same envelopes the pipeline already consumes.
//
// Mirrors the reference CodexHarnessAdapter (ai-sdlc-framework/ai-sdlc,
// pipeline-cli/src/runtime/spawners/codex-harness.ts): per-role system context,
// tolerant JSON extraction (Codex sometimes wraps JSON in ```json fences), and
// a canonical reviewer verdict stamped `harness: 'codex'` so Step 8 attribution
// is unambiguous.
//
//   makeCodexSpawner({ exec, model }) -> async spawn({ type, provider, prompt })
//
// `exec(cmd, args, opts) -> stdout` is injected (default execFileSync) so the
// adapter is unit-testable without a real Codex install (CI / contributor
// laptops never invoke codex).

const { execFileSync } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min, matches the claude spawner
// No forced default model. On a ChatGPT-login account Codex FIXES the model by
// plan and rejects every explicit `-m`/`-c model=` with HTTP 400 ("not supported
// when using Codex with a ChatGPT account") — so passing a model there BREAKS
// dispatch. Leaving it unset uses the account default (verified: `gpt-6-astra`).
// Only set `model` on an API-key account that genuinely supports selection.
const DEFAULT_MODEL = undefined;
// Reasoning effort IS adjustable on a ChatGPT account (unlike the model) via
// `-c model_reasoning_effort=<v>`. Codex defaults to `none`; reviewers benefit
// from more. Unset here -> codex default; callers opt in (e.g. 'high' for review).
const DEFAULT_REASONING_EFFORT = undefined;

function defaultExec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

// Short per-stage role context prepended to the pipeline-built prompt. The user
// prompt already carries the task spec / diff / JSON return contract; these lines
// only reinforce role semantics + "emit raw JSON, no prose/fences" so Codex's
// output parses on the first try. Reviewers additionally get the `harness: codex`
// marker the verdict aggregator expects.
const CODEX_SYSTEM_PROMPTS = {
  developer:
    'You are the AI-SDLC developer agent running on the Codex CLI. Implement the task inside the worktree, verify, and commit. ' +
    'Your FINAL message MUST be a single JSON object matching the developer return contract (commitSha, filesChanged, filesChangedExternal, verifications, summary) — no prose, no markdown fences.',
  reviewer:
    'You are an INDEPENDENT cross-harness reviewer running on the Codex CLI (a different harness than the implementer). ' +
    'Review the diff on its merits. Your FINAL message MUST be a single JSON object: ' +
    '{ "reviewer": string, "approved": boolean, "findings": [{ "severity", "file", "line", "message" }], "summary": string, "harness": "codex" }. ' +
    'Severities: critical, major, minor, suggestion. No prose, no markdown fences around the JSON.',
  design:
    'You are an AI-SDLC architect running on the Codex CLI. Return your high-level proposal as structured text.',
  plan:
    'You are the AI-SDLC planner running on the Codex CLI. Return the implementation plan as structured text.',
};

// Build argv for a headless `codex exec` call.
//   - prompt is prefixed with the role system context (Codex has no --agent).
//   - --json         : emit events as JSONL (we parse the final agent_message).
//   - -s <sandbox>   : read-only for reviewers/advisory stages; workspace-write
//                      only for a developer (which mutates the worktree).
//   - --skip-git-repo-check : the worktree may not look like a repo root to Codex.
//   - -m <model>     : the Codex model (default gpt-5-codex).
function buildCodexArgs(provider, prompt, { model = DEFAULT_MODEL, reasoningEffort = DEFAULT_REASONING_EFFORT, type, sandbox } = {}) {
  const system = CODEX_SYSTEM_PROMPTS[type] || '';
  const finalPrompt = system ? `${system}\n\n${prompt}` : prompt;
  const box = sandbox || (type === 'developer' ? 'workspace-write' : 'read-only');
  const args = ['exec', finalPrompt, '--json', '--skip-git-repo-check', '-s', box];
  if (model) args.push('-m', model); // omitted -> codex uses the account default
  if (reasoningEffort) args.push('-c', `model_reasoning_effort="${reasoningEffort}"`);
  return args;
}

// Tolerant JSON extraction over a message body. Codex agents occasionally wrap
// JSON in ```json … ``` fences despite the system prompt; try raw first, then a
// single fenced block. Returns undefined when nothing parses.
function tryParseJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\n?([\s\S]+?)```/);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

// Parse `codex exec --json` stdout (JSONL). The final assistant message is the
// last event whose item is an agent_message; we take its text and JSON-parse it.
// Falls back gracefully so a non-JSON reply still surfaces as { summary }.
function parseCodexResult(stdout) {
  const lines = String(stdout || '').split('\n');
  let lastMessage = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t || t[0] !== '{') continue;
    let ev;
    try { ev = JSON.parse(t); } catch { continue; }
    // Newer shape: { type: 'item.completed', item: { type: 'agent_message', text } }
    if (ev && ev.item && ev.item.type === 'agent_message' && typeof ev.item.text === 'string') {
      lastMessage = ev.item.text;
    // Older/flat shape: { type: 'agent_message', text | message }
    } else if (ev && ev.type === 'agent_message' && typeof (ev.text || ev.message) === 'string') {
      lastMessage = ev.text || ev.message;
    }
  }
  if (!lastMessage) {
    // No structured event (e.g. non-JSON run) — treat the whole stdout as text.
    const parsed = tryParseJson(stdout);
    return parsed !== undefined ? parsed : { summary: String(stdout || '').trim() };
  }
  const parsed = tryParseJson(lastMessage);
  return parsed !== undefined ? parsed : { summary: lastMessage.trim() };
}

// Normalize whatever a Codex reviewer returned into the canonical verdict the
// aggregator (Step 8) consumes. Stamps harness: 'codex', coerces approved to a
// boolean, defaults findings to [], preserves summary + reviewer name.
function normalizeReviewerVerdict(parsed, provider) {
  const name = (provider && (provider.name || provider.role)) || 'reviewer';
  if (!parsed || typeof parsed !== 'object') {
    return { reviewer: name, approved: false, findings: [], harness: 'codex' };
  }
  return {
    // Attribution comes from the resolved provider (the pipeline's role identity),
    // never the model's self-label — codex tends to name itself "Codex".
    reviewer: name,
    approved: !!parsed.approved,
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    ...(typeof parsed.summary === 'string' ? { summary: parsed.summary } : {}),
    harness: 'codex',
  };
}

function makeCodexSpawner({ exec = defaultExec, model = DEFAULT_MODEL, reasoningEffort = DEFAULT_REASONING_EFFORT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return async function spawn({ type, provider, prompt, sandbox }) {
    const effectiveProvider = provider || { type: 'agent', name: 'codex' };
    const args = buildCodexArgs(effectiveProvider, prompt, { model, reasoningEffort, type, sandbox });
    // input:'' closes Codex's stdin immediately so headless `codex exec` does not
    // block waiting for piped input (it reads the prompt from argv instead).
    const stdout = await Promise.resolve(
      exec('codex', args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, input: '' }),
    );
    const payload = parseCodexResult(stdout);
    if (type === 'reviewer') return normalizeReviewerVerdict(payload, effectiveProvider);
    return payload;
  };
}

module.exports = {
  makeCodexSpawner, buildCodexArgs, parseCodexResult, tryParseJson,
  normalizeReviewerVerdict, defaultExec, CODEX_SYSTEM_PROMPTS,
  DEFAULT_CODEX_MODEL: DEFAULT_MODEL, // undefined -> codex account default
};
