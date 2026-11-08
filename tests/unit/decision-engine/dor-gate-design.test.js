const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateDor, DEFAULT_CONFIG } = require(path.join(ROOT, 'decision-engine', 'dor-gate.js'));
const dec = require(path.join(ROOT, 'decision-engine', 'decisions.js'));

function completeAdr() {
  return dec.newDecision({
    id: 'DEC-0001', summary: 'OAuth over SAML', created: 't',
    options: [{ id: 'oauth', description: 'Chosen: IdPs in scope all support it' }, { id: 'saml', description: 'Rejected: heavier, deferred' }],
    context: 'Enterprise SSO', rationale: 'Smallest slice', consequences: 'SAML customers wait',
  });
}

function approvedPrd() {
  return [
    '---', 'status: approved', 'featureId: sso', '---', '', '# PRD: SSO', '',
    '## Problem', 'Users cannot SSO and abandon onboarding.', '',
    '## Target user', 'Enterprise admins at first-run setup of a workspace.', '',
    '## Success metrics', 'SSO activation +5pp in 30 days; p95 login < 2s.', '',
    '## Scope', 'OAuth login only; SAML deferred to a follow-up.', '',
    '## Non-goals', 'No SAML, no SCIM provisioning, no MFA changes.', '',
    '## User flows', '1. Admin clicks Sign in with SSO', '2. Returns signed in', '',
    '## Acceptance criteria', '- [ ] logs in via OAuth', '- [ ] failure returns 401', '',
    '## Edge cases', 'IdP down shows a retry banner; expired nonce restarts login.', '',
    '## Non-functional requirements', 'p95 login under 2s; no tokens in local storage.', '',
    '## Open questions', 'None.', '',
  ].join('\n');
}

function design(status, { withAdr = true } = {}) {
  return [
    '---', `status: ${status}`, 'featureId: sso', ...(withAdr ? ['relatedAdrs: [DEC-0001]'] : []), '---', '',
    '# Design: SSO', '',
    '## Context', 'Enterprise SSO to reduce onboarding abandonment.', '',
    '## Architecture', 'An OAuth broker module fronting the identity provider.', '```mermaid', 'flowchart LR', '  Browser --> Broker --> IdP', '```', '',
    '## Data model', '```sql', 'CREATE TABLE sessions (id UUID PRIMARY KEY, user_id BIGINT, expires_at TIMESTAMPTZ);', '```', '```mermaid', 'erDiagram', '  USER ||--o{ SESSION : has', '```', '',
    '## Interfaces', 'GET /auth/login, GET /auth/callback returning a session cookie.', '',
    '## Data flow', 'Browser -> broker -> IdP -> callback -> session issued; an IdP error redirects to the retry page.', '```mermaid', 'sequenceDiagram', '  Browser->>Broker: login', '  Broker->>IdP: authorize', '  IdP-->>Broker: error', '```', '',
    '## Decisions', withAdr ? 'OAuth chosen over SAML — see DEC-0001.' : 'No decisions recorded yet.', '',
    '## Risks', 'Token leakage via referrer headers; mitigated by POST callback.', '',
    '## Test strategy', 'Unit for the broker; integration for the callback path.', '- AC1 — integration: OAuth login', '- AC2 — integration: 401 on failure', '',
  ].join('\n');
}

// Build a temp project with an approved PRD and (optionally) a design doc.
function tmpProject({ designBody, adr = completeAdr() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dor-design-'));
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'design'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'sso.md'), approvedPrd(), 'utf8');
  if (designBody) fs.writeFileSync(path.join(root, 'docs', 'design', 'sso.md'), designBody, 'utf8');
  if (adr) dec.writeDecision(root, adr);
  return root;
}

function task() {
  return {
    frontmatter: {
      id: 'AISDLC-1', dispatchable: true,
      references: ['docs/prd/sso.md'],
      specRef: { source: 'prd', featureId: 'sso', artifactPath: 'docs/prd/sso.md' },
    },
    body: 'Add SSO login.',
    acceptanceCriteria: [{ checked: false, text: 'logs in via OAuth' }],
  };
}

function coverageConfig(requireCoverage) {
  return { spec: { evaluationMode: 'enforce', autoPassRules: [], designGate: { enabled: true, requireCoverage } } };
}

const g9 = (res) => res.gates.find((g) => g.gateId === 9);

describe('DoR gate 9 — design ratified', () => {
  test('an approved, valid design doc passes gate 9', () => {
    const root = tmpProject({ designBody: design('approved') });
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(g9(res)).toBeDefined();
    expect(g9(res).verdict).toBe('pass');
  });

  test('a missing design doc fails gate 9 and blocks admission', () => {
    const root = tmpProject(); // PRD only, no design
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(g9(res).verdict).toBe('fail');
    expect(res.admitted).toBe(false);
    expect(res.reasons.join(' ')).toMatch(/no design doc/);
    expect(res.reasons.join(' ')).toMatch(/ai-sdlc:design sso/);
  });

  test('a draft (unapproved) design fails gate 9', () => {
    const root = tmpProject({ designBody: design('draft') });
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(g9(res).verdict).toBe('fail');
    expect(res.reasons.join(' ')).toMatch(/design not ratified/);
    expect(res.reasons.join(' ')).toMatch(/status: approved/);
  });

  test('an approved design that links no ADR fails gate 9', () => {
    const root = tmpProject({ designBody: design('approved', { withAdr: false }) });
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(g9(res).verdict).toBe('fail');
    expect(res.reasons.join(' ')).toMatch(/design not ratified/);
  });

  test('an approved design linking an anemic ADR fails gate 9', () => {
    const anemic = dec.newDecision({ id: 'DEC-0001', summary: 'OAuth', created: 't', options: [{ id: 'oauth', description: 'oauth' }] });
    const root = tmpProject({ designBody: design('approved'), adr: anemic });
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(g9(res).verdict).toBe('fail');
    expect(res.reasons.join(' ')).toMatch(/linked ADRs are incomplete/);
  });

  test('a design whose test strategy skips a PRD AC fails gate 9', () => {
    const root = tmpProject({ designBody: design('approved').replace('- AC2 — integration: 401 on failure\n', '') });
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(g9(res).verdict).toBe('fail');
    expect(res.reasons.join(' ')).toMatch(/AC2/);
  });

  test('requireCoverage: incomplete ADR coverage fails an otherwise-ratified design', () => {
    const root = tmpProject({ designBody: design('approved') });
    const res = evaluateDor(task(), {
      projectRoot: root,
      config: coverageConfig(true),
      evaluateCoverage: () => ({ missing: [{ key: 'security', label: 'Security / secrets / auth' }] }),
    });
    expect(g9(res).verdict).toBe('fail');
    expect(res.reasons.join(' ')).toMatch(/coverage incomplete/);
    expect(res.reasons.join(' ')).toMatch(/Security/);
  });

  test('requireCoverage: complete ADR coverage passes gate 9', () => {
    const root = tmpProject({ designBody: design('approved') });
    const res = evaluateDor(task(), {
      projectRoot: root,
      config: coverageConfig(true),
      evaluateCoverage: () => ({ missing: [] }),
    });
    expect(g9(res).verdict).toBe('pass');
  });

  test('gate 9 does not fire when the task links no PRD (no regression)', () => {
    const t = task();
    delete t.frontmatter.specRef;
    t.frontmatter.references = ['README.md'];
    const res = evaluateDor(t, { projectRoot: ROOT, config: DEFAULT_CONFIG });
    expect(g9(res)).toBeUndefined();
  });

  test('gate 9 can be disabled via opts.designGate=false', () => {
    const root = tmpProject(); // no design doc — would otherwise fail
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG, designGate: false });
    expect(g9(res)).toBeUndefined();
  });

  test('gate 9 can be disabled via config spec.designGate.enabled=false', () => {
    const root = tmpProject();
    const config = { spec: { evaluationMode: 'enforce', autoPassRules: [], designGate: { enabled: false } } };
    const res = evaluateDor(task(), { projectRoot: root, config });
    expect(g9(res)).toBeUndefined();
  });

  test('a design evaluator error surfaces as a gate-9 failure, not a crash', () => {
    const root = tmpProject({ designBody: design('approved') });
    const res = evaluateDor(task(), {
      projectRoot: root,
      config: DEFAULT_CONFIG,
      evaluateDesignDoc: () => { throw new Error('boom'); },
    });
    expect(g9(res).verdict).toBe('fail');
    expect(res.reasons.join(' ')).toMatch(/design could not be evaluated: boom/);
  });
});
