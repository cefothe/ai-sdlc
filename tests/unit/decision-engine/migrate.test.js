const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const mig = require(path.join(ROOT, 'decision-engine', 'migrate.js'));
const dec = require(path.join(ROOT, 'decision-engine', 'decisions.js'));

// A pre-migration PRD (the old 6-section shape) and design doc.
const OLD_PRD = [
  '---', 'status: approved', 'featureId: sso', '---', '', '# PRD: SSO', '',
  '## Problem', 'Admins cannot sign in with SSO and abandon onboarding.', '',
  '## Target user', 'Enterprise admins during first-run workspace setup.', '',
  '## Success metrics', 'SSO activation +5pp within 30 days of launch.', '',
  '## Scope', 'OAuth login only; SAML deferred to a later release.', '',
  '## Acceptance criteria', '- [ ] logs in via OAuth', '- [ ] failure returns 401', '',
  '## Open questions', 'None.', '',
].join('\n');

const OLD_DESIGN = [
  '---', 'status: approved', 'feature: sso', 'relatedAdrs: [DEC-0001]', '---', '', '# Design: SSO', '',
  '## Context', 'Enterprise SSO to reduce onboarding abandonment; see the PRD.', '',
  '## Architecture', 'An OAuth broker module fronting the identity provider.', '',
  '## Data model', 'sessions and oauth_state tables keyed by user.', '',
  '## Decisions', 'OAuth over SAML — DEC-0001.', '',
  '## Test strategy', 'Unit tests for the broker; integration for the callback.', '',
].join('\n');

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-'));
  const write = (rel, body) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body); };
  write('docs/prd/sso.md', OLD_PRD);
  write('docs/design/sso.md', OLD_DESIGN);
  write('backlog/tasks/AISDLC-0001 - sso.md', [
    '---', 'id: AISDLC-0001', 'title: SSO', 'status: To Do', 'labels: []', 'references:', '  - docs/design/sso.md',
    'specRef:', '  source: prd', '  featureId: sso', '  artifactPath: docs/prd/sso.md', '---', '',
    '## Acceptance Criteria', '<!-- AC:BEGIN -->', '- [ ] #1 logs in via OAuth', '<!-- AC:END -->', '',
  ].join('\n'));
  write('backlog/tasks/AISDLC-0002 - crash.md', ['---', 'id: AISDLC-0002', 'title: crash on save', 'status: To Do', 'labels: [bug]', '---', '', '## Acceptance Criteria', '- [ ] no crash', ''].join('\n'));
  dec.writeDecision(root, dec.newDecision({ id: 'DEC-0001', summary: 'OAuth over SAML', created: 't', options: [{ id: 'oauth', description: 'oauth' }] }));
  return root;
}

describe('scanArtifacts', () => {
  let root;
  beforeEach(() => { root = project(); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('reports every artifact that fails the current gates, with in-flight tasks', () => {
    const r = mig.scanArtifacts(root);
    expect(r.summary).toMatchObject({ prds: '0/1 ok', designs: '0/1 ok', adrs: '0/1 ok', tasks: '2 need attention', productContext: 'missing', architecture: 'missing', clean: false });
    expect(r.prds[0]).toMatchObject({ path: path.join('docs', 'prd', 'sso.md'), inFlightTasks: ['AISDLC-0001'] });
    expect(r.prds[0].missingSections).toEqual(['Non-goals', 'User flows', 'Edge cases', 'Non-functional requirements']);
    expect(r.designs[0].missingSections).toEqual(['Interfaces', 'Data flow', 'Risks']);
    expect(r.designs[0].inFlightTasks).toEqual(['AISDLC-0001']);
    expect(r.adrs[0].issues.join(' ')).toMatch(/missing context/);
    const taskIssues = Object.fromEntries(r.tasks.map((t) => [t.id, t.issues.join(' ')]));
    expect(taskIssues['AISDLC-0001']).toMatch(/1 PRD acceptance criteria not in the task/);
    expect(taskIssues['AISDLC-0002']).toMatch(/without a bug report/);
    expect(mig.formatReport(r)).toMatch(/\[blocks AISDLC-0001\]/);
  });

  test('the scan is read-only', () => {
    mig.scanArtifacts(root);
    expect(fs.readFileSync(path.join(root, 'docs', 'prd', 'sso.md'), 'utf8')).toBe(OLD_PRD);
    expect(fs.existsSync(path.join(root, 'docs', 'product', 'context.md'))).toBe(false);
  });
});

describe('applyStructuralFixes', () => {
  let root;
  beforeEach(() => { root = project(); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('adds skeletons, relatedPrd and AC placeholders — and nothing passes by migration alone', () => {
    const changes = mig.applyStructuralFixes(root, mig.scanArtifacts(root));
    expect(changes.map((c) => c.path)).toEqual(expect.arrayContaining([
      path.join('docs', 'product', 'context.md'), path.join('docs', 'architecture', 'overview.md'), path.join('docs', 'prd', 'sso.md'), path.join('docs', 'design', 'sso.md'),
    ]));
    const prd = fs.readFileSync(path.join(root, 'docs', 'prd', 'sso.md'), 'utf8');
    expect(prd).toMatch(/## Non-goals\n<What this feature explicitly does NOT do/);
    expect(prd).toMatch(/^status: approved$/m);
    const design = fs.readFileSync(path.join(root, 'docs', 'design', 'sso.md'), 'utf8');
    expect(design).toMatch(/^relatedPrd: docs\/prd\/sso\.md$/m);
    expect(design).toMatch(/<AC1 — test layer \+ what proves it: "logs in via OAuth">/);
    expect(design).toMatch(/## Interfaces\n</);

    const after = mig.scanArtifacts(root);
    expect(after.prds[0].missingSections).toEqual([]);
    expect(after.prds[0].ok).toBe(false);
    expect(after.designs[0].missingSections).toEqual([]);
    expect(after.designs[0].unmappedAcs).toEqual(['AC1', 'AC2']);
    expect(after.designs[0].ok).toBe(false);
  });

  test('scaffolds a doc for every component of an existing overview — still not ok', () => {
    const { architectureDoc } = require(path.join(ROOT, 'tests', 'helpers', 'architecture-doc.js'));
    fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'architecture', 'overview.md'), architectureDoc());
    const changes = mig.applyStructuralFixes(root, mig.scanArtifacts(root));
    expect(changes.filter((c) => /component doc scaffold/.test(c.change)).map((c) => c.path).sort()).toEqual([
      'docs/architecture/components/orders.md', 'docs/architecture/components/payments.md', 'docs/architecture/components/storefront.md',
    ]);
    expect(fs.readFileSync(path.join(root, 'docs/architecture/components/orders.md'), 'utf8')).toMatch(/^- `services\/orders\/` — <what lives here>$/m);
    const after = mig.scanArtifacts(root);
    expect(after.architecture.ok).toBe(false);
    expect(after.architecture.componentDocs.every((d) => d.exists && !d.valid)).toBe(true);
  });

  test('re-applying is idempotent', () => {
    mig.applyStructuralFixes(root, mig.scanArtifacts(root));
    const snapshot = ['docs/prd/sso.md', 'docs/design/sso.md'].map((f) => fs.readFileSync(path.join(root, f), 'utf8'));
    expect(mig.applyStructuralFixes(root, mig.scanArtifacts(root))).toEqual([]);
    expect(['docs/prd/sso.md', 'docs/design/sso.md'].map((f) => fs.readFileSync(path.join(root, f), 'utf8'))).toEqual(snapshot);
  });
});

describe('helpers', () => {
  test('addFrontmatterLine inserts before the closing fence', () => {
    expect(mig.addFrontmatterLine('---\na: 1\n---\nbody', 'b: 2')).toBe('---\na: 1\nb: 2\n---\nbody');
  });

  test('appendToSection appends at the end of the named section', () => {
    const md = '## A\nx\n\n## B\ny\n';
    expect(mig.appendToSection(md, (h) => h === 'A', ['z'])).toBe('## A\nx\nz\n\n## B\ny\n');
  });
});
