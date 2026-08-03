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
