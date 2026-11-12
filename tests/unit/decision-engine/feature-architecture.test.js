const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const fa = require(path.join(ROOT, 'decision-engine', 'feature-architecture.js'));
const { featureDoc, writeFeatureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
const codes = (r) => r.substanceIssues.map((i) => i.code);
const advisories = (r) => r.advisory.map((a) => a.code);

const overview = {
  components: ['Storefront', 'Orders', 'Payments', 'Search'],
  edges: [
    { from: 'Storefront', to: 'Orders' },
    { from: 'Orders', to: 'Payments' },
  ],
};

function tmpRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-arch-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('evaluateFeatureArchitecture', () => {
  test('a complete journey across the overview components is valid', () => {
    const r = fa.evaluateFeatureArchitecture(featureDoc(), { overview });
    expect(r.reasons).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.components).toEqual(['Storefront', 'Orders', 'Payments']);
    expect(r.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['Storefront>Orders', 'Orders>Payments']);
  });

  test('the template is invalid: no components, placeholder sections', () => {
    const r = fa.evaluateFeatureArchitecture(fs.readFileSync(fa.TEMPLATE_PATH, 'utf8'), { overview });
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain('no-components-declared');
    expect(r.emptySections.length).toBeGreaterThan(0);
  });

  test('every required section is enforced', () => {
    const md = featureDoc().replace(/## Quality attributes\n[^\n]*\n/, '');
    expect(fa.evaluateFeatureArchitecture(md, { overview }).missingSections).toEqual(['Quality attributes']);
  });

  test('a component the overview does not know is rejected', () => {
    const md = featureDoc({ components: ['Storefront', 'Orders', 'Payments', 'Ledger'] });
    const r = fa.evaluateFeatureArchitecture(md, { overview });
    expect(codes(r)).toContain('unknown-component');
    expect(r.reasons.join(' ')).toContain('Ledger');
  });

  test('the component diagram and the sequence diagram must show every listed component', () => {
    const md = featureDoc({ components: ['Storefront', 'Orders', 'Payments', 'Search'] });
    const r = fa.evaluateFeatureArchitecture(md, { overview });
    expect(codes(r)).toEqual(expect.arrayContaining(['diagram-missing-component', 'sequence-missing-component']));
    expect(r.reasons.join(' ')).toMatch(/does not show Search/);
    expect(r.reasons.join(' ')).toMatch(/no participant for Search/);
  });

  test('missing diagrams are reported per section', () => {
    const md = featureDoc().replace(/```mermaid[\s\S]*?```/g, '');
    expect(codes(fa.evaluateFeatureArchitecture(md, { overview }))).toEqual(expect.arrayContaining(['no-component-diagram', 'no-sequence-diagram']));
  });

  test('the interactions must state a failure path', () => {
    const md = featureDoc()
      .replace('  alt timeout\n    Payments-->>Orders: error\n    Orders-->>Storefront: 503, retry later\n  end\n', '  Payments-->>Orders: ok\n')
      .replace('The order is created before the charge; a charge timeout leaves it pending and the retry is idempotent on the order id.', 'The order is created before the charge and confirmed once it succeeds.');
    expect(codes(fa.evaluateFeatureArchitecture(md, { overview }))).toContain('no-failure-path');
  });

  test('a contract absent from the overview is rejected', () => {
    const md = featureDoc().replace('- Orders → Payments: library call', '- Storefront → Payments: REST');
    const r = fa.evaluateFeatureArchitecture(md, { overview });
    expect(codes(r)).toContain('contract-not-in-overview');
    expect(r.reasons.join(' ')).toContain('Storefront → Payments');
  });

  test('a contract reaching an unlisted overview component is rejected', () => {
    const md = featureDoc({ components: ['Storefront', 'Orders'] })
      .replace('  Orders -->|charge| Payments\n', '').replace('  Orders->>Payments: charge()\n', '');
    const r = fa.evaluateFeatureArchitecture(md, { overview });
    expect(codes(r)).toContain('contract-component-undeclared');
    expect(r.reasons.join(' ')).toMatch(/reach Payments/);
  });

  test('a multi-component journey with no contract edge is rejected', () => {
    const md = featureDoc().replace(/- Storefront → Orders[^\n]*\n- Orders → Payments[^\n]*/, 'The storefront calls orders, which charges payments.');
    expect(codes(fa.evaluateFeatureArchitecture(md, { overview }))).toContain('no-contracts');
  });

  test('without an overview the cross-checks are skipped', () => {
    const md = featureDoc({ components: ['Storefront', 'Orders', 'Payments'] }).replace('- Orders → Payments', '- Orders → Ledger');
    expect(fa.evaluateFeatureArchitecture(md).valid).toBe(true);
  });

  test('advisories: draft status, design-level DDL, an isolated component', () => {
    const md = featureDoc({ status: 'draft' })
      .replace('Storefront owns nothing durable.', 'Storefront owns nothing durable. CREATE TABLE orders (id BIGINT);')
      .replace('- Orders → Payments: library call, `services/payments/client.ts`', '');
    const r = fa.evaluateFeatureArchitecture(md);
    expect(advisories(r)).toEqual(expect.arrayContaining(['not-approved', 'too-detailed', 'isolated-component']));
  });

  test('declaredComponents accepts a YAML list or a comma string and drops placeholders', () => {
    expect(fa.declaredComponents({ components: ['Orders', '**Payments**', '<name>'] })).toEqual(['Orders', 'Payments']);
    expect(fa.declaredComponents({ components: 'Orders, Payments' })).toEqual(['Orders', 'Payments']);
    expect(fa.declaredComponents({})).toEqual([]);
  });
});

describe('feature architecture files', () => {
  test('evaluateFeatureArchitectures reads every doc beside the overview, skipping the template', () => {
    tmpRoot((root) => {
      writeFeatureDoc(root);
      writeFeatureDoc(root, { feature: 'refunds', components: ['Orders', 'Payments'] });
      fs.writeFileSync(path.join(root, 'docs/architecture/features/_template.md'), '# template');
      const res = fa.evaluateFeatureArchitectures(root, 'docs/architecture/overview.md', overview);
      expect(res.map((r) => r.feature)).toEqual(['checkout', 'refunds']);
      expect(res.map((r) => r.path)).toEqual(['docs/architecture/features/checkout.md', 'docs/architecture/features/refunds.md']);
      expect(res[0].valid).toBe(true);
      expect(res[1].exists).toBe(true);
    });
  });

  test('no features directory → no docs', () => {
    tmpRoot((root) => expect(fa.evaluateFeatureArchitectures(root, 'docs/architecture/overview.md', overview)).toEqual([]));
  });

  test('readFeatureArchitecture refuses unsafe slugs', () => {
    tmpRoot((root) => {
      writeFeatureDoc(root);
      expect(fa.readFeatureArchitecture(root, 'docs/architecture/overview.md', 'checkout')).toContain('# Feature architecture: checkout');
      expect(fa.readFeatureArchitecture(root, 'docs/architecture/overview.md', '../../etc/passwd')).toBeNull();
      expect(fa.readFeatureArchitecture(root, 'docs/architecture/overview.md', 'missing')).toBeNull();
    });
  });

  test('featuresByComponent and the matrix give the reverse index', () => {
    const evals = [
      { feature: 'checkout', path: 'docs/architecture/features/checkout.md', status: 'approved', components: ['Storefront', 'Orders', 'Payments'] },
      { feature: 'refunds', path: 'docs/architecture/features/refunds.md', status: 'draft', components: ['Orders', 'Payments'] },
    ];
    const index = fa.featuresByComponent(evals);
    expect(index.get('orders').map((f) => f.feature)).toEqual(['checkout', 'refunds']);
    expect(index.get('storefront').map((f) => f.feature)).toEqual(['checkout']);
    const matrix = fa.formatFeatureMatrix(evals, ['Storefront', 'Orders', 'Payments']);
    expect(matrix.split('\n')).toEqual([
      '| Feature | Storefront | Orders | Payments |',
      '|---|---|---|---|',
      '| [checkout](docs/architecture/features/checkout.md) | ● | ● | ● |',
      '| [refunds](docs/architecture/features/refunds.md) |  | ● | ● |',
    ]);
    expect(fa.formatFeatureMatrix([], [])).toBe('No feature architecture docs.');
  });

  test('scaffoldFeatureArchitecture fills the frontmatter and stays invalid until written', () => {
    const md = fa.scaffoldFeatureArchitecture(fs.readFileSync(fa.TEMPLATE_PATH, 'utf8'), { feature: 'checkout', relatedPrd: 'docs/prd/checkout.md', components: ['Orders', 'Payments'] });
    expect(md).toMatch(/^feature: checkout$/m);
    expect(md).toMatch(/^relatedPrd: docs\/prd\/checkout\.md$/m);
    expect(md).toMatch(/^components: \["Orders", "Payments"\]$/m);
    const r = fa.evaluateFeatureArchitecture(md, { overview });
    expect(r.components).toEqual(['Orders', 'Payments']);
    expect(r.valid).toBe(false);
  });
});
