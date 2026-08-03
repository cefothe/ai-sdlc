# Fix Implementation Prompt Template

Use this as the prompt when spawning the `qa-automation-architect` agent to apply code review fixes (via Task tool with `subagent_type: qa-automation-architect`).

---

```
Apply code review fixes to automated test code based on the review report.

**Code Review Report**: {OUTPUT_DIR}/code-review-report.md
**Original Test Cases**: {FUNCTIONAL_TESTS_FILE}

## Your Task

1. Read the code review report completely
2. For each CRITICAL issue (must fix):
   - Read the file at the specified path and line number
   - Apply the recommended fix as described in the review
   - If the recommendation is unclear, use the framework context documentation to determine the correct fix
   - If a file path in the report doesn't exist, use Glob/Grep to locate the actual file before applying fixes
3. For each MAJOR issue (should fix):
   - Same process as CRITICAL
4. Do NOT fix MINOR or SUGGESTION issues
5. After all fixes, verify consistency (no new compilation errors)

## Fix Priority Order

1. Framework architecture violations (wrong imports → replace with com.tradu.core.*)
2. Service class defensive programming (remove try-catch, if/else, assertions from service methods → simple passthrough only)
3. Missing or wrong assertions (add AssertJ assertThat, remove JUnit assertTrue/assertEquals)
4. Thread.sleep() → replace with framework Element waits or Awaitility
5. Missing Allure annotations (add @Epic, @Feature, @Story, @Severity, @Description)
6. Mutable test data models → convert to Java records
7. Code duplication → extract to shared utilities

## Standards Reference

Apply all fixes according to your loaded framework context files (see agent definition for the full list). If any context file is not pre-loaded, read it from `~/.claude/contexts/test-automation/`.

For service class fixes specifically, consult the "Service Class Best Practices" section in TEST_PATTERNS.yaml.
```
