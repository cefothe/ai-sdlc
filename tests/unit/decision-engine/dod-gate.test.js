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
  test('passes when build + test both succeed', async () => {
    const r = await evaluateDod({ config: cfg(), runCommand: runner({ tsc: { code: 0 }, test: { code: 0 } }) });
    expect(r.passed).toBe(true);
    expect(r.blocked).toBe(false);
  });

  test('BLOCKS when tests fail', async () => {
    const r = await evaluateDod({ config: cfg(), runCommand: runner({ tsc: { code: 0 }, test: { code: 1, stderr: '2 failed' } }) });
    expect(r.passed).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/test/);
  });

  test('BLOCKS when the build fails', async () => {
    const r = await evaluateDod({ config: cfg(), runCommand: runner({ tsc: { code: 2, stderr: 'TS error' }, test: { code: 0 } }) });
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/build/);
  });

  test('BLOCKS when a changed file carries an incomplete-work marker', async () => {
    const r = await evaluateDod({
      config: cfg(),
      runCommand: runner({ tsc: { code: 0 }, test: { code: 0 } }),
      changedFiles: ['src/a.ts'],
      read: () => 'function f() { return 1; } // TODO finish',
    });
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/markers/);
  });

  test('warn mode never blocks even on failure', async () => {
    const r = await evaluateDod({ config: cfg({ enforcementMode: 'warn' }), runCommand: runner({ tsc: { code: 1 }, test: { code: 1 } }) });
    expect(r.passed).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.checks.filter((c) => !c.passed).length).toBe(2); // still reported
  });

  test('a check with enforced:false does not block', async () => {
    const r = await evaluateDod({
      config: cfg({ checks: { test: { command: 'npm test', enforced: false } } }),
      runCommand: runner({ tsc: { code: 0 }, test: { code: 1 } }),
    });
    expect(r.blocked).toBe(false);
  });
});

describe('outcome-metrics advisory tier (never blocks)', () => {
  const fs = require('fs');
  const os = require('os');

  test('surfaces the outcome scorecard as advisory without affecting pass/block', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-out-'));
    fs.writeFileSync(path.join(dir, 'runs.jsonl'),
      JSON.stringify({ taskId: 'AISDLC-1', outcome: { mergedClean: true, buildPassed: true, humanCorrections: 0, regressionIntroduced: false }, tests: { after: { failed: 0 } }, review: { cycles: 1 } }) + '\n');
    const r = await evaluateDod({
      projectRoot: dir,
      config: cfg({ checks: { outcomes: { runRecords: 'runs.jsonl' } } }),
      runCommand: runner({ tsc: { code: 0 }, test: { code: 0 } }),
    });
    expect(r.passed).toBe(true); // advisory never blocks
    const adv = r.advisory.find((a) => a.code === 'outcome-metrics');
    expect(adv).toBeDefined();
    expect(adv.scorecard.completionRate).toBe(1);
  });

  test('a failing outcome scorecard still does not block (advisory only)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-out-'));
    fs.writeFileSync(path.join(dir, 'runs.jsonl'),
      JSON.stringify({ taskId: 'AISDLC-2', outcome: { mergedClean: false, humanCorrections: 3 }, tests: { after: { failed: 2 } } }) + '\n');
    const r = await evaluateDod({
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

describe('evaluateDod — every check, concurrently, path-scoped', () => {
  test('runs any named check with a command (not just build/test)', async () => {
    const ran = [];
    const r = await evaluateDod({
      config: cfg({ checks: { 'catalog-integration': { command: 'make catalog-integration', enforced: true } } }),
      runCommand: (c) => { ran.push(c); return c.includes('catalog') ? { code: 1, stderr: 'boom' } : { code: 0 }; },
    });
    expect(ran).toEqual(expect.arrayContaining(['npx tsc --noEmit', 'npm test', 'make catalog-integration']));
    expect(r.blocked).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/catalog-integration/);
  });

  test('runs checks concurrently (all start before any finishes)', async () => {
    let inFlight = 0;
    let peak = 0;
    const runCommand = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((res) => setTimeout(res, 20));
      inFlight--;
      return { code: 0 };
    };
    const r = await evaluateDod({ config: cfg({ checks: { smoke: { command: 'make smoke' } } }), runCommand });
    expect(r.passed).toBe(true);
    expect(peak).toBe(3);
  });

  test('spec.concurrency caps parallelism', async () => {
    let inFlight = 0;
    let peak = 0;
    const runCommand = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((res) => setTimeout(res, 10));
      inFlight--;
      return { code: 0 };
    };
    await evaluateDod({ config: cfg({ concurrency: 1, checks: { smoke: { command: 'make smoke' } } }), runCommand });
    expect(peak).toBe(1);
  });

  test('a paths-scoped check is skipped when no changed file matches', async () => {
    const ran = [];
    const r = await evaluateDod({
      config: cfg({ checks: { smoke: { command: 'make smoke', paths: ['deploy/', 'migrations/**/*.sql'] } } }),
      runCommand: (c) => { ran.push(c); return { code: 0 }; },
      changedFiles: ['internal/api/server.go'],
      read: () => '',
    });
    expect(ran).not.toContain('make smoke');
    const smoke = r.checks.find((c) => c.name === 'smoke');
    expect(smoke.skipped).toBe(true);
    expect(smoke.passed).toBe(true);
  });

  test('a paths-scoped check runs when a changed file matches', async () => {
    const ran = [];
    await evaluateDod({
      config: cfg({ checks: { smoke: { command: 'make smoke', paths: ['migrations/**/*.sql'] } } }),
      runCommand: (c) => { ran.push(c); return { code: 0 }; },
      changedFiles: ['migrations/clickhouse/0007_add.sql'],
      read: () => '',
    });
    expect(ran).toContain('make smoke');
  });

  test('unknown changed set -> a paths-scoped check still runs (never silently skipped)', async () => {
    const ran = [];
    await evaluateDod({
      config: cfg({ checks: { smoke: { command: 'make smoke', paths: ['deploy/'] } } }),
      runCommand: (c) => { ran.push(c); return { code: 0 }; },
    });
    expect(ran).toContain('make smoke');
  });

  test('exports AI_SDLC_BASE and AI_SDLC_CHANGED_FILES to commands', async () => {
    const envs = [];
    await evaluateDod({
      config: cfg(),
      runCommand: (c, root, opts) => { envs.push(opts.env); return { code: 0 }; },
      changedFiles: ['a.go', 'b/c.go'],
      base: 'main',
      read: () => '',
    });
    expect(envs[0]).toEqual({ AI_SDLC_BASE: 'main', AI_SDLC_CHANGED_FILES: 'a.go\nb/c.go' });
  });

  test('timeoutMinutes is forwarded to the runner in ms', async () => {
    const seen = [];
    await evaluateDod({
      config: cfg({ checks: { build: { command: 'make validate', timeoutMinutes: 2 } } }),
      runCommand: (c, root, opts) => { seen.push([c, opts.timeoutMs]); return { code: 0 }; },
    });
    expect(seen).toContainEqual(['make validate', 120000]);
  });

  test('github-checks check delegates to CI via the proc seam', async () => {
    const calls = [];
    const proc = async (cmd, args) => {
      calls.push(`${cmd} ${args.slice(0, 2).join(' ')}`);
      if (args[1] === 'view') return { code: 0, stdout: JSON.stringify({ number: 7, url: 'https://gh/pr/7', state: 'OPEN' }) };
      if (args[1] === 'checks') return { code: 0, stdout: JSON.stringify([{ name: 'validate go', bucket: 'pass' }]) };
      return { code: 0, stdout: '' };
    };
    const r = await evaluateDod({
      config: cfg({ checks: { build: null, test: null, ci: { type: 'github-checks', enforced: true } } }),
      proc,
      runCommand: () => { throw new Error('no local command should run'); },
    });
    expect(r.passed).toBe(true);
    expect(r.checks.find((c) => c.name === 'ci').finding).toMatch(/CI green/);
    expect(calls).not.toContain('git push -u'); // push is opt-in
  });
});

describe('defaultRunCommand (real shell, no injection)', () => {
  test('captures a failing command exit code without throwing', async () => {
    const r = await evaluateDod({
      config: cfg({ checks: { build: { command: 'exit 3' }, test: { command: 'echo fine' } } }),
    });
    const build = r.checks.find((c) => c.name === 'build');
    expect(build.passed).toBe(false);
    expect(build.finding).toMatch(/exit 3/);
    expect(r.checks.find((c) => c.name === 'test').passed).toBe(true);
  });

  test('kills a command that exceeds timeoutMinutes', async () => {
    const r = await evaluateDod({
      config: cfg({ checks: { build: { command: 'sleep 5', timeoutMinutes: 0.01 }, test: null } }),
    });
    const build = r.checks.find((c) => c.name === 'build');
    expect(build.passed).toBe(false);
    expect(build.durationMs).toBeLessThan(4000);
  });
});
