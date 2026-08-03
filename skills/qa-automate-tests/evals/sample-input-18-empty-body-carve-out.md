---
name: sample-empty-body-carve-out
feature: Order Deletion And Conditional Fetch - 204/304 Carve-Out
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 2
note: |
  Two REST tests where the response has no body by design:
   - 204 No Content (successful DELETE)
   - 304 Not Modified (conditional GET with If-None-Match)

  The agent MUST:
   1. Assert ONLY on `response.statusCode()`.
   2. NOT call `response.as(...)` — there is no body to deserialize.
   3. NOT call `response.body()` for assertion — it returns empty/null.

  Header assertions via `response.raw().headers()` ARE allowed (the
  header-check carve-out applies normally).

  Reference: API_TESTING_GUIDE.yaml → "Error Response Models" rule statement
  "204 No Content / 304 Not Modified / empty body: assert only statusCode().
  Do not read the body."

  This eval verifies the agent applies the empty-body carve-out and does NOT
  produce spurious `response.as(...)` calls on bodies that don't exist.
---

# Functional Test Cases: Empty-Body Responses — 204 / 304 Carve-Out

## Shared Preconditions

- API base URL configured via environment
- Trader account TRADER-001 with valid JWT
- An existing order for TRADER-001 that can be deleted
- A resource that supports conditional GET (ETag / If-None-Match)

## Test Data

- Trader account: TRADER-001 with valid JWT
- Existing order ID: `ORDER-EXISTING-001`

---

### TC-FUNC-BE-REST-001: Delete Existing Order Returns 204 No Content

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**Test Steps:**
1. Send DELETE /api/orders/ORDER-EXISTING-001 with valid auth
2. Verify HTTP 204 (No Content)
3. Do NOT attempt to deserialize the body (there is no body)
4. Optionally verify the `Location` or other response headers if present via `response.raw().headers()`

**Expected Results:**
- HTTP 204 No Content
- Test asserts ONLY on the status code (no body deserialization, no `response.as(...)`, no `response.body()` in assertion)

**Empty-body requirement:** This test exists specifically to verify the agent applies the 204 carve-out: `assertThat(response.statusCode()).isEqualTo(204);` and nothing else on the body.

**Test Data:** Existing order ID = ORDER-EXISTING-001

---

### TC-FUNC-BE-REST-002: Conditional Get With Matching ETag Returns 304 Not Modified

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Caching
**Interface:** BE-REST

**Test Steps:**
1. Send GET /api/instruments/EURUSD and capture the `ETag` response header
2. Send a second GET /api/instruments/EURUSD with header `If-None-Match: <ETag>`
3. Verify HTTP 304 (Not Modified)
4. Do NOT attempt to deserialize the body (there is no body)
5. Optionally verify the `ETag` header on the 304 response matches the original via `response.raw().headers()`

**Expected Results:**
- First request: HTTP 200, `ETag` header present
- Second request: HTTP 304 No Modified, no body
- Test asserts ONLY on status code and (optionally) headers for the 304 response — no body deserialization, no `response.as(...)`, no `response.body()` in assertion

**Empty-body requirement:** 304 responses MUST be asserted by status code alone. No `response.as(...)` call on the 304.

**Test Data:** Resource = /api/instruments/EURUSD
