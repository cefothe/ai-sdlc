const { Executor } = require('../../../measurement/executor');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('Executor', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  describe('constructor', () => {
    test('accepts valid options with defaults', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      expect(ex.ref).toBe('main');
      expect(ex.runs).toBe(3);
      expect(ex.model).toBe('sonnet');
      expect(ex.gateRetries).toBe(1);
    });

    test('throws if ref is missing', () => {
      expect(() => new Executor({ repoRoot })).toThrow('ref is required');
    });

    test('throws if repoRoot is missing', () => {
      expect(() => new Executor({ ref: 'main' })).toThrow('repoRoot is required');
    });

    test('accepts custom gateRetries', () => {
      const ex = new Executor({ ref: 'main', repoRoot, gateRetries: 3 });
      expect(ex.gateRetries).toBe(3);
    });
  });

  describe('buildPrompt', () => {
    test('combines CLAUDE.md context with task prompt — no evidence parameter', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const task = { id: 'test-task', prompt: 'Write a function foo()' };
      const prompt = ex.buildPrompt(task, '# CLAUDE.md content');
      expect(prompt).toContain('# CLAUDE.md content');
      expect(prompt).toContain('Write a function foo()');
      expect(prompt).toContain('--- CONTEXT');
      expect(prompt).toContain('--- TASK');
      expect(prompt).not.toContain('EVIDENCE');
      expect(prompt).not.toContain('FEEDBACK');
    });
  });

  describe('buildCxpakPrompt', () => {
    test('includes cxpak tool instructions and task but not CLAUDE.md', () => {
      const ex = new Executor({ ref: 'main', repoRoot, cxpakPrompt: true });
      const task = { id: 'test-task', prompt: 'Write a function foo()' };
      const prompt = ex.buildCxpakPrompt(task);
      expect(prompt).toContain('cxpak:overview');
      expect(prompt).toContain('cxpak:trace');
      expect(prompt).toContain('cxpak:architecture');
      expect(prompt).toContain('Write a function foo()');
      expect(prompt).toContain('--- TASK');
      expect(prompt).not.toContain('--- CONTEXT');
      expect(prompt).not.toContain('CLAUDE.md');
    });

    test('constructor stores cxpakPrompt flag', () => {
      const ex = new Executor({ ref: 'main', repoRoot, cxpakPrompt: true });
      expect(ex.cxpakPrompt).toBe(true);
    });

    test('cxpakPrompt defaults to false', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      expect(ex.cxpakPrompt).toBe(false);
    });
  });

  describe('parseAgentOutput', () => {
    test('extracts result from JSON output', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const json = JSON.stringify({ result: 'function foo() {}', cost: 0.01 });
      expect(ex.parseAgentOutput(json)).toBe('function foo() {}');
    });

    test('returns raw string when not valid JSON', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      expect(ex.parseAgentOutput('plain text output')).toBe('plain text output');
    });

    test('stringifies JSON when result is not a string', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const json = JSON.stringify({ data: [1, 2, 3] });
      const parsed = ex.parseAgentOutput(json);
      expect(parsed).toContain('"data"');
    });
  });

  describe('parseAgentResponse', () => {
    test('extracts text, usage, and cost from JSON output', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const json = JSON.stringify({
        result: 'function foo() {}',
        usage: {
          input_tokens: 1500,
          output_tokens: 250,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 100,
        },
        total_cost_usd: 0.0123,
      });
      const result = ex.parseAgentResponse(json);
      expect(result.text).toBe('function foo() {}');
      expect(result.usage.input_tokens).toBe(1500);
      expect(result.usage.output_tokens).toBe(250);
      expect(result.cost_usd).toBe(0.0123);
    });

    test('returns null usage and cost when not present', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const json = JSON.stringify({ result: 'plain output' });
      const result = ex.parseAgentResponse(json);
      expect(result.text).toBe('plain output');
      expect(result.usage).toBeNull();
      expect(result.cost_usd).toBeNull();
    });

    test('returns raw text when not valid JSON', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const result = ex.parseAgentResponse('plain text output');
      expect(result.text).toBe('plain text output');
      expect(result.usage).toBeNull();
      expect(result.cost_usd).toBeNull();
    });
  });

  describe('checkGate', () => {
    test('passes when no high-confidence promises are broken (default tier)', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'kept', confidence: 'high' },
        { promise_id: 'b', result: 'broken', confidence: 'medium' },
        { promise_id: 'c', result: 'kept', confidence: 'high' },
      ];
      expect(ex.checkGate(results)).toBe(true);
    });

    test('rejects when any high-confidence promise is broken', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'kept', confidence: 'high' },
        { promise_id: 'b', result: 'broken', confidence: 'high' },
      ];
      expect(ex.checkGate(results)).toBe(false);
    });

    test('passes when all promises are kept', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'kept', confidence: 'high' },
        { promise_id: 'b', result: 'kept', confidence: 'medium' },
      ];
      expect(ex.checkGate(results)).toBe(true);
    });

    test('passes with empty results', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      expect(ex.checkGate([])).toBe(true);
    });

    test('high trust tier only gates on high confidence', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'broken', confidence: 'medium' },
        { promise_id: 'b', result: 'broken', confidence: 'low' },
      ];
      expect(ex.checkGate(results, 'high')).toBe(true);
    });

    test('medium trust tier gates on high and medium confidence', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'broken', confidence: 'medium' },
      ];
      expect(ex.checkGate(results, 'medium')).toBe(false);
    });

    test('medium trust tier passes when only low confidence broken', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'broken', confidence: 'low' },
      ];
      expect(ex.checkGate(results, 'medium')).toBe(true);
    });

    test('critical trust tier gates on all confidence levels', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'broken', confidence: 'low' },
      ];
      expect(ex.checkGate(results, 'critical')).toBe(false);
    });

    test('low trust tier gates on high and medium', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'kept', confidence: 'high' },
        { promise_id: 'b', result: 'broken', confidence: 'medium' },
      ];
      expect(ex.checkGate(results, 'low')).toBe(false);
    });

    test('defaults to high tier when trustTier is undefined', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const results = [
        { promise_id: 'a', result: 'broken', confidence: 'medium' },
      ];
      expect(ex.checkGate(results)).toBe(true);
      expect(ex.checkGate(results, undefined)).toBe(true);
    });
  });

  describe('trust-gated dispatch', () => {
    test('constructor accepts promiseEnabled option', () => {
      const ex = new Executor({ ref: 'main', repoRoot, promiseEnabled: true });
      expect(ex.promiseEnabled).toBe(true);
    });

    test('constructor defaults promiseEnabled to false', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      expect(ex.promiseEnabled).toBe(false);
    });

    test('getModelForAgent returns default model when not excluded', () => {
      const ex = new Executor({ ref: 'main', repoRoot, model: 'sonnet' });
      expect(ex.getModelForAgent(0.5)).toBe('sonnet');
    });

    test('getModelForAgent returns escalation model for critical trust', () => {
      const ex = new Executor({ ref: 'main', repoRoot, model: 'sonnet' });
      expect(ex.getModelForAgent(0.15)).toBe('opus');
    });

    test('getModelForAgent returns default model when already at highest', () => {
      const ex = new Executor({ ref: 'main', repoRoot, model: 'opus' });
      expect(ex.getModelForAgent(0.15)).toBe('opus');
    });
  });

  describe('loadCompletedPairs', () => {
    test('returns empty set when no metrics file exists', async () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const tmpDir = path.join(os.tmpdir(), `executor-test-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });
      try {
        const pairs = await ex.loadCompletedPairs(tmpDir);
        expect(pairs.size).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    test('parses existing metrics.jsonl and returns run:task pairs', async () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const tmpDir = path.join(os.tmpdir(), `executor-test-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });
      const lines = [
        JSON.stringify({ run: 1, task_id: 'code-plan', status: 'complete' }),
        JSON.stringify({ run: 1, task_id: 'degraded-input', status: 'complete' }),
        JSON.stringify({ run: 2, task_id: 'code-plan', status: 'error' }),
      ];
      await fs.writeFile(path.join(tmpDir, 'metrics.jsonl'), lines.join('\n') + '\n');
      try {
        const pairs = await ex.loadCompletedPairs(tmpDir);
        expect(pairs.size).toBe(3);
        expect(pairs.has('1:code-plan')).toBe(true);
        expect(pairs.has('1:degraded-input')).toBe(true);
        expect(pairs.has('2:code-plan')).toBe(true);
        expect(pairs.has('2:degraded-input')).toBe(false);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });
  });

  describe('captureBaseline', () => {
    test('returns null when promise not enabled', async () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const baseline = await ex.captureBaseline('/tmp/test');
      expect(baseline).toBeNull();
    });

    test('returns null when cxpak not available', async () => {
      const ex = new Executor({ ref: 'main', repoRoot, promiseEnabled: true });
      ex._cxpakAvailable = false;
      const baseline = await ex.captureBaseline('/tmp/test');
      expect(baseline).toBeNull();
    });
  });

  describe('computeBaselineDeltas', () => {
    test('returns null when baseline is null', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      expect(ex.computeBaselineDeltas(null, {})).toBeNull();
    });

    test('returns null when current is null', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      expect(ex.computeBaselineDeltas({}, null)).toBeNull();
    });

    test('computes health delta correctly', () => {
      const ex = new Executor({ ref: 'main', repoRoot });
      const before = { health: { composite: 8.5, dead_code: 7.5 } };
      const after = { health: { composite: 6.2, dead_code: 5.0 } };
      const deltas = ex.computeBaselineDeltas(before, after);
      expect(parseFloat(deltas.health.composite)).toBeCloseTo(-2.3);
    });
  });

  describe('voting', () => {
    test('computeConsensus returns median of odd number of scores', () => {
      const executor = new Executor({ ref: 'main', repoRoot });
      expect(executor.computeConsensus([7, 9, 4])).toBe(7);
    });

    test('computeConsensus returns average of two middle values for even count', () => {
      const executor = new Executor({ ref: 'main', repoRoot });
      expect(executor.computeConsensus([7, 9, 4, 8])).toBe(7.5);
    });

    test('computeAgreement returns 0 for identical scores', () => {
      const executor = new Executor({ ref: 'main', repoRoot });
      expect(executor.computeAgreement([8, 8, 8])).toBe(0);
    });

    test('computeAgreement returns >0 for divergent scores', () => {
      const executor = new Executor({ ref: 'main', repoRoot });
      const agreement = executor.computeAgreement([4, 8, 9]);
      expect(agreement).toBeGreaterThan(0);
    });
  });
});
