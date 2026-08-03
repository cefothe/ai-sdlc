---
name: sample-ui-only
feature: Portfolio Dashboard UI
generated_by: /qa:functional-tests (sample for eval)
interface_types: [UI-WEB]
total_tests: 10
---

# Functional Test Cases: Portfolio Dashboard UI

## Shared Preconditions

- Application base URL configured via environment
- Test user provisioned with portfolio data
- Authentication service available
- WebSocket price feed active

## Test Data

- User: test-user@example.com / TestPass123!
- Portfolio: 5 positions (AAPL, GOOGL, MSFT, TSLA, AMZN)
- Account balance: $250,000.00
- Unrealized P&L: +$12,500.00

---

### TC-FUNC-UI-WEB-001: Login and Navigate to Portfolio Dashboard

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the login page
When the user enters valid credentials
  And clicks "Sign In"
Then the user is redirected to the portfolio dashboard
  And the portfolio summary is displayed with total value and P&L
```

**Preconditions:**
- User account exists and is active

**Test Steps:**
1. Navigate to login page
2. Enter email and password
3. Click Sign In
4. Verify dashboard loads with portfolio summary

**Expected Results:**
- Dashboard loads within 3 seconds
- Portfolio total value displayed
- P&L section visible

---

### TC-FUNC-UI-WEB-002: Portfolio Positions Table - Data Display

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the portfolio dashboard
When the positions table loads
Then all 5 positions are displayed
  And each row shows: symbol, quantity, avg price, current price, P&L, P&L %
```

**Preconditions:**
- User authenticated (via API)
- Portfolio has 5 positions

**Test Steps:**
1. Navigate to portfolio dashboard
2. Wait for positions table to load
3. Verify all positions displayed
4. Validate column data for each row

**Expected Results:**
- 5 rows in positions table
- All columns populated with non-empty values
- P&L values formatted with currency symbol

---

### TC-FUNC-UI-WEB-003: Sort Positions by P&L

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the positions table is displayed
When the user clicks the "P&L" column header
Then positions are sorted by P&L descending
When the user clicks "P&L" again
Then positions are sorted by P&L ascending
```

**Preconditions:**
- User on dashboard with positions loaded

**Test Steps:**
1. Click P&L column header
2. Verify descending sort
3. Click again
4. Verify ascending sort

**Expected Results:**
- First click: highest P&L at top
- Second click: lowest P&L at top
- Sort indicator icon updates

---

### TC-FUNC-UI-WEB-004: Search/Filter Positions

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the positions table is displayed
When the user types "AAPL" in the search/filter input
Then only the AAPL position row is visible
  And other positions are hidden
When the user clears the search
Then all positions are visible again
```

**Preconditions:**
- User on dashboard with positions loaded

**Test Steps:**
1. Type "AAPL" in search input
2. Verify only AAPL row shown
3. Clear search input
4. Verify all rows restored

**Expected Results:**
- Filter applies in real-time (no button click needed)
- Only matching rows visible
- Clearing restores all rows

---

### TC-FUNC-UI-WEB-005: Portfolio Chart - Time Period Toggle

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the portfolio performance chart is displayed
When the user clicks "1W" time period button
Then the chart updates to show 1-week data
When the user clicks "1M"
Then the chart updates to show 1-month data
```

**Preconditions:**
- User on dashboard with chart loaded

**Test Steps:**
1. Verify default chart period (1D)
2. Click 1W button
3. Verify chart updates
4. Click 1M button
5. Verify chart updates

**Expected Results:**
- Active period button is highlighted
- Chart x-axis range matches selected period
- Chart data points update

---

### TC-FUNC-UI-WEB-006: Position Detail - Click to Expand

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the positions table is displayed
When the user clicks on the AAPL row
Then a detail panel expands below the row
  And shows: open orders, trade history, position analytics
When the user clicks the row again
Then the detail panel collapses
```

**Preconditions:**
- User on dashboard with positions loaded

**Test Steps:**
1. Click AAPL row
2. Verify detail panel expands
3. Verify detail sections present
4. Click row again
5. Verify panel collapses

**Expected Results:**
- Smooth expand/collapse animation
- Detail panel shows trade history
- Only one detail panel open at a time

---

### TC-FUNC-UI-WEB-007: Close Position Button - Confirmation Dialog

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user has expanded the AAPL position detail
When the user clicks "Close Position"
Then a confirmation dialog appears showing:
  - Position details (symbol, quantity, estimated proceeds)
  - "Confirm" and "Cancel" buttons
When the user clicks "Cancel"
Then the dialog closes and no action is taken
```

**Preconditions:**
- User on dashboard with AAPL detail expanded
- AAPL position created via API

**Test Steps:**
1. Expand AAPL position detail
2. Click Close Position
3. Verify dialog content
4. Click Cancel
5. Verify position unchanged

**Expected Results:**
- Dialog shows correct position details
- Cancel dismisses dialog
- Position remains open

---

### TC-FUNC-UI-WEB-008: Dashboard Loading State - Skeleton Screen

**Priority:** P2 (Medium)
**Category:** Functional
**Subcategory:** UX
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user navigates to the portfolio dashboard
When data is loading
Then skeleton placeholders are shown for:
  - Portfolio summary cards
  - Positions table
  - Performance chart
And once data loads, skeletons are replaced with real content
```

**Preconditions:**
- User authenticated

**Test Steps:**
1. Navigate to dashboard
2. Observe loading state
3. Verify skeletons appear
4. Wait for data to load
5. Verify content replaces skeletons

**Expected Results:**
- Skeleton screens visible during load
- No layout shift when data arrives
- All sections populated after load

---

### TC-FUNC-UI-WEB-009: Responsive Layout - Tablet Viewport

**Priority:** P2 (Medium)
**Category:** Functional
**Subcategory:** Responsiveness
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the portfolio dashboard is loaded at desktop resolution
When the viewport is resized to 768x1024 (tablet)
Then the layout adapts:
  - Chart moves below summary cards
  - Positions table scrolls horizontally if needed
  - All data remains accessible
```

**Preconditions:**
- User authenticated and on dashboard

**Test Steps:**
1. Load dashboard at 1920x1080
2. Resize to 768x1024
3. Verify layout adaptation
4. Verify all data accessible
5. Verify horizontal scroll on positions table

**Expected Results:**
- Two-column to single-column layout transition
- No data truncation
- Horizontal scroll available for wide table

---

### TC-FUNC-UI-WEB-010: Notification Toast - Order Execution Alert

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Real-Time
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the portfolio dashboard
When an order is executed (triggered via API)
Then a toast notification appears with:
  - Order details (instrument, side, quantity, price)
  - "View Details" link
  And the notification auto-dismisses after 5 seconds
```

**Preconditions:**
- User on dashboard
- WebSocket connection active

**Test Steps:**
1. Navigate to dashboard
2. Execute order via API
3. Wait for toast notification
4. Verify notification content
5. Verify auto-dismiss after 5 seconds

**Expected Results:**
- Toast appears within 3 seconds of execution
- Shows correct order details
- Auto-dismisses after 5 seconds
- "View Details" link navigates to order
