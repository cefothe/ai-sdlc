---
name: sample-clean-rest
feature: Instrument Lookup Service
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 5
---

# Functional Test Cases: Instrument Lookup Service

## Shared Preconditions

- API base URL configured via environment
- Authentication service available
- Instrument reference data loaded

## Test Data

- Instrument AAPL: Active, type EQUITY, exchange NASDAQ
- Instrument EURUSD: Active, type FX, exchange OTC
- Instrument DELISTED-001: Inactive/delisted

---

### TC-FUNC-BE-REST-001: Get Instrument by Symbol - Happy Path

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client sends GET /api/v1/instruments/AAPL
Then the API responds with HTTP 200 OK
  And the response contains symbol, name, type, exchange, and status
```

**Preconditions:**
- Valid JWT token
- AAPL instrument exists

**Test Steps:**
1. Authenticate via POST /api/v1/auth/login
2. Send GET /api/v1/instruments/AAPL
3. Verify response fields

**Expected Results:**
- HTTP 200 OK
- symbol is "AAPL"
- type is "EQUITY"
- exchange is "NASDAQ"
- status is "ACTIVE"

---

### TC-FUNC-BE-REST-002: List Instruments with Type Filter

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client sends GET /api/v1/instruments?type=FX
Then the API responds with HTTP 200 OK
  And all returned instruments have type "FX"
```

**Preconditions:**
- Valid JWT token
- At least one FX instrument exists

**Test Steps:**
1. Authenticate
2. Send GET with type=FX query parameter
3. Verify all results are FX type

**Expected Results:**
- HTTP 200 OK
- Results array is non-empty
- Every item has type "FX"

---

### TC-FUNC-BE-REST-003: Get Instrument - Not Found

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client sends GET /api/v1/instruments/NONEXISTENT
Then the API responds with HTTP 404 Not Found
  And the error code is "INSTRUMENT_NOT_FOUND"
```

**Preconditions:**
- Valid JWT token

**Test Steps:**
1. Authenticate
2. Send GET for non-existent symbol
3. Verify 404 response

**Expected Results:**
- HTTP 404 Not Found
- error code is "INSTRUMENT_NOT_FOUND"

---

### TC-FUNC-BE-REST-004: Search Instruments by Name

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client sends GET /api/v1/instruments/search?q=Apple
Then the API responds with HTTP 200 OK
  And the results contain AAPL
```

**Preconditions:**
- Valid JWT token
- AAPL instrument has name containing "Apple"

**Test Steps:**
1. Authenticate
2. Send search query for "Apple"
3. Verify AAPL appears in results

**Expected Results:**
- HTTP 200 OK
- Results contain at least one item with symbol "AAPL"

---

### TC-FUNC-BE-REST-005: Get Instrument - Unauthorized

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Security
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given no authentication token
When the client sends GET /api/v1/instruments/AAPL
Then the API responds with HTTP 401 Unauthorized
```

**Preconditions:**
- No JWT token provided

**Test Steps:**
1. Send GET without Authorization header
2. Verify 401 response

**Expected Results:**
- HTTP 401 Unauthorized
- No instrument data leaked
