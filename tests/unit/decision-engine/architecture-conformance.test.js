const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const conf = require(path.join(ROOT, 'decision-engine', 'architecture-conformance.js'));
const { loadOverviews } = require(path.join(ROOT, 'decision-engine', 'architecture-context.js'));
const { architectureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
const repo = require(path.join(ROOT, 'tests', 'helpers', 'git-repo.js'));

function overviewsOf(dir) {
  return loadOverviews(dir);
}

describe('checkConformance', () => {
  let dir;
  beforeEach(() => { dir = repo.makeRepo({ 'docs/architecture/overview.md': architectureDoc() }); });
  afterEach(() => repo.remove(dir));
  const codes = (r) => r.findings.map((f) => `${f.code}:${f.file}`);

  test('a change inside one component through declared contracts is clean', () => {
    const r = conf.checkConformance({
      files: ['services/orders/cancel.ts'],
      addedLines: new Map([['services/orders/cancel.ts', ["import { PaymentsClient } from '../payments/client';"]]]),
      overviews: overviewsOf(dir),
    });
    expect(r).toMatchObject({ status: 'clean', touched: ['Orders'] });
  });

  test('touching a component the feature architecture does not list is a major finding', () => {
    const input = { files: ['services/orders/cancel.ts', 'web/cart.tsx'], overviews: overviewsOf(dir) };
    const r = conf.checkConformance({ ...input, expectedComponents: ['Orders', 'Payments'] });
    expect(r.findings.map((f) => f.code)).toEqual(['outside-feature-architecture']);
    expect(r.findings[0]).toMatchObject({ severity: 'major' });
    expect(r.findings[0].message).toMatch(/touches Storefront/);
    expect(conf.checkConformance({ ...input, expectedComponents: ['orders', 'storefront'] }).status).toBe('clean');
    expect(conf.checkConformance(input).status).toBe('clean');
  });

  test('a file no component owns is a major unowned-file finding; docs/tests are exempt', () => {
    const r = conf.checkConformance({ files: ['scripts/hack.js', 'docs/x.md', 'tests/a.test.js', 'spikes/s1.mjs', 'testdata/k.json', 'fixtures/p.json'], overviews: overviewsOf(dir) });
    expect(codes(r)).toEqual(['unowned-file:scripts/hack.js']);
    expect(r.findings[0].severity).toBe('major');
  });

  test('an import crossing components without a declared contract is undeclared-coupling', () => {
    const r = conf.checkConformance({
      files: ['services/payments/refund.ts'],
      addedLines: new Map([['services/payments/refund.ts', ["import { orderRepo } from '../orders/repo';"]]]),
      overviews: overviewsOf(dir),
    });
    expect(codes(r)).toEqual(['undeclared-coupling:services/payments/refund.ts']);
    expect(r.findings[0].message).toMatch(/Payments → Orders/);
  });

  test('dependency manifests are a minor advisory', () => {
    const r = conf.checkConformance({ files: ['package.json'], overviews: overviewsOf(dir) });
    expect(r.findings).toEqual([expect.objectContaining({ code: 'dependency-change', severity: 'minor' })]);
  });

  test('no overview → skipped', () => {
    expect(conf.checkConformance({ files: ['x.js'], overviews: [] })).toMatchObject({ status: 'skipped' });
  });

  test('evaluateConformance reads the real branch diff', () => {
    repo.git(dir, 'checkout', '-q', '-b', 'feature');
    repo.commit(dir, { 'services/payments/refund.ts': "const r = require('../orders/repo');\n", 'tools/x.js': '1\n' }, 'change');
    const r = conf.evaluateConformance({ cwd: dir, base: 'main', runner: repo.runner });
    expect(codes(r).sort()).toEqual(['undeclared-coupling:services/payments/refund.ts', 'unowned-file:tools/x.js']);
    expect(conf.formatConformanceContext(r)).toMatch(/^Architecture conformance \(deterministic/);
    expect(conf.formatConformanceContext({ status: 'clean', findings: [] })).toBeNull();
  });

  test('monorepo: a project overview owns its subtree', () => {
    fs.mkdirSync(path.join(dir, 'packages/billing/docs/architecture'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'packages/billing/docs/architecture/overview.md'), architectureDoc().replace('(`web/`)', '(`src/web/`)').replace('(`services/orders/`)', '(`src/orders/`)').replace('(`services/payments/`)', '(`src/payments/`)'));
    const overviews = loadOverviews(dir, [{ name: 'billing', path: 'packages/billing' }]);
    const r = conf.checkConformance({ files: ['packages/billing/src/orders/a.ts'], overviews });
    expect(r).toMatchObject({ status: 'clean', touched: ['Orders'] });
    expect(overviews[1].components[1].paths).toEqual(['packages/billing/src/orders/']);
  });
});
