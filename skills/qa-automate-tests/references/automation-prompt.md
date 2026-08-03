# Automation Prompt Template

Use this as the prompt when spawning the `qa-automation-architect` agent (via Task tool with `subagent_type: qa-automation-architect`).

Substitute `{PLACEHOLDERS}` with actual values. Include/exclude sections marked with `{IF ...}` based on context.

---

```
Implement automated Java tests for functional test cases using the Tradu Test Automation Framework.

**Input Test Cases**: {FUNCTIONAL_TESTS_FILE or CHUNK_FILE}
**Output Directory**: {OUTPUT_DIR}
{IF CHUNKED: **Chunk Info**: Tests {START}-{END} of {TOTAL} (chunk {N}/{NUM_CHUNKS})}
{IF EXPLORATION: **Exploration Results**: {OUTPUT_DIR}/exploration-results.md — use discovered locators for UI Page Objects}
{IF UI_TESTS: **Frontend Component Paths** (for adding missing data-testid attributes): {FRONTEND_COMPONENT_PATHS}}

## Your Task

1. Read the functional test cases from the input file
2. Consult your loaded framework context files (available automatically via agent definition) for all implementation decisions — architecture, patterns, locator strategies, API usage, and reporting.
   **Fallback**: If any context file is not pre-loaded, read it directly from `~/.claude/contexts/test-automation/`. In particular, check `guides/REPORTING_GUIDE.yaml` for Allure annotation and screenshot conventions.
3. Read project documentation (README.md, CLAUDE.md) for project-specific conventions
4. Examine existing test code in the project for patterns to follow
{IF CHUNK 2+: - Review test files created by previous chunks — REUSE existing utilities, page objects, service classes. Do NOT duplicate.}
5. Design test automation architecture:
   - Page Object Model for UI tests, Service Layer for API interactions
   - Directory structure: infrastructure (pages, services, models) in src/main/java, tests in src/test/java
   - Reusable test data builders using Java records with static factory methods
6. Implement automated tests for ALL test cases in the input:
   - REST API tests using Service classes (never direct HTTP method calls in tests)
   - WebSocket tests using framework WebSocketClient interface
   - FIX protocol tests using framework FixRequestBuilder
   - UI tests using framework WebDriver/Element/Locator interfaces (use Playwright MCP for locator discovery)
   - Integration tests for end-to-end workflows
7. Create test execution documentation at {OUTPUT_DIR}/automation-summary.md
   {IF CHUNKED and NOT LAST: (SKIP — only the last chunk creates this)}

## Framework Standards

Follow all framework standards from your loaded context files (see agent definition for the full list).

Key constraints:
- AssertJ only — no JUnit assertions
- Zero TODOs, zero placeholders, zero commented-out code
- No Thread.sleep() — use framework Element waits or AsyncWaitUtil/Awaitility
- UI test preconditions via API/FIX/WebSocket, not UI navigation

## Output

- Test implementation files in project structure (src/main/java for pages/services/models, src/test/java for tests)
- Test utilities, helpers, and data builders
- Test data fixtures and configuration files
{IF LAST or SINGLE: - {OUTPUT_DIR}/automation-summary.md with: Maven run commands, environment setup, test data requirements, CI/CD integration notes}
```
