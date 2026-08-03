---
name: sample-mixed-chunked
feature: Order Management System
generated_by: /qa:functional-tests (sample for eval)
interface_types: [UI-WEB, BE-REST, BE-FIX, BE-WEBSOCKET, INTEGRATION]
total_tests: 25
---

# Functional Test Cases: Order Management System

## Shared Preconditions

- API base URL configured via environment
- WebSocket endpoint available at ws://{base_url}/ws/orders
- FIX gateway available on configured port
- Test accounts provisioned in test environment
- Authentication service available

## Test Data

- Account ACC-TRADE-001: Active, balance $100,000.00, currency USD
- Account ACC-TRADE-002: Active, balance $500.00, currency USD (low balance)
- Account ACC-TRADE-003: Active, balance $50,000.00, currency EUR
- Instrument AAPL: Active, min lot 1, max lot 10000, tick size 0.01
- Instrument EURUSD: Active FX pair, min lot 1000, pip size 0.0001
- Instrument INVALID-001: Delisted

---

### TC-FUNC-BE-REST-001: Submit Market Order - Happy Path

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with account "ACC-TRADE-001"
When the client sends POST /api/v1/orders with body:
  | field      | value       |
  | instrument | AAPL        |
  | side       | BUY         |
  | type       | MARKET      |
  | quantity   | 100         |
Then the API responds with HTTP 201 Created
  And the response contains a valid orderId
  And the order status is "PENDING"
```

**Preconditions:**
- Valid JWT token for ACC-TRADE-001
- AAPL instrument is active and tradeable

**Test Steps:**
1. Authenticate via POST /api/v1/auth/login
2. Submit market order via POST /api/v1/orders
3. Verify HTTP 201 response
4. Validate orderId format and status

**Expected Results:**
- HTTP 201 Created
- orderId is non-null UUID format
- status is "PENDING"
- instrument is "AAPL"

---

### TC-FUNC-BE-REST-002: Submit Limit Order with Price

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with account "ACC-TRADE-001"
When the client sends POST /api/v1/orders with body:
  | field      | value       |
  | instrument | AAPL        |
  | side       | BUY         |
  | type       | LIMIT       |
  | quantity   | 50          |
  | price      | 150.25      |
Then the API responds with HTTP 201 Created
  And the order price is 150.25
  And the order type is "LIMIT"
```

**Preconditions:**
- Valid JWT token for ACC-TRADE-001

**Test Steps:**
1. Authenticate and submit limit order
2. Verify response fields

**Expected Results:**
- HTTP 201 Created
- price is 150.25
- type is "LIMIT"

---

### TC-FUNC-BE-REST-003: Get Order by ID

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an existing order with known orderId
When the client sends GET /api/v1/orders/{orderId}
Then the API responds with HTTP 200 OK
  And the response matches the submitted order
```

**Preconditions:**
- An order has been previously created

**Test Steps:**
1. Create an order via POST /api/v1/orders
2. Retrieve it via GET /api/v1/orders/{orderId}
3. Validate all fields match

**Expected Results:**
- HTTP 200 OK
- All order fields match original submission

---

### TC-FUNC-BE-REST-004: Cancel Pending Order

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an existing order in "PENDING" status
When the client sends DELETE /api/v1/orders/{orderId}
Then the API responds with HTTP 200 OK
  And the order status changes to "CANCELLED"
```

**Preconditions:**
- A pending order exists

**Test Steps:**
1. Create a limit order
2. Cancel via DELETE /api/v1/orders/{orderId}
3. Verify cancellation

**Expected Results:**
- HTTP 200 OK
- status is "CANCELLED"

---

### TC-FUNC-BE-REST-005: Submit Order - Insufficient Balance

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client with account "ACC-TRADE-002" (balance $500)
When the client submits a BUY order for 10000 shares of AAPL
Then the API responds with HTTP 400 Bad Request
  And the error code is "INSUFFICIENT_BALANCE"
```

**Preconditions:**
- ACC-TRADE-002 has low balance ($500)

**Test Steps:**
1. Authenticate as ACC-TRADE-002
2. Submit large order exceeding balance
3. Verify rejection

**Expected Results:**
- HTTP 400 Bad Request
- error code "INSUFFICIENT_BALANCE"

---

### TC-FUNC-BE-REST-006: Submit Order - Invalid Instrument

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client submits an order for instrument "INVALID-001"
Then the API responds with HTTP 400 Bad Request
  And the error code is "INSTRUMENT_NOT_TRADEABLE"
```

**Preconditions:**
- INVALID-001 is delisted

**Test Steps:**
1. Submit order with delisted instrument
2. Verify rejection

**Expected Results:**
- HTTP 400 Bad Request
- error code "INSTRUMENT_NOT_TRADEABLE"

---

### TC-FUNC-BE-REST-007: List Orders with Pagination

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an account with multiple orders
When the client sends GET /api/v1/orders?page=0&size=10
Then the API responds with HTTP 200 OK
  And the response contains pagination metadata
  And results are sorted by createdAt descending
```

**Preconditions:**
- Multiple orders exist for the account

**Test Steps:**
1. Create 3 orders
2. List with pagination
3. Verify pagination metadata and sort order

**Expected Results:**
- HTTP 200 OK
- totalElements >= 3
- content array length <= 10
- Sorted by createdAt descending

---

### TC-FUNC-BE-REST-008: Submit Order - Missing Required Fields

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Validation
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client sends POST /api/v1/orders with empty body
Then the API responds with HTTP 400 Bad Request
  And the response contains field validation errors
```

**Preconditions:**
- Valid authentication

**Test Steps:**
1. Submit order with empty body
2. Verify validation error response

**Expected Results:**
- HTTP 400 Bad Request
- errors array contains entries for instrument, side, type, quantity

---

### TC-FUNC-BE-REST-009: Submit Order - Quantity Below Minimum

**Priority:** P2 (Medium)
**Category:** Functional
**Subcategory:** Boundary
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given an authenticated client
When the client submits an order with quantity 0
Then the API responds with HTTP 400 Bad Request
  And the error references minimum quantity
```

**Preconditions:**
- Valid authentication

**Test Steps:**
1. Submit order with quantity 0
2. Verify rejection with quantity validation error

**Expected Results:**
- HTTP 400 Bad Request
- Error references quantity constraint

---

### TC-FUNC-BE-REST-010: Submit Order - Unauthorized

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Security
**Interface:** BE-REST

**BDD Scenario:**
```gherkin
Given no authentication token
When the client sends POST /api/v1/orders
Then the API responds with HTTP 401 Unauthorized
```

**Preconditions:**
- No JWT token provided

**Test Steps:**
1. Submit order without Authorization header
2. Verify 401 response

**Expected Results:**
- HTTP 401 Unauthorized
- No order data leaked

---

### TC-FUNC-BE-FIX-001: Submit FIX New Order Single (35=D)

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given a FIX session is established
When the client sends a NewOrderSingle (35=D) message:
  | tag  | value       |
  | 11   | CL-ORD-001  |
  | 55   | AAPL        |
  | 54   | 1 (BUY)     |
  | 40   | 1 (MARKET)  |
  | 38   | 100         |
Then the gateway responds with ExecutionReport (35=8)
  And ExecType (150) is "0" (New)
  And OrdStatus (39) is "0" (New)
```

**Preconditions:**
- FIX session established with valid SenderCompID/TargetCompID
- Account mapped to FIX session

**Test Steps:**
1. Establish FIX session
2. Send NewOrderSingle
3. Receive and validate ExecutionReport

**Expected Results:**
- ExecutionReport received
- ExecType=0, OrdStatus=0
- ClOrdID matches sent value

---

### TC-FUNC-BE-FIX-002: Cancel FIX Order (35=F)

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given an active order submitted via FIX
When the client sends OrderCancelRequest (35=F) with OrigClOrdID
Then the gateway responds with ExecutionReport (35=8)
  And ExecType (150) is "4" (Cancelled)
  And OrdStatus (39) is "4" (Cancelled)
```

**Preconditions:**
- FIX session established
- An order exists in New status

**Test Steps:**
1. Submit NewOrderSingle
2. Send OrderCancelRequest referencing ClOrdID
3. Validate cancellation ExecutionReport

**Expected Results:**
- ExecutionReport with ExecType=4, OrdStatus=4

---

### TC-FUNC-BE-FIX-003: FIX Order Reject - Invalid Symbol

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** BE-FIX

**BDD Scenario:**
```gherkin
Given a FIX session is established
When the client sends NewOrderSingle with Symbol (55) = "INVALID-001"
Then the gateway responds with OrderReject (35=8)
  And ExecType (150) is "8" (Rejected)
  And OrdRejReason (103) indicates invalid symbol
```

**Preconditions:**
- FIX session established

**Test Steps:**
1. Send NewOrderSingle with invalid symbol
2. Validate reject ExecutionReport

**Expected Results:**
- ExecType=8 (Rejected)
- OrdRejReason present

---

### TC-FUNC-BE-WS-001: Subscribe to Order Updates

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** BE-WEBSOCKET

**BDD Scenario:**
```gherkin
Given an authenticated WebSocket connection to /ws/orders
When the client subscribes to order updates for account "ACC-TRADE-001"
  And a new order is submitted via REST API
Then the WebSocket receives an order update message
  And the message contains orderId, status, and timestamp
```

**Preconditions:**
- WebSocket endpoint available
- Valid authentication token

**Test Steps:**
1. Connect to WebSocket endpoint with auth token
2. Subscribe to order updates
3. Submit order via REST API
4. Verify WebSocket receives update

**Expected Results:**
- WebSocket message received within 5 seconds
- Message contains orderId matching REST response
- status field present

---

### TC-FUNC-BE-WS-002: WebSocket Reconnection After Disconnect

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Resilience
**Interface:** BE-WEBSOCKET

**BDD Scenario:**
```gherkin
Given an active WebSocket subscription
When the connection is dropped and re-established
Then the client can re-subscribe successfully
  And receives new order updates after reconnection
```

**Preconditions:**
- WebSocket endpoint available

**Test Steps:**
1. Establish connection and subscribe
2. Force disconnect
3. Reconnect and re-subscribe
4. Submit order and verify update received

**Expected Results:**
- Reconnection succeeds
- Subscription re-established
- Updates received after reconnection

---

### TC-FUNC-UI-WEB-001: Place Market Order via UI

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is logged in and on the trading dashboard
When the user selects instrument "AAPL"
  And enters quantity "100"
  And selects order type "Market"
  And clicks "Buy"
Then a confirmation dialog appears with order details
  And after confirming, a success notification is shown
  And the order appears in the open orders panel
```

**Preconditions:**
- User authenticated (via API)
- Trading dashboard loaded

**Test Steps:**
1. Navigate to trading dashboard
2. Select AAPL from instrument picker
3. Enter quantity 100
4. Select Market order type
5. Click Buy button
6. Confirm in dialog
7. Verify success notification and order in panel

**Expected Results:**
- Confirmation dialog shows correct details
- Success notification appears
- Order visible in open orders with status PENDING

---

### TC-FUNC-UI-WEB-002: Cancel Order from Open Orders Panel

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given a pending order exists in the open orders panel
When the user clicks the cancel button for that order
  And confirms cancellation
Then the order status changes to "CANCELLED"
  And a cancellation notification is shown
```

**Preconditions:**
- A pending order exists (created via API)
- User on trading dashboard

**Test Steps:**
1. Create order via API
2. Navigate to trading dashboard
3. Locate order in open orders panel
4. Click cancel button
5. Confirm cancellation
6. Verify status update and notification

**Expected Results:**
- Order status changes to CANCELLED
- Notification shown

---

### TC-FUNC-UI-WEB-003: View Order History with Filters

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user has multiple completed orders
When the user navigates to Order History
  And filters by instrument "AAPL"
Then only AAPL orders are displayed
  And orders are sorted by date descending
```

**Preconditions:**
- Multiple orders exist (created via API)
- At least 2 different instruments

**Test Steps:**
1. Create orders for AAPL and EURUSD via API
2. Navigate to Order History page
3. Apply instrument filter for AAPL
4. Verify filtered results

**Expected Results:**
- Only AAPL orders shown
- Sorted by date descending
- Total count matches expected

---

### TC-FUNC-UI-WEB-004: Order Form Validation - Empty Quantity

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Validation
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the order entry form
When the user selects instrument and order type but leaves quantity empty
  And clicks "Buy"
Then a validation error is shown for the quantity field
  And no order is submitted
```

**Preconditions:**
- User on trading dashboard

**Test Steps:**
1. Navigate to trading dashboard
2. Select instrument and order type
3. Leave quantity empty
4. Click Buy
5. Verify validation error

**Expected Results:**
- Inline validation error on quantity field
- Buy button action blocked
- No API call made

---

### TC-FUNC-UI-WEB-005: Real-Time Price Update on Dashboard

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Real-Time
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is viewing the trading dashboard for "AAPL"
When a price update occurs
Then the bid/ask prices update in real-time
  And the price change indicator shows the correct direction
```

**Preconditions:**
- User on trading dashboard
- WebSocket price feed active

**Test Steps:**
1. Navigate to trading dashboard
2. Select AAPL
3. Wait for price update
4. Verify bid/ask display updates

**Expected Results:**
- Prices update without page refresh
- Change indicator (up/down arrow) correct

---

### TC-FUNC-UI-WEB-006: Login Page - Invalid Credentials

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Error Handling
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the login page
When the user enters invalid email and password
  And clicks "Sign In"
Then an error message "Invalid credentials" is displayed
  And the user remains on the login page
```

**Preconditions:**
- User not authenticated

**Test Steps:**
1. Navigate to login page
2. Enter invalid credentials
3. Click Sign In
4. Verify error message

**Expected Results:**
- Error message displayed
- User stays on login page
- No sensitive information leaked in error

---

### TC-FUNC-UI-WEB-007: Responsive Layout - Mobile Viewport

**Priority:** P2 (Medium)
**Category:** Functional
**Subcategory:** Responsiveness
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the trading dashboard is loaded
When the viewport is resized to 375x812 (mobile)
Then the layout adapts to single-column
  And the order panel is accessible via hamburger menu
  And all critical trading functions remain accessible
```

**Preconditions:**
- User authenticated and on dashboard

**Test Steps:**
1. Load dashboard at desktop resolution
2. Resize to 375x812
3. Verify layout adaptation
4. Access order panel via menu
5. Verify trading functions work

**Expected Results:**
- Single-column layout
- Hamburger menu visible
- Order entry functional at mobile size

---

### TC-FUNC-UI-WEB-008: Account Balance Display After Trade

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Data Consistency
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is viewing account summary
When an order is executed (simulated via API)
Then the displayed balance updates to reflect the trade
  And the P&L section shows the position
```

**Preconditions:**
- User on dashboard with account summary visible

**Test Steps:**
1. Note initial balance displayed
2. Execute order via API
3. Wait for UI to update
4. Verify balance changed
5. Verify P&L section updated

**Expected Results:**
- Balance reflects trade impact
- P&L section shows new position

---

### TC-FUNC-INT-001: End-to-End Order Lifecycle via REST + WebSocket

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Integration
**Interface:** INTEGRATION-REST-WS

**BDD Scenario:**
```gherkin
Given an authenticated REST client and WebSocket subscription
When the client submits a market order via REST API
Then the REST response contains orderId with status "PENDING"
  And the WebSocket receives status updates: PENDING → FILLED
  And GET /api/v1/orders/{orderId} shows final status "FILLED"
```

**Preconditions:**
- REST API and WebSocket both available
- Account with sufficient balance

**Test Steps:**
1. Establish WebSocket connection and subscribe
2. Submit market order via REST
3. Collect WebSocket updates
4. Verify final state via REST GET

**Expected Results:**
- REST 201 with orderId
- WebSocket receives PENDING then FILLED updates
- Final GET shows FILLED status

---

### TC-FUNC-INT-002: FIX Order Visible in REST API

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Integration
**Interface:** INTEGRATION-FIX-REST

**BDD Scenario:**
```gherkin
Given a FIX session and REST API access for the same account
When the client submits an order via FIX NewOrderSingle
  And the FIX gateway responds with ExecutionReport (New)
Then the order is visible via GET /api/v1/orders
  And the order details match the FIX submission
```

**Preconditions:**
- FIX session and REST API both available
- Same account accessible via both

**Test Steps:**
1. Submit order via FIX
2. Wait for ExecutionReport
3. List orders via REST API
4. Verify FIX order appears with matching details

**Expected Results:**
- Order visible in REST API
- Instrument, side, quantity, type match FIX submission
- Order has consistent orderId across both interfaces
