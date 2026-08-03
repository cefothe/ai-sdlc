const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateConsistency } = require(path.join(ROOT, 'decision-engine', 'analyze-gate.js'));

function approvedPrd(acLines) {
  return [
    '---', 'status: approved', 'featureId: sso', '---', '', '# PRD: SSO', '',
    '## Problem', 'Users cannot SSO.', '',
    '## Target user', 'Enterprise admins.', '',
    '## Success metrics', 'activation +5pp.', '',
    '## Scope', 'OAuth only.', '',
    '## Acceptance criteria', ...acLines, '',
    '## Open questions', 'None.', '',
  ].join('\n');
}

function task(acs, refs = ['src/auth.ts']) {
  return {
    frontmatter: { id: 'AISDLC-1', references: refs, specRef: { source: 'prd', featureId: 'sso', artifactPath: 'docs/prd/sso.md' } },
    acceptanceCriteria: acs.map((t) => ({ checked: false, text: t })),
  };
}

describe('evaluateConsistency — enforced tier', () => {
  test('aligned PRD + task + plan is consistent', () => {
    const res = evaluateConsistency({
      prdMarkdown: approvedPrd(['- [ ] logs in', '- [ ] 401 on failure']),
      task: task(['logs in via OAuth', 'failure returns 401']),
      planText: 'Edit src/auth.ts to add the OAuth handler.',
    });
    expect(res.consistent).toBe(true);
    expect(res.checks.find((c) => c.name === 'plan-touches-surfaces').ok).toBe(true);
  });

  test('a task with no specRef fails prd-linked', () => {
    const t = task(['logs in']);
    delete t.frontmatter.specRef;
    const res = evaluateConsistency({ task: t });
    expect(res.consistent).toBe(false);
    expect(res.reasons.join(' ')).toMatch(/prd-linked/);
  });

  test('a draft/invalid PRD fails prd-valid', () => {
    const draft = approvedPrd(['- [ ] logs in']).replace('status: approved', 'status: draft');
    const res = evaluateConsistency({ prdMarkdown: draft, task: task(['logs in']) });
    expect(res.checks.find((c) => c.name === 'prd-valid').ok).toBe(false);
    expect(res.consistent).toBe(false);
  });

  test('a plan that ignores the task surfaces fails plan-touches-surfaces', () => {
    const res = evaluateConsistency({
      prdMarkdown: approvedPrd(['- [ ] logs in']),
      task: task(['logs in'], ['src/auth.ts']),
      planText: 'Refactor the unrelated billing module.',
    });
    expect(res.checks.find((c) => c.name === 'plan-touches-surfaces').ok).toBe(false);
    expect(res.consistent).toBe(false);
  });
});

describe('evaluateConsistency — advisory tier (never blocks)', () => {
  test('fewer task ACs than PRD ACs is an advisory coverage gap, not a block', () => {
    const res = evaluateConsistency({
      prdMarkdown: approvedPrd(['- [ ] logs in', '- [ ] 401 on failure', '- [ ] audit log written']),
      task: task(['logs in via OAuth']),
      planText: 'Edit src/auth.ts.',
    });
    expect(res.consistent).toBe(true); // advisory only
    expect(res.advisory.map((a) => a.code)).toContain('ac-coverage-gap');
  });
});
