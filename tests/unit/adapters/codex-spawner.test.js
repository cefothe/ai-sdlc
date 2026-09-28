const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const codex = require(path.join(ROOT, 'adapters', 'codex-spawner.js'));
const { makeHarnessSpawner } = require(path.join(ROOT, 'adapters', 'claude-code-spawner.js'));

// A realistic `codex exec --json` transcript (JSONL), matching the observed
// 0.158.0 event shape: the final assistant message is the last item.completed
// event whose item.type === 'agent_message'.
function jsonl(agentText) {
  return [
    '{"type":"thread.started","thread_id":"t1"}',
    '{"type":"turn.started"}',
    `{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":${JSON.stringify(agentText)}}}`,
    '{"type":"turn.completed","usage":{"output_tokens":17}}',
    '',
  ].join('\n');
}

describe('buildCodexArgs', () => {
  test('reviewer runs read-only, headless JSON, skips the repo check, sets the model', () => {
    const args = codex.buildCodexArgs({ type: 'agent', name: 'code-reviewer', harness: 'codex' }, 'review this', { type: 'reviewer', model: 'gpt-5-codex' });
    expect(args[0]).toBe('exec');
    expect(args).toEqual(expect.arrayContaining(['--json', '--skip-git-repo-check', '-s', 'read-only', '-m', 'gpt-5-codex']));
    // role system context is prepended to the pipeline prompt
    expect(args[1]).toMatch(/INDEPENDENT cross-harness reviewer/);
    expect(args[1]).toMatch(/review this$/);
  });

  test('a developer gets a workspace-write sandbox (it mutates the worktree)', () => {
    const args = codex.buildCodexArgs({ name: 'claude' }, 'build it', { type: 'developer' });
    const i = args.indexOf('-s');
    expect(args[i + 1]).toBe('workspace-write');
  });

  test('explicit sandbox override wins', () => {
    const args = codex.buildCodexArgs({ name: 'x' }, 'p', { type: 'reviewer', sandbox: 'danger-full-access' });
    expect(args[args.indexOf('-s') + 1]).toBe('danger-full-access');
  });

  test('reasoningEffort maps to a -c model_reasoning_effort config override', () => {
    const args = codex.buildCodexArgs({ name: 'x' }, 'p', { type: 'reviewer', reasoningEffort: 'high' });
    const i = args.indexOf('-c');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('model_reasoning_effort="high"');
  });

  test('no reasoningEffort -> no -c flag (codex default)', () => {
    expect(codex.buildCodexArgs({ name: 'x' }, 'p', { type: 'reviewer' })).not.toContain('-c');
  });

  test('no model id is forced by default (ChatGPT accounts reject -m)', () => {
    expect(codex.buildCodexArgs({ name: 'x' }, 'p', { type: 'reviewer' })).not.toContain('-m');
  });
});

describe('parseCodexResult', () => {
  test('extracts + JSON-parses the final agent_message', () => {
    const out = jsonl('{"reviewer":"code-reviewer","approved":true,"findings":[],"summary":"ok"}');
    expect(codex.parseCodexResult(out)).toMatchObject({ reviewer: 'code-reviewer', approved: true, summary: 'ok' });
  });

  test('takes the LAST agent_message when several are emitted', () => {
    const out = [
      '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"approved\\":false}"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"approved\\":true}"}}',
    ].join('\n');
    expect(codex.parseCodexResult(out)).toEqual({ approved: true });
  });

  test('tolerates a flat agent_message shape', () => {
    const out = '{"type":"agent_message","message":"{\\"approved\\":true}"}';
    expect(codex.parseCodexResult(out)).toEqual({ approved: true });
  });

  test('unwraps JSON in ```json fences', () => {
    const out = jsonl('```json\n{"approved":true,"findings":[]}\n```');
    expect(codex.parseCodexResult(out)).toMatchObject({ approved: true });
  });

  test('non-JSON final message falls back to { summary }', () => {
    const out = jsonl('Looks fine to me.');
    expect(codex.parseCodexResult(out)).toEqual({ summary: 'Looks fine to me.' });
  });

  test('no structured events at all -> { summary } from raw stdout', () => {
    expect(codex.parseCodexResult('total gibberish, not jsonl')).toEqual({ summary: 'total gibberish, not jsonl' });
  });
});

describe('normalizeReviewerVerdict', () => {
  test('stamps harness codex, coerces approved, defaults findings, keeps summary', () => {
    const v = codex.normalizeReviewerVerdict({ approved: 1, summary: 's' }, { name: 'security-reviewer' });
    expect(v).toEqual({ reviewer: 'security-reviewer', approved: true, findings: [], summary: 's', harness: 'codex' });
  });

  test('non-object verdict -> a safe non-approving verdict', () => {
    const v = codex.normalizeReviewerVerdict(undefined, { name: 'test-reviewer' });
    expect(v).toEqual({ reviewer: 'test-reviewer', approved: false, findings: [], harness: 'codex' });
  });
});

describe('makeCodexSpawner', () => {
  test('reviewer dispatch shells codex exec and returns a canonical codex verdict', async () => {
    const calls = [];
    const exec = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return jsonl('{"reviewer":"code-reviewer","approved":true,"findings":[]}'); };
    const spawn = codex.makeCodexSpawner({ exec, model: 'gpt-5-codex' });
    const out = await spawn({ type: 'reviewer', provider: { name: 'code-reviewer', harness: 'codex' }, prompt: 'diff…' });
    expect(out).toEqual({ reviewer: 'code-reviewer', approved: true, findings: [], harness: 'codex' });
    expect(calls[0].cmd).toBe('codex');
    // stdin is closed so headless codex does not block on piped input
    expect(calls[0].opts.input).toBe('');
  });

  test('a broken reviewer reply still yields a non-approving verdict (fail-closed)', async () => {
    const exec = () => jsonl('I could not complete the review.');
    const spawn = codex.makeCodexSpawner({ exec });
    const out = await spawn({ type: 'reviewer', provider: { name: 'code-reviewer', harness: 'codex' }, prompt: 'd' });
    expect(out).toMatchObject({ approved: false, harness: 'codex' });
  });
});

describe('makeHarnessSpawner (router)', () => {
  test('routes by provider.harness; absent harness -> claude fallback', async () => {
    const seen = [];
    const claude = async (o) => { seen.push('claude'); return { ok: 'claude', ...o }; };
    const codexSpawn = async (o) => { seen.push('codex'); return { ok: 'codex', ...o }; };
    const spawn = makeHarnessSpawner({ spawners: { claude, codex: codexSpawn } });

    await spawn({ type: 'reviewer', provider: { name: 'r', harness: 'codex' }, prompt: 'x' });
    await spawn({ type: 'developer', provider: { name: 'claude', harness: 'claude' }, prompt: 'y' });
    await spawn({ type: 'plan', provider: { name: 'code-plan' }, prompt: 'z' }); // no harness -> fallback

    expect(seen).toEqual(['codex', 'claude', 'claude']);
  });

  test('throws when a harness has no spawner and no fallback exists', async () => {
    const spawn = makeHarnessSpawner({ spawners: { codex: async () => ({}) }, fallbackHarness: 'claude' });
    await expect(spawn({ provider: { harness: 'gemini' } })).rejects.toThrow(/no spawner registered/);
  });
});
