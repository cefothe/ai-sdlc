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

1. Framework architecture violations (wrong imports → replace with com.tradu.core.*). Specifically: `com.microsoft.playwright.Frame` → use `FrameSwitcher` methods on `WebDriver`/`BasePage` (`switchToFrame`, `switchToParentFrame`, `switchToDefaultContent`).
2. Direct `System.getProperty`/`System.getenv` → replace with `ConfigurationManager.getProperty()` or typed accessors (`getInt`, `getLong`, `getBoolean`, `getDouble`)
3. Service class defensive programming (remove try-catch, if/else, assertions from service methods → simple passthrough only)
4. Direct `new PlaywrightContainer()` in test code → `DriverContainer.create()` / `DriverContainer.getOrStart()` from `com.tradu.core.driver` (tool-agnostic SPI). If the same container configuration is duplicated across test classes, introduce a `SharedContainerFixture` using `getOrStart(UnaryOperator)`.
5. Manual Bearer auth header (`.header("Authorization", "Bearer " + token)`) → `ApiRequest.bearerAuth(token)`
6. Hardcoded Playwright channel string (`"chrome"`, `"msedge"`) → read `browser.use.branded` via `ConfigurationManager.getBoolean("browser.use.branded", true)` and let the adapter map it
7. Direct `new MyCustomElement(delegate)` instantiation → replace with `BasePage.custom(MyCustomElement.class, locator)` or `ElementFactory.create()` / `createWith()` (direct instantiation throws `IllegalStateException` at runtime because `ElementFactory` was never injected)
8. Viewport set via `setViewportSize()` at driver init → move to `DriverConfig.builder().viewportWidth(w).viewportHeight(h)` at driver creation (reserve `setViewportSize` for mid-test resize only)
9. Missing or wrong assertions (add AssertJ assertThat, remove JUnit assertTrue/assertEquals)
10. **Raw-body / `JsonNode` / `JsonPath` / `ObjectMapper.readTree` / `org.json.*` / `WebSocketResponse.getField(...)` / `WebSocketResponse.fields()` / `WebSocketResponse.rawJson()` in assertion context** (🔴 CRITICAL) → deserialize to a typed DTO first. The typical rewrite:

   ```java
   // BEFORE (forbidden — brittle, breaks on whitespace/casing/wording changes)
   assertThat(response.body()).contains("Invalid symbol");

   // AFTER (project defines its own ApiError record matching the backend's error contract,
   //        e.g. record ApiError(int statusCode, String errorCode, String message,
   //                             Map<String, List<String>> validationErrors){})
   ApiError error = response.as(ApiError.class);
   assertThat(error.message()).isEqualTo("Invalid symbol");
   ```

   WebSocket rewrite:
   ```java
   // BEFORE
   assertThat(message.getField("symbol")).contains("EURUSD");

   // AFTER (project defines its own MarketDataMessage record matching the WS payload)
   MarketDataMessage msg = message.as(MarketDataMessage.class);
   assertThat(msg.symbol()).isEqualTo("EURUSD");
   ```

   List-response rewrite (when the endpoint returns a plain JSON array — `[{...}, {...}]`):
   ```java
   // BEFORE (list-response anti-pattern)
   assertThat(response.body()).contains("EURUSD");

   // AFTER
   List<OrderResponse> orders = response.asList(OrderResponse.class);
   assertThat(orders).extracting(OrderResponse::symbol).contains("EURUSD");
   ```

   Paginated / envelope rewrite (when the endpoint returns a wrapped object — `{"content":[...], "totalElements": 42, ...}` — typical for Spring `Page<T>` and similar):
   ```java
   // BEFORE (envelope anti-pattern — body().contains AND wrong API choice)
   assertThat(response.body()).contains("EURUSD");

   // BEFORE (also wrong — asList() on a wrapped response fails to deserialize)
   List<OrderResponse> orders = response.asList(OrderResponse.class);

   // AFTER — declare a concrete wrapper class matching the envelope, then as()
   public class OrderPageResponse {
       private List<OrderResponse> content;
       private int totalPages;
       private long totalElements;
       // getters
   }

   OrderPageResponse page = response.as(OrderPageResponse.class);
   assertThat(page.getContent()).extracting(OrderResponse::symbol).contains("EURUSD");
   assertThat(page.getTotalElements()).isGreaterThan(0);
   ```
   Rule: use `asList()` ONLY for plain JSON arrays (`[...]`); use `as()` with a wrapper class for any wrapped/envelope response. See `API_TESTING_GUIDE.yaml` → "Paginated Responses".

   **204/304/empty body** → drop the body assertion entirely; assert only `response.statusCode()`. **Carve-outs allowed (do not flag)**: raw body passed to `Allure.addAttachment(...)` / `logger.info(...)`, non-JSON `Content-Type` endpoints (`text/plain`/`text/html`), and `response.raw().headers()` for header checks. **FIX protocol** (`FixMessage.getField(Tag)` / `fields()`) is out of scope — tag/value access is the protocol's native model and `FixMessage` has no `.as(Class<T>)`.
11. Thread.sleep() → replace with framework Element waits or Awaitility
12. `forceClick()` on non-flaky elements → use normal `click()` with explicit waits (`forceClick()` is only appropriate for live tickers / animated counters / verified-safe transient overlays)
13. Missing Allure annotations (add @Epic, @Feature, @Story, @Severity, @Description)
14. Mutable test data models → convert to Java records
15. Code duplication → extract to shared utilities
16. **Repetitive tests (2+ tests with identical arrange-act-assert shape, differing only in input/expected values)** → combine into a single `@ParameterizedTest`. Severity 🟡 MAJOR. Prefer `@CsvSource` for ≤5 primitives, `@MethodSource` returning `Stream<Arguments>` for object inputs or computed values, `@ValueSource` for a single primitive dimension. The canonical rewrite:

    ```java
    // BEFORE — 3 copy-paste tests differing only in inputs
    @Test void test_createOrder_eurusd_returns201() { ... }
    @Test void test_createOrder_gbpusd_returns201() { ... }
    @Test void test_createOrder_usdjpy_returns201() { ... }

    // AFTER — one @ParameterizedTest
    @ParameterizedTest
    @CsvSource({
        "EURUSD, BUY, 100000, 1.0850",
        "GBPUSD, SELL, 50000, 1.2500",
        "USDJPY, BUY, 200000, 150.25"
    })
    void test_createOrder_validSymbols_returns201(String symbol, OrderSide side, int qty, double price) { ... }
    ```

    **Carve-out**: Keep tests separate when each name encodes a semantically distinct scenario (different error category, different domain rule — e.g. `test_login_withExpiredToken_returns401` vs. `test_login_withRevokedToken_returns401`). The test name is the documentation; don't bury a meaningful distinction inside a CSV row. See `API_TESTING_GUIDE.yaml` → "Pattern 5: Parameterized Tests".

## Standards Reference

Apply all fixes according to your loaded framework context files (see agent definition for the full list). If any context file is not pre-loaded, read it from `~/.claude/contexts/test-automation/`.

For service class fixes specifically, consult the "Service Class Best Practices" section in TEST_PATTERNS.yaml.
```
