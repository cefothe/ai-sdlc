---
name: sample-paginated-envelope
feature: Order History - Paginated Response Envelope
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 2
note: |
  Two REST tests where the endpoint returns a wrapped/envelope response:
   { "content": [...], "totalElements": N, "totalPages": M, ... }

  The agent MUST:
   1. Declare a project-specific wrapper class matching the envelope (e.g.
      `OrderPageResponse` with `content`, `totalElements`, `totalPages`).
   2. Use `response.as(OrderPageResponse.class)` — NOT `response.asList(...)`.
   3. Assert on `page.content()` (extracted list) AND on envelope metadata
      (e.g. `page.totalElements() > 0`).

  The agent MUST NOT use `response.asList(OrderResponse.class)` because the
  payload is a wrapped object, not a plain JSON array. `asList()` would fail
  to deserialize.

  Reference: fix-prompt.md covers this case in the "Paginated / envelope
  rewrite" example block. This eval verifies the agent actually applies that
  pattern when given an envelope-shaped endpoint.
---

# Functional Test Cases: Order History — Paginated Response

## Shared Preconditions

- API base URL configured via environment
- Trader account TRADER-001 with valid JWT and ≥3 historical orders
- `GET /api/orders/history` returns a Spring `Page<OrderResponse>` envelope

## Response shape (from API contract)

```json
{
  "content": [ { "id": "...", "symbol": "EURUSD", ... }, ... ],
  "totalElements": 42,
  "totalPages": 5,
  "size": 10,
  "number": 0
}
```

## Test Data

- Trader account: TRADER-001 with valid JWT
- Existing orders: at least 3 historical orders for TRADER-001

---

### TC-FUNC-BE-REST-001: Order History First Page Returns Envelope With Content And Metadata

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**Test Steps:**
1. Send GET /api/orders/history?page=0&size=10
2. Verify HTTP 200
3. Deserialize the response into a project-defined wrapper class matching the envelope shape (e.g. `OrderPageResponse` with `content`, `totalElements`, `totalPages` fields)
4. Assert envelope metadata: `totalElements >= 3`, `totalPages >= 1`
5. Assert content list: extract symbols from `content` and verify the list is non-empty

**Expected Results:**
- HTTP 200
- Wrapper deserialization succeeds
- `totalElements >= 3`
- `content` is non-empty and each entry has a valid `symbol`

**Test Data:** page = 0, size = 10

---

### TC-FUNC-BE-REST-002: Order History Filtered By Symbol Returns Only Matching Entries

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**Test Steps:**
1. Send GET /api/orders/history?symbol=EURUSD&page=0&size=20
2. Verify HTTP 200
3. Deserialize the response using the same wrapper class
4. Assert every entry in `content` has `symbol == "EURUSD"`
5. Assert `totalElements` matches the count of EURUSD orders for this trader

**Expected Results:**
- HTTP 200
- All entries in `content` have `symbol == "EURUSD"`
- `totalElements` matches expected EURUSD order count

**Test Data:** symbol = EURUSD, page = 0, size = 20
