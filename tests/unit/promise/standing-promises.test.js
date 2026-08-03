const { STANDING_PROMISES, getPromisesForAgent } = require('../../../promise/standing-promises');
const { ObservabilityChecker } = require('../../../promise/observability-checker');

describe('standing-promises', () => {
  describe('STANDING_PROMISES', () => {
    test('defines exactly 9 standing promises (8 original + test-assertion-deserialize from PR #32 integration)', () => {
      expect(STANDING_PROMISES).toHaveLength(9);
    });

    test('each promise has id, declaration, and verification with method and confidence', () => {
      for (const p of STANDING_PROMISES) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('declaration');
        expect(p).toHaveProperty('verification');
        expect(p.verification).toHaveProperty('method');
        expect(p.verification).toHaveProperty('confidence');
      }
    });

    test('includes all 9 expected promise IDs', () => {
      const ids = STANDING_PROMISES.map(p => p.id);
      expect(ids).toContain('complete-output');
      expect(ids).toContain('no-placeholders');
      expect(ids).toContain('error-handling');
      expect(ids).toContain('tests-with-code');
      expect(ids).toContain('no-dead-code');
      expect(ids).toContain('resource-cleanup');
      expect(ids).toContain('implementation-depth');
      expect(ids).toContain('output-completeness');
      expect(ids).toContain('test-assertion-deserialize');
    });

    test('test-assertion-deserialize uses test_assertion_patterns method with the PR #32 forbidden patterns', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'test-assertion-deserialize');
      expect(p.verification.method).toBe('test_assertion_patterns');
      expect(p.verification.test_file_pattern).toBeTruthy();
      const forbidden = p.verification.forbidden_patterns;
      expect(forbidden).toEqual(expect.arrayContaining([
        expect.stringMatching(/body.*asString/),
        expect.stringMatching(/JsonNode/),
        expect.stringMatching(/JsonPath/),
        // WebSocket pattern was broadened from class-qualified
        // (WebSocketResponse.getField) to method-name only (.getField)
        // because real test code uses instance receivers.
        expect.stringMatching(/\\\.getField\\\(/),
      ]));
    });
  });

  describe('verification effectiveness', () => {
    let checker;

    beforeEach(() => {
      checker = new ObservabilityChecker();
    });

    test('error-handling detects try/catch as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'error-handling');
      const output = 'function save(data) {\n  try {\n    db.write(data);\n  } catch (err) {\n    log(err);\n  }\n}';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('error-handling detects missing error handling as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'error-handling');
      const output = 'function add(a, b) { return a + b; }';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('no-dead-code detects consecutive comments as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'no-dead-code');
      const output = 'const x = 1;\n// old line\n// old line\n// old line\nconst y = 2;';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('no-dead-code accepts clean code as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'no-dead-code');
      const output = '// single comment\nconst x = 1;\n// another\nconst y = 2;';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('resource-cleanup detects .close() as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'resource-cleanup');
      const output = 'const conn = db.connect();\ntry { use(conn); } finally { conn.close(); }';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('resource-cleanup detects missing cleanup as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'resource-cleanup');
      const output = 'function add(a, b) { return a + b; }';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('implementation-depth detects function definitions as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'implementation-depth');
      const output = 'function processOrder(order) {\n  validate(order);\n  return save(order);\n}';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('implementation-depth detects prose-only output as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'implementation-depth');
      const output = 'Here is a description of what the system should do. It processes orders.';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('output-completeness detects short output as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'output-completeness');
      const output = 'Done.';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('output-completeness accepts substantial output as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'output-completeness');
      const output = 'x'.repeat(600);
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });
  });

  describe('getPromisesForAgent', () => {
    test('returns all standing promises for unknown agent type', async () => {
      const promises = await getPromisesForAgent('unknown');
      expect(promises).toHaveLength(9);
      expect(promises).toEqual(STANDING_PROMISES);
    });

    test('returns standing + agent-specific for known agent', async () => {
      const fs = require('fs').promises;
      const os = require('os');
      const path = require('path');
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sp-'));
      const agentFile = path.join(tmpDir, 'test-agent.md');
      await fs.writeFile(agentFile, `---
name: test-agent
promises_offered:
  - id: custom-test
    declaration: "Custom test promise"
    verification: { method: grep, pattern: "test", confidence: high }
---
`);
      const promises = await getPromisesForAgent('test-agent', tmpDir);
      expect(promises).toHaveLength(10);
      expect(promises[9].id).toBe('custom-test');
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });
});
