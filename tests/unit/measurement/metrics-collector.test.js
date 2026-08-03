const { MetricsCollector } = require('../../../measurement/metrics-collector');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('MetricsCollector', () => {
  let collector;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metrics-'));
    collector = new MetricsCollector(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('analyzeOutput', () => {
    test('counts TODO markers in output text', () => {
      const output = 'function foo() {\n  // TODO: fix this\n  // FIXME: broken\n  return null;\n}';
      const result = collector.analyzeOutput(output);
      expect(result.todo_count).toBe(1);
      expect(result.fixme_count).toBe(1);
    });

    test('detects error handling presence', () => {
      const withTry = 'try {\n  doThing();\n} catch (err) {\n  handle(err);\n}';
      const without = 'function foo() { return bar(); }';
      expect(collector.analyzeOutput(withTry).error_handling_present).toBe(true);
      expect(collector.analyzeOutput(without).error_handling_present).toBe(false);
    });

    test('detects test file references in output', () => {
      const output = 'Created tests/unit/foo.test.js with 5 test cases';
      expect(collector.analyzeOutput(output).tests_present).toBe(true);
    });

    test('returns zero counts for clean output', () => {
      const clean = 'function add(a, b) { return a + b; }';
      const result = collector.analyzeOutput(clean);
      expect(result.todo_count).toBe(0);
      expect(result.fixme_count).toBe(0);
    });

    test('includes filler_ratio in analysis', () => {
      const output = "Let me check this.\nThe function works.\n```javascript\nconst x = 1;\n```";
      const result = collector.analyzeOutput(output);
      expect(result).toHaveProperty('filler_ratio');
      expect(typeof result.filler_ratio).toBe('number');
      expect(result.filler_ratio).toBeGreaterThan(0);
    });

    test('includes prose and filler line counts in analysis', () => {
      const output = "Let me look.\nI'll check.\nBug is on line 5.";
      const result = collector.analyzeOutput(output);
      expect(result).toHaveProperty('prose_line_count');
      expect(result).toHaveProperty('filler_line_count');
      expect(result.prose_line_count).toBe(3);
      expect(result.filler_line_count).toBe(2);
    });

    test('includes code_line_ratio in analysis', () => {
      const output = "Fixed.\n```javascript\nconst a = 1;\nconst b = 2;\n```";
      const result = collector.analyzeOutput(output);
      expect(result).toHaveProperty('code_line_ratio');
      expect(result.code_line_ratio).toBeGreaterThan(0);
    });
  });

  describe('computeQualityScore', () => {
    test('returns 10 for perfect output', () => {
      const analysis = {
        todo_count: 0, fixme_count: 0,
        error_handling_present: true, tests_present: true,
        docs_referenced: true
      };
      expect(collector.computeQualityScore(analysis)).toBe(10);
    });

    test('deducts points for TODOs', () => {
      const analysis = {
        todo_count: 2, fixme_count: 0,
        error_handling_present: true, tests_present: true,
        docs_referenced: true
      };
      expect(collector.computeQualityScore(analysis)).toBeLessThan(10);
    });

    test('deducts points for missing tests', () => {
      const analysis = {
        todo_count: 0, fixme_count: 0,
        error_handling_present: true, tests_present: false,
        docs_referenced: true
      };
      expect(collector.computeQualityScore(analysis)).toBeLessThan(10);
    });
  });

  describe('writeRecord', () => {
    test('appends JSONL record to output file', async () => {
      const record = {
        task_id: 'test-1', run_number: 1, branch: 'main',
        verification_results: { todo_count: 0 },
        quality_score: 10, completion_time_ms: 5000
      };
      await collector.writeRecord(record);
      const content = await fs.readFile(
        path.join(tmpDir, 'metrics.jsonl'), 'utf8'
      );
      const parsed = JSON.parse(content.trim());
      expect(parsed.task_id).toBe('test-1');
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe('computeFillerRatio', () => {
    test('returns 0 for pure code output', () => {
      const output = '```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```';
      expect(collector.computeFillerRatio(output)).toBe(0);
    });

    test('returns 0 for output with no filler prose', () => {
      const output = 'Files changed: src/utils.js\nAdded add() function with error handling.\n```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```';
      expect(collector.computeFillerRatio(output)).toBe(0);
    });

    test('detects preamble filler patterns', () => {
      const output = "Let me check the code for you.\nHere's what I found:\nThe function is broken.\n```javascript\nconst x = 1;\n```";
      const ratio = collector.computeFillerRatio(output);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    test('detects summary filler patterns', () => {
      const output = "Fixed the bug.\n```javascript\nconst x = 1;\n```\nIn summary, the fix applies a null check.\nHope this helps!";
      const ratio = collector.computeFillerRatio(output);
      expect(ratio).toBeGreaterThan(0);
    });

    test('ignores filler patterns inside code blocks', () => {
      const output = '```javascript\n// Let me check the code\nconst summary = "In summary, done";\n```\nThe fix is applied.';
      expect(collector.computeFillerRatio(output)).toBe(0);
    });

    test('skips markdown headers when counting prose', () => {
      const output = '## Changes\nFixed the bug.\n## Summary\nOne file changed.';
      expect(collector.computeFillerRatio(output)).toBe(0);
    });

    test('returns 0 for empty string', () => {
      expect(collector.computeFillerRatio('')).toBe(0);
    });

    test('returns 0 for code-only output with no prose', () => {
      const output = '```\nline1\nline2\n```';
      expect(collector.computeFillerRatio(output)).toBe(0);
    });

    test('handles multiple filler lines correctly', () => {
      const output = "Let me look into this.\nI'll check the files.\nCertainly, here are the results.\nThe bug is on line 5.";
      const ratio = collector.computeFillerRatio(output);
      expect(ratio).toBe(0.75);
    });

    test('throws for non-string input', () => {
      expect(() => collector.computeFillerRatio(42)).toThrow('text must be a string');
      expect(() => collector.computeFillerRatio(null)).toThrow('text must be a string');
    });
  });
});
