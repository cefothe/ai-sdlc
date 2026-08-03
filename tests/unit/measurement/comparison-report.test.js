const { ComparisonReport } = require('../../../measurement/comparison-report');

describe('ComparisonReport', () => {
  describe('wilcoxonSignedRank', () => {
    test('detects significant difference in paired samples', () => {
      const baseline = [5, 6, 5, 7, 5, 6, 5, 7, 6, 5];
      const promise =  [8, 9, 8, 9, 8, 9, 8, 9, 9, 8];
      const result = ComparisonReport.wilcoxonSignedRank(baseline, promise);
      expect(result.direction).toBe('promise_better');
      expect(result.statistic).toBeDefined();
    });

    test('detects no significant difference for similar samples', () => {
      const baseline = [7, 7, 8, 7, 8, 7, 7, 8, 7, 8];
      const promise =  [7, 8, 7, 8, 7, 8, 7, 7, 8, 7];
      const result = ComparisonReport.wilcoxonSignedRank(baseline, promise);
      expect(result.direction).toBe('no_difference');
    });

    test('requires equal-length arrays', () => {
      expect(() => ComparisonReport.wilcoxonSignedRank([1,2], [1,2,3]))
        .toThrow('Arrays must have equal length');
    });

    test('requires at least 5 paired observations', () => {
      expect(() => ComparisonReport.wilcoxonSignedRank([1,2], [3,4]))
        .toThrow('Need at least 5 paired observations');
    });
  });

  describe('cohensD', () => {
    test('computes effect size for two samples', () => {
      const baseline = [5, 5, 5, 5, 5];
      const promise = [8, 8, 8, 8, 8];
      const d = ComparisonReport.cohensD(baseline, promise);
      expect(d).toBeGreaterThan(2); // very large effect
    });

    test('returns 0 for identical samples', () => {
      const same = [5, 5, 5, 5, 5];
      expect(ComparisonReport.cohensD(same, same)).toBe(0);
    });

    test('is signed: positive when group2 mean > group1 mean', () => {
      const lower = [1, 2, 1, 2, 1];
      const higher = [4, 5, 4, 5, 4];
      expect(ComparisonReport.cohensD(lower, higher)).toBeGreaterThan(0);
    });

    test('is signed: negative when group2 mean < group1 mean', () => {
      const higher = [4, 5, 4, 5, 4];
      const lower = [1, 2, 1, 2, 1];
      expect(ComparisonReport.cohensD(higher, lower)).toBeLessThan(0);
    });

    // Regression test for kgenov #8: prior implementation used Math.abs which
    // hid the direction. R14's reported d=1.03 with mean delta of -0.113 made
    // a baseline-favored regression look like a treatment win.
    test('regression — symmetric arg flip produces opposite-sign d', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [5, 6, 7, 8, 9];
      const dAB = ComparisonReport.cohensD(a, b);
      const dBA = ComparisonReport.cohensD(b, a);
      expect(dAB).toBeGreaterThan(0);
      expect(dBA).toBeLessThan(0);
      expect(dAB).toBeCloseTo(-dBA, 6);
    });

    test('returns ±Infinity when pooled stddev is 0 but means differ', () => {
      expect(ComparisonReport.cohensD([5, 5, 5], [7, 7, 7])).toBe(Infinity);
      expect(ComparisonReport.cohensD([7, 7, 7], [5, 5, 5])).toBe(-Infinity);
    });
  });

  describe('_wilcoxonPvalue (exact distribution at small n)', () => {
    // Hand-computed exact two-tailed p-values from enumerating sign permutations
    // of ranks 1..n. Reference: standard published Wilcoxon signed-rank tables
    // and direct enumeration.
    test('n=5: P(W ≤ 0) = 0.0625 (minimum achievable two-tailed p)', () => {
      // Min p at n=5 is 2/2^5 = 0.0625; cannot reach α=0.05 two-tailed.
      const p = ComparisonReport._wilcoxonPvalue(0, 5);
      expect(p).toBeCloseTo(0.0625, 6);
    });

    test('n=5: P(W ≤ 1) = 0.125', () => {
      const p = ComparisonReport._wilcoxonPvalue(1, 5);
      expect(p).toBeCloseTo(0.125, 6);
    });

    test('n=6: P(W ≤ 0) = 0.03125', () => {
      const p = ComparisonReport._wilcoxonPvalue(0, 6);
      expect(p).toBeCloseTo(0.03125, 6);
    });

    test('n=6: P(W ≤ 2) = 0.09375', () => {
      const p = ComparisonReport._wilcoxonPvalue(2, 6);
      expect(p).toBeCloseTo(0.09375, 6);
    });

    test('n=10: smallest W with two-tailed p ≤ 0.05 is W=8 (P≈0.0488)', () => {
      // Verified by direct enumeration. W=8 → 0.0488, W=9 → 0.0664.
      const p8 = ComparisonReport._wilcoxonPvalue(8, 10);
      const p9 = ComparisonReport._wilcoxonPvalue(9, 10);
      expect(p8).toBeCloseTo(0.0488, 3);
      expect(p9).toBeCloseTo(0.0645, 3);
      expect(p8).toBeLessThanOrEqual(0.05);
      expect(p9).toBeGreaterThan(0.05);
    });

    test('n=20: exact computation completes (boundary of enumeration)', () => {
      const p = ComparisonReport._wilcoxonPvalue(50, 20);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    });

    test('n=21: falls back to normal approximation', () => {
      // At n=21, mean = 21*22/4 = 115.5, std ≈ √(21*22*43/24) ≈ 28.77
      // W=80 → z = (80.5 - 115.5)/28.77 ≈ -1.217, two-tailed p ≈ 0.224
      const p = ComparisonReport._wilcoxonPvalue(80, 21);
      expect(p).toBeGreaterThan(0.15);
      expect(p).toBeLessThan(0.30);
    });

    test('handles fractional ranks from ties', () => {
      // 5 paired diffs, ranks 1, 2.5, 2.5, 4, 5 (ties at positions 2-3)
      const ranks = [1, 2.5, 2.5, 4, 5];
      const p = ComparisonReport._wilcoxonPvalue(0, 5, ranks);
      expect(p).toBeCloseTo(2 / 32, 6);
    });
  });

  describe('wilcoxonSignedRank with p-value', () => {
    test('returns p_value field', () => {
      const baseline = [5, 6, 5, 7, 5];
      const promise =  [8, 9, 8, 9, 8];
      const result = ComparisonReport.wilcoxonSignedRank(baseline, promise);
      expect(result.p_value).toBeDefined();
      expect(result.p_value).toBeGreaterThanOrEqual(0);
      expect(result.p_value).toBeLessThanOrEqual(1);
    });

    // Regression test for kgenov #6 / nmilenkov #3: prior _wilcoxonCritical
    // table at n=5 was {5: 1}, accepting W=1 as α=0.05-significant. Exact
    // two-tailed p at n=5, W=1 is 0.125 — should be reported as no_difference.
    // Diffs chosen to avoid ties so ranks are unique 1..5.
    test('regression — n=5 W=1 reports no_difference (exact p=0.125 > 0.05)', () => {
      const baseline = [5, 5, 5, 5, 5];
      const promise =  [4, 7, 8, 9, 10];  // diffs: -1, +2, +3, +4, +5 → wMinus=1, wPlus=14
      const result = ComparisonReport.wilcoxonSignedRank(baseline, promise);
      expect(result.statistic).toBe(1);  // min(1, 14)
      expect(result.p_value).toBeCloseTo(0.125, 3);
      expect(result.direction).toBe('no_difference');
    });

    test('n=5 W=0 (all positive diffs) reports promise_better at p=0.0625', () => {
      // R5-style detection at extremes: all 5 differences favor treatment
      const baseline = [1, 1, 1, 1, 1];
      const promise =  [2, 3, 4, 5, 6];  // all diffs positive
      const result = ComparisonReport.wilcoxonSignedRank(baseline, promise);
      expect(result.statistic).toBe(0);
      expect(result.p_value).toBeCloseTo(0.0625, 3);
      // p=0.0625 > 0.05 strict cutoff → still no_difference under our threshold
      expect(result.direction).toBe('no_difference');
    });

    test('n=6 W=0 reports significant (p=0.03125 < 0.05)', () => {
      const baseline = [1, 1, 1, 1, 1, 1];
      const promise =  [2, 3, 4, 5, 6, 7];
      const result = ComparisonReport.wilcoxonSignedRank(baseline, promise);
      expect(result.statistic).toBe(0);
      expect(result.p_value).toBeCloseTo(0.03125, 3);
      expect(result.direction).toBe('promise_better');
    });

    test('direction is baseline_better when more negative diffs', () => {
      const baseline = [10, 10, 10, 10, 10, 10];
      const promise =  [1, 2, 3, 4, 5, 6];  // all diffs negative (promise lower)
      const result = ComparisonReport.wilcoxonSignedRank(baseline, promise);
      expect(result.direction).toBe('baseline_better');
    });
  });

  describe('compareTokens', () => {
    test('returns null when baseline has no usage data', () => {
      const baseline = [{ quality_score: 7 }];
      const treatment = [{ quality_score: 8, usage: { input_tokens: 100, output_tokens: 50 } }];
      expect(ComparisonReport.compareTokens(baseline, treatment)).toBeNull();
    });

    test('computes mean and delta correctly', () => {
      const baseline = [
        { usage: { input_tokens: 1000, output_tokens: 200 } },
        { usage: { input_tokens: 1500, output_tokens: 300 } },
      ];
      const treatment = [
        { usage: { input_tokens: 800, output_tokens: 150 } },
        { usage: { input_tokens: 1000, output_tokens: 200 } },
      ];
      const result = ComparisonReport.compareTokens(baseline, treatment);
      expect(result.baseline_mean).toBe(1500);
      expect(result.treatment_mean).toBe(1075);
      expect(result.delta).toBe(-425);
    });
  });

  describe('efficiencyRatio', () => {
    test('returns tokens per quality point', () => {
      const records = [
        { quality_score: 7, usage: { input_tokens: 1000, output_tokens: 400 } },
        { quality_score: 8, usage: { input_tokens: 1200, output_tokens: 400 } },
      ];
      const ratio = ComparisonReport.efficiencyRatio(records);
      expect(ratio).toBeCloseTo(200, 0);
    });

    test('returns null when no records have usage', () => {
      const records = [{ quality_score: 7 }];
      expect(ComparisonReport.efficiencyRatio(records)).toBeNull();
    });
  });

  describe('generateReport', () => {
    test('produces structured report from two metric sets', () => {
      const baseline = {
        quality_scores: [6, 7, 6, 7, 6, 7, 6, 7, 6, 7],
        compliance_rates: [0.6, 0.7, 0.6, 0.7, 0.6, 0.7, 0.6, 0.7, 0.6, 0.7],
        completion_times: [30, 35, 32, 33, 31, 34, 30, 35, 32, 33],
      };
      const promise = {
        quality_scores: [8, 9, 8, 9, 8, 9, 8, 9, 8, 9],
        compliance_rates: [0.85, 0.9, 0.85, 0.9, 0.85, 0.9, 0.85, 0.9, 0.85, 0.9],
        completion_times: [28, 30, 29, 28, 30, 29, 28, 30, 29, 28],
      };
      const report = ComparisonReport.generateReport(baseline, promise);
      expect(report.quality.direction).toBe('promise_better');
      expect(report.compliance.direction).toBe('promise_better');
      expect(report.quality.effect_size).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
    });
  });
});
