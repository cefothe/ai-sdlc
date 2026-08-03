// promise/standing-promises.js
const { JAVA_TEST_FILE_PATTERN } = require('./java-test-file-pattern');

const STANDING_PROMISES = [
  {
    id: 'complete-output',
    declaration: 'I will produce output with zero TODO/FIXME markers',
    verification: { method: 'grep', pattern: 'TODO|FIXME|HACK', confidence: 'high' },
  },
  {
    id: 'no-placeholders',
    declaration: 'I will not include placeholder implementations',
    verification: {
      method: 'grep',
      pattern: 'NotImplemented|not yet implemented|placeholder|\\/\\/\\s*stub|\\/\\/\\s*temp',
      confidence: 'high',
    },
  },
  {
    id: 'error-handling',
    declaration: 'I will include error handling for all failure paths',
    verification: {
      method: 'grep_absent',
      pattern: 'try\\s*\\{|\\.catch\\s*\\(|catch\\s*\\(|throw\\s+new|\\.on\\s*\\(\\s*[\'"]error',
      confidence: 'high',
    },
  },
  {
    id: 'tests-with-code',
    declaration: 'I will include tests alongside implementation',
    verification: { method: 'file_check', check: 'test file exists', confidence: 'medium' },
  },
  {
    id: 'no-dead-code',
    declaration: 'I will not leave commented-out code blocks',
    verification: { method: 'consecutive_comments', min_lines: 3, confidence: 'high' },
  },
  {
    id: 'resource-cleanup',
    declaration: 'I will close/clean up all resources',
    verification: {
      method: 'grep_absent',
      pattern: '\\.close\\s*\\(|\\.destroy\\s*\\(|\\.end\\s*\\(|\\.disconnect\\s*\\(|\\.release\\s*\\(|finally\\s*\\{',
      confidence: 'medium',
    },
  },
  {
    id: 'implementation-depth',
    declaration: 'I will produce actual code, not just prose or plans',
    verification: {
      method: 'grep_absent',
      pattern: 'function\\s+\\w+|class\\s+\\w+|const\\s+\\w+\\s*=|module\\.exports|def\\s+\\w+|export\\s+(default|function|class)',
      confidence: 'high',
    },
  },
  {
    id: 'output-completeness',
    declaration: 'I will produce substantial, complete output',
    verification: { method: 'output_length', min_chars: 500, confidence: 'medium' },
  },
  // PR #32 integration — see registry.yaml for the rationale and carve-outs.
  // Regex list intentionally broad; qa-code-reviewer LLM resolves the
  // carve-out context (Allure attachments, logger.info, header checks,
  // 204/304 status-only assertions) on retry. Matches all the patterns
  // that PR #32 listed as 🔴 CRITICAL forbidden in assertion context.
  //
  // WebSocketResponse access patterns are matched by method-name regex
  // (\.fields\(\), \.getField\(, \.rawJson\() rather than class-qualified
  // form because real test code uses instance receivers (msg.getField(...))
  // rather than the static-style call (WebSocketResponse.getField(...)).
  // False-positive risk on unrelated classes with matching method names
  // is acceptable — the reviewer carves out at the LLM layer.
  {
    id: 'test-assertion-deserialize',
    declaration: 'I will deserialize REST/WebSocket responses via response.as(Dto.class) in Java test assertions',
    verification: {
      method: 'test_assertion_patterns',
      confidence: 'medium',
      // Single source of truth: see promise/java-test-file-pattern.js.
      // Includes src/sit/ paths and *SIT.java suffixes per georgi-ivanov
      // 2026-06-08 feedback; deduplicated per ryordanov NEW-4.
      test_file_pattern: JAVA_TEST_FILE_PATTERN,
      forbidden_patterns: [
        '\\.body\\(\\)\\.asString\\(\\)',
        '\\.body\\(\\)\\.print\\(\\)',
        '\\bJsonNode\\b',
        '\\bJsonPath\\b',
        'ObjectMapper\\(\\)\\.readTree',
        '\\bJSONObject\\b',
        '\\bJSONArray\\b',
        '\\bJSONTokener\\b',
        '\\.fields\\(\\)',
        '\\.getField\\(',
        '\\.rawJson\\(',
      ],
    },
  },
];

const { loadAgentPromises } = require('./agent-promises-loader');

async function getPromisesForAgent(agentType, agentsDir = 'agents') {
  const standing = STANDING_PROMISES;
  const agentSpecific = await loadAgentPromises(agentType, agentsDir);
  return [...standing, ...agentSpecific];
}

module.exports = { STANDING_PROMISES, getPromisesForAgent };
