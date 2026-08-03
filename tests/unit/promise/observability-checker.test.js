const { ObservabilityChecker } = require('../../../promise/observability-checker');

describe('ObservabilityChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new ObservabilityChecker();
  });

  describe('grep', () => {
    test('detects TODO pattern and returns broken', () => {
      const output = '// TODO: implement this\nconst x = 1;';
      const result = checker.verify('grep', { pattern: 'TODO|FIXME|HACK' }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('TODO');
    });

    test('returns kept when pattern not found', () => {
      const output = 'const x = 1;\nfunction clean() { return true; }';
      const result = checker.verify('grep', { pattern: 'TODO|FIXME|HACK' }, output);
      expect(result.result).toBe('kept');
    });

    test('returns partial when pattern is invalid regex', () => {
      const result = checker.verify('grep', { pattern: '(unclosed' }, 'any output');
      expect(result.result).toBe('partial');
      expect(result.evidence).toContain('Invalid regex');
    });
  });

  describe('grep_absent', () => {
    test('returns kept when pattern IS found in output', () => {
      const output = 'try {\n  doStuff();\n} catch (err) {\n  handle(err);\n}';
      const result = checker.verify('grep_absent', { pattern: 'try\\s*\\{|catch\\s*\\(' }, output);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('pattern found');
    });

    test('returns broken when pattern is NOT found in output', () => {
      const output = 'function add(a, b) { return a + b; }';
      const result = checker.verify('grep_absent', { pattern: 'try\\s*\\{|catch\\s*\\(' }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('not found');
    });

    test('returns partial when pattern is invalid regex', () => {
      const result = checker.verify('grep_absent', { pattern: '[invalid' }, 'any output');
      expect(result.result).toBe('partial');
      expect(result.evidence).toContain('Invalid regex');
    });
  });

  describe('consecutive_comments', () => {
    test('returns kept when no consecutive comment blocks exist', () => {
      const output = '// single comment\nconst x = 1;\n// another single\nconst y = 2;';
      const result = checker.verify('consecutive_comments', { min_lines: 3 }, output);
      expect(result.result).toBe('kept');
    });

    test('returns broken when 3+ consecutive comment lines found', () => {
      const output = 'const x = 1;\n// old code\n// was here\n// and here\nconst y = 2;';
      const result = checker.verify('consecutive_comments', { min_lines: 3 }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('3');
    });

    test('returns kept when consecutive comments are below threshold', () => {
      const output = '// comment one\n// comment two\nconst x = 1;';
      const result = checker.verify('consecutive_comments', { min_lines: 3 }, output);
      expect(result.result).toBe('kept');
    });
  });

  describe('output_length', () => {
    test('returns kept when output exceeds threshold', () => {
      const output = 'x'.repeat(600);
      const result = checker.verify('output_length', { min_chars: 500 }, output);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('600');
    });

    test('returns broken when output is below threshold', () => {
      const output = 'short';
      const result = checker.verify('output_length', { min_chars: 500 }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('5');
    });
  });

  describe('file_check', () => {
    test('detects test file references in output', () => {
      const output = 'Created file: tests/unit/foo.test.js\nAll tests pass.';
      const result = checker.verify('file_check', { check: 'test file exists' }, output);
      expect(result.result).toBe('kept');
    });

    test('returns broken when no test files referenced', () => {
      const output = 'Created file: src/foo.js\nDone.';
      const result = checker.verify('file_check', { check: 'test file exists' }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('No test file');
    });
  });

  describe('output_contains', () => {
    test('detects required content', () => {
      const output = 'As specified in CLAUDE.md, we follow the promise registry...';
      const result = checker.verify('output_contains', { check: 'CLAUDE.md' }, output);
      expect(result.result).toBe('kept');
    });

    test('returns broken when content missing', () => {
      const output = 'Here is the implementation.';
      const result = checker.verify('output_contains', { check: 'CLAUDE.md' }, output);
      expect(result.result).toBe('broken');
    });
  });

  describe('timing', () => {
    test('returns kept when within time limit', () => {
      const result = checker.verify('timing', { max_ms: 60000 }, '', { elapsed_ms: 30000 });
      expect(result.result).toBe('kept');
    });

    test('returns broken when over time limit', () => {
      const result = checker.verify('timing', { max_ms: 60000 }, '', { elapsed_ms: 90000 });
      expect(result.result).toBe('broken');
    });
  });

  describe('verifyAll', () => {
    test('runs all promise verifications and returns array of results', async () => {
      const promises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO|FIXME' } },
        { id: 'has-tests', verification: { method: 'file_check', confidence: 'high', check: 'test file exists' } },
      ];
      const output = 'function foo() { return 1; }\nCreated tests/foo.test.js';
      const results = await checker.verifyAll(promises, output);
      expect(results).toHaveLength(2);
      expect(results[0].promise_id).toBe('no-todos');
      expect(results[0].result).toBe('kept');
      expect(results[1].promise_id).toBe('has-tests');
      expect(results[1].result).toBe('kept');
    });

    test('caps text-based verification confidence at low', async () => {
      const promises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
      ];
      const results = await checker.verifyAll(promises, 'TODO: fix');
      expect(results[0].result).toBe('broken');
      expect(results[0].confidence).toBe('low');
    });
  });

  describe('unknown method', () => {
    test('returns partial for unknown verification method', () => {
      const result = checker.verify('unknown_method', {}, 'output');
      expect(result.result).toBe('partial');
      expect(result.evidence).toContain('Unknown');
    });
  });

  describe('registry integration', () => {
    let checker;

    beforeEach(() => {
      checker = new ObservabilityChecker();
    });

    test('verifyAll accepts registry-format promises (standing) with low confidence', async () => {
      const promises = [
        { id: 'complete-output', type: 'standing', method: 'grep', confidence: 'high', pattern: 'TODO|FIXME|HACK' },
        { id: 'output-completeness', type: 'standing', method: 'output_length', confidence: 'medium', min_chars: 500 },
      ];
      const output = '// TODO: fix this\n' + 'x'.repeat(600);
      const results = await checker.verifyAll(promises, output);
      expect(results).toHaveLength(2);
      expect(results[0].promise_id).toBe('complete-output');
      expect(results[0].result).toBe('broken');
      expect(results[0].confidence).toBe('low');
      expect(results[1].promise_id).toBe('output-completeness');
      expect(results[1].result).toBe('kept');
      expect(results[1].confidence).toBe('low');
    });

    test('verifyAll records behavioral promises as partial when trace unavailable', async () => {
      const promises = [
        { id: 'complete-output', type: 'standing', method: 'grep', confidence: 'high', pattern: 'TODO' },
        { id: 'read-before-write', type: 'behavioral', method: 'trace', confidence: 'high', requires: ['trace'] },
      ];
      const results = await checker.verifyAll(promises, 'clean output', {});
      expect(results).toHaveLength(2);
      expect(results[0].promise_id).toBe('complete-output');
      expect(results[1].promise_id).toBe('read-before-write');
      expect(results[1].result).toBe('partial');
      expect(results[1].evidence).toMatch(/trace unavailable/);
    });

    test('verifyAll runs read-before-write when trace available', async () => {
      const trace = [
        { ev: 'tool', name: 'Read', file_path: '/repo/src/foo.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const promises = [
        { id: 'read-before-write', type: 'behavioral', method: 'trace', confidence: 'high', requires: ['trace'] },
      ];
      const results = await checker.verifyAll(promises, 'output', { trace, files: ['src/foo.js'] });
      expect(results).toHaveLength(1);
      expect(results[0].promise_id).toBe('read-before-write');
      expect(results[0].result).toBe('kept');
      expect(results[0].confidence).toBe('high');
    });

    test('verifyAll detects read-before-write violation', async () => {
      const trace = [
        { ev: 'tool', name: 'Write', file_path: '/repo/src/foo.js', ts: '2026-01-01T00:00:00Z' },
      ];
      const promises = [
        { id: 'read-before-write', type: 'behavioral', method: 'trace', confidence: 'high', requires: ['trace'] },
      ];
      const results = await checker.verifyAll(promises, 'output', { trace, files: ['src/foo.js'] });
      expect(results[0].result).toBe('broken');
    });

    test('verifyAll detects context-acquisition kept when cxpak tool called in output', async () => {
      const promises = [
        { id: 'context-acquisition', type: 'behavioral', method: 'tool_call_check', confidence: 'high', requires: 'cxpak', tool_pattern: 'cxpak_auto_context|cxpak_overview' },
      ];
      const output = 'Called cxpak_auto_context for task context';
      const results = await checker.verifyAll(promises, output, {});
      expect(results).toHaveLength(1);
      expect(results[0].promise_id).toBe('context-acquisition');
      expect(results[0].result).toBe('kept');
      expect(results[0].evidence).toContain('cxpak context tool called');
    });

    test('verifyAll detects context-acquisition broken when no cxpak tool in output or trace', async () => {
      const promises = [
        { id: 'context-acquisition', type: 'behavioral', method: 'tool_call_check', confidence: 'high', requires: 'cxpak', tool_pattern: 'cxpak_auto_context|cxpak_overview' },
      ];
      const output = 'Implemented the feature without context';
      const results = await checker.verifyAll(promises, output, { trace: [] });
      expect(results).toHaveLength(1);
      expect(results[0].promise_id).toBe('context-acquisition');
      expect(results[0].result).toBe('broken');
      expect(results[0].evidence).toContain('No cxpak_auto_context');
    });

    test('verifyAll detects context-acquisition kept via trace (tool field)', async () => {
      const promises = [
        { id: 'context-acquisition', type: 'behavioral', method: 'tool_call_check', confidence: 'high', requires: 'cxpak', tool_pattern: 'cxpak_auto_context|cxpak_overview' },
      ];
      const trace = [{ tool: 'cxpak_auto_context', ts: '2026-01-01T00:00:00Z' }];
      const results = await checker.verifyAll(promises, '', { trace });
      expect(results).toHaveLength(1);
      expect(results[0].result).toBe('kept');
    });

    test('verifyAll detects context-acquisition kept via trace (name field from buildTrace)', async () => {
      const promises = [
        { id: 'context-acquisition', type: 'behavioral', method: 'tool_call_check', confidence: 'high', requires: 'cxpak', tool_pattern: 'cxpak_auto_context|cxpak_overview' },
      ];
      const trace = [{ ev: 'tool', name: 'cxpak_auto_context', args_summary: 'refactor auth' }];
      const results = await checker.verifyAll(promises, '', { trace });
      expect(results).toHaveLength(1);
      expect(results[0].result).toBe('kept');
    });

    test('verifyAll uses diff content for diff-eligible standing promises', async () => {
      const promises = [
        { id: 'complete-output', type: 'standing', method: 'grep', confidence: 'high', pattern: 'TODO|FIXME' },
      ];
      const output = 'clean conversational output';
      const diff = '// TODO: fix this later\n+added line';
      const results = await checker.verifyAll(promises, output, { diff });
      expect(results[0].promise_id).toBe('complete-output');
      expect(results[0].result).toBe('broken');
      expect(results[0].confidence).toBe('medium');
    });

    test('verifyAll falls back to output for diff-eligible promises when no diff', async () => {
      const promises = [
        { id: 'complete-output', type: 'standing', method: 'grep', confidence: 'high', pattern: 'TODO|FIXME' },
      ];
      const output = '// TODO: fix';
      const results = await checker.verifyAll(promises, output, {});
      expect(results[0].result).toBe('broken');
      expect(results[0].confidence).toBe('low');
    });

    // Use a promise NOT in DIFF_ELIGIBLE for this case. output-completeness
    // measures the assistant's prose response length, which is conceptually
    // distinct from diff size and remains output-targeted.
    test('verifyAll keeps non-diff-eligible promises on output at low confidence', async () => {
      const promises = [
        { id: 'output-completeness', type: 'standing', method: 'output_length', confidence: 'medium', min_chars: 10 },
      ];
      const output = 'this output is more than ten characters long for sure';
      const diff = '+x';
      const results = await checker.verifyAll(promises, output, { diff });
      expect(results[0].result).toBe('kept');
      expect(results[0].confidence).toBe('low');
    });

    // Regression tests for nmilenkov #1: error-handling, resource-cleanup,
    // implementation-depth previously grepped assistant text but the actual
    // code went through Edit/Write tool calls. R14 logs: 51-60 of 60 turns
    // broken on these three because of this mismatch.
    describe('diff-eligible code-pattern verifiers (regression)', () => {
      test('error-handling: kept when try/catch is in diff (not in output)', async () => {
        const promises = [{
          id: 'error-handling', type: 'standing', method: 'grep_absent', confidence: 'high',
          pattern: 'try\\s*\\{|catch\\s*\\(|\\.catch\\(|throw\\s+new|\\.on\\s*\\(\\s*[\'"]error',
        }];
        const output = 'I added error handling to the function.';  // prose only
        const diff = '+function foo() {\n+  try {\n+    doStuff();\n+  } catch (e) {\n+    handle(e);\n+  }\n+}';
        const results = await checker.verifyAll(promises, output, { diff });
        expect(results[0].result).toBe('kept');
        expect(results[0].confidence).toBe('medium'); // medium because diff-based
      });

      test('error-handling: broken when diff has no try/catch (not output)', async () => {
        const promises = [{
          id: 'error-handling', type: 'standing', method: 'grep_absent', confidence: 'high',
          pattern: 'try\\s*\\{|catch\\s*\\(',
        }];
        const output = 'try { doStuff(); } catch (e) {}'; // prose has it, but...
        const diff = '+function foo() { return 1; }';     // diff doesn't
        const results = await checker.verifyAll(promises, output, { diff });
        expect(results[0].result).toBe('broken');
        expect(results[0].confidence).toBe('medium');
      });

      test('resource-cleanup: kept when .close/finally is in diff', async () => {
        const promises = [{
          id: 'resource-cleanup', type: 'standing', method: 'grep_absent', confidence: 'medium',
          pattern: '\\.close|\\.destroy|\\.end|\\.disconnect|\\.release|finally\\s*\\{',
        }];
        const output = 'Closed the connection in a finally block.';
        const diff = '+try {\n+  conn.connect();\n+} finally {\n+  conn.close();\n+}';
        const results = await checker.verifyAll(promises, output, { diff });
        expect(results[0].result).toBe('kept');
      });

      test('implementation-depth: kept when function/class declarations are in diff', async () => {
        const promises = [{
          id: 'implementation-depth', type: 'standing', method: 'grep_absent', confidence: 'high',
          pattern: 'function\\s+\\w+|class\\s+\\w+|const\\s+\\w+\\s*=|module\\.exports|def|export',
        }];
        const output = 'Added the helper function.'; // no code in prose
        const diff = '+function helper(x) {\n+  return x * 2;\n+}\n+module.exports = { helper };';
        const results = await checker.verifyAll(promises, output, { diff });
        expect(results[0].result).toBe('kept');
      });

      test('all three fall back to output when no diff provided', async () => {
        const promises = [
          { id: 'error-handling', type: 'standing', method: 'grep_absent', confidence: 'high', pattern: 'try\\s*\\{|catch\\s*\\(' },
          { id: 'resource-cleanup', type: 'standing', method: 'grep_absent', confidence: 'medium', pattern: '\\.close' },
          { id: 'implementation-depth', type: 'standing', method: 'grep_absent', confidence: 'high', pattern: 'function\\s+\\w+' },
        ];
        const output = 'try { x.close(); } catch (e) {} function bar() {}';
        const results = await checker.verifyAll(promises, output, {});
        expect(results.every(r => r.result === 'kept')).toBe(true);
        // Confidence drops to 'low' when falling back to output
        expect(results.every(r => r.confidence === 'low')).toBe(true);
      });

      // R14-style scenario: agent uses Edit/Write so code only appears in
      // diff. Pre-fix this would have produced 3 broken events at high/medium
      // confidence from clean code that exists in the diff.
      test('R14 regression — clean Edit/Write changes do not produce false brokens', async () => {
        const promises = [
          { id: 'error-handling', type: 'standing', method: 'grep_absent', confidence: 'high',
            pattern: 'try\\s*\\{|catch\\s*\\(|\\.catch\\(|throw\\s+new' },
          { id: 'resource-cleanup', type: 'standing', method: 'grep_absent', confidence: 'medium',
            pattern: '\\.close|\\.destroy|finally\\s*\\{' },
          { id: 'implementation-depth', type: 'standing', method: 'grep_absent', confidence: 'high',
            pattern: 'function\\s+\\w+|class\\s+\\w+|const\\s+\\w+\\s*=|module\\.exports' },
        ];
        const output = 'Implemented the auth middleware. All tests pass.'; // pure prose
        const diff = `+const validApiKeys = [];
+async function authenticate(token) {
+  try {
+    const key = validApiKeys.find(k => k.key === token);
+    if (!key) throw new Error('invalid');
+    return key;
+  } catch (e) {
+    logger.error(e);
+    throw e;
+  } finally {
+    metrics.close();
+  }
+}
+module.exports = { authenticate };`;
        const results = await checker.verifyAll(promises, output, { diff });
        for (const r of results) {
          expect(r.result).toBe('kept');
          expect(r.confidence).toBe('medium');
        }
      });
    });

    test('verifyAll still works with legacy format', async () => {
      const promises = [
        { id: 'no-todos', verification: { method: 'grep', confidence: 'high', pattern: 'TODO|FIXME' } },
      ];
      const results = await checker.verifyAll(promises, 'clean code');
      expect(results).toHaveLength(1);
      expect(results[0].promise_id).toBe('no-todos');
      expect(results[0].result).toBe('kept');
    });

    test('each result has promise_id, result, confidence, evidence', async () => {
      const { availablePromises } = require('../../../promise/registry-loader');
      const promises = availablePromises({ cxpak: false, trace: false });
      const output = 'function clean() {\n  try {\n    doStuff();\n  } catch (e) {\n    handle(e);\n  }\n}\n// tests/test_clean.js';
      const results = await checker.verifyAll(promises, output);
      for (const r of results) {
        expect(r).toHaveProperty('promise_id');
        expect(r).toHaveProperty('result');
        expect(r).toHaveProperty('confidence');
      }
    });
  });

  describe('test_assertion_patterns (PR #32 integration)', () => {
    const PARAMS = {
      // Pattern includes src/sit/ + *SIT.java per georgi-ivanov 2026-06-08
      // review — same regex as the standing promise in production.
      test_file_pattern: '(?:^|/)(?:src/test/|src/sit/|tests?/).*\\.java$|(?:Test|IT|Tests|SIT)\\.java$',
      forbidden_patterns: [
        '\\.body\\(\\)\\.asString\\(\\)',
        '\\bJsonNode\\b',
        '\\bJsonPath\\b',
        '\\bJSONObject\\b',
        '\\.getField\\(',
      ],
    };

    function makeDiff(file, lines) {
      const header = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,3 +1,${lines.length} @@\n`;
      const body = lines.map(l => '+' + l).join('\n');
      return header + body + '\n';
    }

    test('returns kept when diff is empty', () => {
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: '' });
      expect(r.result).toBe('kept');
    });

    test('returns broken when test file diff contains forbidden response.body().asString()', () => {
      const diff = makeDiff('src/test/java/com/tradu/auth/LoginTest.java', [
        'public void verifyLogin() {',
        '  ApiResponse response = loginService.login(creds);',
        '  String body = response.body().asString();',
        '  assertThat(body).contains("token");',
        '}',
      ]);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('broken');
      expect(r.evidence).toContain('LoginTest.java');
      expect(r.evidence).toContain('asString');
    });

    test('returns broken on JsonNode in *Test.java suffix', () => {
      const diff = makeDiff('foo/UserApiTest.java', [
        'JsonNode body = mapper.readTree(response.body().asString());',
        'assertThat(body.get("id").asInt()).isEqualTo(42);',
      ]);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('broken');
      expect(r.evidence).toMatch(/UserApiTest\.java/);
    });

    test('returns broken on WebSocketResponse.getField in IT.java', () => {
      const diff = makeDiff('src/test/java/com/tradu/ws/OrderUpdatesIT.java', [
        'WebSocketResponse msg = client.receive();',
        'assertThat(msg.getField("status")).isEqualTo("FILLED");',
      ]);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('broken');
    });

    test('returns broken on raw body access in SIT.java (system integration test suffix)', () => {
      // georgi-ivanov 2026-06-08: SIT must be included in scope. Real-world
      // shape: a system integration test poking a deployed instance.
      const diff = makeDiff('src/test/java/com/tradu/auth/AuthFlowSIT.java', [
        'ApiResponse response = authService.login(testCreds);',
        'JsonNode body = mapper.readTree(response.body().asString());',
        'assertThat(body.get("token").asText()).isNotEmpty();',
      ]);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('broken');
      expect(r.evidence).toContain('AuthFlowSIT.java');
    });

    test('returns broken on raw body access in src/sit/java/ path (SIT layout)', () => {
      // Some Tradu projects use the Maven `src/sit/java/` source-set
      // convention for SIT. Files there must be flagged whether or not
      // they carry the SIT suffix.
      const diff = makeDiff('src/sit/java/com/tradu/order/PlaceOrderSystem.java', [
        'String raw = response.body().asString();',
        'assertThat(raw).contains("FILLED");',
      ]);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('broken');
    });

    test('does NOT flag production code (non-test path) even with forbidden patterns', () => {
      const diff = makeDiff('src/main/java/com/tradu/Parser.java', [
        // Production code is *allowed* to use JsonNode for parsing.
        'public UserDto parse(String body) {',
        '  JsonNode root = mapper.readTree(body);',
        '  return new UserDto(root.get("id").asInt());',
        '}',
      ]);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('kept');
    });

    test('does NOT flag .body() inside Allure.addAttachment context — left for reviewer to decide via broader pattern', () => {
      // Verifier is intentionally broad; the LLM reviewer carve-out logic
      // for Allure/logger is in the qa-code-reviewer dispatch. This test
      // documents the design — verifier flags broadly, reviewer carves out.
      // Note: asString() inside an addAttachment string is still flagged
      // by THIS verifier; the carve-out happens at the LLM layer.
      const diff = makeDiff('src/test/java/com/tradu/LogTest.java', [
        'Allure.addAttachment("raw", response.body().asString());',
      ]);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('broken');
    });

    test('only scans + lines (additions), not removed lines', () => {
      const diff = 'diff --git a/src/test/java/Foo.java b/src/test/java/Foo.java\n--- a/src/test/java/Foo.java\n+++ b/src/test/java/Foo.java\n@@ -1,3 +1,3 @@\n-JsonNode n = mapper.readTree(body);\n+UserDto u = response.as(UserDto.class);\n';
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('kept');
    });

    test('truncates findings at 5 hits', () => {
      const lines = Array.from({ length: 20 }, () => 'JsonNode n = mapper.readTree(body);');
      const diff = makeDiff('src/test/java/Foo.java', lines);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { _diffContent: diff });
      expect(r.result).toBe('broken');
      // Evidence has at most 5 entries (separated by '; ').
      const count = r.evidence.split(';').length;
      expect(count).toBeLessThanOrEqual(5);
    });

    test('returns partial when forbidden_patterns is empty', () => {
      const r = checker.verify('test_assertion_patterns', { test_file_pattern: '\\.java$', forbidden_patterns: [] }, '', { _diffContent: 'whatever' });
      expect(r.result).toBe('partial');
    });

    test('returns partial when test_file_pattern is invalid regex', () => {
      const r = checker.verify('test_assertion_patterns', { test_file_pattern: '(unclosed', forbidden_patterns: ['x'] }, '', { _diffContent: 'whatever' });
      expect(r.result).toBe('partial');
      expect(r.evidence).toMatch(/Invalid test_file_pattern/);
    });

    test('returns partial when test_file_pattern is missing — does NOT fall back to .java$ (ryordanov NEW-3)', () => {
      // Pre-fix, a missing test_file_pattern fell back to '\\.java$', which
      // matches every Java file including src/main/ production code. The
      // verifier would silently flag forbidden patterns in production. This
      // test fires a diff against a PRODUCTION Java file with a forbidden
      // pattern present; the fix must return partial rather than broken
      // (which would mean the silent-widening bug had reappeared).
      const prodDiff = makeDiff('src/main/java/com/tradu/PrettyPrinter.java', [
        'public String dump(JsonNode root) {',
        '  return root.toString();',
        '}',
      ]);
      const r = checker.verify('test_assertion_patterns', { forbidden_patterns: ['\\bJsonNode\\b'] }, '', { _diffContent: prodDiff });
      expect(r.result).toBe('partial');
      expect(r.evidence).toMatch(/no test_file_pattern provided/);
    });

    test('returns partial when test_file_pattern is the empty string (treated as configuration error)', () => {
      // Empty string is falsy but technically present; treat consistently
      // with missing — "no scope defined" rather than "match nothing".
      const r = checker.verify('test_assertion_patterns', { test_file_pattern: '', forbidden_patterns: ['\\bJsonNode\\b'] }, '', { _diffContent: 'irrelevant' });
      expect(r.result).toBe('partial');
      expect(r.evidence).toMatch(/no test_file_pattern provided/);
    });

    test('falls back to context.diff when _diffContent is absent', () => {
      const diff = makeDiff('src/test/java/Foo.java', ['JsonNode x = null;']);
      const r = checker.verify('test_assertion_patterns', PARAMS, '', { diff });
      expect(r.result).toBe('broken');
    });
  });
});
