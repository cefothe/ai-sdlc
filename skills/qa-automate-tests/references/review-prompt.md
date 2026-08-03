# Code Review Prompt Template

Use this as the prompt when spawning the `qa-code-reviewer` agent (via Task tool with `subagent_type: qa-code-reviewer`).

---

```
Review the automated test code for quality, best practices, and Tradu Test Automation Framework compliance.

**Context**:
- Functional test cases: {FUNCTIONAL_TESTS_FILE}
- Test automation implemented by qa-automation-architect
- Output directory: {OUTPUT_DIR}

## Your Task

1. Find and review ALL automated test files in the project (src/test/java for tests, src/main/java for infrastructure)
2. **Stage 1 — Framework Compliance (all violations are CRITICAL)**:
   Validate against FRAMEWORK_CONTEXT.yaml and TEST_PATTERNS.yaml:
   - Hexagonal architecture: tests import ONLY `com.tradu.core.*` interfaces — no direct Playwright, HTTP client, or QuickFIX/J imports (note: `com.tradu.core` is the framework base package — update if the framework namespace changes)
   - Service layer: all API calls via Service classes returning ApiResponse
   - Service class zero-defensive-programming: no try-catch, if/else, switch, assertions, parameter validation, error handling, retry logic, or response transformation in service methods (see TEST_PATTERNS.yaml "Service Class Best Practices")
   - Test structure: UI classes extend BaseWebTest, API classes extend BaseApiTest; `@WebTest` annotation goes on individual test **methods** (not the class)
   - Page Objects: extend BasePage, final class, static final Locator fields, no business logic
   - Allure annotations present: @Epic, @Feature, @Story, @Severity on classes; @Description on methods
   - AssertJ assertions only (no JUnit assertTrue/assertEquals)
3. **Stage 2 — Code Quality**:
   - Design Patterns (40%): POM, Service Layer, Factory/Builder for test data
   - Test Structure (25%): AAA pattern, independence, determinism, naming convention `test_{feature}_{scenario}_{expectedBehavior}`
   - Code Quality (20%): Readability, SOLID, no duplication, Java records for models
   - Framework Usage (15%): Correct Locator strategies, wait strategies (Element waits for UI, AsyncWaitUtil/Awaitility for async conditions), ConfigurationManager usage
4. Classify issues by severity:
   - CRITICAL: Must fix (broken tests, no assertions, direct Playwright imports, defensive service classes, Thread.sleep)
   - MAJOR: Should fix (duplication, poor patterns, missing Allure annotations, mutable test data models)
   - MINOR: Nice to have (naming improvements, minor refactoring)
   - SUGGESTION: Optional (performance optimizations)
5. For each issue: file path, line number, description, recommended fix with code example, rationale

## Quality Gates

- Zero CRITICAL issues
- Fewer than 5 MAJOR issues
- All tests have meaningful AssertJ assertions
- No Thread.sleep() or hardcoded delays
- Code readability >= 7/10
- No TODOs or placeholder implementations

## Output

Write report to: {OUTPUT_DIR}/code-review-report.md

Format with YAML frontmatter:
---
verdict: PASS|FAIL|CONDITIONAL_PASS
quality_score: {1-10}
critical_issues: {count}
major_issues: {count}
minor_issues: {count}
suggestions: {count}
---

Then sections: Executive Summary, Critical Issues, Major Issues, Minor Issues, Suggestions, Positive Observations, Test Coverage Assessment, Recommendations Summary.
```
