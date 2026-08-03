const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const om = require(path.join(ROOT, 'measurement', 'outcome-metrics.js'));

function rec(over = {}) {
  return {
    taskId: 'AISDLC-1',
    review: { cycles: 1 },
    tests: { after: { passed: 10, failed: 0 } },
    outcome: { mergedClean: true, buildPassed: true, humanCorrections: 0, regressionIntroduced: false, blastRadiusFiles: 0 },
    leadTimeMs: 1000,
    ...over,
  };
}

describe('isStrictCompletion', () => {
  test('clean merge, green tests, zero corrections = completion', () => {
    expect(om.isStrictCompletion(rec())).toBe(true);
  });
  test('any human correction disqualifies (strict definition)', () => {
    expect(om.isStrictCompletion(rec({ outcome: { mergedClean: true, humanCorrections: 1 } }))).toBe(false);
  });
  test('failing tests disqualify', () => {
    expect(om.isStrictCompletion(rec({ tests: { after: { passed: 8, failed: 2 } } }))).toBe(false);
  });
  test('not merged clean disqualifies', () => {
    expect(om.isStrictCompletion(rec({ outcome: { mergedClean: false } }))).toBe(false);
  });
});

describe('parseRunRecords', () => {
  test('separates valid from invalid rows', () => {
    const jsonl = [
      JSON.stringify(rec()),
      '{ not json',
      JSON.stringify({ review: {} }), // missing taskId + outcome
    ].join('\n');
    const { records, invalid } = om.parseRunRecords(jsonl);
    expect(records).toHaveLength(1);
    expect(invalid).toHaveLength(2);
  });
});

describe('scorecard', () => {
  test('computes the four outcome metrics', () => {
    const records = [
      rec(),                                                                   // completion, no regression
      rec({ outcome: { mergedClean: true, buildPassed: true, humanCorrections: 0, regressionIntroduced: true, blastRadiusFiles: 3 }, review: { cycles: 2 } }), // completion WITH regression
      rec({ outcome: { mergedClean: true, humanCorrections: 2 }, review: { cycles: 3 } }), // not a completion (corrections)
    ];
    const sc = om.scorecard(records);
    expect(sc.runs).toBe(3);
    expect(sc.completed).toBe(2);
    expect(sc.completionRate).toBeCloseTo(2 / 3);
    expect(sc.regressionRate).toBeCloseTo(1 / 2); // 1 of 2 completions regressed
    expect(sc.avgReviewLoops).toBeCloseTo((1 + 2 + 3) / 3);
  });

  test('counts gate blocks', () => {
    const records = [
      rec({ gates: { dor: { admitted: false } } }),
      rec({ gates: { clarify: { clear: false }, analyze: { consistent: false } } }),
    ];
    const sc = om.scorecard(records);
    expect(sc.gateBlocks.dor).toBe(1);
    expect(sc.gateBlocks.clarify).toBe(1);
    expect(sc.gateBlocks.analyze).toBe(1);
  });

  test('empty input yields null rates, not a crash', () => {
    const sc = om.scorecard([]);
    expect(sc.runs).toBe(0);
    expect(sc.completionRate).toBeNull();
  });
});

describe('recordRun + evaluateRunFile round-trip', () => {
  test('appends valid records and evaluates them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-'));
    const sink = path.join(dir, 'runs.jsonl');
    om.recordRun(sink, rec());
    om.recordRun(sink, rec({ outcome: { mergedClean: true, humanCorrections: 1 } }));
    const { scorecard: sc, counted } = om.evaluateRunFile(sink);
    expect(counted).toBe(2);
    expect(sc.completed).toBe(1);
  });

  test('recordRun rejects an invalid record', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-'));
    expect(() => om.recordRun(path.join(dir, 'r.jsonl'), { review: {} })).toThrow(/invalid run-record/);
  });
});
