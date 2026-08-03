const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const dec = require(path.join(ROOT, 'decision-engine', 'decisions.js'));

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dec-'));
}

describe('newDecision', () => {
  test('builds a schema-shaped Decision', () => {
    const d = dec.newDecision({ id: 'DEC-0007', summary: 'Use Postgres', options: [{ id: 'pg', description: 'chosen' }, { id: 'mysql', description: 'no' }], created: '2026-07-17T21:00:00Z' });
    expect(d.apiVersion).toBe('ai-sdlc.io/v1alpha1');
    expect(d.kind).toBe('Decision');
    expect(d.metadata.id).toBe('DEC-0007');
    expect(d.metadata.created).toBe('2026-07-17T21:00:00Z');
    expect(d.spec.summary).toBe('Use Postgres');
    expect(d.status.lifecycle).toBe('proposed');
  });

  test('validates inputs', () => {
    expect(() => dec.newDecision({ id: 'bad', summary: 's', options: [{ id: 'a', description: 'b' }] })).toThrow(/DEC-NNNN/);
    expect(() => dec.newDecision({ id: 'DEC-0001', options: [{ id: 'a', description: 'b' }] })).toThrow(/summary/);
    expect(() => dec.newDecision({ id: 'DEC-0001', summary: 's', options: [] })).toThrow(/at least one option/);
    expect(() => dec.newDecision({ id: 'DEC-0001', summary: 's', options: [{ id: 'a' }] })).toThrow(/id \+ description/);
  });

  test('records the canonical ADR sections when provided', () => {
    const d = dec.newDecision({
      id: 'DEC-0009', summary: 'Use ed25519', options: [{ id: 'ed', description: 'chosen' }],
      context: 'Need to sign attestation envelopes.', rationale: 'Small keys, native crypto.',
      consequences: 'RSA envelopes are not accepted.', confidence: 'high', created: '2026-07-18T00:00:00Z',
    });
    expect(d.spec.context).toMatch(/attestation/);
    expect(d.spec.rationale).toMatch(/native crypto/);
    expect(d.spec.consequences).toMatch(/RSA/);
    expect(d.spec.confidence).toBe('high');
  });

  test('rejects an invalid confidence level', () => {
    expect(() => dec.newDecision({ id: 'DEC-0009', summary: 's', options: [{ id: 'a', description: 'b' }], confidence: 'certain' })).toThrow(/confidence must be/);
  });
});

describe('answerDecision', () => {
  test('records the chosen option + actor', () => {
    const d = dec.newDecision({ id: 'DEC-0002', summary: 's', options: [{ id: 'a', description: 'x' }, { id: 'b', description: 'y' }], created: '2026-07-17T21:00:00Z' });
    dec.answerDecision(d, { optionId: 'b', answeredBy: 'op@x', answeredAt: '2026-07-18T00:00:00Z' });
    expect(d.status.lifecycle).toBe('answered');
    expect(d.status.answeredOptionId).toBe('b');
    expect(d.status.answeredBy).toBe('op@x');
    expect(d.metadata.updated).toBe('2026-07-18T00:00:00Z');
  });

  test('rejects an unknown option', () => {
    const d = dec.newDecision({ id: 'DEC-0003', summary: 's', options: [{ id: 'a', description: 'x' }], created: 't' });
    expect(() => dec.answerDecision(d, { optionId: 'z' })).toThrow(/not one of/);
  });
});

describe('store: write / load / list / nextId', () => {
  test('round-trips a decision to .ai-sdlc/_decisions', () => {
    const root = tmp();
    try {
      const d = dec.newDecision({ id: 'DEC-0001', summary: 'first', options: [{ id: 'a', description: 'x' }], created: 't' });
      const file = dec.writeDecision(root, d);
      expect(file).toContain(path.join('.ai-sdlc', '_decisions', 'DEC-0001.yaml'));
      expect(dec.loadDecision(root, 'DEC-0001').spec.summary).toBe('first');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('nextId increments from existing records', () => {
    const root = tmp();
    try {
      expect(dec.nextId(root)).toBe('DEC-0001');
      dec.writeDecision(root, dec.newDecision({ id: 'DEC-0001', summary: 's', options: [{ id: 'a', description: 'x' }], created: 't' }));
      dec.writeDecision(root, dec.newDecision({ id: 'DEC-0002', summary: 's', options: [{ id: 'a', description: 'x' }], created: 't' }));
      expect(dec.nextId(root)).toBe('DEC-0003');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('list filters by lifecycle and sorts by id', () => {
    const root = tmp();
    try {
      const a = dec.newDecision({ id: 'DEC-0002', summary: 'open one', options: [{ id: 'a', description: 'x' }], created: 't' });
      const b = dec.newDecision({ id: 'DEC-0001', summary: 'answered one', options: [{ id: 'a', description: 'x' }], created: 't', lifecycle: 'answered' });
      dec.writeDecision(root, a);
      dec.writeDecision(root, b);
      const all = dec.listDecisions(root);
      expect(all.map((d) => d.metadata.id)).toEqual(['DEC-0001', 'DEC-0002']);
      expect(dec.listDecisions(root, { lifecycle: 'answered' })).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('loads the shipped DEC-0001 example', () => {
    const d = dec.loadDecision(ROOT, 'DEC-0001');
    expect(d.spec.summary).toMatch(/ed25519/);
    expect(d.status.answeredOptionId).toBe('ed25519');
  });
});
