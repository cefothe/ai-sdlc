const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateDesign, evaluateDesignFile, REQUIRED_SECTIONS, headingMatchesSection } = require(path.join(ROOT, 'decision-engine', 'design-gate.js'));
const dec = require(path.join(ROOT, 'decision-engine', 'decisions.js'));

function design({ omit = [], empty = [], adrs = 'DEC-0001', status = 'approved', extra = '' } = {}) {
  const bodies = {
    Context: 'Ingest imot.bg listings; see docs/prd/property-ingestion-imot.md.',
    Architecture: 'discovery → fetch → normalize → validate → upsert → report.',
    'Data model': 'CREATE TABLE properties (id BIGSERIAL PRIMARY KEY, source TEXT, source_listing_id TEXT, UNIQUE(source, source_listing_id));',
    Interfaces: 'FIRECRAWL_API_URL, DATABASE_URL; CLI: npm run ingest.',
    'Data flow': 'Paginate search, scrape each listing, normalize, upsert, write run report. A failed fetch retries 3x with backoff, then is logged and skipped.',
    Decisions: `Listing identity ${adrs}.`,
    Risks: 'imot.bg may render client-side; spike before compose.',
    'Test strategy': 'Unit: normalize/identity. Integration: upsert vs Postgres. Smoke: coverage.\n- AC1 — integration: upsert is idempotent\n- AC2 — unit: invalid listing rejected',
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
      '## Datastore & physical schema', 'PostgreSQL 16, schema pmdm.', '```sql', 'CREATE TABLE pmdm.market (id TEXT PRIMARY KEY, price NUMERIC);', '```', '',
      '## API surface', 'REST read API: GET /markets/{id}; env DATABASE_URL_RO.', '',
      '## Ingestion & data flow', 'fetch → normalize → validate → upsert → report; a venue error aborts that venue only.', '',
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

describe('evaluateDesign — enforced substance', () => {
  const codes = (r) => r.substanceIssues.map((i) => `${i.code}:${i.section}`);

  test('a prose-only data model (no DDL / schema block / field table) is invalid', () => {
    const md = design().replace(/CREATE TABLE properties[^\n]*/, 'A properties table keyed by source and listing id.');
    const r = evaluateDesign(md);
    expect(codes(r)).toContain('section-not-concrete:Data model');
    expect(r.valid).toBe(false);
  });

  test('a field table or an explicit N/A satisfies the data model rule', () => {
    const table = design().replace(/CREATE TABLE properties[^\n]*/, '| column | type |\n|---|---|\n| id | bigint |');
    expect(codes(evaluateDesign(table))).not.toContain('section-not-concrete:Data model');
    const na = design().replace(/CREATE TABLE properties[^\n]*/, 'N/A — no persisted state; the CLI is stateless and writes stdout only.');
    expect(codes(evaluateDesign(na))).not.toContain('section-not-concrete:Data model');
  });

  test('interfaces without any concrete surface are invalid', () => {
    const md = design().replace('FIRECRAWL_API_URL, DATABASE_URL; CLI: npm run ingest.', 'It talks to the scraping service and the database.');
    expect(codes(evaluateDesign(md))).toContain('section-not-concrete:Interfaces');
  });

  test('a data flow with no failure path is invalid', () => {
    const md = design().replace(' A failed fetch retries 3x with backoff, then is logged and skipped.', '');
    expect(codes(evaluateDesign(md))).toContain('section-not-concrete:Data flow');
  });

  test('a too-short section is invalid; Decisions is exempt', () => {
    const md = design().replace('imot.bg may render client-side; spike before compose.', 'Rendering.');
    const r = evaluateDesign(md);
    expect(codes(r)).toContain('section-too-short:Risks');
    expect(codes(r).some((c) => c.endsWith(':Decisions'))).toBe(false);
  });

  test('the test strategy must map every PRD acceptance criterion by number', () => {
    const r = evaluateDesign(design(), { prdAcceptanceCriteria: ['upsert idempotent', 'invalid rejected', 'report written'] });
    expect(r.unmappedAcs).toEqual(['AC3']);
    expect(codes(r)).toContain('acs-not-mapped:Test strategy');
    expect(r.valid).toBe(false);
    expect(evaluateDesign(design(), { prdAcceptanceCriteria: ['a', 'b'] }).valid).toBe(true);
  });

  test('linked ADRs must be recorded and complete', () => {
    const complete = dec.newDecision({
      id: 'DEC-0001', summary: 'Listing identity by (source, source_listing_id)', created: 't',
      options: [{ id: 'natural', description: 'Natural key — stable across runs' }, { id: 'hash', description: 'Rejected: content hash changes on edits' }],
      context: 'Listings are re-fetched daily', rationale: 'Natural key is stable', consequences: 'Unique index required',
    });
    expect(evaluateDesign(design(), { decisions: { 'DEC-0001': complete } }).valid).toBe(true);

    const missing = evaluateDesign(design(), { decisions: { 'DEC-0001': null } });
    expect(missing.adrIssues.join(' ')).toMatch(/DEC-0001: linked but not recorded/);
    expect(missing.valid).toBe(false);

    const anemic = dec.newDecision({ id: 'DEC-0001', summary: 's', created: 't', options: [{ id: 'a', description: 'a' }] });
    const r = evaluateDesign(design(), { decisions: { 'DEC-0001': anemic } });
    expect(r.adrIssues.join(' ')).toMatch(/missing context/);
    expect(r.adrIssues.join(' ')).toMatch(/1 option/);
    expect(r.valid).toBe(false);
  });
});

describe('evaluateDesignFile — cross-artifact checks from disk', () => {
  function project({ prdAcs, withDecision = true }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-file-'));
    fs.mkdirSync(path.join(root, 'docs', 'design'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'prd', 'sso.md'), ['## Acceptance criteria', ...prdAcs.map((a) => `- [ ] ${a}`), ''].join('\n'));
    fs.writeFileSync(path.join(root, 'docs', 'design', 'sso.md'), design().replace('feature: sso', 'feature: sso\nrelatedPrd: docs/prd/sso.md'));
    if (withDecision) {
      dec.writeDecision(root, dec.newDecision({
        id: 'DEC-0001', summary: 'identity', created: 't', context: 'c', rationale: 'r', consequences: 'q',
        options: [{ id: 'a', description: 'chosen because stable' }, { id: 'b', description: 'rejected: unstable' }],
      }));
    }
    return root;
  }

  test('loads the PRD ACs and linked ADRs relative to root', () => {
    const root = project({ prdAcs: ['one', 'two'] });
    try {
      expect(evaluateDesignFile(path.join(root, 'docs', 'design', 'sso.md'), { root }).valid).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('an unmapped PRD AC and an unrecorded ADR both fail', () => {
    const root = project({ prdAcs: ['one', 'two', 'three'], withDecision: false });
    try {
      const r = evaluateDesignFile(path.join(root, 'docs', 'design', 'sso.md'), { root });
      expect(r.unmappedAcs).toEqual(['AC3']);
      expect(r.adrIssues.join(' ')).toMatch(/not recorded/);
      expect(r.valid).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a relatedPrd escaping the root is ignored (no AC check)', () => {
    const root = project({ prdAcs: ['one', 'two', 'three'] });
    try {
      const file = path.join(root, 'docs', 'design', 'sso.md');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('relatedPrd: docs/prd/sso.md', 'relatedPrd: ../../etc/passwd').replace('feature: sso', 'feature: nope'));
      expect(evaluateDesignFile(file, { root }).unmappedAcs).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('evaluateDesign — advisory tier', () => {
  test('draft status is advisory, not blocking', () => {
    const r = evaluateDesign(design({ status: 'draft' }));
    expect(r.valid).toBe(true); // structure + ADR link satisfied
    expect(r.advisory.map((a) => a.code)).toContain('not-approved');
  });
});

describe('evaluateDesign — placeholders map nothing', () => {
  test('a migration skeleton "<AC1 — …>" does not satisfy the AC mapping', () => {
    const md = design().replace('- AC1 — integration: upsert is idempotent', '<AC1 — test layer + what proves it: "upsert idempotent">');
    expect(evaluateDesign(md, { prdAcceptanceCriteria: ['a', 'b'] }).unmappedAcs).toEqual(['AC1']);
  });
});

describe('evaluateDesign — architecture overview', () => {
  const arch = { path: 'docs/architecture/overview.md', valid: true, reasons: [], components: ['Orders', 'Payments'] };
  const codes = (r) => r.substanceIssues.map((i) => i.code);
  const withArch = (md) => md.replace('feature: sso', 'feature: sso\narchitecture: docs/architecture/overview.md');

  test('a design referencing the overview and naming a component passes', () => {
    const md = withArch(design()).replace('discovery → fetch', 'Orders: discovery → fetch');
    expect(evaluateDesign(md, { architecture: arch }).valid).toBe(true);
  });

  test('not referencing the overview, or naming no component, is invalid', () => {
    const r = evaluateDesign(design(), { architecture: arch });
    expect(codes(r)).toEqual(expect.arrayContaining(['architecture-not-referenced', 'no-component-named']));
    expect(r.valid).toBe(false);
  });

  test('declaring a new component satisfies the naming rule', () => {
    const md = withArch(design()).replace('discovery → fetch', 'New component: Ingestor. discovery → fetch');
    expect(codes(evaluateDesign(md, { architecture: arch }))).not.toContain('no-component-named');
  });

  test('an incomplete overview blocks every design', () => {
    const md = withArch(design()).replace('discovery → fetch', 'Orders: discovery → fetch');
    const r = evaluateDesign(md, { architecture: { ...arch, valid: false, reasons: ['missing sections: Invariants'] } });
    expect(r.reasons.join(' ')).toMatch(/architecture overview docs\/architecture\/overview\.md is incomplete \(missing sections: Invariants\)/);
  });
});

describe('evaluateDesign — greenfield architecture', () => {
  test('an untouched architecture scaffold does not block the first design (advisory instead)', () => {
    const fs = require('fs');
    const { evaluateArchitecture } = require(path.join(ROOT, 'decision-engine', 'architecture-context.js'));
    const scaffold = evaluateArchitecture(fs.readFileSync(path.join(ROOT, 'docs', 'architecture', '_template.md'), 'utf8'));
    expect(scaffold.scaffold).toBe(true);
    const r = evaluateDesign(design(), { architecture: scaffold });
    expect(r.valid).toBe(true);
    expect(r.advisory.map((a) => a.code)).toContain('architecture-greenfield');
  });

  test('a partly written overview is not a scaffold and still blocks', () => {
    const { evaluateArchitecture } = require(path.join(ROOT, 'decision-engine', 'architecture-context.js'));
    const partial = evaluateArchitecture('## System overview\nAn order-book data warehouse for prediction markets.\n');
    expect(partial.scaffold).toBe(false);
    expect(evaluateDesign(design(), { architecture: partial }).valid).toBe(false);
  });
});
