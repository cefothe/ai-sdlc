const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const lk = require(path.join(ROOT, 'decision-engine', 'context-lookup.js'));
const dec = require(path.join(ROOT, 'decision-engine', 'decisions.js'));
const { architectureDoc, componentDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
const repo = require(path.join(ROOT, 'tests', 'helpers', 'git-repo.js'));

const CONTEXT = '## Personas\n- **Active trader**: trades daily\n\n## Glossary\n- Fill: an execution of an order\n\n## Current capabilities\nOrders and payments.\n';

describe('context lookups', () => {
  let dir;
  beforeEach(() => {
    dir = repo.makeRepo({
      'docs/architecture/overview.md': architectureDoc(),
      'docs/architecture/components/orders.md': componentDoc('Orders'),
      'docs/product/context.md': CONTEXT,
      'backlog/tasks/AISDLC-0007 - refund.md': '---\nid: AISDLC-0007\ntitle: refund via Payments\nreferences:\n  - services/payments/refund.ts\n---\n',
    });
    dec.writeDecision(dir, dec.newDecision({ id: 'DEC-0001', summary: 'Postgres', created: 't', context: 'one datastore', options: [{ id: 'pg', description: 'chosen' }, { id: 'mongo', description: 'rejected' }] }));
  });
  afterEach(() => repo.remove(dir));

  test('architectureLookup by path finds the owner with contracts, data and invariants', () => {
    const out = lk.architectureLookup(dir, { path: 'services/orders/cancel.ts' });
    expect(out).toMatch(/^Component: \*\*Orders\*\*/);
    expect(out).toMatch(/Storefront → Orders: REST/);
    expect(out).toMatch(/Orders owns the orders and order_items tables/);
    expect(out).toMatch(/No component reads another/);
    expect(out).toMatch(/Component doc \(docs\/architecture\/components\/orders\.md\):\n# Component: Orders/);
    expect(lk.architectureLookup(dir, { component: 'Payments' })).toMatch(/Component doc: none at docs\/architecture\/components\/payments\.md/);
  });

  test('architectureLookup by name, unknown names/paths, and the component list', () => {
    expect(lk.architectureLookup(dir, { component: 'payments' })).toMatch(/^Component: \*\*Payments\*\*/);
    expect(lk.architectureLookup(dir, { component: 'Billing' })).toMatch(/No component named "Billing"\. Known components: Storefront, Orders, Payments/);
    expect(lk.architectureLookup(dir, { path: 'scripts/x.js' })).toMatch(/No component owns scripts\/x\.js/);
    expect(lk.architectureLookup(dir, {})).toMatch(/^Components:\n- \*\*Storefront\*\*/);
  });

  test('architectureContracts filters by component', () => {
    expect(lk.architectureContracts(dir, { component: 'Payments' })).toBe('- Orders → Payments: library call, contract `services/payments/client.ts`');
  });

  test('productLookup matches lines and section names', () => {
    expect(lk.productLookup(dir, { query: 'fill' })).toBe('## Glossary\n- Fill: an execution of an order');
    expect(lk.productLookup(dir, { query: 'personas' })).toMatch(/^## Personas\n- \*\*Active trader\*\*/);
    expect(lk.productLookup(dir, {})).toMatch(/Product context sections:\n- Personas/);
  });

  test('specLookup renders a task spec (architecture slice) and validates the id', () => {
    expect(lk.specLookup(dir, { task: 'AISDLC-0007' })).toMatch(/Components this task touches:\n- \*\*Payments\*\*/);
    expect(lk.specLookup(dir, { task: '../etc' })).toMatch(/Give a backlog task id/);
    expect(lk.specLookup(dir, { task: 'AISDLC-0999' })).toMatch(/No task AISDLC-0999/);
  });

  test('decisionLookup renders an ADR in full and validates the id', () => {
    const out = lk.decisionLookup(dir, { id: 'DEC-0001' });
    expect(out).toMatch(/^DEC-0001 \[proposed\/project\]: Postgres/);
    expect(out).toMatch(/Context: one datastore/);
    expect(out).toMatch(/- mongo: rejected/);
    expect(lk.decisionLookup(dir, { id: 'DEC-9999' })).toBe('No decision DEC-9999.');
    expect(lk.decisionLookup(dir, { id: 'x' })).toMatch(/Give a decision id/);
  });

  test('missing documents are reported, not thrown', () => {
    fs.rmSync(path.join(dir, 'docs'), { recursive: true, force: true });
    expect(lk.architectureLookup(dir, { path: 'x' })).toMatch(/No architecture overview/);
    expect(lk.productLookup(dir, { query: 'x' })).toMatch(/No product context/);
  });
});
