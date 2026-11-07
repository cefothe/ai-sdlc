const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ac = require(path.join(ROOT, 'decision-engine', 'architecture-context.js'));
const { architectureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
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
});
