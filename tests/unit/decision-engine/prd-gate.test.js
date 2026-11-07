const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluatePrd, parsePrd, extractPrdAcceptanceCriteria, REQUIRED_SECTIONS } = require(path.join(ROOT, 'decision-engine', 'prd-gate.js'));

function prd({ status = 'approved', omit = [], empty = [], extra = '' } = {}) {
  const bodies = {
    Problem: 'Users cannot log in with SSO and abandon onboarding.',
    'Target user': 'Enterprise admins during first-run setup.',
    'Success metrics': 'SSO activation rate +5pp; p95 login < 2s.',
    Scope: 'OAuth login only; SAML deferred to a follow-up.',
    'Non-goals': 'No SAML, no SCIM provisioning, no MFA changes in this feature.',
    'User flows': '1. Admin clicks "Sign in with SSO"\n2. Redirected to the IdP\n3. Returns signed in on the dashboard',
    'Acceptance criteria': '- [ ] User logs in via OAuth\n- [ ] Failure returns 401',
    'Edge cases': 'IdP down: show a retry banner. Expired state nonce: restart the login flow.',
    'Non-functional requirements': 'p95 login under 2s; no tokens stored in browser local storage.',
    'Open questions': 'None.',
  };
  const lines = [`---`, `status: ${status}`, `featureId: sso`, `---`, '', '# PRD: SSO', ''];
  for (const name of REQUIRED_SECTIONS) {
    if (omit.includes(name)) continue;
    lines.push(`## ${name}`);
    lines.push(empty.includes(name) ? '<placeholder>' : bodies[name]);
    lines.push('');
  }
  if (extra) lines.push(extra);
  return lines.join('\n');
}

describe('parsePrd', () => {
  test('splits frontmatter and sections', () => {
    const { frontmatter, sections } = parsePrd(prd());
    expect(frontmatter.status).toBe('approved');
    expect(sections.map((s) => s.heading)).toEqual(expect.arrayContaining(['Problem', 'Scope']));
  });
});

describe('evaluatePrd — enforced tier', () => {
  test('a complete, approved PRD is valid', () => {
    const r = evaluatePrd(prd());
    expect(r.valid).toBe(true);
    expect(r.structureValid).toBe(true);
    expect(r.approved).toBe(true);
    expect(r.missingSections).toHaveLength(0);
  });

  test('draft status blocks validity (human sign-off required)', () => {
    const r = evaluatePrd(prd({ status: 'draft' }));
    expect(r.approved).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/approved/);
  });

  test('missing required section is invalid', () => {
    const r = evaluatePrd(prd({ omit: ['Success metrics'] }));
    expect(r.missingSections).toContain('Success metrics');
    expect(r.valid).toBe(false);
  });

  test('empty (placeholder-only) required section is invalid', () => {
    const r = evaluatePrd(prd({ empty: ['Scope'] }));
    expect(r.emptySections).toContain('Scope');
    expect(r.valid).toBe(false);
  });

  test('placeholder marker token is invalid', () => {
    const r = evaluatePrd(prd({ extra: '## Open questions\nTODO decide auth provider' }));
    expect(r.markers.length).toBeGreaterThan(0);
    expect(r.valid).toBe(false);
  });

  test('collects ALL distinct marker tokens, not just the first', () => {
    const r = evaluatePrd(prd({ extra: '## Notes\nTODO one\nFIXME two\nTODO three' }));
    expect(r.markers).toEqual(expect.arrayContaining(['TODO', 'FIXME']));
    expect(r.markers.filter((m) => m === 'TODO')).toHaveLength(1); // deduped
  });
});

describe('evaluatePrd — enforced substance', () => {
  const codes = (r) => r.substanceIssues.map((i) => i.code);

  test('non-measurable success metrics block validity', () => {
    const md = prd().replace('SSO activation rate +5pp; p95 login < 2s.', 'It should feel better and users will be happier.');
    const r = evaluatePrd(md);
    expect(r.structureValid).toBe(true);
    expect(r.substanceValid).toBe(false);
    expect(r.valid).toBe(false);
    expect(codes(r)).toContain('metric-not-measurable');
  });

  test('fewer than two list-item acceptance criteria block validity', () => {
    const md = prd().replace('- [ ] User logs in via OAuth\n- [ ] Failure returns 401', 'Users should be able to log in with OAuth and see errors.');
    const r = evaluatePrd(md);
    expect(r.acceptanceCriteria).toHaveLength(0);
    expect(codes(r)).toContain('too-few-acceptance-criteria');
    expect(r.valid).toBe(false);
  });

  test('a near-empty section blocks validity', () => {
    const md = prd().replace('Enterprise admins during first-run setup.', 'Admins.');
    const r = evaluatePrd(md);
    expect(r.substanceIssues.find((i) => i.code === 'section-too-short').section).toBe('Target user');
    expect(r.valid).toBe(false);
  });

  test('"None." open questions is exempt from the length rule', () => {
    expect(codes(evaluatePrd(prd()))).toEqual([]);
  });

  test('unresolved open questions block validity; answered ones do not', () => {
    const open = evaluatePrd(prd().replace('None.', '- Which IdPs at launch?\n- Do we need SCIM?'));
    expect(open.openQuestions).toHaveLength(2);
    expect(codes(open)).toContain('open-questions-unresolved');
    expect(open.valid).toBe(false);

    const answered = evaluatePrd(prd().replace('None.', '- Which IdPs at launch? → Okta and Entra ID\n- ~~Do we need SCIM?~~ resolved: no'));
    expect(answered.openQuestions).toEqual([]);
    expect(answered.valid).toBe(true);
  });

  test('every enforced issue is listed in reasons', () => {
    const md = prd({ status: 'draft' }).replace('SSO activation rate +5pp; p95 login < 2s.', 'Better outcomes for users overall.');
    const r = evaluatePrd(md);
    expect(r.reasons.join(' ')).toMatch(/measurable target/);
    expect(r.reasons.join(' ')).toMatch(/approved/);
  });
});

describe('evaluatePrd — section aliases', () => {
  test('"Out of scope" satisfies Non-goals but never Scope', () => {
    const md = prd({ omit: ['Non-goals'] }).replace('## Scope', '## Out of scope\nNo SAML, no SCIM provisioning, no MFA changes here.\n\n## Scope');
    const r = evaluatePrd(md);
    expect(r.missingSections).toEqual([]);
    const noScope = evaluatePrd(prd({ omit: ['Scope', 'Non-goals'], extra: '## Out of scope\nNo SAML, no SCIM provisioning, no MFA changes here.' }));
    expect(noScope.missingSections).toEqual(['Scope']);
  });
});

describe('extractPrdAcceptanceCriteria', () => {
  test('returns the AC list items without bullets/checkboxes', () => {
    expect(extractPrdAcceptanceCriteria(prd())).toEqual(['User logs in via OAuth', 'Failure returns 401']);
  });

  test('skips template placeholders and returns [] with no AC section', () => {
    expect(extractPrdAcceptanceCriteria('## Acceptance criteria\n- [ ] <Observable outcome>\n')).toEqual([]);
    expect(extractPrdAcceptanceCriteria('## Problem\nx')).toEqual([]);
  });
});

describe('evaluatePrd — advisory tier (never blocks)', () => {
  test('a thin-but-passing section is advisory only', () => {
    const r = evaluatePrd(prd());
    expect(r.valid).toBe(true);
    expect(r.advisory.map((a) => a.code)).toContain('thin-section');
  });

  test('technical-leakage: naming a stack/DB in the PRD is advisory, not blocking', () => {
    const md = prd({ extra: '## Scope\nBuild it in React with a PostgreSQL store on Docker.' });
    const r = evaluatePrd(md);
    expect(r.valid).toBe(true); // advisory does not block
    const leak = r.advisory.find((a) => a.code === 'technical-leakage');
    expect(leak).toBeDefined();
    expect(leak.message.toLowerCase()).toMatch(/react|postgres|docker/);
  });

  test('a clean product-only PRD raises no technical-leakage', () => {
    const r = evaluatePrd(prd());
    expect(r.advisory.map((a) => a.code)).not.toContain('technical-leakage');
  });
});

describe('evaluatePrd — product context', () => {
  const ctx = { path: 'docs/product/context.md', valid: true, reasons: [], personas: ['Enterprise admin', 'Desk trader'] };
  const codes = (r) => r.substanceIssues.map((i) => i.code);
  const grounded = () => prd()
    .replace('Enterprise admins during first-run setup.', 'Enterprise admin during first-run workspace setup.')
    .replace('SSO activation rate +5pp; p95 login < 2s.', 'SSO activation: baseline 31% → target 36%; p95 login < 2s.');

  test('a PRD naming a persona and citing a baseline passes', () => {
    expect(evaluatePrd(grounded(), { productContext: ctx }).valid).toBe(true);
  });

  test('a Target user naming no persona is invalid', () => {
    const r = evaluatePrd(grounded().replace('Enterprise admin during', 'Some people during'), { productContext: ctx });
    expect(codes(r)).toContain('persona-not-named');
    expect(r.valid).toBe(false);
  });

  test('success metrics without a baseline are invalid', () => {
    const r = evaluatePrd(grounded().replace('baseline 31% → target 36%', '+5pp'), { productContext: ctx });
    expect(codes(r)).toContain('metric-no-baseline');
  });

  test('"currently X" and "from X to Y" count as baselines', () => {
    for (const m of ['SSO activation currently 31%, target 36%.', 'SSO activation from 31% to 36% in 30 days.']) {
      const md = grounded().replace('SSO activation: baseline 31% → target 36%; p95 login < 2s.', m);
      expect(codes(evaluatePrd(md, { productContext: ctx }))).not.toContain('metric-no-baseline');
    }
  });

  test('an invalid product context blocks every PRD', () => {
    const r = evaluatePrd(grounded(), { productContext: { ...ctx, valid: false, reasons: ['missing sections: Vision'] } });
    expect(r.reasons.join(' ')).toMatch(/product context docs\/product\/context\.md is incomplete \(missing sections: Vision\)/);
    expect(r.valid).toBe(false);
  });

  test('without a product context the persona/baseline rules do not apply', () => {
    expect(evaluatePrd(prd()).valid).toBe(true);
  });
});

