const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateDesign, REQUIRED_SECTIONS } = require(path.join(ROOT, 'decision-engine', 'design-gate.js'));

function design({ omit = [], empty = [], adrs = 'DEC-0001', status = 'approved', extra = '' } = {}) {
  const bodies = {
    Context: 'Ingest imot.bg listings; see docs/prd/property-ingestion-imot.md.',
    Architecture: 'discovery → fetch → normalize → validate → upsert → report.',
    'Data model': 'CREATE TABLE properties (id BIGSERIAL PRIMARY KEY, source TEXT, source_listing_id TEXT, UNIQUE(source, source_listing_id));',
    Interfaces: 'FIRECRAWL_API_URL, DATABASE_URL; CLI: npm run ingest.',
    'Data flow': 'Paginate search, scrape each listing, normalize, upsert, write run report.',
    Decisions: `Listing identity ${adrs}.`,
    Risks: 'imot.bg may render client-side; spike before compose.',
    'Test strategy': 'Unit: normalize/identity. Integration: upsert vs Postgres. Smoke: coverage.',
  };
  const lines = ['---', `status: ${status}`, 'feature: sso', '---', '', '# Design: Ingestion', ''];
  for (const name of REQUIRED_SECTIONS) {
    if (omit.includes(name)) continue;
    lines.push(`## ${name}`);
    lines.push(empty.includes(name) ? '<placeholder>' : bodies[name]);
    lines.push('');
  }
  if (extra) lines.push(extra);
  return lines.join('\n');
}

describe('evaluateDesign — enforced tier', () => {
  test('a complete design that links an ADR is valid', () => {
    const r = evaluateDesign(design());
    expect(r.valid).toBe(true);
    expect(r.structureValid).toBe(true);
    expect(r.adrLinks).toContain('DEC-0001');
  });

  test('a design linking no ADR is invalid', () => {
    const r = evaluateDesign(design({ adrs: 'none here' }));
    expect(r.hasAdrLinks).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/links no ADRs/);
  });

  test('a missing required section is invalid', () => {
    const r = evaluateDesign(design({ omit: ['Data model'] }));
    expect(r.missingSections).toContain('Data model');
    expect(r.valid).toBe(false);
  });

  test('an empty (placeholder) section is invalid', () => {
    const r = evaluateDesign(design({ empty: ['Data flow'] }));
    expect(r.emptySections).toContain('Data flow');
    expect(r.valid).toBe(false);
  });

  test('a placeholder marker token is invalid', () => {
    const r = evaluateDesign(design({ extra: '## Notes\nTODO decide indexes' }));
    expect(r.markers.length).toBeGreaterThan(0);
    expect(r.valid).toBe(false);
  });
});

describe('evaluateDesign — advisory tier', () => {
  test('draft status is advisory, not blocking', () => {
    const r = evaluateDesign(design({ status: 'draft' }));
    expect(r.valid).toBe(true); // structure + ADR link satisfied
    expect(r.advisory.map((a) => a.code)).toContain('not-approved');
  });
});
