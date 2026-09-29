const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateDesign, REQUIRED_SECTIONS, headingMatchesSection } = require(path.join(ROOT, 'decision-engine', 'design-gate.js'));

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

describe('evaluateDesign — section synonyms (no cosmetic rename-to-pass)', () => {
  // A design doc using natural synonym headings must pass — the gate checks the
  // substance is present, not the exact heading text.
  function synonymDoc() {
    return [
      '---', 'status: approved', 'feature: pmdm', '---', '', '# Design: Data Mirror', '',
      '## Overview', 'A Go service mirrors venue markets into Postgres. See the PRD.', '',
      '## Architecture', 'Poller + read API; anti-corruption adapters per venue.', '',
      '## Datastore & physical schema', 'PostgreSQL 16, schema pmdm; NUMERIC prices as probability 0–1.', '',
      '## API surface', 'REST read API; env DATABASE_URL_RO.', '',
      '## Ingestion & data flow', 'fetch → normalize → validate → upsert → report.', '',
      '## Key decisions', 'Datastore is Postgres (DEC-0003); price unit probability (DEC-0005).', '',
      '## Risks & spikes', 'Kalshi liquidity field removed — spike before build.', '',
      '## Testing strategy', 'Unit normalize; integration upsert vs Postgres; smoke.', '',
    ].join('\n');
  }

  test('"Overview" satisfies Context and "Datastore & physical schema" satisfies Data model', () => {
    const r = evaluateDesign(synonymDoc());
    expect(r.missingSections).toEqual([]);
    expect(r.structureValid).toBe(true);
    expect(r.valid).toBe(true);
  });

  test('headingMatchesSection maps synonyms to their canonical section', () => {
    expect(headingMatchesSection('Overview', 'Context')).toBe(true);
    expect(headingMatchesSection('Datastore & physical schema', 'Data model')).toBe(true);
    expect(headingMatchesSection('Ingestion & data flow', 'Data flow')).toBe(true);
    expect(headingMatchesSection('Testing strategy', 'Test strategy')).toBe(true);
    // and does not match an unrelated section
    expect(headingMatchesSection('Overview', 'Risks')).toBe(false);
  });
});

describe('evaluateDesign — advisory tier', () => {
  test('draft status is advisory, not blocking', () => {
    const r = evaluateDesign(design({ status: 'draft' }));
    expect(r.valid).toBe(true); // structure + ADR link satisfied
    expect(r.advisory.map((a) => a.code)).toContain('not-approved');
  });
});
