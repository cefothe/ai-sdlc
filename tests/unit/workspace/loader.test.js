const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { loadWorkspace, resolveTargetRepo, buildDepGraph } = require(path.join(ROOT, 'workspace', 'loader.js'));

function makeWorkspace(yamlBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  fs.mkdirSync(path.join(dir, '.ai-sdlc'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ai-sdlc', 'workspace.yaml'), yamlBody);
  return dir;
}

const BASE = [
  'apiVersion: ai-sdlc.io/v1alpha1',
  'kind: Workspace',
  'metadata:',
  '  name: demo',
  'spec:',
  '  configScope: shared',
  '  repos:',
  '    - id: web',
  '      path: ./web',
  '    - id: api',
  '      path: ./api',
  '      worktreeRoot: ./api/.wt',
].join('\n');

const fmTask = (id, targetRepo, deps = []) => ({ frontmatter: { id, targetRepo, dependencies: deps } });

describe('loadWorkspace', () => {
  let dirs = [];
  afterEach(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    dirs = [];
  });

  test('loads a valid workspace with normalized abs paths', () => {
    const dir = makeWorkspace(BASE);
    dirs.push(dir);
    const ws = loadWorkspace(dir);
    expect(ws.repos.map((r) => r.id)).toEqual(['web', 'api']);
    expect(ws.configScope).toBe('shared');
    expect(path.isAbsolute(ws.repos[0].path)).toBe(true);
    expect(ws.repos[1].worktreeRoot.endsWith(path.join('api', '.wt'))).toBe(true);
    expect(ws.repos[0].defaultBranch).toBe('main');
  });

  test('throws when workspace.yaml is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-none-'));
    dirs.push(dir);
    expect(() => loadWorkspace(dir)).toThrow(/no workspace/);
  });

  test('rejects duplicate repo ids', () => {
    const dir = makeWorkspace(BASE.replace('id: api', 'id: web'));
    dirs.push(dir);
    expect(() => loadWorkspace(dir)).toThrow(/duplicate repo id/);
  });

  test('rejects a repo path that escapes the parent folder', () => {
    const dir = makeWorkspace(BASE.replace('path: ./api', 'path: ../evil'));
    dirs.push(dir);
    expect(() => loadWorkspace(dir)).toThrow(/escapes the workspace parent/);
  });

  test('rejects a worktreeRoot that escapes the parent folder', () => {
    const dir = makeWorkspace(BASE.replace('worktreeRoot: ./api/.wt', 'worktreeRoot: ../../outside'));
    dirs.push(dir);
    expect(() => loadWorkspace(dir)).toThrow(/worktreeRoot escapes/);
  });
});

describe('resolveTargetRepo', () => {
  let dir;
  let ws;
  beforeAll(() => {
    dir = makeWorkspace(BASE);
    ws = loadWorkspace(dir);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('maps targetRepo to its repo + a per-repo worktree path', () => {
    const { repo, worktreePath } = resolveTargetRepo(ws, fmTask('AISDLC-5', 'api'));
    expect(repo.id).toBe('api');
    expect(worktreePath).toBe(path.join(repo.worktreeRoot, 'aisdlc-5'));
  });

  test('throws when targetRepo is missing', () => {
    expect(() => resolveTargetRepo(ws, fmTask('AISDLC-6', undefined))).toThrow(/no targetRepo/);
  });

  test('throws when targetRepo is unknown', () => {
    expect(() => resolveTargetRepo(ws, fmTask('AISDLC-7', 'ghost'))).toThrow(/unknown repo/);
  });
});

describe('buildDepGraph', () => {
  test('topologically orders intra-repo deps', () => {
    const ws = { depGraphSpanning: false };
    const tasks = [fmTask('B', 'web', ['A']), fmTask('A', 'web'), fmTask('C', 'web', ['B'])];
    const { order } = buildDepGraph(ws, tasks);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
  });

  test('detects a cycle', () => {
    const ws = { depGraphSpanning: true };
    const tasks = [fmTask('A', 'web', ['B']), fmTask('B', 'web', ['A'])];
    expect(() => buildDepGraph(ws, tasks)).toThrow(/cycle detected/);
  });

  test('rejects a cross-repo edge when spanning is disabled', () => {
    const ws = { depGraphSpanning: false };
    const tasks = [fmTask('A', 'api'), fmTask('B', 'web', ['A'])];
    expect(() => buildDepGraph(ws, tasks)).toThrow(/depGraphSpanning/);
  });

  test('allows + records cross-repo edges when spanning is enabled', () => {
    const ws = { depGraphSpanning: true };
    const tasks = [fmTask('A', 'api'), fmTask('B', 'web', ['A'])];
    const { order, crossRepoEdges } = buildDepGraph(ws, tasks);
    expect(order).toEqual(['A', 'B']);
    expect(crossRepoEdges).toEqual([['A', 'B']]);
  });

  test('ignores unknown/external deps not in the task set', () => {
    const ws = { depGraphSpanning: false };
    const tasks = [fmTask('A', 'web', ['EXTERNAL-99'])];
    const { order } = buildDepGraph(ws, tasks);
    expect(order).toEqual(['A']);
  });
});
