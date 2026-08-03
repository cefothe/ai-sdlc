---
name: sample-allure-diagnostic-carve-out
feature: Order Creation - Diagnostic Logging Carve-Out
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-REST]
total_tests: 2
note: |
  Two REST tests that explicitly request diagnostic attachments / logging of
  the raw response body. The agent MUST:
   1. Deserialize via `response.as(...)` for the actual assertions.
   2. Pass the raw `response.body()` into `Allure.addAttachment(...)` and/or
      `logger.info(...)` for diagnostics — this is the carve-out and is allowed.

  The agent MUST NOT remove the diagnostic raw-body usage. The reviewer MUST
  NOT flag those Allure / logger calls as a CRITICAL deserialize violation.

  This eval exists because the deserialize rule's enforcement could over-correct
  by stripping legitimate diagnostic uses. Verifies the carve-out is respected
  in both directions: the rule applies to assertions, NOT to diagnostics.
---

# Functional Test Cases: Order Creation — Diagnostic Logging Carve-Out

## Shared Preconditions

- API base URL configured via environment
- Trader account TRADER-001 with valid JWT
- Allure reporting configured in the test framework

## Test Data

- Trader account: TRADER-001 with valid JWT
- Symbol: EURUSD

---

### TC-FUNC-BE-REST-001: Create Order Attaches Raw Response To Allure Report

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path + Diagnostics
**Interface:** BE-REST

**Test Steps:**
1. Build a valid POST /api/orders request body
2. Send the request
3. **Attach raw response body to the Allure report** (diagnostic — `Allure.addAttachment("response", "application/json", response.body())`)
4. Deserialize response to `OrderResponse`
5. Assert HTTP 201, `order.symbol() == "EURUSD"`, `order.status() == "NEW"`

**Expected Results:**
- HTTP 201 Created
- Allure report contains a "response" attachment with the raw JSON
- Deserialized assertions all pass

**Diagnostic requirement (carve-out):** The raw body MUST appear inside `Allure.addAttachment(...)`. Assertions MUST use the deserialized typed fields.

**Test Data:** Symbol = EURUSD, Side = BUY, Quantity = 100000, Price = 1.0850

---

### TC-FUNC-BE-REST-002: Failed Order Creation Logs Raw Body For Debugging

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Negative + Diagnostics
**Interface:** BE-REST

**Test Steps:**
1. Build an invalid POST /api/orders request body (negative quantity)
2. Send the request
3. **Log the raw response body at INFO level for debugging** (diagnostic — `logger.info("Failed order response: {}", response.body())`)
4. Deserialize response to the project's `ApiError` record
5. Assert HTTP 400, `error.errorCode() == "VALIDATION_FAILED"`, `error.validationErrors()` mentions the `quantity` field

**Expected Results:**
- HTTP 400 Bad Request
- Test log contains the raw response body at INFO level
- Deserialized assertions all pass

**Diagnostic requirement (carve-out):** The raw body MUST appear inside `logger.info(...)`. Assertions MUST use the deserialized typed fields.

**Test Data:** Symbol = EURUSD, Side = BUY, Quantity = -100 (invalid), Price = 1.0850
