const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { waitForGithubChecks, parseChecks } = require(path.join(ROOT, 'decision-engine', 'ci-checks.js'));

// Scripted proc: `pr view` / `pr create` / `push` answers are fixed; `pr checks`
// replays a sequence of polls (last one repeats).
function scripted({ view = { code: 0, stdout: JSON.stringify({ url: 'https://gh/pr/1', state: 'OPEN' }) }, create, push, polls = [] } = {}) {
  const calls = [];
  let poll = 0;
  const proc = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (cmd === 'git') return push || { code: 0, stdout: '' };
    if (args[1] === 'view') return view;
    if (args[1] === 'create') return create || { code: 0, stdout: 'https://gh/pr/9\n' };
    if (args[1] === 'checks') {
      const p = polls[Math.min(poll, polls.length - 1)];
      poll++;
      return { code: 0, stdout: JSON.stringify(p) };
    }
    return { code: 1, stdout: '', stderr: 'unexpected' };
  };
  return { proc, calls };
}

// Deterministic clock: every sleep advances time by the slept amount.
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

describe('waitForGithubChecks', () => {
  test('passes once every check is pass/skipping', async () => {
    const { proc } = scripted({ polls: [[{ name: 'go', bucket: 'pending' }], [{ name: 'go', bucket: 'pass' }, { name: 'rust', bucket: 'skipping' }]] });
    const r = await waitForGithubChecks({ proc, ...clock(), intervalMs: 10 });
    expect(r.passed).toBe(true);
    expect(r.finding).toMatch(/CI green on https:\/\/gh\/pr\/1 \(2 checks\)/);
  });

  test('fails fast on a failed check and names it with its link', async () => {
    const { proc } = scripted({ polls: [[{ name: 'go', bucket: 'pending' }, { name: 'trading', bucket: 'fail', workflow: 'ci', link: 'https://gh/run/5' }]] });
    const r = await waitForGithubChecks({ proc, ...clock() });
    expect(r.passed).toBe(false);
    expect(r.finding).toMatch(/trading/);
    expect(r.output).toBe('ci / trading: https://gh/run/5');
  });

  test('times out while checks stay pending', async () => {
    const { proc } = scripted({ polls: [[{ name: 'go', bucket: 'pending' }]] });
    const r = await waitForGithubChecks({ proc, ...clock(), intervalMs: 1000, timeoutMs: 5000 });
    expect(r.passed).toBe(false);
    expect(r.finding).toMatch(/still pending/);
  });

  test('fails when no checks ever appear', async () => {
    const { proc } = scripted({ polls: [[]] });
    const r = await waitForGithubChecks({ proc, ...clock(), intervalMs: 1000, appearTimeoutMs: 3000 });
    expect(r.passed).toBe(false);
    expect(r.finding).toMatch(/no CI checks appeared/);
  });

  test('without draftPr and no open PR -> explains, never creates one', async () => {
    const { proc, calls } = scripted({ view: { code: 1, stdout: '', stderr: 'no pull requests found' } });
    const r = await waitForGithubChecks({ proc, ...clock() });
    expect(r.passed).toBe(false);
    expect(r.finding).toMatch(/no open PR/);
    expect(calls.some((c) => c.includes('pr create'))).toBe(false);
  });

  test('push + draftPr opt-ins push the branch and open a draft PR', async () => {
    const { proc, calls } = scripted({ view: { code: 1, stdout: '' }, polls: [[{ name: 'go', bucket: 'pass' }]] });
    const r = await waitForGithubChecks({ proc, ...clock(), push: true, draftPr: true, baseBranch: 'main' });
    expect(r.passed).toBe(true);
    expect(calls).toContain('git push -u origin HEAD');
    expect(calls).toContain('gh pr create --draft --fill --base main');
    expect(r.finding).toMatch(/pr\/9/);
  });

  test('a failed push stops before touching PRs', async () => {
    const { proc, calls } = scripted({ push: { code: 1, stdout: '', stderr: 'rejected' } });
    const r = await waitForGithubChecks({ proc, ...clock(), push: true });
    expect(r.passed).toBe(false);
    expect(r.output).toBe('rejected');
    expect(calls.some((c) => c.startsWith('gh'))).toBe(false);
  });

  test('requires a proc runner', async () => {
    await expect(waitForGithubChecks({})).rejects.toThrow(/proc runner/);
  });
});

describe('parseChecks', () => {
  test('null on non-JSON, [] on empty', () => {
    expect(parseChecks('not json')).toBeNull();
    expect(parseChecks('')).toEqual([]);
  });
});
