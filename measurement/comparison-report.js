class ComparisonReport {
  static mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  static stddev(arr) {
    const m = ComparisonReport.mean(arr);
    const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  // Signed effect size: returns (mean(group2) - mean(group1)) / pooled_std.
  // Convention used in comparison reports: pass arguments such that
  // group2 is the "treatment" arm — positive d means treatment > baseline.
  // For metrics where lower is better (e.g. efficiency = tokens/quality),
  // callers should flip arguments so positive d still means "treatment better".
  static cohensD(group1, group2) {
    const m1 = ComparisonReport.mean(group1);
    const m2 = ComparisonReport.mean(group2);
    const s1 = ComparisonReport.stddev(group1);
    const s2 = ComparisonReport.stddev(group2);
    const pooledStd = Math.sqrt(((group1.length - 1) * s1 ** 2 + (group2.length - 1) * s2 ** 2) / (group1.length + group2.length - 2));
    if (pooledStd === 0) return m1 === m2 ? 0 : (m2 > m1 ? Infinity : -Infinity);
    return (m2 - m1) / pooledStd;
  }

  static wilcoxonSignedRank(baseline, promise) {
    if (baseline.length !== promise.length) {
      throw new Error('Arrays must have equal length');
    }
    if (baseline.length < 5) {
      throw new Error('Need at least 5 paired observations');
    }

    const diffs = baseline.map((b, i) => promise[i] - b);
    const nonZero = diffs.filter(d => d !== 0);

    if (nonZero.length === 0) {
      return { direction: 'no_difference', statistic: 0, n: baseline.length };
    }

    const sorted = nonZero
      .map(d => ({ diff: d, abs: Math.abs(d), sign: d > 0 ? 1 : -1 }))
      .sort((a, b) => a.abs - b.abs);

    // Assign average ranks for ties
    const ranked = sorted.map((item, i, arr) => {
      const ties = arr.filter(x => x.abs === item.abs);
      const firstIdx = arr.indexOf(ties[0]);
      const avgRank = ties.reduce((sum, _, j) => sum + (firstIdx + j + 1), 0) / ties.length;
      return { ...item, rank: avgRank };
    });

    const wPlus = ranked.filter(r => r.sign === 1).reduce((sum, r) => sum + r.rank, 0);
    const wMinus = ranked.filter(r => r.sign === -1).reduce((sum, r) => sum + r.rank, 0);
    const w = Math.min(wPlus, wMinus);

    const n = nonZero.length;
    const ranks = ranked.map(r => r.rank);
    const pValue = ComparisonReport._wilcoxonPvalue(w, n, ranks);

    let direction;
    if (pValue <= 0.05) {
      direction = wPlus > wMinus ? 'promise_better' : 'baseline_better';
    } else {
      direction = 'no_difference';
    }

    return { direction, statistic: w, w_plus: wPlus, w_minus: wMinus, n, p_value: pValue };
  }

  // Two-tailed p-value for the paired Wilcoxon signed-rank statistic.
  // For n <= 20 enumerates all 2^n sign permutations of `ranks` (handles ties
  // when ranks contain averaged values). For n > 20 falls back to the normal
  // approximation with continuity correction.
  static _wilcoxonPvalue(w, n, ranks) {
    if (n < 1) return 1;
    const r = (Array.isArray(ranks) && ranks.length === n)
      ? ranks
      : Array.from({ length: n }, (_, i) => i + 1);
    const totalRankSum = r.reduce((a, b) => a + b, 0);

    if (n <= 20) {
      const total = 1 << n;
      let countLE = 0;
      const eps = 1e-9;
      for (let mask = 0; mask < total; mask++) {
        let wPlus = 0;
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) wPlus += r[i];
        }
        const wTest = Math.min(wPlus, totalRankSum - wPlus);
        if (wTest <= w + eps) countLE++;
      }
      return countLE / total;
    }

    // Normal approximation (n > 20)
    const mean = n * (n + 1) / 4;
    const std = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24);
    if (std === 0) return 1;
    const z = (w + 0.5 - mean) / std; // continuity correction toward the mean
    const pOneTail = ComparisonReport._normalCdf(z);
    return Math.min(1, 2 * pOneTail);
  }

  // Standard normal CDF via Abramowitz & Stegun 7.1.26 erf approximation.
  static _normalCdf(z) {
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    const y = 1 - (((((a[4] * t + a[3]) * t) + a[2]) * t + a[1]) * t + a[0]) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  static compareTokens(baseline, treatment) {
    const baselineTokens = baseline
      .filter(r => r.usage)
      .map(r => (r.usage.input_tokens || 0) + (r.usage.output_tokens || 0));
    const treatmentTokens = treatment
      .filter(r => r.usage)
      .map(r => (r.usage.input_tokens || 0) + (r.usage.output_tokens || 0));

    if (baselineTokens.length === 0 || treatmentTokens.length === 0) {
      return null;
    }

    const bMean = ComparisonReport.mean(baselineTokens);
    const tMean = ComparisonReport.mean(treatmentTokens);

    return {
      baseline_mean: bMean,
      treatment_mean: tMean,
      delta: tMean - bMean,
      delta_pct: ((tMean - bMean) / bMean) * 100,
      baseline_total: baselineTokens.reduce((a, b) => a + b, 0),
      treatment_total: treatmentTokens.reduce((a, b) => a + b, 0),
    };
  }

  static efficiencyRatio(records) {
    const valid = records.filter(r => r.usage && r.quality_score);
    if (valid.length === 0) return null;
    const tokens = valid.map(r => (r.usage.input_tokens || 0) + (r.usage.output_tokens || 0));
    const scores = valid.map(r => r.quality_score);
    const meanTokens = ComparisonReport.mean(tokens);
    const meanScore = ComparisonReport.mean(scores);
    return meanTokens / meanScore;
  }

  static generateReport(baseline, promise) {
    const metrics = {};

    for (const key of Object.keys(baseline)) {
      const b = baseline[key];
      const p = promise[key];
      const metricKey = key.replace('_scores', '').replace('_rates', '').replace('_times', '');
      metrics[metricKey] = {
        baseline_mean: Math.round(ComparisonReport.mean(b) * 1000) / 1000,
        promise_mean: Math.round(ComparisonReport.mean(p) * 1000) / 1000,
        effect_size: Math.round(ComparisonReport.cohensD(b, p) * 1000) / 1000,
        ...ComparisonReport.wilcoxonSignedRank(b, p),
      };
    }

    const improvements = Object.values(metrics).filter(m => m.direction === 'promise_better').length;
    const regressions = Object.values(metrics).filter(m => m.direction === 'baseline_better').length;
    const neutral = Object.values(metrics).filter(m => m.direction === 'no_difference').length;

    return {
      ...metrics,
      summary: {
        total_metrics: Object.keys(metrics).length,
        improvements,
        regressions,
        neutral,
        recommendation: regressions > 0
          ? 'INVESTIGATE — regressions detected'
          : improvements > neutral
            ? 'POSITIVE — directional improvement'
            : 'NEUTRAL — no clear signal',
      },
    };
  }
}

module.exports = { ComparisonReport };
