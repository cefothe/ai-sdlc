const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateDor, DEFAULT_CONFIG } = require(path.join(ROOT, 'decision-engine', 'dor-gate.js'));

function tmpProject(prdBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dor-prd-'));
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'sso.md'), prdBody, 'utf8');
  return root;
}

function approvedPrd(status) {
  return [
    '---', `status: ${status}`, 'featureId: sso', '---', '', '# PRD: SSO', '',
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

describe('DoR gate 8 — PRD readiness', () => {
  test('an approved, well-formed PRD passes gate 8', () => {
    const root = tmpProject(approvedPrd('approved'));
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    const g8 = res.gates.find((g) => g.gateId === 8);
    expect(g8).toBeDefined();
    expect(g8.verdict).toBe('pass');
  });

  test('a draft PRD fails gate 8 and blocks admission', () => {
    const root = tmpProject(approvedPrd('draft'));
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    const g8 = res.gates.find((g) => g.gateId === 8);
    expect(g8.verdict).toBe('fail');
    expect(res.admitted).toBe(false);
    expect(res.reasons.join(' ')).toMatch(/PRD not ready/);
  });

  test('an approved but unsubstantive PRD (one AC) fails gate 8', () => {
    const root = tmpProject(approvedPrd('approved').replace('- [ ] failure returns 401\n', ''));
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    const g8 = res.gates.find((g) => g.gateId === 8);
    expect(g8.verdict).toBe('fail');
    expect(res.reasons.join(' ')).toMatch(/acceptance criteria/);
  });

  test('with a product context in the repo, gate 8 requires a persona and a baseline', () => {
    const root = tmpProject(approvedPrd('approved'));
    fs.mkdirSync(path.join(root, 'docs', 'product'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'product', 'context.md'), [
      '## Vision', 'Make enterprise onboarding self-serve within one session.',
      '## Personas', '- **Workspace admin**: sets up SSO and invites the team',
      '## Current capabilities', 'Email/password login, team invites, roles and permissions.',
      '## Glossary', '- Workspace: a tenant with its own members and billing',
      '## Metric baselines', '- SSO activation: 31% as of 2026-10 (source: onboarding funnel)',
      '## Regulatory constraints', 'GDPR: EU data residency for identity data; audit log of logins.',
      '## Non-goals', 'No consumer social login; no on-prem identity broker.',
    ].join('\n'));
    const fail = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(fail.gates.find((g) => g.gateId === 8).verdict).toBe('fail');
    expect(fail.reasons.join(' ')).toMatch(/Workspace admin/);
    expect(fail.reasons.join(' ')).toMatch(/baseline/);

    fs.writeFileSync(path.join(root, 'docs', 'prd', 'sso.md'), approvedPrd('approved')
      .replace('Enterprise admins at first-run setup of a workspace.', 'Workspace admin at first-run setup of a workspace.')
      .replace('SSO activation +5pp in 30 days; p95 login < 2s.', 'SSO activation: baseline 31% → target 36%; p95 login < 2s.'));
    const pass = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG });
    expect(pass.gates.find((g) => g.gateId === 8).verdict).toBe('pass');
  });

  test('gate 8 does not fire when the task links no PRD (no regression)', () => {
    const t = task();
    delete t.frontmatter.specRef;
    t.frontmatter.references = ['README.md'];
    const res = evaluateDor(t, { projectRoot: ROOT, config: DEFAULT_CONFIG });
    expect(res.gates.find((g) => g.gateId === 8)).toBeUndefined();
  });

  test('gate 8 can be disabled via opts.prdGate=false', () => {
    const root = tmpProject(approvedPrd('draft'));
    const res = evaluateDor(task(), { projectRoot: root, config: DEFAULT_CONFIG, prdGate: false });
    expect(res.gates.find((g) => g.gateId === 8)).toBeUndefined();
  });
});
