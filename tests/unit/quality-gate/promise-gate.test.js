const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { loadQualityGate, evaluatePromiseGate, formatReviewerContext } = require(path.join(ROOT, 'quality-gate', 'promise-gate.js'));

const kept = (id) => ({ promise_id: id, result: 'kept', confidence: 'high' });
const broken = (id, ev) => ({ promise_id: id, result: 'broken', confidence: 'high', evidence: ev || 'x' });
const partial = (id) => ({ promise_id: id, result: 'partial', confidence: 'medium', evidence: 'p' });

const advisoryCfg = { kind: 'QualityGate', spec: { gates: [{ name: 'promise-verification', enforcement: 'advisory', rule: { metric: 'promise.broken_count', operator: '==', threshold: 0 } }] } };
const hardCfg = { kind: 'QualityGate', spec: { gates: [{ name: 'promise-verification', enforcement: 'hard-mandatory', rule: { metric: 'promise.broken_count', operator: '==', threshold: 0 } }] } };

describe('loadQualityGate', () => {
  test('loads the shipped advisory gate', () => {
    const cfg = loadQualityGate(path.join(ROOT, '.ai-sdlc', 'quality-gate.yaml'));
    expect(cfg.kind).toBe('QualityGate');
    expect(cfg.spec.gates[0].enforcement).toBe('advisory');
  });

  test('returns null when absent', () => {
    expect(loadQualityGate('/no/such.yaml')).toBeNull();
  });
});

describe('evaluatePromiseGate', () => {
  test('passes when no promises broken', () => {
    const r = evaluatePromiseGate([kept('a'), kept('b')], { config: advisoryCfg });
    expect(r.metricValue).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.blocking).toBe(false);
  });

  test('advisory gate never blocks even with broken promises', () => {
    const r = evaluatePromiseGate([kept('a'), broken('error-handling')], { config: advisoryCfg });
    expect(r.metricValue).toBe(1);
    expect(r.passed).toBe(false);
    expect(r.enforcement).toBe('advisory');
    expect(r.blocking).toBe(false); // R5/R15: advisory reports, never blocks
    expect(r.brokenPromises).toEqual(['error-handling']);
  });

  test('hard-mandatory gate blocks the pipeline on a broken promise', () => {
    const r = evaluatePromiseGate([broken('no-placeholders')], { config: hardCfg });
    expect(r.passed).toBe(false);
    expect(r.blocking).toBe(true);
  });

  test('defaults to advisory when no config provided', () => {
    const r = evaluatePromiseGate([broken('x')]);
    expect(r.enforcement).toBe('advisory');
    expect(r.blocking).toBe(false);
  });

  test('throws on an unknown enforcement level', () => {
    const bad = { kind: 'QualityGate', spec: { gates: [{ name: 'promise-verification', enforcement: 'nonsense' }] } };
    expect(() => evaluatePromiseGate([], { config: bad })).toThrow(/unknown enforcement/);
  });
});

describe('formatReviewerContext', () => {
  test('summarizes clean when nothing flagged', () => {
    expect(formatReviewerContext([kept('a')])).toMatch(/all standing.*promises kept/i);
  });

  test('lists broken + partial findings as advisory reviewer context', () => {
    const s = formatReviewerContext([kept('a'), broken('error-handling', 'missing try/catch'), partial('tests-with-code')]);
    expect(s).toMatch(/advisory context for your independent review/i);
    expect(s).toMatch(/\[BROKEN\] error-handling/);
    expect(s).toMatch(/missing try\/catch/);
    expect(s).toMatch(/\[PARTIAL\] tests-with-code/);
    // must NOT read like an instruction to the author
    expect(s).not.toMatch(/you (must|should) fix/i);
  });
});
