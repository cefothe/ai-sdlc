const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const dm = require(path.join(ROOT, 'measurement', 'delivery-metrics.js'));
const repo = require(path.join(ROOT, 'tests', 'helpers', 'git-repo.js'));

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

function commitAt(dir, files, message, at) {
  repo.writeFiles(dir, files);
  repo.git(dir, 'add', '-A');
  require('child_process').execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: iso(at), GIT_COMMITTER_DATE: iso(at) } });
}

describe('computeMetrics', () => {
  let dir;
  const t0 = Date.parse('2026-10-01T00:00:00Z');
  beforeEach(() => {
    dir = repo.makeRepo({ 'README.md': '# r\n' });
    commitAt(dir, { 'docs/prd/a.md': 'prd a\n' }, 'prd a', t0);
    commitAt(dir, { 'src/a.js': '1\n' }, 'feat a (merged)', t0 + 4 * DAY);
    commitAt(dir, { 'src/a.js': '2\n' }, 'fix: a crashed on empty input', t0 + 6 * DAY);
    commitAt(dir, { 'src/b.js': '1\n' }, 'feat b (merged)', t0 + 5 * DAY);
  });
  afterEach(() => repo.remove(dir));

  const records = [
    { taskId: 'T-1', runId: 'r1', timestamp: iso(t0 + 3 * DAY), ok: true, specPath: 'docs/prd/a.md', prUrl: 'pr/1', cost: { usd: 3 }, review: { cycles: 1 }, implementation: { filesChanged: ['src/a.js'] }, outcome: { pending: true } },
    { taskId: 'T-2', runId: 'r2', timestamp: iso(t0 + 4 * DAY), ok: true, prUrl: 'pr/2', cost: { usd: 2 }, review: { cycles: 2 }, implementation: { filesChanged: ['src/b.js'] }, outcome: { pending: true } },
    { taskId: 'T-3', runId: 'r3', timestamp: iso(t0 + 4 * DAY), ok: false, abortedAt: 'review', cost: { usd: 1 }, outcome: { pending: true } },
  ];
  const prState = (url) => ({ 'pr/1': { state: 'MERGED', mergedAt: iso(t0 + 4 * DAY) }, 'pr/2': { state: 'MERGED', mergedAt: iso(t0 + 5 * DAY) } }[url] || null);

  test('success, cost per success, rework, lead time and churn from runs + git + PR fate', () => {
    const m = dm.computeMetrics(records, { runner: repo.runner, cwd: dir, base: 'main', prState, now: t0 + 30 * DAY });
    expect(m).toMatchObject({ runs: 3, merged: 2, agentSuccessRate: 0.667, costPerSuccess: 3, reworkRate: 0.5, leadTimeDays: 4, changeFailureRate: 0 });
    expect(m.context).toMatchObject({ churnRate: 0.5, firstPassReviewRate: 0.5, totalCostUsd: 6, abortedByStage: { review: 1 } });
  });

  test('baseline comparison knows which direction is better', () => {
    const now = { agentSuccessRate: 0.7, costPerSuccess: 2, reworkRate: 0.2, leadTimeDays: 5, changeFailureRate: 0.1 };
    const c = dm.compareToBaseline(now, { metrics: { agentSuccessRate: 0.5, costPerSuccess: 3, reworkRate: 0.1, leadTimeDays: 5, changeFailureRate: null } });
    expect(c.agentSuccessRate.verdict).toBe('better');
    expect(c.costPerSuccess.verdict).toBe('better');
    expect(c.reworkRate.verdict).toBe('worse');
    expect(c.leadTimeDays.verdict).toBe('same');
    expect(c.changeFailureRate.verdict).toBe('n/a');
    expect(dm.formatMetrics({ ...now, runs: 3, merged: 2, context: { churnRate: 0, firstPassReviewRate: 1, throughputPerWeek: 1, totalCostUsd: 4, abortedByStage: {} } }, { owners: { reworkRate: 'qa-lead' }, comparison: c }))
      .toMatch(/\| reworkRate \| 20\.0% \| 10\.0% \(worse\) \| qa-lead \|/);
  });

  test('baseline round-trip and run loading', () => {
    fs.mkdirSync(path.join(dir, '.ai-sdlc'), { recursive: true });
    fs.writeFileSync(path.join(dir, dm.RUNS_FILE), `${records.map((r) => JSON.stringify(r)).join('\n')}\n{bad\n`);
    expect(dm.loadRuns(dir)).toHaveLength(3);
    dm.writeBaseline(dir, { agentSuccessRate: 0.5 }, '2026-11-07T00:00:00Z');
    expect(dm.readBaseline(dir)).toEqual({ recordedAt: '2026-11-07T00:00:00Z', metrics: { agentSuccessRate: 0.5 } });
  });
});
