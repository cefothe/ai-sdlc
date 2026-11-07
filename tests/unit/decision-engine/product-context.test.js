const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const pc = require(path.join(ROOT, 'decision-engine', 'product-context.js'));

const CONTEXT = [
  '---', 'owner: product', '---', '', '# Product context: Brokerage', '',
  '## Vision', 'The fastest self-directed brokerage for active retail traders in the EU.', '',
  '## Personas',
  '- **Active trader**: trades daily on mobile, wants fast fills and live P&L',
  '- Compliance officer — reviews best-execution reports monthly', '',
  '## Current capabilities', 'Equities and ETF trading, watchlists, price alerts, monthly statements.', '',
  '## Glossary', '- Fill: an execution of all or part of an order at a price', '',
  '## Metric baselines', '- Order success rate: 97.2% as of 2026-10 (source: orders dashboard)', '',
  '## Regulatory constraints', 'MiFID II best execution and RTS 28 reporting; 5-year order record retention.', '',
  '## Non-goals', 'No crypto, no copy-trading, no advisory/discretionary portfolio management.', '',
].join('\n');

function project({ context = CONTEXT, prds = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-ctx-'));
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true });
  if (context !== null) {
    fs.mkdirSync(path.join(root, 'docs', 'product'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'product', 'context.md'), context);
  }
  for (const [name, body] of Object.entries(prds)) fs.writeFileSync(path.join(root, 'docs', 'prd', name), body);
  return root;
}

const prd = (featureId, title, problem, status = 'approved') => [
  '---', `status: ${status}`, `featureId: ${featureId}`, '---', '', `# PRD: ${title}`, '',
  '## Problem', problem, '', '## Scope', `Scope of ${title}.`, '',
].join('\n');

describe('evaluateProductContext', () => {
  test('a complete context is valid and yields persona names', () => {
    const r = pc.evaluateProductContext(CONTEXT);
    expect(r.valid).toBe(true);
    expect(r.personas).toEqual(['Active trader', 'Compliance officer']);
  });

  test('the scaffold template is invalid (placeholders only)', () => {
    const r = pc.evaluateProductContext(fs.readFileSync(path.join(ROOT, 'docs', 'product', '_template.md'), 'utf8'));
    expect(r.valid).toBe(false);
    expect(r.emptySections).toEqual(expect.arrayContaining(['Vision', 'Glossary']));
    expect(r.personas).toEqual([]); // "<Persona name>" is a placeholder, not a persona
  });

  test('missing sections, no personas and non-numeric baselines are reported', () => {
    const md = CONTEXT
      .replace(/## Glossary[\s\S]*?(?=## Metric)/, '')
      .replace(/- \*\*Active trader\*\*[^\n]*\n- Compliance officer[^\n]*/, 'Our users are mostly traders on mobile and some ops staff.')
      .replace('97.2% as of 2026-10', 'good');
    const r = pc.evaluateProductContext(md);
    expect(r.missingSections).toEqual(['Glossary']);
    const codes = r.substanceIssues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['no-personas', 'baselines-not-numeric']));
    expect(r.valid).toBe(false);
  });

  test('section aliases are accepted', () => {
    const md = CONTEXT.replace('## Personas', '## Segments & personas').replace('## Regulatory constraints', '## Compliance');
    expect(pc.evaluateProductContext(md).valid).toBe(true);
  });
});

describe('listPrds / selectRelatedPrds', () => {
  test('indexes PRDs, skipping the template and README', () => {
    const root = project({ prds: {
      'price-alerts.md': prd('price-alerts', 'Price alerts', 'Traders miss price moves while away from the app.'),
      '_template.md': 'x', 'README.md': 'x',
    } });
    try {
      expect(pc.listPrds(root)).toEqual([{
        path: path.join('docs', 'prd', 'price-alerts.md'), featureId: 'price-alerts', title: 'Price alerts',
        status: 'approved', problem: 'Traders miss price moves while away from the app.',
      }]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('ranks related PRDs by term overlap and drops unrelated / excluded ones', () => {
    const prds = [
      { featureId: 'price-alerts', title: 'Price alerts', problem: 'Traders miss price moves while away' },
      { featureId: 'statements', title: 'Monthly statements', problem: 'Users need tax documents' },
      { featureId: 'smart-alerts', title: 'Smart price alerts', problem: 'Alerts on volatile price moves' },
    ];
    const ids = (r) => r.map((p) => p.featureId);
    expect(ids(pc.selectRelatedPrds(prds, 'trailing price alerts for volatile moves'))).toEqual(['smart-alerts', 'price-alerts']);
    expect(ids(pc.selectRelatedPrds(prds, 'trailing price alerts for volatile moves', { exclude: 'smart-alerts' }))).toEqual(['price-alerts']);
    expect(pc.selectRelatedPrds(prds, 'dark mode')).toEqual([]);
  });
});

describe('formatProductContext', () => {
  test('renders the instructions, the context doc, related PRDs and the PRD index', () => {
    const root = project({ prds: {
      'price-alerts.md': prd('price-alerts', 'Price alerts', 'Traders miss price moves while away from the app.'),
      'statements.md': prd('statements', 'Statements', 'Users need monthly tax documents.', 'draft'),
    } });
    try {
      const out = pc.formatProductContext(pc.loadProductContextForIdea(root, 'trailing price alerts for traders'));
      expect(out).toMatch(/PRODUCT CONTEXT/);
      expect(out).toMatch(/baseline → target/);
      expect(out).toMatch(/### Product context — docs\/product\/context\.md/);
      expect(out).toMatch(/\*\*Active trader\*\*/);
      expect(out).toMatch(/### Related PRD — docs\/prd\/price-alerts\.md/);
      expect(out).toMatch(/- statements \[draft\] — Statements: Users need monthly tax documents\./);
      expect(out).not.toMatch(/### Related PRD — docs\/prd\/statements\.md/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('warns when the context doc is missing or incomplete', () => {
    const none = project({ context: null });
    const bad = project({ context: CONTEXT.replace(/## Vision[\s\S]*?(?=## Personas)/, '') });
    try {
      expect(pc.formatProductContext(pc.loadProductContextForIdea(none, 'x'))).toMatch(/no product context doc/);
      expect(pc.formatProductContext(pc.loadProductContextForIdea(bad, 'x'))).toMatch(/WARNING: docs\/product\/context\.md is incomplete \(missing sections: Vision\)/);
    } finally {
      fs.rmSync(none, { recursive: true, force: true });
      fs.rmSync(bad, { recursive: true, force: true });
    }
  });
});

describe('evaluateProductContextRoot', () => {
  test('null when the repo has no context doc', () => {
    const root = project({ context: null });
    try {
      expect(pc.evaluateProductContextRoot(root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('recordShippedCapability', () => {
  test('appends the shipped feature to Current capabilities once', () => {
    const root = project();
    try {
      const args = { title: 'Trailing alerts', prdPath: 'docs/prd/trailing-alerts.md', taskId: 'AISDLC-0009' };
      expect(pc.recordShippedCapability(root, args)).toEqual({ recorded: true, line: '- Trailing alerts — docs/prd/trailing-alerts.md (shipped in AISDLC-0009)' });
      const text = fs.readFileSync(path.join(root, 'docs', 'product', 'context.md'), 'utf8');
      expect(text).toMatch(/monthly statements\.\n- Trailing alerts — docs\/prd\/trailing-alerts\.md \(shipped in AISDLC-0009\)\n\n## Glossary/);
      expect(pc.recordShippedCapability(root, args)).toEqual({ recorded: false, reason: 'already recorded' });
      expect(pc.evaluateProductContext(fs.readFileSync(path.join(root, 'docs', 'product', 'context.md'), 'utf8')).valid).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('no context doc → not recorded, with the reason', () => {
    const root = project({ context: null });
    try {
      expect(pc.recordShippedCapability(root, { title: 't', prdPath: 'p', taskId: 'x' })).toEqual({ recorded: false, reason: 'no docs/product/context.md' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
