const { TrustManager } = require('../../../promise/trust-manager');

describe('TrustManager', () => {
  let manager;

  beforeEach(() => {
    manager = new TrustManager({ decayFactor: 0.70 });
  });

  describe('computeRunObservation', () => {
    test('returns 1.0 for all kept high-confidence promises', () => {
      const results = [
        { result: 'kept', confidence: 'high' },
        { result: 'kept', confidence: 'high' },
      ];
      expect(manager.computeRunObservation(results)).toBe(1.0);
    });

    test('returns 0.0 for all broken high-confidence promises', () => {
      const results = [
        { result: 'broken', confidence: 'high' },
      ];
      expect(manager.computeRunObservation(results)).toBe(0.0);
    });

    test('weights by confidence: broken low-confidence has less impact', () => {
      const results = [
        { result: 'kept', confidence: 'high' },
        { result: 'kept', confidence: 'high' },
        { result: 'kept', confidence: 'high' },
        { result: 'broken', confidence: 'low' },
      ];
      const obs = manager.computeRunObservation(results);
      // (3*1.0*1.0 + 1*0.0*0.3) / (3*1.0 + 1*0.3) = 3.0 / 3.3 ≈ 0.909
      expect(obs).toBeCloseTo(0.909, 2);
    });

    test('partial promises contribute 0.5', () => {
      const results = [{ result: 'partial', confidence: 'high' }];
      expect(manager.computeRunObservation(results)).toBe(0.5);
    });

    test('throws on empty results', () => {
      expect(() => manager.computeRunObservation([])).toThrow('No verification results');
    });

    test('throws on unknown result type', () => {
      expect(() => manager.computeRunObservation([{ result: 'mystery', confidence: 'high' }]))
        .toThrow('Unknown result type: mystery');
    });

    // Regression test for kgenov #7 / nmilenkov #2: cxpak fail-open returned
    // 'kept' which trust EMA consumed at full weight, silently inflating trust.
    test('skipped results are excluded from observation entirely', () => {
      const results = [
        { result: 'kept', confidence: 'high' },
        { result: 'skipped', confidence: 'high' },
        { result: 'kept', confidence: 'high' },
      ];
      // Should equal pure-kept observation (1.0), not (1.0 + skipped_weight) / total
      expect(manager.computeRunObservation(results)).toBe(1.0);
    });

    test('returns null when every result is skipped', () => {
      const results = [
        { result: 'skipped', confidence: 'high' },
        { result: 'skipped', confidence: 'medium' },
      ];
      expect(manager.computeRunObservation(results)).toBeNull();
    });

    test('skipped does not contribute to weighted average even when broken results present', () => {
      const allBroken = [
        { result: 'broken', confidence: 'high' },
        { result: 'broken', confidence: 'high' },
      ];
      const brokenWithSkipped = [
        { result: 'broken', confidence: 'high' },
        { result: 'skipped', confidence: 'high' },
        { result: 'broken', confidence: 'high' },
      ];
      // Adding skipped should not change the observation
      expect(manager.computeRunObservation(allBroken))
        .toBe(manager.computeRunObservation(brokenWithSkipped));
    });
  });

  describe('updateTrust', () => {
    test('starts at 0.5 and increases with kept promises', () => {
      const results = [{ result: 'kept', confidence: 'high' }];
      const newTrust = manager.updateTrust(0.5, results);
      // 0.70 * 0.5 + 0.30 * 1.0 = 0.35 + 0.30 = 0.65
      expect(newTrust).toBeCloseTo(0.65, 3);
    });

    test('decreases with broken promises', () => {
      const results = [{ result: 'broken', confidence: 'high' }];
      const newTrust = manager.updateTrust(0.5, results);
      // 0.70 * 0.5 + 0.30 * 0.0 = 0.35
      expect(newTrust).toBeCloseTo(0.35, 3);
    });

    test('reaches high-trust tier after 5 perfect runs', () => {
      let trust = 0.5;
      for (let i = 0; i < 5; i++) {
        trust = manager.updateTrust(trust, [{ result: 'kept', confidence: 'high' }]);
      }
      expect(trust).toBeGreaterThan(0.8);
    });

    test('reaches critical-trust tier after 5 failing runs', () => {
      let trust = 0.5;
      for (let i = 0; i < 5; i++) {
        trust = manager.updateTrust(trust, [{ result: 'broken', confidence: 'high' }]);
      }
      expect(trust).toBeLessThan(0.2);
    });

    test('all-skipped run leaves trust unchanged', () => {
      const trust = 0.42;
      const results = [
        { result: 'skipped', confidence: 'high' },
        { result: 'skipped', confidence: 'medium' },
      ];
      expect(manager.updateTrust(trust, results)).toBe(trust);
    });

    // Regression: previously, 8 cxpak verifiers returning fail-open 'kept' on
    // unavailability counted as 8 perfect-pass observations. Verify trust
    // stays at the prior value when every cxpak verifier is skipped, rather
    // than inflating to 1.0.
    test('regression — cxpak-unavailable run does not inflate trust', () => {
      const startingTrust = 0.5;
      const allCxpakSkipped = [
        { result: 'skipped', confidence: 'high' },
        { result: 'skipped', confidence: 'medium' },
        { result: 'skipped', confidence: 'medium' },
        { result: 'skipped', confidence: 'medium' },
        { result: 'skipped', confidence: 'medium' },
        { result: 'skipped', confidence: 'medium' },
        { result: 'skipped', confidence: 'high' },
      ];
      const newTrust = manager.updateTrust(startingTrust, allCxpakSkipped);
      expect(newTrust).toBe(startingTrust);
      // Specifically: NOT moving toward 1.0 (which is what fail-open 'kept' would do)
      const fakeAllKept = allCxpakSkipped.map(r => ({ ...r, result: 'kept' }));
      const inflatedTrust = manager.updateTrust(startingTrust, fakeAllKept);
      expect(inflatedTrust).toBeGreaterThan(startingTrust);
      expect(newTrust).not.toBe(inflatedTrust);
    });

    test('mixed real signal + skipped: only real signal moves trust', () => {
      const startingTrust = 0.5;
      const realPlusSkipped = [
        { result: 'broken', confidence: 'high' },
        { result: 'skipped', confidence: 'high' },
      ];
      const realOnly = [{ result: 'broken', confidence: 'high' }];
      expect(manager.updateTrust(startingTrust, realPlusSkipped))
        .toBe(manager.updateTrust(startingTrust, realOnly));
    });
  });

  describe('getTrustTier', () => {
    test('returns correct tier for each range', () => {
      expect(manager.getTrustTier(0.9)).toBe('high');
      expect(manager.getTrustTier(0.65)).toBe('medium');
      expect(manager.getTrustTier(0.35)).toBe('low');
      expect(manager.getTrustTier(0.15)).toBe('critical');
    });

    test('handles boundary values correctly', () => {
      expect(manager.getTrustTier(0.8)).toBe('medium');   // > 0.8 is high, so 0.8 is medium
      expect(manager.getTrustTier(0.81)).toBe('high');
      expect(manager.getTrustTier(0.5)).toBe('medium');    // >= 0.5 is medium
      expect(manager.getTrustTier(0.49)).toBe('low');
      expect(manager.getTrustTier(0.2)).toBe('low');       // >= 0.2 is low
      expect(manager.getTrustTier(0.19)).toBe('critical');
      expect(manager.getTrustTier(0.0)).toBe('critical');
      expect(manager.getTrustTier(1.0)).toBe('high');
    });
  });

  describe('graduated response', () => {
    let manager;
    beforeEach(() => { manager = new TrustManager({ decayFactor: 0.70 }); });

    describe('getThresholdsForTier', () => {
      test('returns loosest thresholds for high tier', () => {
        const t = manager.getThresholdsForTier('high');
        expect(t.functionLength).toBe(60);
        expect(t.duplication).toBe(12);
        expect(t.outputCompleteness).toBe(400);
      });

      test('returns intermediate thresholds for medium tier', () => {
        const t = manager.getThresholdsForTier('medium');
        expect(t.functionLength).toBe(50);
        expect(t.duplication).toBe(10);
        expect(t.outputCompleteness).toBe(500);
      });

      test('returns tightened thresholds for low tier', () => {
        const t = manager.getThresholdsForTier('low');
        expect(t.functionLength).toBe(40);
        expect(t.duplication).toBe(8);
        expect(t.outputCompleteness).toBe(750);
      });

      test('returns strictest thresholds for critical tier', () => {
        const t = manager.getThresholdsForTier('critical');
        expect(t.functionLength).toBe(30);
        expect(t.duplication).toBe(5);
        expect(t.outputCompleteness).toBe(1000);
      });

      // Regression test for nmilenkov #5: high and medium had identical thresholds.
      test('regression — high and medium thresholds are not identical', () => {
        const high = manager.getThresholdsForTier('high');
        const medium = manager.getThresholdsForTier('medium');
        expect(high).not.toEqual(medium);
      });

      test('thresholds are monotonic in trust direction across all 4 tiers', () => {
        const tiers = ['high', 'medium', 'low', 'critical'].map(t => manager.getThresholdsForTier(t));
        // functionLength: max allowed — should decrease (stricter) as trust drops
        for (let i = 0; i < tiers.length - 1; i++) {
          expect(tiers[i].functionLength).toBeGreaterThan(tiers[i + 1].functionLength);
        }
        // duplication: max allowed — should decrease (stricter)
        for (let i = 0; i < tiers.length - 1; i++) {
          expect(tiers[i].duplication).toBeGreaterThan(tiers[i + 1].duplication);
        }
        // outputCompleteness: min required — should increase (stricter)
        for (let i = 0; i < tiers.length - 1; i++) {
          expect(tiers[i].outputCompleteness).toBeLessThan(tiers[i + 1].outputCompleteness);
        }
      });

      test('returned object is a copy — mutating does not affect subsequent calls', () => {
        const t1 = manager.getThresholdsForTier('high');
        t1.functionLength = 999;
        const t2 = manager.getThresholdsForTier('high');
        expect(t2.functionLength).toBe(60);
      });
    });

    describe('getResponseForTier', () => {
      test('high tier: accept, no retry, no voting', () => {
        const r = manager.getResponseForTier('high');
        expect(r.action).toBe('accept');
        expect(r.retry).toBe(false);
        expect(r.voting).toBe(false);
      });

      test('medium tier: retry same model on failure', () => {
        const r = manager.getResponseForTier('medium');
        expect(r.action).toBe('retry');
        expect(r.retryModel).toBe('same');
        expect(r.voting).toBe(false);
      });

      test('low tier: retry with escalated model', () => {
        const r = manager.getResponseForTier('low');
        expect(r.action).toBe('retry');
        expect(r.retryModel).toBe('escalate');
        expect(r.voting).toBe(false);
      });

      test('critical tier: escalate + mandatory voting', () => {
        const r = manager.getResponseForTier('critical');
        expect(r.action).toBe('escalate');
        expect(r.retryModel).toBe('best');
        expect(r.voting).toBe(true);
        expect(r.voters).toBe(3);
        expect(r.humanReview).toBe(true);
      });
    });

    describe('per-dimension trust', () => {
      test('computeDimensionTrust groups by promise type', () => {
        const results = [
          { promise_id: 'complete-output', result: 'kept', confidence: 'high', type: 'standing' },
          { promise_id: 'no-placeholders', result: 'kept', confidence: 'high', type: 'standing' },
          { promise_id: 'import-validity', result: 'broken', confidence: 'high', type: 'structural' },
          { promise_id: 'function-length', result: 'kept', confidence: 'high', type: 'structural' },
        ];
        const dimensions = manager.computeDimensionTrust(results);
        expect(dimensions.standing).toBeCloseTo(1.0, 1);
        expect(dimensions.structural).toBeCloseTo(0.5, 1);
      });

      test('returns null for dimensions with no results', () => {
        const results = [
          { promise_id: 'complete-output', result: 'kept', confidence: 'high', type: 'standing' },
        ];
        const dimensions = manager.computeDimensionTrust(results);
        expect(dimensions.standing).toBeCloseTo(1.0, 1);
        expect(dimensions.structural).toBeNull();
        expect(dimensions.behavioral).toBeNull();
      });
    });
  });
});
