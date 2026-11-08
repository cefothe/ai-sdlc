const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const mono = require(path.join(ROOT, 'decision-engine', 'monorepo.js'));

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-'));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

describe('detectProjects', () => {
  let root;
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('package.json workspaces with a glob, names from each package.json', () => {
    root = repo({
      'package.json': JSON.stringify({ workspaces: ['packages/*', 'apps/web'] }),
      'packages/orders/package.json': JSON.stringify({ name: '@shop/orders' }),
      'packages/payments/index.js': '',
      'apps/web/index.js': '',
    });
    expect(mono.detectProjects(root)).toEqual([
      { name: 'web', path: 'apps/web' },
      { name: '@shop/orders', path: 'packages/orders' },
      { name: 'payments', path: 'packages/payments' },
    ]);
  });

  test('pnpm-workspace.yaml, go.work and Cargo workspace members', () => {
    root = repo({
      'pnpm-workspace.yaml': 'packages:\n  - "svc/*"\n',
      'svc/a/x': '', 'go.work': 'go 1.22\nuse (\n  ./tools/gen\n)\n', 'tools/gen/main.go': '',
      'Cargo.toml': '[workspace]\nmembers = ["crates/core"]\n', 'crates/core/src/lib.rs': '',
    });
    expect(mono.detectProjects(root).map((p) => p.path)).toEqual(['crates/core', 'svc/a', 'tools/gen']);
  });

  test('declared projects win; missing dirs, traversal and auto-detect off are ignored', () => {
    root = repo({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }), 'packages/a/x': '', 'services/billing/x': '' });
    expect(mono.detectProjects(root, { declared: ['services/billing', { name: 'Ghost', path: 'nope' }, '../etc'] })).toEqual([{ name: 'billing', path: 'services/billing' }]);
    expect(mono.detectProjects(root, { autoDetect: false })).toEqual([]);
  });
});

describe('projectsForPaths', () => {
  test('owning projects, deepest first', () => {
    const projects = [{ name: 'a', path: 'packages/a' }, { name: 'b', path: 'packages/b' }, { name: 'a-sub', path: 'packages/a/sub' }];
    expect(mono.projectsForPaths(projects, ['packages/a/sub/x.js', 'packages/b/y.js']).map((p) => p.name)).toEqual(['a-sub', 'a', 'b']);
    expect(mono.projectsForPaths(projects, ['docs/x.md'])).toEqual([]);
  });
});
