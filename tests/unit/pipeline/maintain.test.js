const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const mt = require(path.join(ROOT, 'pipeline', 'maintain.js'));
const { createTask } = require(path.join(ROOT, 'decision-engine', 'backlog-task-new.js'));
const { evaluateBug } = require(path.join(ROOT, 'decision-engine', 'bug-gate.js'));

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maintain-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

const BASE = Array.from({ length: 20 }, (_, i) => 10 + ((i % 3) - 1));
const BANDS = [
  'version: "1"', 'runbooks:', '  rollback: "echo rolled back"', 'metrics:',
  '  - name: ci-failure-rate', '    source: { command: "x" }', '    baseline: { window: 20, recent: 8 }', '    tiers:', '      "3": { propose: runbook:rollback }',
  '  - name: quiet', '    source: { command: "y" }', '    baseline: { window: 20, recent: 8 }',
].join('\n');

describe('runBands', () => {
  let root;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('level 3: read-only diagnosis → draft bug report (passes the gate once a human confirms) + pre-approved runbook', async () => {
    root = project({ '.ai-sdlc/bands.yaml': BANDS });
    const series = { 'ci-failure-rate': [...BASE, 10, 10, 10, 10, 10, 10, 10, 30], quiet: [...BASE, 10, 9, 11, 10, 10, 9, 11, 10] };
    const spawned = [];
    const spawn = async (a) => { spawned.push(a); return { summary: 'CI failures tripled after the cache change', steps: ['Run the CI pipeline on main', 'Compare the failure rate with the last 30 days'], environment: 'GitHub Actions on main, ubuntu-latest runners', expected: 'failure rate near 10% of runs', actual: 'failure rate jumped to 30% on main', impact: 'Every merge waits for reruns; ~20 engineers blocked daily.', reproduction: 'Run `gh run list --branch main --limit 50`', suspectedCause: 'ci/cache.yml key changed in abc123', severity: 'major' }; };
    const runbooks = [];
    const now = Date.parse('2026-11-07T05:00:00Z');
    const rep = await mt.runBands({ root, now, fetchSeries: (m) => series[m.name], spawn, runRunbook: (cmd) => { runbooks.push(cmd); return { exit: 0, output: 'rolled back' }; } });
    const ci = rep.metrics.find((m) => m.name === 'ci-failure-rate');
    expect(ci.level).toBe(3);
    expect(ci.actions).toEqual([{ kind: 'draft-bug-report', path: 'docs/bugs/ci-failure-rate-2026-11-07.md' }, { kind: 'runbook', name: 'rollback', exit: 0, output: 'rolled back' }]);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].tools).toEqual(['Read', 'Grep', 'Glob']);
    expect(runbooks).toEqual(['echo rolled back']);
    expect(rep.metrics.find((m) => m.name === 'quiet')).toMatchObject({ level: 0, actions: [] });
    const draft = fs.readFileSync(path.join(root, 'docs/bugs/ci-failure-rate-2026-11-07.md'), 'utf8');
    expect(evaluateBug(draft).reasons).toEqual(['status is "draft" — a human must confirm the triage (status: confirmed)']);
    expect(fs.readFileSync(path.join(root, mt.LOG_FILE), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  test('an undeclared runbook never runs; no bands file → skipped; a source error is reported', async () => {
    root = project({ '.ai-sdlc/bands.yaml': BANDS.replace('runbook:rollback', 'runbook:nuke') });
    const rep = await mt.runBands({ root, fetchSeries: (m) => { if (m.name === 'quiet') throw new Error('boom'); return [...BASE, 10, 10, 10, 10, 10, 10, 10, 30]; }, spawn: async () => ({}), runRunbook: () => { throw new Error('must not run'); } });
    expect(rep.metrics[0].actions[1]).toMatchObject({ kind: 'runbook', name: 'nuke', error: expect.stringMatching(/not declared/) });
    expect(rep.metrics[1]).toEqual({ name: 'quiet', error: 'boom' });
    const empty = project({});
    try {
      expect(await mt.runBands({ root: empty, fetchSeries: () => [] })).toMatchObject({ status: 'skipped' });
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('runJobs', () => {
  let root;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const JOBS = 'version: "1"\njobs:\n  - name: flag-cleanup\n    days: [sat]\n    maxOpen: 2\n    prompt: find dead flags\n';
  const saturday = Date.parse('2026-11-07T05:00:00Z');

  test('creates labelled, non-dispatchable tasks up to the cap, only on its days', async () => {
    root = project({ '.ai-sdlc/maintenance.yaml': JOBS });
    const spawn = async () => ({ items: [{ title: 'remove FLAG_A', files: ['src/a.js'], acceptance: ['FLAG_A gone'] }, { title: 'remove FLAG_B' }, { title: 'remove FLAG_C' }] });
    const first = await mt.runJobs({ root, now: saturday, spawn, createTask });
    expect(first.jobs[0].created).toHaveLength(2);
    const files = fs.readdirSync(path.join(root, 'backlog', 'tasks'));
    const text = fs.readFileSync(path.join(root, 'backlog', 'tasks', files[0]), 'utf8');
    expect(text).toMatch(/dispatchable: false/);
    expect(text).toMatch(/- maintenance:flag-cleanup/);
    expect((await mt.runJobs({ root, now: saturday, spawn, createTask })).jobs[0].skipped).toMatch(/2 open task\(s\) ≥ cap 2/);
    expect((await mt.runJobs({ root, now: saturday + 86400000, spawn, createTask })).jobs[0].skipped).toMatch(/not scheduled on sun/);
  });

  test('recordJobFeedback counts landed vs rejected per job', () => {
    root = project({});
    expect(mt.recordJobFeedback(root, [
      { state: 'MERGED', labels: ['maintenance:flag-cleanup'] }, { state: 'CLOSED', labels: ['maintenance:flag-cleanup'] },
      { state: 'OPEN', labels: ['maintenance:flag-cleanup'] }, { state: 'MERGED', labels: ['other'] },
    ])).toEqual({ 'flag-cleanup': { landed: 1, rejected: 1 } });
  });
});
