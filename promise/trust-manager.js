const CONFIDENCE_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3 };
// `skipped` is intentionally null — verifiers that could not run (e.g. cxpak
// unavailable) emit `skipped` rather than fail-open `kept`, and the EMA
// excludes these results entirely so missing signal does not inflate trust.
const OBSERVATION_VALUES = { kept: 1.0, broken: 0.0, partial: 0.5, skipped: null };

// Tier thresholds: stricter as trust drops.
// functionLength / duplication: max allowed — smaller value = stricter.
// outputCompleteness: min required chars — larger value = stricter.
// Monotonic: high (loosest) → medium → low → critical (strictest).
const TIER_THRESHOLDS = {
  high:     { functionLength: 60, duplication: 12, outputCompleteness: 400 },
  medium:   { functionLength: 50, duplication: 10, outputCompleteness: 500 },
  low:      { functionLength: 40, duplication: 8,  outputCompleteness: 750 },
  critical: { functionLength: 30, duplication: 5,  outputCompleteness: 1000 },
};

const TIER_RESPONSES = {
  high:     { action: 'accept', retry: false, retryModel: null, voting: false, voters: 0, humanReview: false },
  medium:   { action: 'retry', retry: true, retryModel: 'same', voting: false, voters: 0, humanReview: false },
  low:      { action: 'retry', retry: true, retryModel: 'escalate', voting: false, voters: 0, humanReview: false },
  critical: { action: 'escalate', retry: true, retryModel: 'best', voting: true, voters: 3, humanReview: true },
};

class TrustManager {
  constructor({ decayFactor } = {}) {
    if (decayFactor === undefined) {
      throw new Error('decayFactor is required');
    }
    if (decayFactor < 0 || decayFactor > 1) {
      throw new Error('decayFactor must be between 0 and 1');
    }
    this.decayFactor = decayFactor;
  }

  // Returns the weighted-average observation in [0, 1], or null if every
  // result was `skipped` (no signal). Throws on empty input or unknown result
  // types — `skipped` is the only valid "no observation" path.
  computeRunObservation(verificationResults) {
    if (!verificationResults || verificationResults.length === 0) {
      throw new Error('No verification results provided');
    }

    let weightedSum = 0;
    let totalWeight = 0;
    let observableCount = 0;

    for (const result of verificationResults) {
      const value = OBSERVATION_VALUES[result.result];
      if (value === undefined) {
        throw new Error(`Unknown result type: ${result.result}`);
      }
      if (value === null) continue; // skipped — exclude from EMA
      const weight = CONFIDENCE_WEIGHTS[result.confidence] || CONFIDENCE_WEIGHTS.low;
      weightedSum += value * weight;
      totalWeight += weight;
      observableCount++;
    }

    if (observableCount === 0) return null;
    return weightedSum / totalWeight;
  }

  updateTrust(currentTrust, verificationResults) {
    const observation = this.computeRunObservation(verificationResults);
    if (observation === null) return currentTrust; // no signal — preserve trust
    return this.decayFactor * currentTrust + (1 - this.decayFactor) * observation;
  }

  getTrustTier(trustScore) {
    if (trustScore > 0.8) return 'high';
    if (trustScore >= 0.2) {
      return trustScore >= 0.5 ? 'medium' : 'low';
    }
    return 'critical';
  }

  getThresholdsForTier(tier) {
    return { ...(TIER_THRESHOLDS[tier] || TIER_THRESHOLDS.high) };
  }

  getResponseForTier(tier) {
    return { ...(TIER_RESPONSES[tier] || TIER_RESPONSES.high) };
  }

  computeDimensionTrust(verificationResults) {
    const groups = { standing: [], structural: [], behavioral: [] };
    for (const r of verificationResults) {
      const type = r.type || 'standing';
      if (groups[type]) {
        groups[type].push(r);
      }
    }
    const result = {};
    for (const [dim, results] of Object.entries(groups)) {
      if (results.length === 0) {
        result[dim] = null;
        continue;
      }
      result[dim] = this.computeRunObservation(results);
    }
    return result;
  }
}

module.exports = { TrustManager, CONFIDENCE_WEIGHTS, OBSERVATION_VALUES, TIER_THRESHOLDS, TIER_RESPONSES };
