const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ac = require(path.join(ROOT, 'decision-engine', 'architecture-context.js'));
const { architectureDoc, writeComponentDocs } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
const codes = (r) => r.substanceIssues.map((i) => i.code);

function withArch(body, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'));
  try {
    if (body !== null) {
      fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
      fs.writeFileSync(path.join(root, 'docs', 'architecture', 'overview.md'), body);
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('evaluateArchitecture', () => {
  test('a complete overview is valid and lists its components', () => {
    const r = ac.evaluateArchitecture(architectureDoc());
    expect(r.reasons).toEqual([]);
    expect(r.components).toEqual(['Storefront', 'Orders', 'Payments']);
  });

  test('components without code paths, contracts without edges and prose invariants are invalid', () => {
    const md = architectureDoc()
      .replace(/- \*\*Storefront\*\* \(`web\/`\)/, '- **Storefront**').replace(/ \(`services\/orders\/`\)/, '').replace(/ \(`services\/payments\/`\)/, '')
      .replace(/- Storefront → Orders[^\n]*\n- Orders → Payments[^\n]*/, 'The storefront calls orders, which calls payments.')
      .replace(/- No component reads[^\n]*\n- Every external call[^\n]*/, 'Components keep to their own data and use timeouts.');
    expect(codes(ac.evaluateArchitecture(md))).toEqual(expect.arrayContaining(['no-components', 'no-contracts', 'no-invariants']));
  });

  test('the template is invalid; aliases are accepted', () => {
    expect(ac.evaluateArchitecture(fs.readFileSync(path.join(ROOT, 'docs', 'architecture', '_template.md'), 'utf8')).valid).toBe(false);
    const md = architectureDoc().replace('## Components', '## Services').replace('## Invariants', '## Architectural rules');
    expect(ac.evaluateArchitecture(md).valid).toBe(true);
  });

  test('evaluateArchitectureRoot is null without the doc', () => {
    withArch(null, (root) => expect(ac.evaluateArchitectureRoot(root)).toBeNull());
  });

  test('evaluateArchitectureRoot requires a valid doc per component', () => {
    withArch(architectureDoc(), (root) => {
      const missing = ac.evaluateArchitectureRoot(root);
      expect(missing.valid).toBe(false);
      expect(codes(missing).filter((c) => c === 'missing-component-doc')).toHaveLength(3);
      expect(missing.reasons.join('\n')).toContain('docs/architecture/components/orders.md');

      writeComponentDocs(root);
      const ok = ac.evaluateArchitectureRoot(root);
      expect(ok.reasons).toEqual([]);
      expect(ok.componentDocs.map((d) => d.valid)).toEqual([true, true, true]);

      fs.writeFileSync(path.join(root, 'docs/architecture/components/payments.md'), '# Component: Payments\n\n## Responsibility\nCharges.\n');
      const bad = ac.evaluateArchitectureRoot(root);
      expect(codes(bad)).toContain('component-doc-invalid');
      expect(bad.valid).toBe(false);
    });
  });

  test('the untouched scaffold asks for no component docs', () => {
    withArch(fs.readFileSync(path.join(ROOT, 'docs', 'architecture', '_template.md'), 'utf8'), (root) => {
      const r = ac.evaluateArchitectureRoot(root);
      expect(r.scaffold).toBe(true);
      expect(r.componentDocs).toEqual([]);
    });
  });
});

describe('formatArchitectureContext', () => {
  test('a task reaching Orders by path gets Orders, its contracts and data, every invariant', () => {
    withArch(architectureDoc(), (root) => {
      const out = ac.formatArchitectureContext(root, { paths: ['services/orders/cancel.ts'] });
      expect(out).toMatch(/^SYSTEM ARCHITECTURE — docs\/architecture\/overview\.md/);
      expect(out).toMatch(/Components this task touches:\n- \*\*Orders\*\*/);
      expect(out).not.toMatch(/- \*\*Storefront\*\*/);
      expect(out).toMatch(/- Storefront → Orders: REST/);
      expect(out).toMatch(/- Orders → Payments: library call/);
      expect(out).toMatch(/- Orders owns the orders and order_items tables/);
      expect(out).not.toMatch(/Payments owns the payments table/);
      expect(out).toMatch(/Invariants \(all apply\):\n- No component reads/);
      expect(out).toMatch(/Other components .*: Storefront, Payments/);
    });
  });

  test('a component named in the spec text is relevant; no match lists every component', () => {
    withArch(architectureDoc(), (root) => {
      expect(ac.formatArchitectureContext(root, { texts: ['Refund via the Payments component'] })).toMatch(/Components this task touches:\n- \*\*Payments\*\*/);
      const none = ac.formatArchitectureContext(root, { texts: ['dark mode'] });
      expect(none).toMatch(/none matched this task/);
      expect(none).toMatch(/\*\*Storefront\*\*[\s\S]*\*\*Orders\*\*[\s\S]*\*\*Payments\*\*/);
    });
  });

  test('null without an overview', () => {
    withArch(null, (root) => expect(ac.formatArchitectureContext(root, {})).toBeNull());
  });

  test('the touched components\' docs follow the overview slice, within the budget', () => {
    withArch(architectureDoc(), (root) => {
      writeComponentDocs(root);
      const out = ac.formatArchitectureContext(root, { paths: ['services/orders/cancel.ts'] });
      expect(out).toMatch(/COMPONENT DOC — docs\/architecture\/components\/orders\.md\n# Component: Orders/);
      expect(out).toContain('## Key flows');
      expect(out).not.toContain('component: Orders'); // frontmatter stripped
      expect(out).not.toContain('components/payments.md');
      const small = ac.formatArchitectureContext(root, { paths: ['services/orders/cancel.ts'], maxChars: 1500 });
      expect(small.length).toBeLessThan(1700);
      expect(small).toContain('COMPONENT DOC — docs/architecture/components/orders.md');
    });
  });
});

describe('evaluateArchitecture — diagrams', () => {
  test('an overview without a component diagram or a sequence diagram is invalid', () => {
    const md = architectureDoc().replace(/```mermaid[\s\S]*?```/g, '');
    const r = ac.evaluateArchitecture(md);
    expect(r.substanceIssues.map((i) => i.code)).toEqual(expect.arrayContaining(['no-component-diagram', 'no-sequence-diagram']));
    expect(r.valid).toBe(false);
  });

  test('a component diagram that leaves out a listed component is invalid', () => {
    const md = architectureDoc().replace('  Orders -->|PaymentsClient| Payments\n', '');
    const r = ac.evaluateArchitecture(md);
    const issue = r.substanceIssues.find((i) => i.code === 'diagram-missing-component');
    expect(issue.message).toContain('Payments');
    expect(issue.message).not.toContain('Storefront');
    expect(r.valid).toBe(false);
  });

  test('the complete overview draws every component', () => {
    expect(ac.evaluateArchitecture(architectureDoc()).substanceIssues.map((i) => i.code)).not.toContain('diagram-missing-component');
  });
});
