---
name: sample-distinct-scenarios-keep-separate
feature: Login - Token Validation Failures (Carve-Out)
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 3
note: |
  The 3 test cases below all return HTTP 401 with the same response shape, but
  each represents a SEMANTICALLY DISTINCT scenario (different domain failure
  mode — expired vs revoked vs malformed token). They share the same arrange-
  act-assert structure but differ in WHY they fail, not just in input values.

  Per the parameterize carve-out: "Keep tests separate when each name encodes a
  semantically distinct scenario (different error category, different domain
  rule) — the test name is the documentation; don't bury a meaningful
  distinction inside a CSV row."

  This eval verifies the agent does NOT collapse these into a @ParameterizedTest.
  Each test name carries domain meaning a CSV row would erase. Combining them
  would also lose the distinct error_code values (TOKEN_EXPIRED vs TOKEN_REVOKED
  vs TOKEN_MALFORMED), which are different domain rules enforced by different
  authentication code paths.
---

# Functional Test Cases: Login - Token Validation Failures

## Shared Preconditions

- API base URL configured via environment
- Auth service available
- Test fixtures provide:
  - one expired JWT (`exp` timestamp in the past)
  - one revoked JWT (issued, then explicitly revoked via admin endpoint)
  - one malformed JWT (header section corrupted so signature validation fails before claims are inspected)

## Test Data

- `EXPIRED_TOKEN` — well-formed JWT signed by the auth service, `exp` timestamp = T-3600s
- `REVOKED_TOKEN` — well-formed JWT, originally issued and added to the revocation list
- `MALFORMED_TOKEN` — corrupted JWT (e.g. `"not.a.valid.jwt"`)

---

### TC-FUNC-BE-REST-001: Login With Expired Token Returns 401 TOKEN_EXPIRED

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Negative — Authentication
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given a JWT token whose `exp` claim is in the past
When the client calls GET /api/v1/account with the expired token
Then the API responds with HTTP 401 Unauthorized
  And the error body contains:
    - "errorCode": "TOKEN_EXPIRED"
    - "message": "Authentication token has expired"
```

**Preconditions:**
- `EXPIRED_TOKEN` fixture is available

**Test Steps:**
1. Send GET /api/v1/account with `Authorization: Bearer <EXPIRED_TOKEN>`
2. Verify HTTP 401 response
3. Deserialize error body to ApiError
4. Verify errorCode = "TOKEN_EXPIRED"
5. Verify message = "Authentication token has expired"

**Expected Results:**
- HTTP 401 Unauthorized
- errorCode = "TOKEN_EXPIRED"
- message = "Authentication token has expired"

**Post Conditions:** None

**Dependencies:** None
**Execution Time:** 5 seconds
**Test Data:** `EXPIRED_TOKEN`

---

### TC-FUNC-BE-REST-002: Login With Revoked Token Returns 401 TOKEN_REVOKED

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Negative — Authentication
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given a JWT token that was issued and then explicitly revoked
When the client calls GET /api/v1/account with the revoked token
Then the API responds with HTTP 401 Unauthorized
  And the error body contains:
    - "errorCode": "TOKEN_REVOKED"
    - "message": "Authentication token has been revoked"
```

**Preconditions:**
- `REVOKED_TOKEN` fixture is available (issued, then revoked via admin endpoint)

**Test Steps:**
1. Send GET /api/v1/account with `Authorization: Bearer <REVOKED_TOKEN>`
2. Verify HTTP 401 response
3. Deserialize error body to ApiError
4. Verify errorCode = "TOKEN_REVOKED"
5. Verify message = "Authentication token has been revoked"

**Expected Results:**
- HTTP 401 Unauthorized
- errorCode = "TOKEN_REVOKED"
- message = "Authentication token has been revoked"

**Post Conditions:** None

**Dependencies:** None
**Execution Time:** 5 seconds
**Test Data:** `REVOKED_TOKEN`

---

### TC-FUNC-BE-REST-003: Login With Malformed Token Returns 401 TOKEN_MALFORMED

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Negative — Authentication
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given a string that is not a structurally valid JWT
When the client calls GET /api/v1/account with the malformed token
Then the API responds with HTTP 401 Unauthorized
  And the error body contains:
    - "errorCode": "TOKEN_MALFORMED"
    - "message": "Authentication token is malformed"
```

**Preconditions:**
- `MALFORMED_TOKEN` fixture is available

**Test Steps:**
1. Send GET /api/v1/account with `Authorization: Bearer <MALFORMED_TOKEN>`
2. Verify HTTP 401 response
3. Deserialize error body to ApiError
4. Verify errorCode = "TOKEN_MALFORMED"
5. Verify message = "Authentication token is malformed"

**Expected Results:**
- HTTP 401 Unauthorized
- errorCode = "TOKEN_MALFORMED"
- message = "Authentication token is malformed"

**Post Conditions:** None

**Dependencies:** None
**Execution Time:** 5 seconds
**Test Data:** `MALFORMED_TOKEN`
