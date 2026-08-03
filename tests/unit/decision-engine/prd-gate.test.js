const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluatePrd, parsePrd, REQUIRED_SECTIONS } = require(path.join(ROOT, 'decision-engine', 'prd-gate.js'));

function prd({ status = 'approved', omit = [], empty = [], extra = '' } = {}) {
  const bodies = {
    Problem: 'Users cannot log in with SSO and abandon onboarding.',
    'Target user': 'Enterprise admins during first-run setup.',
    'Success metrics': 'SSO activation rate +5pp; p95 login < 2s.',
    Scope: 'OAuth login only; SAML deferred to a follow-up.',
    'Acceptance criteria': '- [ ] User logs in via OAuth\n- [ ] Failure returns 401',
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

describe('evaluatePrd — advisory tier (never blocks)', () => {
  test('non-measurable success metrics is advisory only', () => {
    const md = prd().replace('SSO activation rate +5pp; p95 login < 2s.', 'It should feel better and users will be happier.');
    const r = evaluatePrd(md);
    expect(r.valid).toBe(true); // still valid — advisory does not block
    expect(r.advisory.map((a) => a.code)).toContain('metric-not-measurable');
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
