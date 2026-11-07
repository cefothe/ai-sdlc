// End-to-end flow wiring: pace → plan + manifest → RED oracle nodes → review →
// HITL gate → PR, on a real git repository with real accept commands.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { executePipeline } = require(path.join(ROOT, 'pipeline', 'execute.js'));
const { loadCapabilityMap } = require(path.join(ROOT, 'pipeline', 'capabilities.js'));
const { DEFAULTS } = require(path.join(ROOT, 'pipeline', 'flow-config.js'));
const { makeAcceptRunner } = require(path.join(ROOT, 'pipeline', 'node-executor.js'));
const repo = require(path.join(ROOT, 'tests', 'helpers', 'git-repo.js'));

const MAP = loadCapabilityMap(path.join(ROOT, '.ai-sdlc', 'capabilities.yaml'));
const ADD_CHECK = "const m = require('../src/math.js'); if (m.add(2, 3) !== 5) process.exit(1);\n";
const MANIFEST_PLAN = [
  'Plan: implement add.',
  '```json',
  JSON.stringify({ 'execution-manifest': [{ id: 'add', files: ['src/math.js'], change: 'Implement add.', accept: 'node test/add.check.js', local: true }] }),
  '```',
].join('\n');

function setup(references = ['src/math.js']) {
  const dir = repo.makeRepo({ 'src/math.js': 'module.exports = {};\n', 'docs/guide.md': '# guide\n' });
  repo.git(dir, 'checkout', '-q', '-b', 'feature');
  const tasksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-tasks-'));
  const taskFilePath = path.join(tasksDir, 'AISDLC-0001 - math.md');
  fs.writeFileSync(taskFilePath, 'x');
  const task = { frontmatter: { id: 'AISDLC-0001', title: 'math helpers', references }, body: '', acceptanceCriteria: [{ checked: true, text: 'add works' }] };
  return { dir, tasksDir, taskFilePath, task, completedDir: path.join(tasksDir, 'completed') };
}

function scriptedSpawn(dir, { plan = MANIFEST_PLAN, developer } = {}) {
  const calls = [];
  const spawn = async (a) => {
    calls.push(a);
    if (a.type === 'design') return { design: 'note' };
    if (a.type === 'plan') return { plan };
    if (a.type === 'test-author') {
      return { commitSha: repo.commit(dir, { 'test/add.check.js': ADD_CHECK, 'src/math.js': 'module.exports = { add: () => 0 };\n' }, 'tests: oracle'), testFiles: ['test/add.check.js'] };
    }
    if (a.type === 'developer') {
      const files = developer || { 'src/math.js': 'module.exports = { add: (a, b) => a + b };\n' };
      return { commitSha: repo.commit(dir, files, 'impl'), filesChanged: Object.keys(files), verifications: ['ran'], summary: 'impl' };
    }
    return { approved: true, findings: [] };
  };
  spawn.calls = calls;
  return spawn;
}

const unavailable = async () => ({ status: 'unavailable', reason: 'docker not found' });
const ghCalls = [];
const gh = (args) => { ghCalls.push(args); return { stdout: 'https://github.com/o/r/pull/1\n' }; };

function opts(s, spawn, extra = {}) {
  return {
    taskId: 'AISDLC-0001', task: s.task, projectRoot: s.dir, repoDir: s.dir, baseBranch: 'main',
    runner: repo.runner, gh, spawn, taskFilePath: s.taskFilePath, completedDir: s.completedDir,
    capabilityMap: MAP, taskContext: { files: [] }, implementerHarness: 'claude',
    flow: DEFAULTS, invoke: unavailable, fetchTrust: async () => 'high', runAccept: makeAcceptRunner({ timeoutSec: 30 }),
    ...extra,
  };
}

// Pushing to a remote is out of scope here: the runner skips `push`.
const noPushRunner = (args, o) => (args[0] === 'push' ? { stdout: '' } : repo.runner(args, o));

describe('the harness-component flow', () => {
  let s;
  afterEach(() => { repo.remove(s.dir); fs.rmSync(s.tasksDir, { recursive: true, force: true }); ghCalls.length = 0; });

  test('manifest plan → oracle → GREEN node → review → HITL clear → PR', async () => {
    s = setup();
    const spawn = scriptedSpawn(s.dir);
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner }));
    expect(r.ok).toBe(true);
    expect(r.steps.manifest).toEqual({ source: 'in-process', nodes: ['add'], inline: [] });
    expect(r.steps.nodes.nodes).toEqual([{ id: 'add', status: 'done', attempts: 1 }]);
    expect(r.steps.hitl).toMatchObject({ status: 'clear', source: 'in-process' });
    expect(r.degraded).toEqual(expect.arrayContaining([{ seam: 'slicr', reason: 'docker not found' }, { seam: 'commitward', reason: 'docker not found' }]));
    const types = spawn.calls.map((c) => c.type);
    expect(types.indexOf('test-author')).toBeLessThan(types.indexOf('developer'));
    expect(spawn.calls.find((c) => c.type === 'plan').prompt).toMatch(/execution-manifest/);
    expect(r.steps.pr).toMatchObject({ url: 'https://github.com/o/r/pull/1', draft: false });
  });

  test('a change touching CLAUDE.md stops at the HITL gate — never pushed, never auto-acked', async () => {
    s = setup();
    const spawn = scriptedSpawn(s.dir, { plan: 'no manifest', developer: { 'CLAUDE.md': '# new rules\n' } });
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner }));
    expect(r.ok).toBe(false);
    expect(r.abortedAt).toBe('hitl');
    expect(r.reasons.join('\n')).toMatch(/human sign-off required for: agent-instructions-self-mod/);
    expect(r.steps.pace.post).toMatchObject({ verdict: 'slow' });
    expect(ghCalls).toHaveLength(0);
    expect(repo.git(s.dir, 'log', '--format=%B')).not.toMatch(/HITL-ACK/);
  });

  test('a docs-only change is fast: no design panel and a single reviewer', async () => {
    s = setup(['docs/guide.md']);
    const spawn = scriptedSpawn(s.dir, { plan: 'no manifest', developer: { 'docs/guide.md': '# guide v2\n' } });
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner }));
    expect(r.ok).toBe(true);
    expect(r.steps.design).toEqual({ skipped: true, reason: 'pace fast: the change earns no design panel' });
    expect(spawn.calls.filter((c) => c.type === 'reviewer')).toHaveLength(1);
    expect(r.steps.pace.post.verdict).toBe('fast');
  });

  test('a low-trust implementer raises a fast change to normal (full review team)', async () => {
    s = setup(['docs/guide.md']);
    const spawn = scriptedSpawn(s.dir, { plan: 'no manifest', developer: { 'docs/guide.md': '# guide v2\n' } });
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner, fetchTrust: async () => 'low' }));
    expect(r.ok).toBe(true);
    expect(r.steps.pace.post).toMatchObject({ verdict: 'normal', trustRaised: true });
    expect(spawn.calls.filter((c) => c.type === 'reviewer').length).toBeGreaterThan(1);
  });

  test('a refused manifest aborts at plan', async () => {
    s = setup();
    const bad = '```json\n{"execution-manifest": [{"id": "../x", "files": ["a"], "change": "c", "accept": "a", "local": true}]}\n```';
    const r = await executePipeline(opts(s, scriptedSpawn(s.dir, { plan: bad })));
    expect(r.ok).toBe(false);
    expect(r.abortedAt).toBe('plan');
    expect(r.reasons[0]).toMatch(/execution manifest refused/);
  });

  test('a node that never goes GREEN halts to a human', async () => {
    s = setup();
    const spawn = scriptedSpawn(s.dir, { developer: { 'src/math.js': 'module.exports = { add: () => 1 };\n' } });
    const r = await executePipeline(opts(s, spawn));
    expect(r.ok).toBe(false);
    expect(r.abortedAt).toBe('implement');
    expect(r.reasons[0]).toMatch(/node add did not pass its accept after 3 attempt\(s\)/);
  });

  test('a bug task skips the design panel and plans a root-cause fix against the reproduction', async () => {
    s = setup();
    const spawn = scriptedSpawn(s.dir);
    const fetchSpec = async () => ({ text: 'BUG FIX — report', kind: 'bug', bugPath: 'docs/bugs/b.md', prdPath: null, designPath: null, designApproved: false });
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner, fetchSpec }));
    expect(r.ok).toBe(true);
    expect(r.steps.design).toEqual({ skipped: true, reason: 'bug fix: the confirmed bug report docs/bugs/b.md is the input' });
    expect(r.steps.spec).toMatchObject({ kind: 'bug', bugPath: 'docs/bugs/b.md' });
    expect(spawn.calls.filter((c) => c.type === 'design')).toHaveLength(0);
    expect(spawn.calls.find((c) => c.type === 'plan').prompt).toMatch(/fix plan for bug task .*Reproduction test \(RED now, GREEN after the fix\)/s);
  });

  test('architecture conformance findings reach the reviewers and make the change slow', async () => {
    s = setup();
    const { architectureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
    // The overview already exists on main — only the implementation is in the branch's diff.
    repo.git(s.dir, 'checkout', '-q', 'main');
    repo.commit(s.dir, { 'docs/architecture/overview.md': architectureDoc() }, 'architecture');
    repo.git(s.dir, 'checkout', '-q', 'feature');
    repo.git(s.dir, 'merge', '-q', '--ff-only', 'main');
    const spawn = scriptedSpawn(s.dir, { plan: 'no manifest', developer: { 'services/payments/refund.ts': "const repo = require('../orders/repo');\n" } });
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner }));
    expect(r.steps.conformance.status).toBe('findings');
    expect(r.steps.conformance.findings[0]).toMatchObject({ code: 'undeclared-coupling', file: 'services/payments/refund.ts' });
    expect(r.steps.pace.post).toMatchObject({ verdict: 'slow', conformanceRaised: true });
    const reviewer = spawn.calls.find((c) => c.type === 'reviewer');
    expect(reviewer.prompt).toMatch(/Architecture conformance \(deterministic/);
    expect(spawn.calls.find((c) => c.type === 'developer').prompt).not.toMatch(/Architecture conformance/);
    expect(r.steps.pr.draft).toBe(true);
  });

  test('a shipped feature is recorded in the product context on the branch', async () => {
    s = setup();
    repo.commit(s.dir, { 'docs/product/context.md': '## Current capabilities\nOrders and payments today.\n\n## Glossary\n- x\n' }, 'context');
    const spawn = scriptedSpawn(s.dir);
    const fetchSpec = async () => ({ text: 'SPEC', kind: 'feature', prdPath: 'docs/prd/math.md', designPath: null, designApproved: false });
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner, fetchSpec }));
    expect(r.ok).toBe(true);
    expect(r.steps.productContext).toEqual({ recorded: true, line: '- math helpers — docs/prd/math.md (shipped in AISDLC-0001)' });
    expect(repo.git(s.dir, 'log', '-1', '--format=%s')).toBe('docs(product): record shipped capability (AISDLC-0001)\n');
    expect(fs.readFileSync(path.join(s.dir, 'docs', 'product', 'context.md'), 'utf8')).toMatch(/shipped in AISDLC-0001/);
  });

  test('the plan is committed, the PR body is the validation table, and the run is recorded with its cost', async () => {
    s = setup();
    const spawn = scriptedSpawn(s.dir);
    const metered = async (a) => ({ ...(await spawn(a)), _meta: { costUsd: 0.5 } });
    const recorded = [];
    const r = await executePipeline(opts(s, metered, { runner: noPushRunner, recordRun: (rec) => recorded.push(rec) }));
    expect(r.ok).toBe(true);
    expect(r.steps.planArtifact).toEqual({ path: 'docs/plans/AISDLC-0001.md' });
    expect(fs.readFileSync(path.join(s.dir, 'docs/plans/AISDLC-0001.md'), 'utf8')).toMatch(/\| add \| `src\/math\.js` \| `node test\/add\.check\.js` \| node \(RED oracle\) \|/);
    expect(r.steps.planDrift).toEqual([]);
    const prArgs = ghCalls[ghCalls.length - 1];
    const body = prArgs[prArgs.indexOf('--body') + 1];
    expect(body).toMatch(/## Validation/);
    expect(body).toMatch(/\| RED oracle nodes \| ✅ \| 1\/1 GREEN/);
    expect(body).toMatch(/\| Cost \| ✅ \| \$[\d.]+ over \d+ agent call\(s\) \|/);
    expect(r.steps.cost.calls).toBeGreaterThan(3);
    expect(r.steps.cost.usd).toBeCloseTo(r.steps.cost.calls * 0.5);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ taskId: 'AISDLC-0001', ok: true, abortedAt: null, accepts: [{ id: 'add', files: ['src/math.js'], accept: 'node test/add.check.js' }], outcome: { pending: true }, prUrl: 'https://github.com/o/r/pull/1' });
    expect(recorded[0].implementation.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(recorded[0].cost.usd).toBeCloseTo(r.steps.cost.usd);
  });

  test('files the plan never names are reported to reviewers as plan drift', async () => {
    s = setup();
    const spawn = scriptedSpawn(s.dir, { plan: 'Plan: edit src/math.js only.', developer: { 'src/math.js': 'module.exports = { add: (a, b) => a + b };\n', 'src/extra.js': '1\n' } });
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner }));
    expect(r.steps.planDrift).toEqual(['src/extra.js']);
    expect(spawn.calls.find((c) => c.type === 'reviewer').prompt).toMatch(/Plan drift \(deterministic\): changed but not in the committed plan docs\/plans\/AISDLC-0001\.md: src\/extra\.js/);
  });

  test('a run over its call budget aborts at budget and is still recorded', async () => {
    s = setup();
    const recorded = [];
    const flow = { ...DEFAULTS, budget: { maxCostUsd: 0, maxCalls: 2 } };
    const r = await executePipeline(opts(s, scriptedSpawn(s.dir), { flow, recordRun: (rec) => recorded.push(rec) }));
    expect(r.abortedAt).toBe('budget');
    expect(r.reasons[0]).toMatch(/2 agent calls reached the cap of 2/);
    expect(recorded[0]).toMatchObject({ ok: false, abortedAt: 'budget', cost: { calls: 2 } });
  });

  test('REVIEW.md reaches reviewers and its nit cap / skips are applied to findings', async () => {
    s = setup();
    repo.git(s.dir, 'checkout', '-q', 'main');
    repo.commit(s.dir, { 'REVIEW.md': '---\nmaxNits: 1\nskip: ["^src/gen/"]\n---\n## Passes\nCorrectness only.\n' }, 'review contract');
    repo.git(s.dir, 'checkout', '-q', 'feature');
    repo.git(s.dir, 'merge', '-q', '--ff-only', 'main');
    const base = scriptedSpawn(s.dir, { plan: 'no manifest' });
    const spawn = async (a) => (a.type === 'reviewer'
      ? { approved: true, findings: [{ severity: 'major', file: 'src/gen/x.js', message: 'generated' }, { severity: 'minor', file: 'a.js', message: 'n1' }, { severity: 'suggestion', file: 'b.js', message: 'n2' }] }
      : base(a));
    spawn.calls = base.calls;
    const r = await executePipeline(opts(s, spawn, { runner: noPushRunner }));
    expect(r.ok).toBe(true);
    expect(base.calls.length).toBeGreaterThan(0);
    expect(r.steps.review.counts.major).toBe(0);
    expect(r.steps.review.counts.minor + r.steps.review.counts.suggestion).toBe(1);
  });

  test('a requested but missing cordon sandbox aborts loudly', async () => {
    s = setup();
    const flow = { ...DEFAULTS, sandbox: { mode: 'cordon', cordonRun: '/missing/cordon-run.sh', image: 'x' } };
    const r = await executePipeline(opts(s, scriptedSpawn(s.dir), { flow, runAccept: undefined }));
    expect(r.abortedAt).toBe('sandbox');
  });
});
