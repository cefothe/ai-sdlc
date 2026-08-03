// Single source of truth for the Java test-file regex used by:
//   - findings-interpreter.js (isJavaTestFile + reviewer-skill routing)
//   - standing-promises.js (test-assertion-deserialize.test_file_pattern)
//   - promise/registry.yaml (test-assertion-deserialize.test_file_pattern)
//
// Pre-extraction, the same regex string lived verbatim in all three files.
// Drift was the most plausible silent regression in the PR #32 integration:
// a file could match one regex but not another, silently misrouting test-
// file findings to the generic reviewer (which lacks the deserialize-for-
// assertions / parameterize-repetitive-tests carve-out knowledge).
//
// Now the JS callers import JAVA_TEST_FILE_PATTERN from here. The YAML
// file still hard-codes the literal (YAML can't `require`); a cross-check
// test in tests/unit/promise/registry-loader.test.js asserts the registry
// string matches this constant byte-for-byte after js-yaml processes
// escapes — which also catches accidental YAML quoting changes (single-
// vs double-quoted YAML processes \\ differently).
//
// Caught by ryordanov-tradu re-verification of HEAD `2905120` (NEW-4).
//
// Scope: Maven/JUnit conventions plus Tradu's system-integration layout
// per tradu-georgi-ivanov's 2026-06-08 SIT extension.
//   - Unit:        src/test/ + *Test.java / *Tests.java
//   - Integration: *IT.java  (Failsafe)
//   - System:      src/sit/ + *SIT.java
//   - Generic:     tests/ (any depth)

const JAVA_TEST_FILE_PATTERN = '(?:^|/)(?:src/test/|src/sit/|tests?/).*\\.java$|(?:Test|IT|Tests|SIT)\\.java$';
const JAVA_TEST_FILE_REGEX = new RegExp(JAVA_TEST_FILE_PATTERN);

// Returns true iff filePath looks like a Java test file. Robust to Windows
// backslash paths (normalizes \ to /) per ryordanov's NEW-4 note. Null /
// undefined / non-string inputs return false (callers may pass anything
// from a tool-call trace).
function isJavaTestFile(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');
  return JAVA_TEST_FILE_REGEX.test(normalized);
}

module.exports = { JAVA_TEST_FILE_PATTERN, JAVA_TEST_FILE_REGEX, isJavaTestFile };
