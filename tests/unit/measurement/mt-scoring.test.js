const { computeArtifactQuality, computeCorrectionSpeed, computeEfficiency, aggregateSessionScores, buildMtPairedScores, determineMtResult, categorizeTool, decomposeContextAcquisition, aggregateContextDecomposition } = require('../../../measurement/mt-scoring');

describe('mt-scoring', () => {
  describe('computeArtifactQuality', () => {
    test('returns 1.0 when all checkpoints pass', () => {
      const turnResults = [
        [{ passed: true }, { passed: true }],
        [{ passed: true }],
      ];
      expect(computeArtifactQuality(turnResults)).toBe(1.0);
    });

    test('returns 0.0 when all checkpoints fail', () => {
      const turnResults = [
        [{ passed: false }, { passed: false }],
      ];
      expect(computeArtifactQuality(turnResults)).toBe(0.0);
    });

    test('returns ratio for mixed results', () => {
      const turnResults = [
        [{ passed: true }, { passed: false }],
        [{ passed: true }, { passed: true }],
      ];
      expect(computeArtifactQuality(turnResults)).toBe(0.75);
    });

    test('returns 1.0 for empty checkpoints', () => {
      expect(computeArtifactQuality([])).toBe(1.0);
    });
  });

  describe('computeCorrectionSpeed', () => {
    test('returns 1.0 when fixed on first defect_check turn', () => {
      const turnResults = [
        [{ type: 'file_exists', passed: true }],
        [{ type: 'defect_check', passed: true }],
        [{ type: 'grep_present', passed: true }],
      ];
      expect(computeCorrectionSpeed(turnResults)).toBe(1.0);
    });

    test('returns 0.0 when never fixed', () => {
      const turnResults = [
        [{ type: 'file_exists', passed: true }],
        [{ type: 'defect_check', passed: false }],
        [{ type: 'defect_check', passed: false }],
      ];
      expect(computeCorrectionSpeed(turnResults)).toBe(0.0);
    });

    test('returns intermediate value for delayed fix', () => {
      const turnResults = [
        [{ type: 'defect_check', passed: false }],
        [{ type: 'grep_present', passed: true }],
        [{ type: 'defect_check', passed: true }],
      ];
      // first defect_check at turn 0, remaining=3, fixed at turn 2, depth=2
      // 1 - (2/3) = 0.333...
      expect(computeCorrectionSpeed(turnResults)).toBeCloseTo(0.333, 2);
    });

    test('returns null when no defect_check checkpoints exist', () => {
      const turnResults = [
        [{ type: 'file_exists', passed: true }],
        [{ type: 'grep_present', passed: true }],
      ];
      expect(computeCorrectionSpeed(turnResults)).toBeNull();
    });
  });

  describe('computeEfficiency', () => {
    test('returns tokens/quality when quality > 0', () => {
      expect(computeEfficiency(1000, 0.5)).toBe(2000);
    });

    test('returns Infinity when quality is 0', () => {
      expect(computeEfficiency(1000, 0)).toBe(Infinity);
    });

    test('returns 0 when tokens is 0 and quality > 0', () => {
      expect(computeEfficiency(0, 1.0)).toBe(0);
    });
  });

  describe('aggregateSessionScores', () => {
    test('keys observations by (scenario, run); each session is its own observation', () => {
      const sessions = [
        { run: 1, scenario: 'a', artifact_quality: 0.8, total_tokens: 1000, correction_speed: 1.0, efficiency: 1250 },
        { run: 1, scenario: 'b', artifact_quality: 0.6, total_tokens: 2000, correction_speed: 0.5, efficiency: 3333 },
        { run: 2, scenario: 'a', artifact_quality: 1.0, total_tokens: 800, correction_speed: 1.0, efficiency: 800 },
        { run: 2, scenario: 'b', artifact_quality: 0.4, total_tokens: 1500, correction_speed: null, efficiency: 3750 },
      ];
      const per = aggregateSessionScores(sessions);
      expect(per).toHaveLength(4);
      expect(per[0]).toMatchObject({ scenario: 'a', run: 1, mean_quality: 0.8, mean_tokens: 1000, mean_correction_speed: 1.0 });
      expect(per[1]).toMatchObject({ scenario: 'a', run: 2, mean_quality: 1.0, mean_tokens: 800 });
      expect(per[2]).toMatchObject({ scenario: 'b', run: 1, mean_quality: 0.6, mean_correction_speed: 0.5 });
      expect(per[3]).toMatchObject({ scenario: 'b', run: 2, mean_quality: 0.4, mean_correction_speed: null });
    });
  });

  describe('buildMtPairedScores', () => {
    test('pairs by (scenario, run); drops pairs missing in either arm', () => {
      const baseline = [
        { scenario: 'a', run: 1, mean_quality: 0.7, mean_tokens: 1000, mean_efficiency: 1428, mean_correction_speed: 0.5 },
        { scenario: 'a', run: 2, mean_quality: 0.8, mean_tokens: 1200, mean_efficiency: 1500, mean_correction_speed: 0.7 },
        { scenario: 'b', run: 1, mean_quality: 0.6, mean_tokens: 2000, mean_efficiency: 3333, mean_correction_speed: 0.4 },
      ];
      const treatment = [
        { scenario: 'a', run: 1, mean_quality: 0.9, mean_tokens: 900, mean_efficiency: 1000, mean_correction_speed: 1.0 },
        { scenario: 'a', run: 2, mean_quality: 0.85, mean_tokens: 1100, mean_efficiency: 1294, mean_correction_speed: 0.8 },
        // scenario b run 1 missing from treatment -> pair dropped
      ];
      const pairs = buildMtPairedScores(baseline, treatment);
      expect(pairs.quality.baseline).toEqual([0.7, 0.8]);
      expect(pairs.quality.treatment).toEqual([0.9, 0.85]);
      expect(pairs.efficiency.baseline).toEqual([1428, 1500]);
      expect(pairs.correction.baseline).toEqual([0.5, 0.7]);
    });

    test('omits scenarios where the same run number exists in both arms but for different scenarios', () => {
      const baseline = [{ scenario: 'a', run: 1, mean_quality: 0.5, mean_tokens: 100, mean_efficiency: 200, mean_correction_speed: null }];
      const treatment = [{ scenario: 'b', run: 1, mean_quality: 0.9, mean_tokens: 80, mean_efficiency: 88, mean_correction_speed: null }];
      const pairs = buildMtPairedScores(baseline, treatment);
      expect(pairs.quality.baseline).toEqual([]);
      expect(pairs.quality.treatment).toEqual([]);
    });
  });

  describe('determineMtResult', () => {
    test('PASS when quality and efficiency no_difference (no promise stats)', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'no_difference' } },
        efficiency: { wilcoxon: { direction: 'no_difference' } },
      };
      const result = determineMtResult(comparison);
      expect(result.verdict).toBe('PASS');
      expect(result.passed).toBe(true);
    });

    test('FAIL when quality baseline_better', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'baseline_better' } },
        efficiency: { wilcoxon: { direction: 'no_difference' } },
      };
      const result = determineMtResult(comparison);
      expect(result.verdict).toBe('FAIL');
      expect(result.passed).toBe(false);
    });

    test('WARN when quality treatment-better but efficiency baseline-better (no promise stats)', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'promise_better' } },
        efficiency: { wilcoxon: { direction: 'baseline_better' } },
      };
      const result = determineMtResult(comparison);
      expect(result.verdict).toBe('WARN');
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('treatment significantly better'),
        expect.stringContaining('uses more tokens'),
      ]));
    });

    test('PASS when promise_better on both quality and efficiency', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'promise_better' } },
        efficiency: { wilcoxon: { direction: 'promise_better' } },
      };
      const result = determineMtResult(comparison);
      expect(result.verdict).toBe('PASS');
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('Quality: treatment significantly better'),
        expect.stringContaining('Efficiency: treatment more efficient'),
      ]));
    });

    // Regression test for kgenov #5: determineMtResult previously checked for
    // 'treatment_better' / 'treatment_worse' which Wilcoxon never emits.
    // R13's direction:'promise_better' surfaced as "no significant difference".
    test('regression — promise_better quality must produce "treatment significantly better" reason', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'promise_better' } },
        efficiency: { wilcoxon: { direction: 'no_difference' } },
      };
      const result = determineMtResult(comparison);
      expect(result.reasons.find(r => r.includes('Quality:'))).toContain('treatment significantly better');
      expect(result.reasons.find(r => r.includes('Quality:'))).not.toContain('no significant difference');
    });

    // Regression test: 'treatment_better'/'treatment_worse' must NOT be treated
    // specially by the verdict logic — they are not part of the contract.
    test('regression — legacy treatment_better/treatment_worse strings fall through to no_difference', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'treatment_better' } },
        efficiency: { wilcoxon: { direction: 'treatment_worse' } },
      };
      const result = determineMtResult(comparison);
      // Quality: not 'baseline_better' and not 'promise_better' → no_difference reason
      expect(result.reasons[0]).toBe('Quality: no significant difference');
      // Efficiency: not 'baseline_better' and not 'promise_better' → no_difference reason
      expect(result.reasons[1]).toBe('Efficiency: no significant difference');
    });

    test('PASS with high promise compliance and good metrics', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'promise_better' } },
        efficiency: { wilcoxon: { direction: 'promise_better' } },
      };
      const promiseStats = {
        compliance_rate: 0.95,
        retry_rate: 0.1,
        total_turns: 10,
        compliant_turns: 9,
        total_retries: 1,
      };
      const result = determineMtResult(comparison, promiseStats);
      expect(result.verdict).toBe('PASS');
      expect(result.passed).toBe(true);
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('95.0%'),
        expect.stringContaining('high'),
      ]));
    });

    test('WARN with high compliance offsets efficiency regression', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'promise_better' } },
        efficiency: { wilcoxon: { direction: 'baseline_better' } },
      };
      const promiseStats = {
        compliance_rate: 0.95,
        retry_rate: 0.1,
        total_turns: 10,
        compliant_turns: 9,
        total_retries: 1,
      };
      const result = determineMtResult(comparison, promiseStats);
      expect(result.verdict).toBe('WARN');
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('High compliance offsets efficiency cost'),
      ]));
    });

    test('FAIL with low promise compliance', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'no_difference' } },
        efficiency: { wilcoxon: { direction: 'no_difference' } },
      };
      const promiseStats = {
        compliance_rate: 0.5,
        retry_rate: 0.2,
        total_turns: 10,
        compliant_turns: 5,
        total_retries: 2,
      };
      const result = determineMtResult(comparison, promiseStats);
      expect(result.verdict).toBe('FAIL');
      expect(result.passed).toBe(false);
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('50.0%'),
        expect.stringContaining('low'),
      ]));
    });

    test('WARN with excessive retry rate', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'treatment_better' } },
        efficiency: { wilcoxon: { direction: 'treatment_better' } },
      };
      const promiseStats = {
        compliance_rate: 0.9,
        retry_rate: 0.6,
        total_turns: 10,
        compliant_turns: 9,
        total_retries: 6,
      };
      const result = determineMtResult(comparison, promiseStats);
      expect(result.verdict).toBe('WARN');
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('excessive'),
      ]));
    });

    test('WARN with efficiency regression but high compliance', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'treatment_better' } },
        efficiency: { wilcoxon: { direction: 'baseline_better' } },
      };
      const promiseStats = {
        compliance_rate: 0.95,
        retry_rate: 0.1,
        total_turns: 20,
        compliant_turns: 19,
        total_retries: 2,
      };
      const result = determineMtResult(comparison, promiseStats);
      expect(result.verdict).toBe('WARN');
      expect(result.passed).toBe(true);
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('High compliance offsets efficiency cost'),
      ]));
    });

    describe('|d| ≥ 0.5 effect-size floor on no_difference quality', () => {
      // Post-ryordanov-audit fix: previously, no_difference quality direction
      // passed regardless of |d|. A moderate-but-NS quality regression at
      // modest n (e.g. d=-0.6, p=0.08) would silently rubber-stamp. Floor at
      // |d|=0.5 catches this class.

      test('no_difference with d ≤ -0.5 downgrades PASS to WARN', () => {
        const comparison = {
          quality: { wilcoxon: { direction: 'no_difference' }, cohens_d: -0.6 },
          efficiency: { wilcoxon: { direction: 'promise_better' } },
        };
        const result = determineMtResult(comparison);
        expect(result.verdict).toBe('WARN');
        expect(result.reasons.join(' ')).toMatch(/floor/);
      });

      test('exactly at floor (d = -0.5) trips WARN', () => {
        const comparison = {
          quality: { wilcoxon: { direction: 'no_difference' }, cohens_d: -0.5 },
          efficiency: { wilcoxon: { direction: 'no_difference' } },
        };
        const result = determineMtResult(comparison);
        expect(result.verdict).toBe('WARN');
      });

      test('just below floor (d = -0.49) keeps PASS', () => {
        const comparison = {
          quality: { wilcoxon: { direction: 'no_difference' }, cohens_d: -0.49 },
          efficiency: { wilcoxon: { direction: 'no_difference' } },
        };
        const result = determineMtResult(comparison);
        expect(result.verdict).toBe('PASS');
      });

      test('positive d (treatment-favoring) does not trip floor', () => {
        const comparison = {
          quality: { wilcoxon: { direction: 'no_difference' }, cohens_d: 0.6 },
          efficiency: { wilcoxon: { direction: 'promise_better' } },
        };
        const result = determineMtResult(comparison);
        expect(result.verdict).toBe('PASS');
      });

      test('R16 actual data (d=-0.229) is below floor — preserves PASS verdict', () => {
        // Sanity: the new floor must not retroactively invalidate the R16
        // n=30 PASS that the PR ships on.
        const comparison = {
          quality: { wilcoxon: { direction: 'no_difference' }, cohens_d: -0.229 },
          efficiency: { wilcoxon: { direction: 'promise_better' }, cohens_d: 0.225 },
        };
        const promiseStats = { compliance_rate: 0.931, retry_rate: 0.038, total_turns: 320, compliant_turns: 298, total_retries: 12 };
        const result = determineMtResult(comparison, promiseStats);
        expect(result.verdict).toBe('PASS');
      });
    });

    test('moderate compliance does not downgrade to FAIL', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'treatment_better' } },
        efficiency: { wilcoxon: { direction: 'no_difference' } },
      };
      const promiseStats = {
        compliance_rate: 0.75,
        retry_rate: 0.1,
        total_turns: 20,
        compliant_turns: 15,
        total_retries: 2,
      };
      const result = determineMtResult(comparison, promiseStats);
      expect(result.verdict).toBe('PASS');
      expect(result.passed).toBe(true);
      expect(result.reasons).toEqual(expect.arrayContaining([
        expect.stringContaining('moderate'),
      ]));
    });

    test('no-promise-stats path: WARN when efficiency regresses', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'promise_better' } },
        efficiency: { wilcoxon: { direction: 'baseline_better' } },
      };
      const result = determineMtResult(comparison, null);
      expect(result.verdict).toBe('WARN');
      const result2 = determineMtResult(comparison, undefined);
      expect(result2.verdict).toBe('WARN');
    });
  });

  describe('categorizeTool', () => {
    test('classifies cxpak tools as context', () => {
      expect(categorizeTool('mcp__cxpak__cxpak_auto_context', {})).toBe('context');
      expect(categorizeTool('cxpak_overview', {})).toBe('context');
    });

    test('classifies Read/Grep/Glob/LS as context', () => {
      expect(categorizeTool('Read', { file_path: '/x' })).toBe('context');
      expect(categorizeTool('Grep', {})).toBe('context');
      expect(categorizeTool('Glob', {})).toBe('context');
      expect(categorizeTool('LS', {})).toBe('context');
    });

    test('classifies Edit/Write/MultiEdit as implementation', () => {
      expect(categorizeTool('Edit', {})).toBe('implementation');
      expect(categorizeTool('Write', {})).toBe('implementation');
      expect(categorizeTool('MultiEdit', {})).toBe('implementation');
    });

    test('classifies Bash by command pattern', () => {
      expect(categorizeTool('Bash', { command: 'grep -r "foo" src/' })).toBe('context');
      expect(categorizeTool('Bash', { command: 'find . -name "*.js"' })).toBe('context');
      expect(categorizeTool('Bash', { command: 'cat package.json' })).toBe('context');
      expect(categorizeTool('Bash', { command: 'npm test' })).toBe('implementation');
      expect(categorizeTool('Bash', { command: 'node build.js' })).toBe('implementation');
    });

    test('returns other for unknown tools', () => {
      expect(categorizeTool('UnknownTool', {})).toBe('other');
      expect(categorizeTool(undefined, {})).toBe('other');
    });
  });

  describe('decomposeContextAcquisition', () => {
    test('sums chars by category across all turns', () => {
      const turnToolUses = [
        [
          { name: 'Read', input: { file_path: '/a' }, result_chars: 1000 },
          { name: 'Grep', input: { pattern: 'foo' }, result_chars: 500 },
          { name: 'Edit', input: {}, result_chars: 50 },
        ],
        [
          { name: 'mcp__cxpak__cxpak_auto_context', input: {}, result_chars: 3000 },
          { name: 'Write', input: {}, result_chars: 30 },
        ],
      ];
      const d = decomposeContextAcquisition(turnToolUses);
      expect(d.context_calls).toBe(3);
      expect(d.context_chars).toBe(4500);
      expect(d.cxpak_calls).toBe(1);
      expect(d.cxpak_chars).toBe(3000);
      expect(d.unstructured_context_calls).toBe(2);
      expect(d.unstructured_context_chars).toBe(1500);
      expect(d.implementation_calls).toBe(2);
      expect(d.implementation_chars).toBe(80);
    });

    test('handles empty input', () => {
      const d = decomposeContextAcquisition([]);
      expect(d.context_calls).toBe(0);
      expect(d.implementation_calls).toBe(0);
    });

    test('handles missing result_chars gracefully', () => {
      const d = decomposeContextAcquisition([[{ name: 'Read', input: {} }]]);
      expect(d.context_calls).toBe(1);
      expect(d.context_chars).toBe(0);
    });
  });

  describe('aggregateContextDecomposition', () => {
    test('returns null when no sessions have turn_tool_uses', () => {
      const sessions = [{ session_id: 'a', total_tokens: 100 }];
      expect(aggregateContextDecomposition(sessions)).toBeNull();
    });

    test('averages decomposition across sessions', () => {
      const sessions = [
        { turn_tool_uses: [[{ name: 'Read', input: {}, result_chars: 1000 }]] },
        { turn_tool_uses: [[{ name: 'Read', input: {}, result_chars: 3000 }]] },
      ];
      const agg = aggregateContextDecomposition(sessions);
      expect(agg.n).toBe(2);
      expect(agg.mean_context_calls).toBe(1);
      expect(agg.mean_context_chars).toBe(2000);
      expect(agg.mean_unstructured_context_chars).toBe(2000);
      expect(agg.mean_cxpak_chars).toBe(0);
    });
  });
});
