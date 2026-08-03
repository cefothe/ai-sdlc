const fs = require('fs');
const path = require('path');
const os = require('os');
const { evaluateCheckpoint, evaluateCheckpoints } = require('../../../measurement/checkpoint-runner');

describe('checkpoint-runner', () => {
  let workDir;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  describe('file_exists', () => {
    test('passes when file exists', async () => {
      const filePath = path.join(workDir, 'src', 'handler.js');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'module.exports = {}', 'utf8');
      const result = await evaluateCheckpoint({ type: 'file_exists', path: 'src/handler.js' }, workDir);
      expect(result.passed).toBe(true);
      expect(result.type).toBe('file_exists');
    });

    test('fails when file missing', async () => {
      const result = await evaluateCheckpoint({ type: 'file_exists', path: 'src/missing.js' }, workDir);
      expect(result.passed).toBe(false);
      expect(result.details).toMatch(/not found/i);
    });
  });

  describe('grep_present', () => {
    test('passes when pattern found', async () => {
      const filePath = path.join(workDir, 'handler.js');
      fs.writeFileSync(filePath, 'res.status(400).json({ error: "bad" })', 'utf8');
      const result = await evaluateCheckpoint({
        type: 'grep_present', file: 'handler.js', pattern: 'status\\(4[0-9][0-9]\\)'
      }, workDir);
      expect(result.passed).toBe(true);
    });

    test('fails when pattern not found', async () => {
      const filePath = path.join(workDir, 'handler.js');
      fs.writeFileSync(filePath, 'res.status(200).json({ ok: true })', 'utf8');
      const result = await evaluateCheckpoint({
        type: 'grep_present', file: 'handler.js', pattern: 'status\\(4[0-9][0-9]\\)'
      }, workDir);
      expect(result.passed).toBe(false);
    });

    test('fails when file missing', async () => {
      const result = await evaluateCheckpoint({
        type: 'grep_present', file: 'nope.js', pattern: 'anything'
      }, workDir);
      expect(result.passed).toBe(false);
    });
  });

  describe('grep_absent', () => {
    test('passes when pattern not found', async () => {
      const filePath = path.join(workDir, 'handler.js');
      fs.writeFileSync(filePath, 'res.status(400)', 'utf8');
      const result = await evaluateCheckpoint({
        type: 'grep_absent', file: 'handler.js', pattern: 'console\\.log'
      }, workDir);
      expect(result.passed).toBe(true);
    });

    test('fails when pattern found', async () => {
      const filePath = path.join(workDir, 'handler.js');
      fs.writeFileSync(filePath, 'console.log("debug")', 'utf8');
      const result = await evaluateCheckpoint({
        type: 'grep_absent', file: 'handler.js', pattern: 'console\\.log'
      }, workDir);
      expect(result.passed).toBe(false);
    });
  });

  describe('defect_check', () => {
    test('passes when defect is fixed (fixed_line present)', async () => {
      const filePath = path.join(workDir, 'utils.js');
      fs.writeFileSync(filePath, 'for (let i = 0; i < arr.length; i++) {}', 'utf8');
      const result = await evaluateCheckpoint({
        type: 'defect_check',
        defect_file: 'utils.js',
        planted_line: 'i <= arr.length',
        fixed_line: 'i < arr.length',
      }, workDir);
      expect(result.passed).toBe(true);
    });

    test('fails when defect still present', async () => {
      const filePath = path.join(workDir, 'utils.js');
      fs.writeFileSync(filePath, 'for (let i = 0; i <= arr.length; i++) {}', 'utf8');
      const result = await evaluateCheckpoint({
        type: 'defect_check',
        defect_file: 'utils.js',
        planted_line: 'i <= arr.length',
        fixed_line: 'i < arr.length',
      }, workDir);
      expect(result.passed).toBe(false);
    });
  });

  describe('evaluateCheckpoints', () => {
    test('evaluates all checkpoints and returns array', async () => {
      fs.writeFileSync(path.join(workDir, 'a.js'), 'hello world', 'utf8');
      const checks = [
        { type: 'file_exists', path: 'a.js' },
        { type: 'file_exists', path: 'b.js' },
        { type: 'grep_present', file: 'a.js', pattern: 'hello' },
      ];
      const results = await evaluateCheckpoints(checks, workDir);
      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
      expect(results[2].passed).toBe(true);
    });

    test('returns empty array for empty checkpoints', async () => {
      const results = await evaluateCheckpoints([], workDir);
      expect(results).toEqual([]);
    });
  });

  describe('unknown type', () => {
    test('fails with descriptive message', async () => {
      const result = await evaluateCheckpoint({ type: 'unknown_type' }, workDir);
      expect(result.passed).toBe(false);
      expect(result.details).toMatch(/unknown.*type/i);
    });
  });
});
