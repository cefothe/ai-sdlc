---
name: sample-phase3-fixes
feature: User Profile Management
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 5
---

# Functional Test Cases: User Profile Management

## Shared Preconditions

- API base URL configured via environment
- Test accounts provisioned in test environment
- Authentication service available

## Test Data

- User USR-001: Active, email user1@example.com, role TRADER
- User USR-002: Active, email user2@example.com, role ADMIN
- User USR-003: Inactive, email user3@example.com, role TRADER

---

### TC-FUNC-BE-REST-001: Get User Profile - Happy Path

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with valid JWT token
When the client sends GET /api/v1/users/USR-001/profile
Then the API responds with HTTP 200 OK
  And the response contains userId, email, role, and lastLogin
```

**Preconditions:**
- Valid JWT token for USR-001

**Test Steps:**
1. Authenticate via POST /api/v1/auth/login
2. Send GET /api/v1/users/USR-001/profile
3. Verify response fields

**Expected Results:**
- HTTP 200 OK
- userId is "USR-001"
- email is "user1@example.com"
- role is "TRADER"

---

### TC-FUNC-BE-REST-002: Update User Email

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client for USR-001
When the client sends PUT /api/v1/users/USR-001/profile with new email
Then the API responds with HTTP 200 OK
  And the email is updated
```

**Preconditions:**
- Valid JWT token for USR-001

**Test Steps:**
1. Authenticate
2. Send PUT with body { "email": "updated@example.com" }
3. Verify response shows new email
4. GET profile to confirm persistence

**Expected Results:**
- HTTP 200 OK
- email updated to "updated@example.com"

---

### TC-FUNC-BE-REST-003: Update User Profile - Unauthorized

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Security
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given no authentication token
When the client sends PUT /api/v1/users/USR-001/profile
Then the API responds with HTTP 401 Unauthorized
```

**Preconditions:**
- No JWT token provided

**Test Steps:**
1. Send PUT without Authorization header
2. Verify 401 response

**Expected Results:**
- HTTP 401 Unauthorized
- No profile data modified

---

### TC-FUNC-BE-REST-004: Get User Profile - Inactive User

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated admin client
When the client sends GET /api/v1/users/USR-003/profile
Then the API responds with HTTP 200 OK
  And the response includes status "INACTIVE"
```

**Preconditions:**
- Valid JWT token with ADMIN role

**Test Steps:**
1. Authenticate as USR-002 (ADMIN)
2. Send GET /api/v1/users/USR-003/profile
3. Verify response includes inactive status

**Expected Results:**
- HTTP 200 OK
- status is "INACTIVE"

---

### TC-FUNC-BE-REST-005: Update User Email - Invalid Format

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Validation
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client for USR-001
When the client sends PUT /api/v1/users/USR-001/profile with email "not-an-email"
Then the API responds with HTTP 400 Bad Request
  And the error references email format
```

**Preconditions:**
- Valid JWT token for USR-001

**Test Steps:**
1. Authenticate
2. Send PUT with body { "email": "not-an-email" }
3. Verify validation error

**Expected Results:**
- HTTP 400 Bad Request
- Error references invalid email format
