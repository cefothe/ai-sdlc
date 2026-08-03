---
name: sample-rest-tests
feature: Account Balance Retrieval
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 3
---

# Functional Test Cases: Account Balance Retrieval

## Shared Preconditions

- API base URL configured via environment
- Test accounts provisioned in test environment
- Authentication service available

## Test Data

- Account ACC-TEST-001: Active, balance $5,000.00, currency USD
- Account ACC-TEST-002: Active, balance $0.00, currency USD
- Account ACC-SUSPENDED: Suspended

---

### TC-FUNC-BE-REST-001: Get Account Balance - Happy Path

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with valid JWT token
  And the client account ID is "ACC-TEST-001" with balance $5,000.00
When the client sends GET /api/v1/accounts/ACC-TEST-001/balance
Then the API responds with HTTP 200 OK
  And the response body contains:
    - "accountId": "ACC-TEST-001"
    - "balance": 5000.00
    - "currency": "USD"
    - "updatedAt": ISO 8601 timestamp
```

**Preconditions:**
- Client has valid JWT token (not expired)
- Account ACC-TEST-001 exists with status ACTIVE
- Account balance: $5,000.00

**Test Steps:**
1. Obtain valid JWT token via POST /api/v1/auth/login
2. Send GET /api/v1/accounts/ACC-TEST-001/balance with Authorization header
3. Verify HTTP 200 response
4. Validate response body fields and types

**Expected Results:**
- HTTP 200 OK response received
- Response Content-Type: application/json
- accountId matches "ACC-TEST-001"
- balance is numeric 5000.00
- currency is "USD"
- updatedAt is valid ISO 8601 timestamp

**Post Conditions:**
- No state changes (read-only operation)

**Dependencies:** None
**Execution Time:** 30 seconds
**Test Data:**
- Account: ACC-TEST-001
- Expected Balance: 5000.00
- Currency: USD

---

### TC-FUNC-BE-REST-002: Get Account Balance - Zero Balance

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Edge Case
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with valid JWT token
  And the client account ID is "ACC-TEST-002" with balance $0.00
When the client sends GET /api/v1/accounts/ACC-TEST-002/balance
Then the API responds with HTTP 200 OK
  And the response body contains:
    - "accountId": "ACC-TEST-002"
    - "balance": 0.00
    - "currency": "USD"
```

**Preconditions:**
- Client has valid JWT token (not expired)
- Account ACC-TEST-002 exists with status ACTIVE
- Account balance: $0.00

**Test Steps:**
1. Obtain valid JWT token via POST /api/v1/auth/login
2. Send GET /api/v1/accounts/ACC-TEST-002/balance with Authorization header
3. Verify HTTP 200 response
4. Validate balance field is exactly 0.00 (not null, not empty string)

**Expected Results:**
- HTTP 200 OK response received
- balance is numeric 0.00 (not null or omitted)
- currency is "USD"

**Post Conditions:**
- No state changes (read-only operation)

**Dependencies:** None
**Execution Time:** 30 seconds
**Test Data:**
- Account: ACC-TEST-002
- Expected Balance: 0.00
- Currency: USD

---

### TC-FUNC-BE-REST-003: Get Account Balance - Suspended Account

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with valid JWT token
  And the account "ACC-SUSPENDED" has status SUSPENDED
When the client sends GET /api/v1/accounts/ACC-SUSPENDED/balance
Then the API responds with HTTP 403 Forbidden
  And the response body contains:
    - "error": "ACCOUNT_SUSPENDED"
    - "message": contains "suspended"
```

**Preconditions:**
- Client has valid JWT token (not expired)
- Account ACC-SUSPENDED exists with status SUSPENDED

**Test Steps:**
1. Obtain valid JWT token via POST /api/v1/auth/login
2. Send GET /api/v1/accounts/ACC-SUSPENDED/balance with Authorization header
3. Verify HTTP 403 response
4. Validate error response body

**Expected Results:**
- HTTP 403 Forbidden response received
- error field is "ACCOUNT_SUSPENDED"
- message field contains "suspended" (case-insensitive)
- No balance data leaked in error response

**Post Conditions:**
- No state changes
- Account remains SUSPENDED

**Dependencies:** None
**Execution Time:** 30 seconds
**Test Data:**
- Account: ACC-SUSPENDED
- Account Status: SUSPENDED
