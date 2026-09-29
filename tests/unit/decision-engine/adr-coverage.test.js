const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateCoverage, AREAS } = require(path.join(ROOT, 'decision-engine', 'adr-coverage.js'));

function dec(id, spec) {
  return { metadata: { id }, spec };
}

describe('evaluateCoverage', () => {
  test('reports an area as covered when an ADR matches it', () => {
    const decisions = [
      dec('DEC-0001', { summary: 'Backend runtime = Node.js + TypeScript', options: [] }),
      dec('DEC-0002', { summary: 'Primary datastore = PostgreSQL', options: [] }),
    ];
    const r = evaluateCoverage(decisions);
    const backend = r.areas.find((a) => a.key === 'backend-stack');
    const datastore = r.areas.find((a) => a.key === 'datastore');
    expect(backend.covered).toBe(true);
    expect(backend.adrs).toContain('DEC-0001');
    expect(datastore.covered).toBe(true);
  });

  test('reports missing areas that no ADR covers', () => {
    const r = evaluateCoverage([dec('DEC-0001', { summary: 'Backend = Node', options: [] })]);
    const missingKeys = r.missing.map((m) => m.key);
    expect(missingKeys).toContain('security');
    expect(missingKeys).toContain('observability');
    expect(missingKeys).toContain('read-path');
  });

  test('a canonical data-model ADR covers the data-model area; a datastore-engine ADR alone does not', () => {
    const engineOnly = evaluateCoverage([dec('DEC-0001', { summary: 'Primary datastore = PostgreSQL', options: [] })]);
    expect(engineOnly.missing.map((m) => m.key)).toContain('data-model');

    const withModel = evaluateCoverage([
      dec('DEC-0001', { summary: 'Primary datastore = PostgreSQL', options: [] }),
      dec('DEC-0002', { summary: 'Canonical three-table schema with composite natural keys', options: [] }),
    ]);
    const dm = withModel.areas.find((a) => a.key === 'data-model');
    expect(dm.covered).toBe(true);
    expect(dm.adrs).toContain('DEC-0002');
  });

  test('resource-budget is distinct from scale: a "TB → ClickHouse later" ADR covers scale but NOT resource-budget', () => {
    // The premia_v3 lesson: a scale/datastore ADR does not decide how v1 stays bounded.
    const scaleOnly = evaluateCoverage([
      dec('DEC-0001', { summary: 'Phase-2 datastore for TB of history: ClickHouse (columnar/time-series)', options: [] }),
    ]);
    expect(scaleOnly.areas.find((a) => a.key === 'scale').covered).toBe(true);
    expect(scaleOnly.missing.map((m) => m.key)).toContain('resource-budget');

    // A bounded-working-set decision covers it.
    const withBudget = evaluateCoverage([
      dec('DEC-0001', { summary: 'Phase-2 datastore: ClickHouse', options: [] }),
      dec('DEC-0002', {
        summary: 'Ingestion memory profile',
        rationale: 'Stream markets per page and upsert per batch; never hold the full dataset in memory. Incremental crash-durable writes.',
        options: [{ id: 'stream', description: 'per-batch upsert, bounded working set' }],
      }),
    ]);
    const rb = withBudget.areas.find((a) => a.key === 'resource-budget');
    expect(rb.covered).toBe(true);
    expect(rb.adrs).toContain('DEC-0002');
  });

  test('matches against context/rationale/options, not just summary', () => {
    const decisions = [dec('DEC-0001', {
      summary: 'How we handle failures',
      context: 'Transient errors need exponential backoff and idempotent retry.',
      options: [{ id: 'a', description: 'backoff + jitter' }],
    })];
    const resilience = evaluateCoverage(decisions).areas.find((a) => a.key === 'resilience');
    expect(resilience.covered).toBe(true);
  });

  test('empty ADR set covers nothing', () => {
    const r = evaluateCoverage([]);
    expect(r.covered).toBe(0);
    expect(r.missing.length).toBe(AREAS.length);
  });
});
