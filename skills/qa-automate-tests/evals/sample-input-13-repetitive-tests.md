---
name: sample-repetitive-order-tests
feature: Order Creation - Multiple Currency Pairs
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 3
note: |
  The 3 test cases below are intentionally near-identical — same arrange-act-assert
  shape, differing only in the input values (symbol, side, quantity, price). They
  exist to verify that the qa-automation-architect agent produces ONE
  @ParameterizedTest (with @CsvSource of 3 rows) rather than 3 copy-paste @Test
  methods. The test name `test_order_createValidSymbols_returns201` should
  parameterize cleanly over the three inputs because each row tests the same
  domain rule (valid major currency pair → 201 Created), not three semantically
  distinct scenarios.
---

# Functional Test Cases: Order Creation - Multiple Currency Pairs

## Shared Preconditions

- API base URL configured via environment
- Test trader account provisioned with valid JWT token
- All three currency pairs (EURUSD, GBPUSD, USDJPY) enabled on the trading venue

## Test Data

- Trader account: TRADER-001 with valid JWT
- Currency pairs: EURUSD, GBPUSD, USDJPY (all tradable)
- Order book has liquidity at the test prices

---

### TC-ORD-001: Create Limit Order - EURUSD

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated trader with valid JWT token
  And the symbol "EURUSD" is tradable
When the trader sends POST /api/orders with body:
    { "symbol": "EURUSD", "side": "BUY", "quantity": 100000, "price": 1.0850 }
Then the API responds with HTTP 201 Created
  And the response body contains:
    - "symbol": "EURUSD"
    - "side": "BUY"
    - "quantity": 100000
    - "price": 1.0850
    - "status": "NEW"
```

**Preconditions:**
- Trader has valid JWT token (not expired)
- EURUSD tradable

**Test Steps:**
1. Obtain valid JWT token via POST /api/v1/auth/login
2. Send POST /api/orders with the request body above
3. Verify HTTP 201 response
4. Validate response body fields match the request

**Expected Results:**
- HTTP 201 Created response received
- Response Content-Type: application/json
- symbol matches "EURUSD"
- side matches "BUY"
- quantity matches 100000
- price matches 1.0850
- status is "NEW"

**Post Conditions:**
- Order exists in the system with status NEW

**Dependencies:** None
**Execution Time:** 30 seconds
**Test Data:**
- Symbol: EURUSD
- Side: BUY
- Quantity: 100000
- Price: 1.0850

---

### TC-ORD-002: Create Limit Order - GBPUSD

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated trader with valid JWT token
  And the symbol "GBPUSD" is tradable
When the trader sends POST /api/orders with body:
    { "symbol": "GBPUSD", "side": "SELL", "quantity": 50000, "price": 1.2500 }
Then the API responds with HTTP 201 Created
  And the response body contains:
    - "symbol": "GBPUSD"
    - "side": "SELL"
    - "quantity": 50000
    - "price": 1.2500
    - "status": "NEW"
```

**Preconditions:**
- Trader has valid JWT token (not expired)
- GBPUSD tradable

**Test Steps:**
1. Obtain valid JWT token via POST /api/v1/auth/login
2. Send POST /api/orders with the request body above
3. Verify HTTP 201 response
4. Validate response body fields match the request

**Expected Results:**
- HTTP 201 Created response received
- Response Content-Type: application/json
- symbol matches "GBPUSD"
- side matches "SELL"
- quantity matches 50000
- price matches 1.2500
- status is "NEW"

**Post Conditions:**
- Order exists in the system with status NEW

**Dependencies:** None
**Execution Time:** 30 seconds
**Test Data:**
- Symbol: GBPUSD
- Side: SELL
- Quantity: 50000
- Price: 1.2500

---

### TC-ORD-003: Create Limit Order - USDJPY

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated trader with valid JWT token
  And the symbol "USDJPY" is tradable
When the trader sends POST /api/orders with body:
    { "symbol": "USDJPY", "side": "BUY", "quantity": 200000, "price": 150.25 }
Then the API responds with HTTP 201 Created
  And the response body contains:
    - "symbol": "USDJPY"
    - "side": "BUY"
    - "quantity": 200000
    - "price": 150.25
    - "status": "NEW"
```

**Preconditions:**
- Trader has valid JWT token (not expired)
- USDJPY tradable

**Test Steps:**
1. Obtain valid JWT token via POST /api/v1/auth/login
2. Send POST /api/orders with the request body above
3. Verify HTTP 201 response
4. Validate response body fields match the request

**Expected Results:**
- HTTP 201 Created response received
- Response Content-Type: application/json
- symbol matches "USDJPY"
- side matches "BUY"
- quantity matches 200000
- price matches 150.25
- status is "NEW"

**Post Conditions:**
- Order exists in the system with status NEW

**Dependencies:** None
**Execution Time:** 30 seconds
**Test Data:**
- Symbol: USDJPY
- Side: BUY
- Quantity: 200000
- Price: 150.25
