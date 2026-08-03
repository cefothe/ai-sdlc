const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { runChecks } = require(path.join(ROOT, 'measurement', 'convergence-gate.js'));

describe('convergence gate', () => {
  test('all architecture invariants hold', () => {
    const { ok, checks } = runChecks();
    const failed = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
    expect(failed).toEqual([]);
    expect(ok).toBe(true);
  });

  test('covers each load-bearing invariant', () => {
    const names = runChecks().checks.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'schemas + instances validate',
        'advisory promise gate never blocks (R5/R15 guardrail)',
        'Pattern C enforced (worktree refused off base branch)',
        'DoR enforce refuses an undecided task',
        'capability map resolves + is cross-harness-safe',
        'cross-harness attestation rejects collusion',
      ]),
    );
  });
});
