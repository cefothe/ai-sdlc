---
name: sample-websocket-deserialize
feature: Market Data Stream - Deserialize for Assertions
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-WEBSOCKET]
total_tests: 3
note: |
  Three WebSocket subscription tests. Each receives a market data message and
  asserts on specific fields (symbol, bid, ask). The agent MUST deserialize
  via `message.as(MarketDataMessage.class)` and assert on typed fields — NOT
  use `message.getField(...)`, `message.fields()`, or `message.rawJson()` in
  assertion context.

  This eval is the WebSocket counterpart to the REST deserialize evals (1, 13).
  It exists to verify rule parity across protocols.
---

# Functional Test Cases: Market Data Stream — Deserialize for Assertions

## Shared Preconditions

- WebSocket endpoint configured via environment
- Authenticated session token available
- Market data feed live for EURUSD, GBPUSD, USDJPY

## Test Data

- Trader account: TRADER-001 with valid JWT
- Symbols: EURUSD, GBPUSD, USDJPY (all subscribable)

---

### TC-FUNC-BE-WEBSOCKET-001: Subscribe EURUSD Returns Tick With Bid And Ask

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-WEBSOCKET

**Test Steps:**
1. Open WebSocket connection with valid auth token
2. Send subscribe message for `{"symbol": "EURUSD"}`
3. Wait for first market-data tick (max 5s)
4. Deserialize message and assert symbol = "EURUSD", bid > 0, ask >= bid

**Expected Results:**
- Tick received within 5s
- `symbol` field = "EURUSD"
- `bid` > 0
- `ask` >= `bid`

**Test Data:** Symbol = EURUSD

---

### TC-FUNC-BE-WEBSOCKET-002: Subscribe Invalid Symbol Returns Error Message

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Negative
**Interface:** BE-WEBSOCKET

**Test Steps:**
1. Open WebSocket connection with valid auth token
2. Send subscribe message for `{"symbol": "INVALID"}`
3. Wait for error message (max 5s)
4. Deserialize to error DTO and assert errorCode = "UNKNOWN_SYMBOL"

**Expected Results:**
- Error message received within 5s
- `errorCode` field = "UNKNOWN_SYMBOL"
- `message` field describes the unknown symbol

**Test Data:** Symbol = INVALID (not in instrument list)

---

### TC-FUNC-BE-WEBSOCKET-003: Unsubscribe Stops Tick Stream

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** State Transition
**Interface:** BE-WEBSOCKET

**Test Steps:**
1. Subscribe to GBPUSD, receive 3 ticks to confirm flow
2. Send unsubscribe message
3. Wait 2s and assert no further ticks arrive for GBPUSD
4. Deserialize the unsubscribe-ack message and assert status = "UNSUBSCRIBED"

**Expected Results:**
- Unsubscribe-ack received
- `status` field = "UNSUBSCRIBED"
- No further GBPUSD ticks within 2s

**Test Data:** Symbol = GBPUSD
