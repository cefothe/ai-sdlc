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
    '## Target user', 'Enterprise admins at first-run.', '',
    '## Success metrics', 'activation +5pp; p95 < 2s.', '',
    '## Scope', 'OAuth only; SAML deferred.', '',
    '## Acceptance criteria', '- [ ] logs in via OAuth', '- [ ] failure returns 401', '',
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
