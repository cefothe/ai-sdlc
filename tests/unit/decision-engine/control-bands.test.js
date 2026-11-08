const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { evaluateBand } = require(path.join(ROOT, 'decision-engine', 'control-bands.js'));

// A stable baseline around 10 (sd ~1) followed by `recent` points.
const baseline = [9, 10, 11, 10, 9, 11, 10, 10, 9, 11, 10, 9, 11, 10, 10, 9, 11, 10, 9, 11];
const band = (recent, opts = {}) => evaluateBand([...baseline, ...recent], { window: 20, recent: recent.length, ...opts });

describe('evaluateBand (Western Electric)', () => {
  test('in control → level 0', () => {
    expect(band([10, 9, 11, 10, 10, 9, 11, 10])).toMatchObject({ level: 0, rules: [] });
  });

  test('rule 1: a point beyond 3σ → level 3', () => {
    expect(band([10, 10, 10, 10, 10, 10, 10, 20])).toMatchObject({ level: 3, latest: 20 });
  });

  test('rule 2: 2 of 3 beyond 2σ → level 2', () => {
    const r = band([10, 10, 10, 10, 10, 12.1, 10, 12.2]);
    expect(r.level).toBe(2);
    expect(r.rules).toContain('rule2: 2 of 3 beyond 2σ');
  });

  test('rules 3/4: sustained drift → level 1', () => {
    const r = band([10.4, 10.5, 10.3, 11.3, 11.2, 11.4, 10.5, 11.3]);
    expect(r.level).toBe(1);
    expect(r.rules.join(' ')).toMatch(/rule4: 8 in a row/);
  });

  test('direction: improvement is not a breach; "down" flips the side', () => {
    expect(band([10, 10, 10, 10, 10, 10, 10, 0]).level).toBe(0);
    expect(band([10, 10, 10, 10, 10, 10, 10, 0], { direction: 'down' }).level).toBe(3);
    expect(band([10, 10, 10, 10, 10, 10, 10, 0], { direction: 'both' }).level).toBe(3);
  });

  test('too little history is reported, never flagged', () => {
    expect(evaluateBand([1, 2, 3, 50], { recent: 1 })).toMatchObject({ level: 0, reason: expect.stringMatching(/insufficient baseline/) });
  });
});
