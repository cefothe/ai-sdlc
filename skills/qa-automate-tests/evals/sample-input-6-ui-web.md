---
name: sample-ui-web-skip-exploration
feature: Account Settings UI
generated_by: /qa:functional-tests (sample for eval)
interface_types: [UI-WEB]
total_tests: 6
---

# Functional Test Cases: Account Settings UI

## Shared Preconditions

- Application base URL configured via environment
- Test user provisioned with verified account
- Authentication service available

## Test Data

- User: settings-user@example.com / TestPass123!
- Display name: Test User
- Timezone: UTC
- Language: English

---

### TC-FUNC-UI-WEB-001: Navigate to Account Settings Page

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is authenticated
When the user clicks the profile avatar in the top navigation
  And clicks "Account Settings"
Then the account settings page loads
  And the profile section is displayed with current user details
```

**Preconditions:**
- User authenticated via API

**Test Steps:**
1. Navigate to dashboard
2. Click profile avatar
3. Click Account Settings menu item
4. Verify settings page loads

**Expected Results:**
- Settings page loads within 2 seconds
- Profile section shows display name, email, timezone
- Navigation breadcrumb shows "Account > Settings"

---

### TC-FUNC-UI-WEB-002: Update Display Name

**Priority:** P0 (Critical)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the account settings page
When the user clears the display name field
  And enters "Updated Name"
  And clicks "Save Changes"
Then a success toast notification appears
  And the display name field shows "Updated Name"
```

**Preconditions:**
- User on account settings page

**Test Steps:**
1. Clear display name input
2. Enter "Updated Name"
3. Click Save Changes button
4. Verify success notification
5. Verify field value updated

**Expected Results:**
- Success toast: "Settings saved successfully"
- Display name field shows "Updated Name"
- Profile avatar initials update to "UN"

---

### TC-FUNC-UI-WEB-003: Change Timezone Selection

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the account settings page
When the user opens the timezone dropdown
  And selects "Europe/London"
  And clicks "Save Changes"
Then the timezone is updated to "Europe/London"
  And timestamps on the page reflect the new timezone
```

**Preconditions:**
- User on account settings page
- Current timezone is UTC

**Test Steps:**
1. Click timezone dropdown
2. Select "Europe/London"
3. Click Save Changes
4. Verify timezone updated
5. Verify timestamp display changes

**Expected Results:**
- Dropdown shows "Europe/London" after selection
- Success notification displayed
- Last login timestamp adjusts to new timezone

---

### TC-FUNC-UI-WEB-004: Display Name Validation - Empty Field

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Negative
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the account settings page
When the user clears the display name field
  And clicks "Save Changes"
Then an inline validation error appears: "Display name is required"
  And the save is not submitted
```

**Preconditions:**
- User on account settings page

**Test Steps:**
1. Clear display name input
2. Click Save Changes
3. Verify validation error appears
4. Verify no success notification

**Expected Results:**
- Inline error below display name field: "Display name is required"
- Save button remains enabled
- No API call made (client-side validation)

---

### TC-FUNC-UI-WEB-005: Toggle Email Notification Preferences

**Priority:** P1 (High)
**Category:** Functional
**Subcategory:** Happy Path
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user is on the account settings page
When the user scrolls to "Notification Preferences"
  And toggles off "Trade Execution Alerts"
  And clicks "Save Changes"
Then the toggle shows as disabled
  And a success notification appears
```

**Preconditions:**
- User on account settings page
- Trade Execution Alerts currently enabled

**Test Steps:**
1. Scroll to Notification Preferences section
2. Click Trade Execution Alerts toggle
3. Verify toggle visually changes to off
4. Click Save Changes
5. Verify success notification

**Expected Results:**
- Toggle animates from on to off state
- Success toast displayed
- Refreshing the page shows toggle still off

---

### TC-FUNC-UI-WEB-006: Settings Page - Unsaved Changes Warning

**Priority:** P2 (Medium)
**Category:** Functional
**Subcategory:** Edge Case
**Interface:** UI-WEB

**BDD Scenario:**
```gherkin
Given the user has modified the display name but not saved
When the user clicks the browser back button or navigates away
Then a confirmation dialog appears: "You have unsaved changes"
  And offers "Stay" and "Leave" options
When the user clicks "Stay"
Then the dialog closes and the user remains on settings page
```

**Preconditions:**
- User on account settings page

**Test Steps:**
1. Modify display name field
2. Click navigation link (e.g., Dashboard)
3. Verify unsaved changes dialog appears
4. Click "Stay"
5. Verify still on settings page with changes preserved

**Expected Results:**
- Dialog blocks navigation when changes exist
- "Stay" keeps user on page with modifications intact
- "Leave" navigates away and discards changes
