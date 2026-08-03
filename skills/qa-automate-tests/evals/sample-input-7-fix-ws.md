---
name: sample-fix-ws
feature: FIX Gateway and WebSocket Feed
generated_by: /qa:functional-tests (sample for eval)
interface_types: [BE-FIX, BE-WEBSOCKET]
total_tests: 8
---

# Functional Test Cases: FIX Gateway and WebSocket Feed

## Shared Preconditions

- FIX gateway available on configured port (SenderCompID: TEST_CLIENT, TargetCompID: TRADU_GW)
- WebSocket endpoint available at ws://{base_url}/ws/market-data
- WebSocket order endpoint available at ws://{base_url}/ws/orders
- Test accounts provisioned and mapped to FIX sessions
- Market data feed active for instruments: EURUSD, GBPUSD, AAPL

## Test Data

- Account ACC-FIX-001: Active, mapped to FIX SenderCompID TEST_CLIENT
- Instrument EURUSD: Active FX pair, min lot 1000, pip size 0.0001
- Instrument GBPUSD: Active FX pair, min lot 1000, pip size 0.0001
- Instrument AAPL: Active equity, min lot 1, tick size 0.01
- Instrument DELISTED-FX: Delisted FX pair

---

### TC-FUNC-BE-FIX-001: FIX Logon Handshake

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given FIX session configuration with valid SenderCompID and TargetCompID
When the client initiates a FIX Logon (35=A) message
Then the gateway responds with Logon (35=A)
  And HeartBtInt (108) matches the requested interval
  And the session is established
```

**Preconditions:**
- FIX gateway is running
- Valid session configuration

**Test Steps:**
1. Configure FIX session with SenderCompID=TEST_CLIENT, TargetCompID=TRADU_GW
2. Send Logon message with HeartBtInt=30
3. Receive Logon response
4. Verify session state

**Expected Results:**
- Logon response received
- HeartBtInt=30
- Session status is ACTIVE

---

### TC-FUNC-BE-FIX-002: FIX New Order Single - Limit Order (35=D)

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given an established FIX session
When the client sends NewOrderSingle (35=D):
  | tag  | value        |
  | 11   | CLORD-LMT-01 |
  | 55   | EURUSD       |
  | 54   | 1 (BUY)      |
  | 40   | 2 (LIMIT)    |
  | 38   | 10000        |
  | 44   | 1.0850       |
  | 59   | 1 (GTC)      |
Then the gateway responds with ExecutionReport (35=8)
  And ExecType (150) is "0" (New)
  And OrdStatus (39) is "0" (New)
  And Price (44) is 1.0850
  And TimeInForce (59) is "1" (GTC)
```

**Preconditions:**
- FIX session established
- EURUSD is active

**Test Steps:**
1. Send NewOrderSingle with limit price
2. Receive ExecutionReport
3. Validate all response tags

**Expected Results:**
- ExecutionReport with ExecType=0
- Price matches submitted 1.0850
- TimeInForce preserved as GTC

---

### TC-FUNC-BE-FIX-003: FIX Order Cancel Replace (35=G)

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given an active limit order submitted via FIX
When the client sends OrderCancelReplaceRequest (35=G):
  | tag  | value        |
  | 41   | CLORD-LMT-01 |
  | 11   | CLORD-LMT-02 |
  | 44   | 1.0900       |
Then the gateway responds with ExecutionReport (35=8)
  And ExecType (150) is "5" (Replaced)
  And Price (44) is 1.0900
```

**Preconditions:**
- FIX session established
- Active limit order exists

**Test Steps:**
1. Submit original limit order
2. Send cancel/replace with new price
3. Validate replacement ExecutionReport

**Expected Results:**
- ExecType=5 (Replaced)
- New price 1.0900 reflected
- OrigClOrdID references original

---

### TC-FUNC-BE-FIX-004: FIX Reject - Duplicate ClOrdID (35=3)

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given an order with ClOrdID "CLORD-DUP-01" already exists
When the client sends a new order with the same ClOrdID "CLORD-DUP-01"
Then the gateway responds with Reject (35=3) or BusinessMessageReject (35=j)
  And RefSeqNum (45) references the duplicate message
  And SessionRejectReason (373) or BusinessRejectReason (380) indicates duplicate
```

**Preconditions:**
- FIX session established
- An order with CLORD-DUP-01 exists

**Test Steps:**
1. Submit order with ClOrdID=CLORD-DUP-01
2. Submit second order with same ClOrdID
3. Validate reject response

**Expected Results:**
- Reject or BusinessMessageReject received
- Reason indicates duplicate ClOrdID

---

### TC-FUNC-BE-FIX-005: FIX Heartbeat and Test Request

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Session Management
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given an established FIX session with HeartBtInt=30
When no messages are sent for 30 seconds
Then the client receives a Heartbeat (35=0) from the gateway
When the client sends TestRequest (35=1) with TestReqID "TR-001"
Then the gateway responds with Heartbeat (35=0) containing TestReqID "TR-001"
```

**Preconditions:**
- FIX session established

**Test Steps:**
1. Wait for heartbeat interval
2. Verify heartbeat received
3. Send TestRequest
4. Verify heartbeat response with matching TestReqID

**Expected Results:**
- Heartbeat received after interval
- TestRequest response includes matching TestReqID

---

### TC-FUNC-BE-WS-001: Subscribe to Market Data Feed

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-WEBSOCKET

**BDD Scenario:**
```gherkin
Given an authenticated WebSocket connection to /ws/market-data
When the client subscribes to EURUSD price feed
Then the client receives price tick messages
  And each message contains: instrument, bid, ask, timestamp
  And bid < ask (valid spread)
```

**Preconditions:**
- WebSocket endpoint available
- Market data feed active

**Test Steps:**
1. Connect to /ws/market-data with auth token
2. Send subscribe message for EURUSD
3. Receive price ticks
4. Validate message structure

**Expected Results:**
- Price ticks received within 5 seconds
- Each tick has instrument, bid, ask, timestamp
- Spread is positive (bid < ask)

---

### TC-FUNC-BE-WS-002: Unsubscribe from Market Data Feed

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-WEBSOCKET

**BDD Scenario:**
```gherkin
Given an active subscription to EURUSD price feed
When the client sends unsubscribe message for EURUSD
Then no further EURUSD price ticks are received
  And the connection remains open
  And the client can subscribe to a different instrument
```

**Preconditions:**
- Active WebSocket subscription to EURUSD

**Test Steps:**
1. Subscribe to EURUSD
2. Verify ticks received
3. Unsubscribe from EURUSD
4. Wait 5 seconds, verify no more EURUSD ticks
5. Subscribe to GBPUSD, verify ticks received

**Expected Results:**
- No EURUSD ticks after unsubscribe
- Connection stays open
- GBPUSD subscription works

---

### TC-FUNC-BE-WS-003: WebSocket Authentication Failure

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Security
**Interface:** BE-WEBSOCKET

**BDD Scenario:**
```gherkin
Given no authentication token
When the client attempts to connect to /ws/market-data
Then the connection is rejected with close code 4401
  And the close reason indicates authentication required
```

**Preconditions:**
- WebSocket endpoint available

**Test Steps:**
1. Attempt WebSocket connection without auth token
2. Verify connection rejected
3. Check close code and reason

**Expected Results:**
- Connection rejected (not upgraded to WebSocket)
- Close code 4401 or similar auth error
- No market data leaked
