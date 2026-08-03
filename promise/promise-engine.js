const { ObservabilityChecker } = require('./observability-checker');
const { TrustManager } = require('./trust-manager');
const { LedgerWriter } = require('./ledger-writer');

class PromiseEngine {
  constructor({ ledgerDir, decayFactor = 0.85 }) {
    if (!ledgerDir) throw new Error('ledgerDir is required');
    this.checker = new ObservabilityChecker();
    this.trustManager = new TrustManager({ decayFactor });
    this.ledger = new LedgerWriter(ledgerDir);
    this._trustCache = {};
    // Per-agentId Promise chain. Without this serialization, parallel
    // evaluate() calls for the same agentId race on the read-modify-write
    // of _trustCache: both reads see the same trustBefore, both compute
    // their own trustAfter, second write wins, first observation lost.
    // The lock is per-agentId so different agents still execute in parallel.
    this._evaluateLocks = new Map();
  }

  async evaluate(args) {
    if (!args || !args.runId) throw new Error('runId is required');
    if (!args.agentId) throw new Error('agentId is required');

    const { agentId } = args;
    const previous = this._evaluateLocks.get(agentId) || Promise.resolve();
    const myTurn = previous.then(() => this._evaluateUnsafe(args));
    // Tail of the chain that never rejects, so a thrown evaluate() does
    // not poison the queue for the next caller of the same agentId.
    const completion = myTurn.catch(() => {});
    this._evaluateLocks.set(agentId, completion);
    completion.then(() => {
      // Drop the map entry once no caller is queued behind us. Prevents
      // unbounded growth across long-running processes that touch many
      // distinct agentIds.
      if (this._evaluateLocks.get(agentId) === completion) {
        this._evaluateLocks.delete(agentId);
      }
    });
    return myTurn;
  }

  async _evaluateUnsafe({ runId, agentId, taskId, promises, output, context = {} }) {
    const trustBefore = await this.getAgentTrust(agentId);
    const verificationResults = await this.checker.verifyAll(promises, output, context);
    const trustAfter = this.trustManager.updateTrust(trustBefore, verificationResults);

    this._trustCache[agentId] = trustAfter;

    const record = {
      run_id: runId,
      agent_id: agentId,
      task_id: taskId,
      promises_declared: promises.map(p => ({
        promise_id: p.id,
        direction: '+b',
        declaration: p.declaration || p.description || p.id,
        verification_confidence: p.confidence || (p.verification && p.verification.confidence) || 'medium',
      })),
      verification_results: verificationResults,
      trust_score_before: trustBefore,
      trust_score_after: trustAfter,
      rebinding_triggered: this.trustManager.getTrustTier(trustAfter) === 'critical'
        && this.trustManager.getTrustTier(trustBefore) !== 'critical',
      completion_time_ms: context.elapsed_ms || 0,
      tokens_used: context.tokens_used || 0,
    };

    await this.ledger.writeRunRecord(record);
    await this.ledger.writeAgentTrust(agentId, trustBefore, trustAfter, runId);

    return record;
  }

  async getAgentTrust(agentId) {
    if (this._trustCache[agentId] !== undefined) {
      return this._trustCache[agentId];
    }
    const scores = await this.ledger.readTrustScores();
    return scores[agentId] || 0.5;
  }

  getTrustTier(agentId) {
    const trust = this._trustCache[agentId] || 0.5;
    return this.trustManager.getTrustTier(trust);
  }

  async shouldExclude(agentId) {
    const trust = await this.getAgentTrust(agentId);
    return this.trustManager.getTrustTier(trust) === 'critical';
  }
}

module.exports = { PromiseEngine };
