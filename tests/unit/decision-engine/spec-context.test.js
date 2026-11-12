const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const sc = require(path.join(ROOT, 'decision-engine', 'spec-context.js'));

const PRD = [
  '---', 'status: approved', 'featureId: sso', '---', '', '# PRD: SSO', '',
  '## Problem', 'Admins abandon onboarding because SSO is missing.', '',
  '## Scope', 'OAuth login for enterprise workspaces.', '',
  '## Non-goals', 'No SAML in this feature.', '',
  '## Acceptance criteria', '- [ ] logs in via OAuth', '- [ ] failure returns 401', '',
  '## Open questions', 'None.', '',
].join('\n');

const DESIGN = (status = 'approved') => [
  '---', `status: ${status}`, 'feature: sso', '---', '', '# Design: SSO', '',
  '## Context', 'See the PRD.', '',
  '## Data model', 'CREATE TABLE sessions (id UUID PRIMARY KEY);', '',
  '## Interfaces', 'GET /auth/callback', '',
].join('\n');

function project({ design } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-ctx-'));
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'design'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'sso.md'), PRD);
  if (design) fs.writeFileSync(path.join(root, 'docs', 'design', 'sso.md'), design);
  return root;
}

const task = (specRef = { source: 'prd', featureId: 'sso', artifactPath: 'docs/prd/sso.md' }) => ({ frontmatter: { id: 'AISDLC-1', title: 'SSO', specRef } });

describe('loadSpecForTask', () => {
  test('loads the PRD from specRef and the design doc from the featureId', () => {
    const root = project({ design: DESIGN() });
    try {
      const spec = sc.loadSpecForTask(root, task());
      expect(spec.prd.path).toBe(path.join('docs', 'prd', 'sso.md'));
      expect(spec.design.path).toBe(path.join('docs', 'design', 'sso.md'));
      expect(spec.design.status).toBe('approved');
      expect(spec.prd.sections.map((s) => s.heading)).toContain('Acceptance criteria');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a task with no specRef has no spec', () => {
    const root = project();
    try {
      const spec = sc.loadSpecForTask(root, { frontmatter: { id: 'X' } });
      expect(spec.prd).toBeNull();
      expect(spec.design).toBeNull();
      expect(sc.formatSpecContext(spec)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('paths escaping the root are ignored', () => {
    const root = project({ design: DESIGN() });
    try {
      const spec = sc.loadSpecForTask(root, task({ artifactPath: '../../etc/passwd', featureId: '../sso' }));
      expect(spec.prd).toBeNull();
      expect(spec.design).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('formatSpecContext', () => {
  test('renders both docs with their sections and the build-against-it instruction', () => {
    const root = project({ design: DESIGN() });
    try {
      const out = sc.formatSpecContext(sc.loadSpecForTask(root, task()));
      expect(out).toMatch(/SPECIFICATION/);
      expect(out).toMatch(/STOP and flag/);
      expect(out).toMatch(/### PRD — docs\/prd\/sso\.md \(status: approved\)/);
      expect(out).toMatch(/- \[ \] failure returns 401/);
      expect(out).toMatch(/CREATE TABLE sessions/);
      expect(out).toMatch(/GET \/auth\/callback/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('notes when the feature has no design doc', () => {
    const root = project();
    try {
      expect(sc.formatSpecContext(sc.loadSpecForTask(root, task()))).toMatch(/no design doc found/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('under a tight budget the buildable sections win and the rest are listed by name', () => {
    const big = (h, n) => ({ heading: h, content: 'x'.repeat(n), hasContent: true });
    const spec = {
      prd: { path: 'docs/prd/a.md', status: 'approved', sections: [
        { ...big('Problem', 3000), idx: 0, priority: 6 },
        { ...big('Acceptance criteria', 500), idx: 1, priority: 0 },
      ] },
      design: { path: 'docs/design/a.md', status: 'approved', sections: [
        { ...big('Context', 3000), idx: 0, priority: 7 },
        { ...big('Data model', 500), idx: 1, priority: 0 },
      ] },
    };
    const out = sc.formatSpecContext(spec, { maxChars: 1400 });
    expect(out).toMatch(/#### Acceptance criteria/);
    expect(out).toMatch(/#### Data model/);
    expect(out).toMatch(/omitted for budget — open docs\/prd\/a\.md for: Problem/);
    expect(out).toMatch(/omitted for budget — open docs\/design\/a\.md for: Context/);
  });

  test('a section that partly fits is truncated with a marker', () => {
    const spec = { prd: { path: 'p.md', status: 'approved', sections: [{ heading: 'Scope', content: 'y'.repeat(5000), idx: 0, priority: 1 }] }, design: null };
    const out = sc.formatSpecContext(spec, { maxChars: 1000 });
    expect(out).toMatch(/truncated — read the rest in the file/);
    expect(out.length).toBeLessThan(2000);
  });
});

describe('buildSpecForTask', () => {
  test('reports designApproved only for an approved design doc', () => {
    const approved = project({ design: DESIGN('approved') });
    const draft = project({ design: DESIGN('draft') });
    try {
      const a = sc.buildSpecForTask(approved, task());
      expect(a.designApproved).toBe(true);
      expect(a.text).toMatch(/SPECIFICATION/);
      expect(a.designPath).toBe(path.join('docs', 'design', 'sso.md'));
      expect(sc.buildSpecForTask(draft, task()).designApproved).toBe(false);
    } finally {
      fs.rmSync(approved, { recursive: true, force: true });
      fs.rmSync(draft, { recursive: true, force: true });
    }
  });
});

describe('bug tasks', () => {
  const { bugReport } = require(path.join(ROOT, 'tests', 'helpers', 'bug-report.js'));

  test('renders the bug report first, with the regressed feature as context', () => {
    const root = project({ design: DESIGN() });
    try {
      fs.mkdirSync(path.join(root, 'docs', 'bugs'));
      fs.writeFileSync(path.join(root, 'docs', 'bugs', 'order-double-cancel.md'), bugReport({ relatedPrd: 'docs/prd/sso.md' }));
      const t = task({ source: 'bug', featureId: 'order-double-cancel', artifactPath: 'docs/bugs/order-double-cancel.md' });
      const built = sc.buildSpecForTask(root, t);
      expect(built.kind).toBe('bug');
      expect(built.bugPath).toBe(path.join('docs', 'bugs', 'order-double-cancel.md'));
      expect(built.prdPath).toBe(path.join('docs', 'prd', 'sso.md'));
      expect(built.text).toMatch(/^BUG FIX — /);
      expect(built.text).toMatch(/must FAIL before the fix and PASS after/);
      expect(built.text).toMatch(/### Bug report — docs\/bugs\/order-double-cancel\.md \(status: confirmed\)/);
      expect(built.text).toMatch(/### Related PRD — docs\/prd\/sso\.md/);
      expect(built.text.indexOf('#### Reproduction')).toBeLessThan(built.text.indexOf('### Related PRD'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a bug report without relatedPrd renders alone', () => {
    const root = project();
    try {
      fs.mkdirSync(path.join(root, 'docs', 'bugs'));
      fs.writeFileSync(path.join(root, 'docs', 'bugs', 'b.md'), bugReport());
      const built = sc.buildSpecForTask(root, task({ source: 'bug', artifactPath: 'docs/bugs/b.md' }));
      expect(built).toMatchObject({ kind: 'bug', prdPath: null, designPath: null, designApproved: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('architecture slice', () => {
  const { architectureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));

  test('is appended to the spec for the components the task reaches', () => {
    const root = project({ design: DESIGN() });
    try {
      fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
      fs.writeFileSync(path.join(root, 'docs', 'architecture', 'overview.md'), architectureDoc());
      const t = task();
      t.frontmatter.references = ['services/payments/refund.ts'];
      const built = sc.buildSpecForTask(root, t);
      expect(built.architectureInjected).toBe(true);
      expect(built.text.indexOf('SPECIFICATION')).toBeLessThan(built.text.indexOf('SYSTEM ARCHITECTURE'));
      expect(built.text).toMatch(/Components this task touches:\n- \*\*Payments\*\*/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reaches a task with no PRD at all', () => {
    const root = project();
    try {
      fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
      fs.writeFileSync(path.join(root, 'docs', 'architecture', 'overview.md'), architectureDoc());
      const built = sc.buildSpecForTask(root, { frontmatter: { id: 'X', title: 'tidy the Storefront' } });
      expect(built.text).toMatch(/^SYSTEM ARCHITECTURE/);
      expect(built.text).toMatch(/Components this task touches:\n- \*\*Storefront\*\*/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('feature architecture', () => {
  const { architectureDoc, writeComponentDocs, writeFeatureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));

  test('sits between the PRD and the design, and its components select the architecture slice', () => {
    const root = project({ design: DESIGN() });
    try {
      fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
      fs.writeFileSync(path.join(root, 'docs', 'architecture', 'overview.md'), architectureDoc());
      writeComponentDocs(root);
      writeFeatureDoc(root, { feature: 'sso', components: ['Orders', 'Payments'] });
      const built = sc.buildSpecForTask(root, task());
      expect(built.featureArchitecturePath).toBe(path.join('docs', 'architecture', 'features', 'sso.md'));
      expect(built.featureComponents).toEqual(['Orders', 'Payments']);
      expect(built.text).toMatch(/change only its components, connect them only through its contracts/);
      const prd = built.text.indexOf('PRD — ');
      const feature = built.text.indexOf('Feature architecture — ');
      const design = built.text.indexOf('Design — ');
      expect(prd).toBeGreaterThan(-1);
      expect(feature).toBeGreaterThan(prd);
      expect(design).toBeGreaterThan(feature);
      expect(built.text).toMatch(/COMPONENT DOC — docs\/architecture\/components\/orders\.md/);
      expect(built.text).toMatch(/COMPONENT DOC — docs\/architecture\/components\/payments\.md/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a task without a feature doc has no feature components', () => {
    const root = project({ design: DESIGN() });
    try {
      const built = sc.buildSpecForTask(root, task());
      expect(built.featureArchitecturePath).toBeNull();
      expect(built.featureComponents).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('monorepo architecture slices', () => {
  const { architectureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));

  test('a touched subproject adds its own overview slice with project-relative paths', () => {
    const root = project();
    try {
      fs.mkdirSync(path.join(root, 'packages', 'shop', 'docs', 'architecture'), { recursive: true });
      fs.writeFileSync(path.join(root, 'packages', 'shop', 'docs', 'architecture', 'overview.md'), architectureDoc());
      const t = { frontmatter: { id: 'X', title: 'refund', references: ['packages/shop/services/payments/r.ts'] } };
      const built = sc.buildSpecForTask(root, t, { projects: [{ name: 'shop', path: 'packages/shop' }] });
      expect(built.architectureInjected).toBe(true);
      expect(built.text).toMatch(/SYSTEM ARCHITECTURE — packages\/shop\/docs\/architecture\/overview\.md/);
      expect(built.text).toMatch(/Components this task touches:\n- \*\*Payments\*\*/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
