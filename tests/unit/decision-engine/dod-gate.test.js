const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateDod, loadDodConfig, DEFAULT_CONFIG } = require(path.join(ROOT, 'decision-engine', 'dod-gate.js'));

// A run-command stub scripted by command substring.
function runner(map) {
  return (command) => {
    for (const [needle, result] of Object.entries(map)) {
      if (command.includes(needle)) return { code: result.code, stdout: result.stdout || '', stderr: result.stderr || '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
}

const cfg = (over = {}) => ({
  ...DEFAULT_CONFIG,
  spec: { ...DEFAULT_CONFIG.spec, ...over, checks: { ...DEFAULT_CONFIG.spec.checks, ...(over.checks || {}) } },
});

describe('evaluateDod — hard enforcement', () => {
  test('passes when build + test both succeed', () => {
    const r = evaluateDod({ config: cfg(), runCommand: runner({ tsc: { code: 0 }, test: { code: 0 } }) });
    expect(r.passed).toBe(true);
    expect(r.blocked).toBe(false);
  });

  test('BLOCKS when tests fail', () => {
    const r = evaluateDod({ config: cfg(), runCommand: runner({ tsc: { code: 0 }, test: { code: 1, stderr: '2 failed' } }) });
    expect(r.passed).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/test/);
  });

  test('BLOCKS when the build fails', () => {
    const r = evaluateDod({ config: cfg(), runCommand: runner({ tsc: { code: 2, stderr: 'TS error' }, test: { code: 0 } }) });
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/build/);
  });

  test('BLOCKS when a changed file carries an incomplete-work marker', () => {
    const r = evaluateDod({
      config: cfg(),
      runCommand: runner({ tsc: { code: 0 }, test: { code: 0 } }),
      changedFiles: ['src/a.ts'],
      read: () => 'function f() { return 1; } // TODO finish',
    });
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/markers/);
  });

  test('warn mode never blocks even on failure', () => {
    const r = evaluateDod({ config: cfg({ enforcementMode: 'warn' }), runCommand: runner({ tsc: { code: 1 }, test: { code: 1 } }) });
    expect(r.passed).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.checks.filter((c) => !c.passed).length).toBe(2); // still reported
  });

  test('a check with enforced:false does not block', () => {
    const r = evaluateDod({
      config: cfg({ checks: { test: { command: 'npm test', enforced: false } } }),
      runCommand: runner({ tsc: { code: 0 }, test: { code: 1 } }),
    });
    expect(r.blocked).toBe(false);
  });
});

describe('outcome-metrics advisory tier (never blocks)', () => {
  const fs = require('fs');
  const os = require('os');

  test('surfaces the outcome scorecard as advisory without affecting pass/block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-out-'));
    fs.writeFileSync(path.join(dir, 'runs.jsonl'),
      JSON.stringify({ taskId: 'AISDLC-1', outcome: { mergedClean: true, buildPassed: true, humanCorrections: 0, regressionIntroduced: false }, tests: { after: { failed: 0 } }, review: { cycles: 1 } }) + '\n');
    const r = evaluateDod({
      projectRoot: dir,
      config: cfg({ checks: { outcomes: { runRecords: 'runs.jsonl' } } }),
      runCommand: runner({ tsc: { code: 0 }, test: { code: 0 } }),
    });
    expect(r.passed).toBe(true); // advisory never blocks
    const adv = r.advisory.find((a) => a.code === 'outcome-metrics');
    expect(adv).toBeDefined();
    expect(adv.scorecard.completionRate).toBe(1);
  });

  test('a failing outcome scorecard still does not block (advisory only)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-out-'));
    fs.writeFileSync(path.join(dir, 'runs.jsonl'),
      JSON.stringify({ taskId: 'AISDLC-2', outcome: { mergedClean: false, humanCorrections: 3 }, tests: { after: { failed: 2 } } }) + '\n');
    const r = evaluateDod({
      projectRoot: dir,
      config: cfg({ checks: { outcomes: { runRecords: 'runs.jsonl' } } }),
      runCommand: runner({ tsc: { code: 0 }, test: { code: 0 } }),
    });
    expect(r.blocked).toBe(false);
    expect(r.advisory.some((a) => a.code === 'outcome-metrics')).toBe(true);
  });
});

describe('loadDodConfig', () => {
  test('falls back to DEFAULT_CONFIG when the file is absent', () => {
    expect(loadDodConfig('/no/such/dod.yaml')).toEqual(DEFAULT_CONFIG);
  });
});
