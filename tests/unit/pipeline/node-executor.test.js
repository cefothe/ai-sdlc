const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ne = require(path.join(ROOT, 'pipeline', 'node-executor.js'));
const repo = require(path.join(ROOT, 'tests', 'helpers', 'git-repo.js'));

const TASK = { frontmatter: { id: 'AISDLC-0001', title: 'math helpers' } };
const NODE_ADD = { id: 'add', files: ['src/math.js'], change: 'Implement add(a, b).', accept: 'node test/add.check.js' };

// The oracle: a check that is RED until src/math.js exports a correct add().
const ADD_CHECK = "const m = require('../src/math.js'); if (typeof m.add !== 'function' || m.add(2, 3) !== 5) { console.error('add(2,3) !== 5'); process.exit(1); }\n";

function scriptedSpawn(dir, script) {
  const calls = [];
  const spawn = async (a) => {
    calls.push(a);
    const step = script.shift();
    if (!step) throw new Error(`unexpected spawn ${a.type}`);
    return step(a);
  };
  spawn.calls = calls;
  return spawn;
}

const oracle = (dir) => () => {
  const sha = repo.commit(dir, { 'test/add.check.js': ADD_CHECK, 'src/math.js': 'module.exports = { add: () => { throw new Error("not implemented"); } };\n' }, 'tests: RED oracle for add');
  return { commitSha: sha, testFiles: ['test/add.check.js'], verifications: ['tests written'], summary: 'oracle' };
};
const implement = (dir, files, msg = 'impl') => () => ({ commitSha: repo.commit(dir, files, msg), filesChanged: Object.keys(files), verifications: ['ran'], summary: msg });

describe('runNodes (real git + real accept commands)', () => {
  let dir;
  beforeEach(() => { dir = repo.makeRepo({ 'src/math.js': 'module.exports = {};\n' }); });
  afterEach(() => repo.remove(dir));

  const run = (spawn, extra = {}) => ne.runNodes({
    task: TASK, nodes: [NODE_ADD], spawn, implementer: { name: 'javascript-pro' }, cwd: dir,
    runner: repo.runner, runAccept: ne.makeAcceptRunner({ timeoutSec: 30 }), retries: 1, ...extra,
  });

  test('oracle → RED → node implemented → GREEN accept keeps the commit', async () => {
    const spawn = scriptedSpawn(dir, [oracle(dir), implement(dir, { 'src/math.js': 'module.exports = { add: (a, b) => a + b };\n' })]);
    const r = await run(spawn);
    expect(r.status).toBe('ok');
    expect(r.nodes).toEqual([{ id: 'add', status: 'done', attempts: 1 }]);
    expect(r.developer.verifications).toEqual(['[add] node test/add.check.js → exit 0']);
    expect(r.developer.filesChanged.sort()).toEqual(['src/math.js', 'test/add.check.js']);
    expect(spawn.calls[0].type).toBe('test-author');
    expect(spawn.calls[0].prompt).toMatch(/do NOT implement/);
    expect(spawn.calls[1].prompt).toMatch(/Files you may edit \(and only these\): src\/math\.js/);
  });

  test('a wrong implementation is rolled back and retried with the accept output', async () => {
    const spawn = scriptedSpawn(dir, [
      oracle(dir),
      implement(dir, { 'src/math.js': 'module.exports = { add: (a, b) => a - b };\n' }, 'wrong'),
      implement(dir, { 'src/math.js': 'module.exports = { add: (a, b) => a + b };\n' }, 'right'),
    ]);
    const r = await run(spawn);
    expect(r.status).toBe('ok');
    expect(r.nodes[0].attempts).toBe(2);
    expect(spawn.calls[2].prompt).toMatch(/add\(2,3\) !== 5/);
    expect(repo.git(dir, 'log', '--format=%s').split('\n')).not.toContain('wrong');
  });

  test('editing the oracle\'s tests or files outside the node is a scope violation', async () => {
    const spawn = scriptedSpawn(dir, [
      oracle(dir),
      implement(dir, { 'test/add.check.js': 'process.exit(0);\n', 'src/math.js': 'module.exports = {};\n' }, 'cheat'),
      implement(dir, { 'src/other.js': 'x\n', 'src/math.js': 'module.exports = { add: (a, b) => a + b };\n' }, 'outside'),
    ]);
    const r = await run(spawn);
    expect(r.status).toBe('halted');
    expect(spawn.calls[2].prompt).toMatch(/modified the oracle's tests: test\/add\.check\.js/);
    expect(r.halt.reason).toMatch(/edited files outside the node: src\/other\.js/);
    expect(fs.readFileSync(path.join(dir, 'test', 'add.check.js'), 'utf8')).toBe(ADD_CHECK);
  });

  test('forbid new_deps rejects a dependency-manifest change', () => {
    expect(ne.scopeViolations({ node: { ...NODE_ADD, files: ['src/math.js', 'package.json'], forbid: ['new_deps'] }, changed: ['package.json'], testFiles: [] }))
      .toEqual(['changed dependency manifests under forbid new_deps: package.json']);
  });

  test('an accept already GREEN before any change is recorded already_satisfied, no implementer runs', async () => {
    const spawn = scriptedSpawn(dir, [oracle(dir)]);
    const r = await run(spawn, { nodes: [{ ...NODE_ADD, accept: 'true' }] });
    expect(r.status).toBe('ok');
    expect(r.nodes[0].status).toBe('already_satisfied');
    expect(spawn.calls).toHaveLength(1);
  });

  test('no setup commit from the oracle halts before any node', async () => {
    const r = await run(scriptedSpawn(dir, [() => ({ summary: 'nothing' })]));
    expect(r.status).toBe('halted');
    expect(r.halt.reason).toMatch(/no setup commit/);
  });
});

describe('makeAcceptRunner', () => {
  test('host mode reports exit code and output', () => {
    const runAccept = ne.makeAcceptRunner({ timeoutSec: 10 });
    expect(runAccept('echo hi; exit 3', process.cwd())).toMatchObject({ passed: false, exitCode: 3 });
    expect(runAccept('echo ok', process.cwd())).toMatchObject({ passed: true, exitCode: 0, output: 'ok\n' });
  });

  test('a requested cordon sandbox that is not installed fails loud', () => {
    expect(() => ne.makeAcceptRunner({ sandbox: { mode: 'cordon', cordonRun: '/nope/cordon-run.sh', image: 'x' } })).toThrow(/does not exist/);
    expect(() => ne.makeAcceptRunner({ sandbox: { mode: 'vm' } })).toThrow(/unknown sandbox mode/);
  });

  test('cordon mode invokes cordon-run.sh with worktree, image and the accept', () => {
    const calls = [];
    const runAccept = ne.makeAcceptRunner({
      sandbox: { mode: 'cordon', cordonRun: __filename, image: 'node:22' }, timeoutSec: 60,
      run: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { status: 0, stdout: '', stderr: '' }; },
    });
    expect(runAccept('npm test', '/wt').passed).toBe(true);
    expect(calls[0].cmd).toBe(__filename);
    expect(calls[0].args).toEqual(['/wt', 'node:22', 'sh', '-c', 'npm test']);
    expect(calls[0].opts.env.CORDON_TIMEOUT).toBe('60');
  });
});
