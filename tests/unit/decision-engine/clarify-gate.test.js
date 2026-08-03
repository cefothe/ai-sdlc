const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateClarity } = require(path.join(ROOT, 'decision-engine', 'clarify-gate.js'));

function prd(openQuestions, extra = '') {
  return [
    '---', 'status: draft', '---', '', '# PRD: SSO', '',
    '## Problem', 'Users cannot SSO.', '',
    '## Open questions', openQuestions, '',
    extra,
  ].join('\n');
}

describe('evaluateClarity — enforced tier', () => {
  test('a resolved PRD (Open questions: None) is clear', () => {
    const r = evaluateClarity(prd('None.'));
    expect(r.clear).toBe(true);
    expect(r.unresolvedQuestions).toHaveLength(0);
  });

  test('an unresolved question blocks clarity', () => {
    const r = evaluateClarity(prd('- What happens when the token expires?'));
    expect(r.clear).toBe(false);
    expect(r.unresolvedQuestions).toHaveLength(1);
    expect(r.reasons.join(' ')).toMatch(/unresolved/);
  });

  test('multiple unresolved questions are all collected', () => {
    const r = evaluateClarity(prd('- Which segment?\n- Retry policy on 401?'));
    expect(r.unresolvedQuestions).toHaveLength(2);
    expect(r.clear).toBe(false);
  });
});

describe('evaluateClarity — advisory tier (never blocks)', () => {
  test('ambiguity tokens are advisory, not blocking', () => {
    const r = evaluateClarity(prd('None.', '## Scope\nSupport OAuth and/or SAML as needed.'));
    expect(r.clear).toBe(true); // advisory does not flip clarity
    expect(r.advisory.length).toBeGreaterThan(0);
    expect(r.ambiguityFlags.map((f) => f.token.toLowerCase())).toEqual(
      expect.arrayContaining([expect.stringMatching(/and\/or|as needed/)]),
    );
  });
});
