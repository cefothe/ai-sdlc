const { PromiseEngine } = require('../../../promise/promise-engine');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('PromiseEngine', () => {
  let engine;
  let ledgerDir;

  beforeEach(async () => {
    ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-'));
    engine = new PromiseEngine({ ledgerDir, decayFactor: 0.85 });
  });

  afterEach(async () => {
    await fs.rm(ledgerDir, { recursive: true, force: true });
  });

  describe('evaluate', () => {
    test('verifies agent output against declared promises and returns results', async () => {
      const agentPromises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO|FIXME' } },
      ];
      const output = 'function clean() { return 1; }';
      const result = await engine.evaluate({
        runId: 'r1',
        agentId: 'test-agent',
        taskId: 't1',
        promises: agentPromises,
        output,
      });
      expect(result.verification_results).toHaveLength(1);
      expect(result.verification_results[0].result).toBe('kept');
      expect(result.trust_score_after).toBeGreaterThan(0.5);
    });

    test('records broken promise and decreases trust', async () => {
      const agentPromises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO|FIXME' } },
      ];
      const output = '// TODO: fix this later';
      const result = await engine.evaluate({
        runId: 'r1',
        agentId: 'test-agent',
        taskId: 't1',
        promises: agentPromises,
        output,
      });
      expect(result.verification_results[0].result).toBe('broken');
      expect(result.trust_score_after).toBeLessThan(0.5);
    });

    test('writes record to ledger', async () => {
      const agentPromises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];
      await engine.evaluate({
        runId: 'r1', agentId: 'test-agent', taskId: 't1',
        promises: agentPromises, output: 'clean code',
      });
      const runFile = path.join(ledgerDir, 'runs', 'r1.jsonl');
      const exists = await fs.access(runFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('handles registry-format promises (type field, no verification wrapper)', async () => {
      const registryPromises = [
        { id: 'complete-output', type: 'standing', method: 'grep', confidence: 'high', requires: null, pattern: 'TODO|FIXME|HACK', description: 'Zero TODO/FIXME/HACK markers' },
      ];
      const result = await engine.evaluate({
        runId: 'r2', agentId: 'test-agent', taskId: 't2',
        promises: registryPromises, output: '// TODO: fix this',
      });
      expect(result.verification_results).toHaveLength(1);
      expect(result.verification_results[0].result).toBe('broken');
      expect(result.promises_declared[0].promise_id).toBe('complete-output');
      expect(result.promises_declared[0].verification_confidence).toBe('high');
      expect(result.promises_declared[0].declaration).toBe('Zero TODO/FIXME/HACK markers');
    });
  });

  describe('getAgentTrust', () => {
    test('returns 0.5 for unknown agent', async () => {
      const trust = await engine.getAgentTrust('unknown-agent');
      expect(trust).toBe(0.5);
    });

    test('returns updated trust after evaluation', async () => {
      const promises = [
        { id: 'p1', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];
      await engine.evaluate({
        runId: 'r1', agentId: 'a1', taskId: 't1',
        promises, output: 'clean',
      });
      const trust = await engine.getAgentTrust('a1');
      expect(trust).toBeGreaterThan(0.5);
    });
  });

  describe('shouldExclude', () => {
    test('returns false for agent above critical threshold', async () => {
      expect(await engine.shouldExclude('unknown-agent')).toBe(false);
    });

    test('returns true for agent at critical trust', async () => {
      engine._trustCache['bad-agent'] = 0.15;
      expect(await engine.shouldExclude('bad-agent')).toBe(true);
    });

    test('returns false for agent at exactly 0.2', async () => {
      engine._trustCache['edge-agent'] = 0.2;
      expect(await engine.shouldExclude('edge-agent')).toBe(false);
    });
  });

  describe('evaluate with rebinding', () => {
    test('sets rebinding_triggered when trust drops to critical', async () => {
      engine._trustCache['failing-agent'] = 0.22;
      const promises = [
        { id: 'p1', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];
      const result = await engine.evaluate({
        runId: 'r1', agentId: 'failing-agent', taskId: 't1',
        promises, output: '// TODO: fix',
      });
      // 0.85 * 0.22 + 0.15 * 0 = 0.187 (critical)
      expect(result.rebinding_triggered).toBe(true);
    });

    test('does not set rebinding_triggered when trust stays above critical', async () => {
      const promises = [
        { id: 'p1', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];
      const result = await engine.evaluate({
        runId: 'r1', agentId: 'good-agent', taskId: 't1',
        promises, output: 'clean code',
      });
      expect(result.rebinding_triggered).toBe(false);
    });
  });

  // M1: per-agentId mutex around evaluate(). Without it, parallel calls for
  // the same agentId both read trustBefore=0.5, compute their own trustAfter,
  // second write wins → first observation silently lost from the EMA.
  describe('parallel evaluate serialization (M1)', () => {
    test('parallel evaluates of same agentId both contribute to EMA (no lost write)', async () => {
      const broken = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];
      const dirtyOutput = 'TODO: implement';

      // Two parallel evaluates of the same agentId, both broken.
      const [r1, r2] = await Promise.all([
        engine.evaluate({ runId: 'r1', agentId: 'race-agent', taskId: 't1', promises: broken, output: dirtyOutput }),
        engine.evaluate({ runId: 'r2', agentId: 'race-agent', taskId: 't2', promises: broken, output: dirtyOutput }),
      ]);

      // With the mutex, the second evaluate must observe r1's trust as its before.
      // EMA: trust_after = 0.85 * trust_before + 0.15 * observation
      // Both broken (observation=0), starting at 0.5:
      //   r1: 0.85 * 0.5  + 0 = 0.425
      //   r2: 0.85 * 0.425 + 0 = 0.36125
      // Without serialization both would compute 0.425 and the second write
      // (still 0.425) would mask one observation.
      expect(r1.trust_score_before).toBeCloseTo(0.5, 5);
      expect(r1.trust_score_after).toBeCloseTo(0.425, 5);

      expect(r2.trust_score_before).toBeCloseTo(0.425, 5);
      expect(r2.trust_score_after).toBeCloseTo(0.36125, 5);

      // Final cached trust reflects the second-in-chain value.
      expect(engine._trustCache['race-agent']).toBeCloseTo(0.36125, 5);
    });

    test('parallel evaluates of DIFFERENT agentIds run concurrently (no false serialization)', async () => {
      const promises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];

      // Stub the checker to introduce a delay so we can detect serialization.
      const realVerifyAll = engine.checker.verifyAll.bind(engine.checker);
      engine.checker.verifyAll = async (...args) => {
        await new Promise(r => setTimeout(r, 50));
        return realVerifyAll(...args);
      };

      const start = Date.now();
      // Two evaluates with distinct agentIds — should run in parallel.
      await Promise.all([
        engine.evaluate({ runId: 'r1', agentId: 'agent-A', taskId: 't1', promises, output: 'clean' }),
        engine.evaluate({ runId: 'r2', agentId: 'agent-B', taskId: 't2', promises, output: 'clean' }),
      ]);
      const elapsed = Date.now() - start;

      // Strictly serial would be ~100ms+, parallel ~50ms. If the lock is
      // per-engine instead of per-agentId, this assertion fails.
      expect(elapsed).toBeLessThan(95);
    });

    test('rejected evaluate does not poison the queue for the next caller', async () => {
      const promises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];

      // Force first call to throw BEFORE the trustCache write by failing
      // verifyAll (which runs before _trustCache[agentId] = trustAfter).
      const realVerifyAll = engine.checker.verifyAll.bind(engine.checker);
      let calls = 0;
      engine.checker.verifyAll = async (...args) => {
        calls++;
        if (calls === 1) throw new Error('synthetic verifier failure');
        return realVerifyAll(...args);
      };

      const failing = engine.evaluate({
        runId: 'r1', agentId: 'flaky-agent', taskId: 't1', promises, output: 'clean',
      });
      await expect(failing).rejects.toThrow('synthetic verifier failure');

      // Second call must proceed (queue not poisoned by the rejected promise).
      // First evaluate threw before any state mutation, so trustBefore for r2
      // is the un-modified 0.5.
      const r2 = await engine.evaluate({
        runId: 'r2', agentId: 'flaky-agent', taskId: 't2', promises, output: 'clean',
      });
      expect(r2.trust_score_before).toBeCloseTo(0.5, 5);
      // observation=1.0 (broken-pattern absent → grep returns kept), so
      // trustAfter = 0.85*0.5 + 0.15*1.0 = 0.575
      expect(r2.trust_score_after).toBeCloseTo(0.575, 5);
    });

    test('lock map cleans up after all queued evaluates complete', async () => {
      const promises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];

      await Promise.all([
        engine.evaluate({ runId: 'r1', agentId: 'cleanup-agent', taskId: 't1', promises, output: 'clean' }),
        engine.evaluate({ runId: 'r2', agentId: 'cleanup-agent', taskId: 't2', promises, output: 'clean' }),
        engine.evaluate({ runId: 'r3', agentId: 'cleanup-agent', taskId: 't3', promises, output: 'clean' }),
      ]);

      // Allow the cleanup microtask attached via completion.then(...) to run.
      await new Promise(r => setImmediate(r));

      // After all queued evaluates resolve and no caller is queued behind,
      // the map entry for that agentId should be dropped to keep memory
      // bounded across long-running processes.
      expect(engine._evaluateLocks.has('cleanup-agent')).toBe(false);
    });
  });
});
