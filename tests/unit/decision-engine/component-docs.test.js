const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const cd = require(path.join(ROOT, 'decision-engine', 'component-docs.js'));
const { componentDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
const codes = (r) => r.substanceIssues.map((i) => `${i.code}:${i.section}`);

describe('evaluateComponentDoc', () => {
  test('a complete doc naming the overview paths is valid', () => {
    const r = cd.evaluateComponentDoc(componentDoc('Orders'), { name: 'Orders', paths: ['services/orders/'] });
    expect(r.reasons).toEqual([]);
    expect(r.valid).toBe(true);
  });

  test('the template is invalid', () => {
    const r = cd.evaluateComponentDoc(fs.readFileSync(cd.TEMPLATE_PATH, 'utf8'), { name: 'Orders', paths: ['services/orders/'] });
    expect(r.valid).toBe(false);
  });

  test('Code must name every path the overview gives the component', () => {
    const r = cd.evaluateComponentDoc(componentDoc('Orders'), { name: 'Orders', paths: ['services/orders/', 'jobs/orders/'] });
    expect(codes(r)).toContain('code-paths-mismatch:Code');
    expect(r.reasons.join()).toContain('`jobs/orders/`');
  });

  test('Interfaces must be concrete; structure and key flows need their diagrams', () => {
    const md = componentDoc('Orders')
      .replace(/## Interfaces\n[^\n]*/, '## Interfaces\nIt exposes the usual operations for orders to the rest of the shop.')
      .replace(/## Internal structure\n```mermaid[\s\S]*?```/, '## Internal structure')
      .replace(/## Key flows\n```mermaid[\s\S]*?```/, '## Key flows\nA request comes in, gets validated and is stored, or rejected on conflict.');
    expect(codes(cd.evaluateComponentDoc(md, { paths: ['services/orders/'] }))).toEqual(expect.arrayContaining([
      'section-not-concrete:Interfaces', 'missing-diagram:Internal structure', 'missing-diagram:Key flows',
    ]));
  });

  test('a classDiagram counts as the internal-structure diagram', () => {
    const md = componentDoc('Orders').replace('flowchart LR\n  Handler --> Service --> Repo', 'classDiagram\n  Service <|-- OrderService');
    expect(codes(cd.evaluateComponentDoc(md, { paths: ['services/orders/'] }))).not.toContain('missing-diagram:Internal structure');
  });
});

describe('componentDocPath', () => {
  test('a link in the list item wins; else components/<slug>.md beside the overview', () => {
    expect(cd.componentDocPath('docs/architecture/overview.md', { name: 'Order Service', line: '**Order Service** (`svc/`)' })).toBe('docs/architecture/components/order-service.md');
    expect(cd.componentDocPath('docs/architecture/overview.md', { name: 'Orders', line: '**Orders** Details: [x](components/ord.md)' })).toBe('docs/architecture/components/ord.md');
    expect(cd.componentDocPath('packages/a/docs/architecture/overview.md', { name: 'Api', line: '**Api**' })).toBe('packages/a/docs/architecture/components/api.md');
  });

  test('a link escaping the components directory falls back to the slug path', () => {
    expect(cd.componentDocPath('docs/architecture/overview.md', { name: 'Orders', line: '**Orders** [x](components/../../../etc/passwd.md)' })).toBe('docs/architecture/components/orders.md');
  });
});

describe('evaluateComponentDocs / scaffoldComponentDoc', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdocs-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('reports missing and invalid docs per component', () => {
    fs.mkdirSync(path.join(root, 'docs/architecture/components'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/architecture/components/orders.md'), componentDoc('Orders'));
    const res = cd.evaluateComponentDocs(root, 'docs/architecture/overview.md', [
      { name: 'Orders', paths: ['services/orders/'], line: '' },
      { name: 'Payments', paths: ['services/payments/'], line: '' },
    ]);
    expect(res.map((d) => [d.name, d.exists, d.valid])).toEqual([['Orders', true, true], ['Payments', false, false]]);
    expect(res[1].path).toBe('docs/architecture/components/payments.md');
  });

  test('a scaffold fills name and paths but stays invalid', () => {
    const md = cd.scaffoldComponentDoc(fs.readFileSync(cd.TEMPLATE_PATH, 'utf8'), { name: 'Orders', paths: ['services/orders/'] });
    expect(md).toMatch(/^component: "Orders"$/m);
    expect(md).toMatch(/^# Component: Orders$/m);
    expect(md).toMatch(/^- `services\/orders\/` — <what lives here>$/m);
    expect(cd.evaluateComponentDoc(md, { name: 'Orders', paths: ['services/orders/'] }).valid).toBe(false);
  });

  test('CLI gates one doc: 0 valid, 2 invalid, 64 without an argument', () => {
    const cli = path.join(ROOT, 'decision-engine', 'component-docs.js');
    const good = path.join(root, 'good.md');
    fs.writeFileSync(good, componentDoc('Orders'));
    expect(spawnSync(process.execPath, [cli, good], { encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync(process.execPath, [cli, cd.TEMPLATE_PATH], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status).toBe(64);
  });
});
