---
name: sample-header-carve-out
feature: HTTP Header Assertions - response.raw().headers() Carve-Out
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 2
note: |
  Two REST tests where the verification target is an HTTP response header, not the body:
   - POST 201 returns a `Location` header pointing at the newly-created resource.
   - 503 Service Unavailable returns a `Retry-After` header instructing the caller when to retry.

  The agent MUST:
   1. Use `response.raw().headers().firstValue(...)` for ALL header assertions.
   2. Continue to deserialize the body via `response.as(...)` for the 201 success
      path (body assertion + header assertion — both are required and they are
      independent concerns).
   3. NOT call `response.body()` or `response.as(...)` to "fish" for header
      values — headers are not in the body.

  Reference: API_TESTING_GUIDE.yaml → "Error Response Models" → Header assertions
  carve-out:
      assertThat(response.raw().headers().firstValue("Retry-After")).isPresent();

  This eval exists because eval 18 only brushes the header carve-out (it passes
  whether or not header assertions are present). This eval exercises the
  carve-out in isolation: the test's entire point is the header, and the agent
  MUST reach for the correct API.
---

# Functional Test Cases: HTTP Header Assertions — raw().headers() Carve-Out

## Shared Preconditions

- API base URL configured via environment
- Trader account TRADER-001 with valid JWT
- The order-creation endpoint returns `Location: /api/orders/{id}` on 201
- The order-creation endpoint can be rate-limited; under load returns 503 with `Retry-After: <seconds>`

## Test Data

- Trader account: TRADER-001 with valid JWT
- Symbol: EURUSD, Side: BUY, Quantity: 100000, Price: 1.0850

---

### TC-FUNC-BE-REST-001: Create Order Returns 201 With Location Header

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path + Header Assertion
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated trader with valid JWT token
  And the symbol "EURUSD" is tradable
When the trader sends POST /api/orders with a valid request body
Then the API responds with HTTP 201 Created
  And the response body contains the created order (typed assertion)
  And the response `Location` header points at /api/orders/{order.id}
```

**Preconditions:**
- Trader has valid JWT
- EURUSD tradable

**Test Steps:**
1. Send POST /api/orders with the EURUSD request body
2. Verify HTTP 201 response
3. Deserialize body to `OrderResponse` and assert `order.symbol() == "EURUSD"`, `order.status() == "NEW"`
4. Assert `response.raw().headers().firstValue("Location")` is present AND ends with the order's id

**Expected Results:**
- HTTP 201 Created
- Body deserialization succeeds
- `order.symbol() == "EURUSD"`, `order.status() == "NEW"`
- `Location` header present and equals `/api/orders/{order.id}`

**Header-assertion requirement (carve-out):** The header value MUST be accessed via `response.raw().headers().firstValue("Location")` — NOT via `response.body()` parsing and NOT via a custom DTO field on the body.

**Test Data:** Symbol = EURUSD, Side = BUY, Quantity = 100000, Price = 1.0850

---

### TC-FUNC-BE-REST-002: Rate-Limited Order Creation Returns 503 With Retry-After Header

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Negative + Header Assertion
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated trader has exhausted their per-minute order quota
When the trader sends POST /api/orders one more time
Then the API responds with HTTP 503 Service Unavailable
  And the response `Retry-After` header is present
  And the parsed Retry-After value is a positive integer (seconds)
```

**Preconditions:**
- Trader's per-minute order quota has been exhausted (test fixture rapidly fires N+1 orders to trip the limiter)

**Test Steps:**
1. Send N+1 rapid POST /api/orders requests (N = the per-minute quota)
2. Capture the last response (the one that trips the limiter)
3. Verify HTTP 503 response
4. Assert `response.raw().headers().firstValue("Retry-After")` is present
5. Parse the header value as an integer and assert it is > 0

**Expected Results:**
- HTTP 503 Service Unavailable
- `Retry-After` header present
- Parsed Retry-After value > 0

**Header-assertion requirement (carve-out):** The `Retry-After` value MUST be accessed via `response.raw().headers().firstValue("Retry-After")`. The body may or may not contain an `ApiError` payload; the test's verification target is the header, not the body.

**Test Data:** Symbol = EURUSD, Side = BUY, Quantity = 100000, Price = 1.0850; quota fixture configured to trip after N requests
