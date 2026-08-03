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
- Deserialize for assertions (🔴 CRITICAL) — REST/WebSocket response assertions go through `response.as(Dto.class)` / `asList(Dto.class)` / `message.as(Dto.class)`. **Forbidden in assertion context**: `response.body()`, `JsonNode`, `JsonPath`, `ObjectMapper.readTree`, `org.json.*` (e.g. `JSONObject`, `JSONArray`, `JSONTokener`), `WebSocketResponse.fields()`, `WebSocketResponse.getField(...)`, `WebSocketResponse.rawJson()`. **Carve-outs**: Allure / logging attachments, non-JSON `Content-Type` endpoints, `response.raw().headers()` for header checks. 204/304/empty body → assert only `statusCode()`. FIX is out of scope (tag/value access is the protocol's native model). See `API_TESTING_GUIDE.yaml` → "Error Response Models".
- Zero TODOs, zero placeholders, zero commented-out code
- No Thread.sleep() — use framework Element waits or AsyncWaitUtil/Awaitility
- UI test preconditions via API/FIX/WebSocket, not UI navigation
- All configuration via `ConfigurationManager` — `getProperty()` for String values, typed accessors (`getInt`, `getLong`, `getBoolean`, `getDouble`) for non-String values — **never** `System.getProperty` / `System.getenv` directly (ArchUnit-enforced)
- **Parameterize repetitive tests** — When 2+ test methods share the same arrange-act-assert structure and differ only in input values or expected outputs, write a single `@ParameterizedTest` (`@CsvSource` for ≤5 primitives, `@MethodSource` returning `Stream<Arguments>` for object inputs or computed values, `@ValueSource` for a single primitive dimension) instead of N copy-paste tests. Severity 🟡 MAJOR. **Carve-out**: keep tests separate when each name encodes a semantically distinct scenario (different error category, different domain rule) — the test name is the documentation; don't bury it in a CSV row. See `API_TESTING_GUIDE.yaml` → "Pattern 5: Parameterized Tests".

## Current Framework Best Practices (introduced 2026 Q2 — fold into main checklist after 2026-12-31)

Prefer these APIs — they are ArchUnit-enforced or documented best practice in the framework's published context files. See your loaded context files for full details.

**Removal trigger**: After 2026-12-31, fold these bullets into the "Key constraints" checklist above and delete this section header. Two release cycles is enough for consuming projects to upgrade; longer than that and the "newness" framing in this section misleads readers. If, on review at that date, any of these APIs are still genuinely new in any consuming project, push the date forward by exactly one cycle and re-evaluate at the next checkpoint — do not leave the trigger open-ended.

- **REST auth**: `ApiRequest.bearerAuth(token)` shortcut — never hand-write `"Authorization", "Bearer " + token`. Service methods keep `authToken` as the first parameter; pass `null` for unauthorized scenarios.
- **Negative query params**: `ApiRequest.queryParam(name, null)` / `queryParams(mapWithNullValues)` are accepted — use them directly for negative tests (empty / absent query values).
- **Driver containers**: `DriverContainer.create()` / `getOrStart()` / `getOrStart(configurator)` from `com.tradu.core.driver` — **never** `new PlaywrightContainer()` directly. Use `withAdditionalExposedPorts(int...)` when the container needs extra ports mapped back to the host.
- **Shared containers across test classes**: `SharedContainerFixture` pattern via `DriverContainer.getOrStart()` — one process-wide singleton replaces per-class `@Container` fields.
- **Viewport**: set at creation via `DriverConfig.builder().viewportWidth(w).viewportHeight(h)`. Reserve `driver().setViewportSize(w, h)` for mid-test resize.
- **Iframes (UI)**: `FrameSwitcher` methods on `WebDriver` / `BasePage` — `switchToFrame(String|Locator)`, `switchToParentFrame()`, `switchToDefaultContent()`. Element lookup, JS execution, and web storage auto-scope to the active frame. Encapsulate frame switching inside page objects; tests never call `switchToFrame` directly. Never import `com.microsoft.playwright.Frame`.
- **`Element.forceClick()`**: only for verified flaky / animated elements (live price tickers, counters, elements behind a transient safe overlay). Normal `click()` everywhere else — `forceClick` skips actionability and hides real bugs if misused.
- **Custom elements**: extend `AbstractCustomElement` and always construct via `BasePage.custom(MyElement.class, locator)` — never `new MyCustomElement(...)`. `ElementFactory` is injected post-construction, giving you `element(Locator)` for page-wide lookups (e.g. portaled Radix dropdown panels).
- **Branded browsers**: never hardcode Playwright channels (`"chrome"`, `"msedge"`). Let `ConfigurationManager.getBoolean("browser.use.branded", true)` resolve via the framework.
- **Optional deps**: if a test run throws `IllegalStateException` mentioning `ClasspathGuard`, add the Maven coordinate to `pom.xml` — **do not** wrap framework calls in try/catch for `NoClassDefFoundError` or missing classes.
- **Error responses (negative tests)**: deserialize to a per-project error DTO record — `ErrorDto error = response.as(ErrorDto.class); assertThat(error.message()).isEqualTo("...");` — **never** `response.body().contains(...)`. WebSocket: `MessageDto msg = message.as(MessageDto.class); assertThat(msg.symbol()).isEqualTo("...");` — **never** `.getField()` / `.fields()` / `.rawJson()` in assertions.

## Framework Javadoc and Sources JARs (introduced 2026 Q2 — fold into main checklist after 2026-12-31)

The framework now publishes `-sources` and `-javadoc` JARs to the GitHub Packages Maven artefactory alongside the main JAR for every release. Javadoc is enforced in CI with `failOnWarnings=true`, so every public class, method, record, and enum — including `@throws` contracts and thread-safety notes — is documented.

**Removal trigger**: After 2026-12-31, drop the "(introduced 2026 Q2 — fold into main checklist after ...)" framing from this section header and merge the guidance into the main "Key constraints" / "Standards Reference" surface above. Two release cycles is enough for consuming projects to integrate the Javadoc/sources publishing into their IDE setup; longer than that and the "new" framing in this section misleads readers. If, on review at that date, the sources/javadoc JAR pipeline is still genuinely new in any consuming project, push the date forward by exactly one cycle and re-evaluate at the next checkpoint — do not leave the trigger open-ended.

**When to consult**: if a specific API signature, exception contract, or behavioral detail is unclear and your pre-loaded context files are insufficient, attach the `-sources` / `-javadoc` JAR for the relevant `com.tradu.test-automation-*` module in your IDE (or download it directly from the artefactory) and read the contract. **Never guess signatures or invent methods**. Pay particular attention to `@throws` tags on `PlaywrightElement` operations (`ElementNotFoundException`, `TimeoutException`), async error contracts on HTTP/FIX/WebSocket clients, and the `createDriver()` contract per `ExecutionMode` (including the CONTAINER-mode `wsEndpoint` requirement).

## Output

- Test implementation files in project structure (src/main/java for pages/services/models, src/test/java for tests)
- Test utilities, helpers, and data builders
- Test data fixtures and configuration files
{IF LAST or SINGLE: - {OUTPUT_DIR}/automation-summary.md with: Maven run commands, environment setup, test data requirements, CI/CD integration notes}
```
