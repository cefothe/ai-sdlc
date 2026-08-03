# Shared Utilities API Reference

Complete API documentation for the 5 shared utility modules used across all dev commands.

---

## Table of Contents
1. [git-utils.js](#git-utilsjs) - Git operations
2. [label-parser.js](#label-parserjs) - Label metadata extraction
3. [validators.js](#validatorsjs) - Input validation and sanitization
4. [error-handler.js](#error-handlerjs) - Error handling and formatting
5. [format-utils.js](#format-utilsjs) - Output formatting

---

## git-utils.js

**Location:** `/Users/lb/.claude/src/utils/git-utils.js`
**Purpose:** Centralize all git operations with timeout protection and error handling

### Functions

#### `getCurrentGitUser()`
Extract username from git config email.

**Returns:** `string` - Username (e.g., "john-doe")
**Throws:** `Error` if git user cannot be determined

**Example:**
```javascript
const { getCurrentGitUser } = require('../utils/git-utils');

try {
  const username = getCurrentGitUser();
  console.log(username); // "john-doe"
} catch (error) {
  console.error('Git user not configured');
}
```

---

#### `getCurrentBranch()`
Get the current git branch name.

**Returns:** `string` - Branch name (e.g., "feature/my-feature")
**Throws:** `Error` if not in a git repository

**Example:**
```javascript
const { getCurrentBranch } = require('../utils/git-utils');

const branch = getCurrentBranch();
console.log(branch); // "feature/my-feature"
```

---

#### `getCurrentCommit()`
Get the current commit SHA.

**Returns:** `string` - Commit SHA (e.g., "abc123def456")
**Throws:** `Error` if not in a git repository

**Example:**
```javascript
const { getCurrentCommit } = require('../utils/git-utils');

const commit = getCurrentCommit();
console.log(commit); // "abc123def456"
```

---

#### `getCommitsSince(baseCommit, options)`
Get all commits since a specific commit with file statistics.

**Parameters:**
- `baseCommit` (string) - Base commit SHA to start from
- `options` (object, optional) - Configuration options
  - `timeout` (number) - Timeout in milliseconds (default: 10000)

**Returns:** `Array<Object>` - Array of commit objects
```javascript
[
  {
    sha: "abc123",
    message: "feat: add new feature",
    files: [
      { name: "src/file.js", additions: 10, deletions: 5 }
    ]
  }
]
```

**Throws:** `Error` if git operation fails

**Example:**
```javascript
const { getCommitsSince } = require('../utils/git-utils');

const commits = getCommitsSince('abc123def456');
console.log(`${commits.length} commits since start`);

commits.forEach(commit => {
  console.log(`${commit.sha}: ${commit.message}`);
  console.log(`  Files changed: ${commit.files.length}`);
});
```

---

#### `isGitRepository()`
Check if current directory is a git repository.

**Returns:** `boolean` - True if in git repo

**Example:**
```javascript
const { isGitRepository } = require('../utils/git-utils');

if (isGitRepository()) {
  // Perform git operations
} else {
  console.log('Not in a git repository');
}
```

---

## label-parser.js

**Location:** `/Users/lb/.claude/src/utils/label-parser.js`
**Purpose:** Extract metadata from issue labels (Jira/GitHub)

### Functions

#### `extractPriority(labels)`
Extract priority from labels.

**Parameters:**
- `labels` (Array<Object>) - Array of label objects with `name` property

**Returns:** `string` - Priority level: "critical", "high", "medium", "low", or "medium" (default)

**Supported Formats:**
- `priority:high`, `Priority: High`
- `p0`, `p1`, `p2`, `p3`
- `critical`, `high`, `medium`, `low`

**Example:**
```javascript
const { extractPriority } = require('../utils/label-parser');

const labels = [
  { name: 'priority:high' },
  { name: 'bug' }
];

const priority = extractPriority(labels);
console.log(priority); // "high"
```

---

#### `extractType(labels)`
Extract issue type from labels.

**Parameters:**
- `labels` (Array<Object>) - Array of label objects with `name` property

**Returns:** `string` - Type: "story", "task", "bug", "spike", or "task" (default)

**Supported Formats:**
- `type:story`, `Type: Story`
- `story`, `Story`, `User Story`
- `task`, `Task`, `Feature`
- `bug`, `Bug`, `Defect`
- `spike`, `Spike`, `Research`

**Example:**
```javascript
const { extractType } = require('../utils/label-parser');

const labels = [
  { name: 'type:story' },
  { name: 'high-priority' }
];

const type = extractType(labels);
console.log(type); // "story"
```

---

#### `extractStoryPoints(labels)`
Extract story points from labels.

**Parameters:**
- `labels` (Array<Object>) - Array of label objects with `name` property

**Returns:** `number` - Story points (1-100), or 3 (default)

**Supported Formats:**
- `points:5`, `Points: 5`
- `5 points`, `5 Points`, `5pts`
- `SP: 5`, `sp-5`

**Example:**
```javascript
const { extractStoryPoints } = require('../utils/label-parser');

const labels = [
  { name: 'points:8' },
  { name: 'story' }
];

const points = extractStoryPoints(labels);
console.log(points); // 8
```

---

#### `extractAllMetadata(labels)` ⭐ **RECOMMENDED**
Extract all metadata in a single pass (O(n) performance).

**Parameters:**
- `labels` (Array<Object>) - Array of label objects with `name` property

**Returns:** `Object` - All metadata
```javascript
{
  priority: "high",
  type: "story",
  storyPoints: 8
}
```

**Performance:** O(n) - Single pass over labels (vs O(n²) calling each function separately)

**Example:**
```javascript
const { extractAllMetadata } = require('../utils/label-parser');

const labels = [
  { name: 'priority:high' },
  { name: 'type:story' },
  { name: 'points:8' }
];

const metadata = extractAllMetadata(labels);
console.log(metadata);
// { priority: "high", type: "story", storyPoints: 8 }
```

---

## validators.js

**Location:** `/Users/lb/.claude/src/utils/validators.js`
**Purpose:** Input validation and sanitization to prevent injection attacks

### Security Functions

#### `sanitizeJQL(value)` 🔒 **SECURITY-CRITICAL**
Sanitize string for use in JQL queries. **Prevents JQL injection attacks.**

**Parameters:**
- `value` (string) - Value to sanitize

**Returns:** `string` - Sanitized value with escaped special characters

**Escapes:** `\` `"` `'` `\n` `\r`

**Example:**
```javascript
const { sanitizeJQL } = require('../utils/validators');

// Prevent JQL injection
const username = sanitizeJQL(userInput);
const jql = `assignee = "${username}"`;

// Before: userInput = '" OR 1=1 OR "'
// After: username = '\" OR 1=1 OR \"'
// Safe query: assignee = "\" OR 1=1 OR \""
```

---

#### `validateDeveloperUsername(username)` 🔒 **SECURITY-CRITICAL**
Validate developer username to prevent injection attacks.

**Parameters:**
- `username` (string) - Username to validate

**Returns:** `string` - Validated username
**Throws:** `ValidationError` if invalid

**Rules:**
- 3-50 characters
- Alphanumeric, dash, underscore, period only
- No spaces, no special characters

**Example:**
```javascript
const { validateDeveloperUsername } = require('../utils/validators');

try {
  const username = validateDeveloperUsername('john-doe');
  // Use username safely
} catch (error) {
  console.error('Invalid username format');
}
```

---

#### `validatePath(path)` 🔒 **SECURITY-CRITICAL**
Validate file path to prevent path traversal attacks.

**Parameters:**
- `path` (string) - File path to validate

**Returns:** `string` - Validated path
**Throws:** `ValidationError` if contains `..` or null bytes

**Example:**
```javascript
const { validatePath } = require('../utils/validators');

try {
  const path = validatePath(userProvidedPath);
  // Safe to use path for file operations
} catch (error) {
  console.error('Path traversal attempt detected');
}
```

---

### Validation Functions

#### `validateTicketId(ticketId)`
Validate Jira/GitHub ticket ID format.

**Parameters:**
- `ticketId` (string) - Ticket ID to validate

**Returns:** `string` - Validated ticket ID
**Throws:** `ValidationError` if invalid format

**Supported Formats:**
- Jira: `PROJ-123`, `ABC-999`
- GitHub: `#123`, `#999`

**Example:**
```javascript
const { validateTicketId } = require('../utils/validators');

try {
  const ticketId = validateTicketId('PROJ-123');
  // Valid format
} catch (error) {
  console.error('Invalid ticket ID format');
}
```

---

#### `validatePositiveInteger(value, name, options)`
Validate positive integer with optional range constraints.

**Parameters:**
- `value` (number) - Value to validate
- `name` (string) - Parameter name for error messages
- `options` (object, optional)
  - `min` (number) - Minimum value (inclusive)
  - `max` (number) - Maximum value (inclusive)

**Returns:** `number` - Validated integer
**Throws:** `ValidationError` if invalid

**Example:**
```javascript
const { validatePositiveInteger } = require('../utils/validators');

// Simple positive integer
const count = validatePositiveInteger(value, 'count');

// With range constraints
const days = validatePositiveInteger(value, 'days', { min: 1, max: 365 });
```

---

#### `validateEnum(value, allowedValues, name)`
Validate that value is in allowed set.

**Parameters:**
- `value` (string) - Value to validate
- `allowedValues` (Array<string>) - Array of valid values
- `name` (string) - Parameter name for error messages

**Returns:** `string` - Validated value
**Throws:** `ValidationError` if not in allowed set

**Example:**
```javascript
const { validateEnum } = require('../utils/validators');

const sortBy = validateEnum(
  value,
  ['velocity', 'success_rate', 'tickets', 'points'],
  'sort'
);
```

---

#### `validateDate(dateString)`
Validate date string format.

**Parameters:**
- `dateString` (string) - Date string to validate

**Returns:** `Date` - Validated Date object
**Throws:** `ValidationError` if invalid date

**Example:**
```javascript
const { validateDate } = require('../utils/validators');

try {
  const date = validateDate('2024-10-28');
  // Valid date
} catch (error) {
  console.error('Invalid date format');
}
```

---

## error-handler.js

**Location:** `/Users/lb/.claude/src/utils/error-handler.js`
**Purpose:** Centralized error handling with context preservation

### Error Classes

#### `OperationError`
Generic error with operation and phase context.

**Constructor:**
```javascript
new OperationError(operation, phase, originalError)
```

**Parameters:**
- `operation` (string) - Operation name (e.g., "view-metrics")
- `phase` (string) - Phase where error occurred (e.g., "load-data")
- `originalError` (Error) - Original error

**Example:**
```javascript
const { OperationError } = require('../utils/error-handler');

try {
  await someOperation();
} catch (error) {
  throw new OperationError('command-name', 'phase-name', error);
}
```

---

#### `ValidationError`
User input validation errors. **Exit code: 1**

**Constructor:**
```javascript
new ValidationError(message)
```

**Parameters:**
- `message` (string) - User-friendly error message with suggestions

**Best Practice:** Include actionable suggestions

**Example:**
```javascript
const { ValidationError } = require('../utils/error-handler');

if (!ticketId) {
  throw new ValidationError(
    'Ticket ID is required\n' +
    '  Usage: npm run dev:start <ticket-id>\n' +
    '  Example: npm run dev:start PROJ-123'
  );
}
```

---

#### `ApiError`
External API errors. **Exit code: 2**

**Constructor:**
```javascript
new ApiError(operation, service, originalError, context)
```

**Parameters:**
- `operation` (string) - API operation
- `service` (string) - Service name (e.g., "JIRA", "GitHub")
- `originalError` (Error) - Original error
- `context` (object, optional) - Additional context

**Example:**
```javascript
const { ApiError } = require('../utils/error-handler');

try {
  await jiraClient.fetch();
} catch (error) {
  throw new ApiError('fetch-tickets', 'JIRA', error, { retry: true });
}
```

---

#### `StorageError`
File system errors. **Exit code: 2**

**Constructor:**
```javascript
new StorageError(operation, filePath, originalError)
```

**Parameters:**
- `operation` (string) - Storage operation
- `filePath` (string) - File path
- `originalError` (Error) - Original error

**Example:**
```javascript
const { StorageError } = require('../utils/error-handler');

try {
  await fs.readFile(path);
} catch (error) {
  throw new StorageError('load-data', 'data.json', error);
}
```

---

#### `ConfigurationError`
Configuration errors. **Exit code: 3**

**Constructor:**
```javascript
new ConfigurationError(message, configKey)
```

**Parameters:**
- `message` (string) - Error message
- `configKey` (string, optional) - Config key that's missing/invalid

**Example:**
```javascript
const { ConfigurationError } = require('../utils/error-handler');

if (!config.apiKey) {
  throw new ConfigurationError(
    'JIRA API key not configured',
    'jira.apiKey'
  );
}
```

---

### Functions

#### `formatError(error)`
Format error for user-friendly display.

**Parameters:**
- `error` (Error) - Error to format

**Returns:** `string` - Formatted error message

**Example:**
```javascript
const { formatError } = require('../utils/error-handler');

try {
  // operation
} catch (error) {
  console.error(formatError(error));
}
```

---

#### `exitWithError(error)`
Exit with appropriate code based on error type.

**Parameters:**
- `error` (Error) - Error to handle

**Exit Codes:**
- `1` - ValidationError (user error, fix input)
- `2` - ApiError, StorageError (system error, retry)
- `3` - ConfigurationError (fix config)

**Example:**
```javascript
const { exitWithError } = require('../utils/error-handler');

async run(args) {
  try {
    // command logic
  } catch (error) {
    exitWithError(error); // Exits with proper code
  }
}
```

---

## format-utils.js

**Location:** `/Users/lb/.claude/src/utils/format-utils.js`
**Purpose:** Consistent formatting across all commands

### Functions

#### `formatHeader(text, options)`
Format a header with borders.

**Parameters:**
- `text` (string) - Header text
- `options` (object, optional)
  - `width` (number) - Total width (default: 80)
  - `char` (string) - Border character (default: '═')

**Returns:** `string` - Formatted header

**Example:**
```javascript
const { formatHeader } = require('../utils/format-utils');

const header = formatHeader('DEVELOPER METRICS', { width: 80 });
console.log(header);
// ════════════════════════════════════════════════════════════════════════════════
//   DEVELOPER METRICS
// ════════════════════════════════════════════════════════════════════════════════
```

---

#### `formatKeyValue(pairs, options)`
Format key-value pairs with alignment.

**Parameters:**
- `pairs` (Object) - Key-value pairs
- `options` (object, optional)
  - `labelWidth` (number) - Width for labels (default: 20)
  - `indent` (number) - Left indent spaces (default: 2)

**Returns:** `string` - Formatted output

**Example:**
```javascript
const { formatKeyValue } = require('../utils/format-utils');

const data = {
  'Total Tickets': 10,
  'Success Rate': '85%',
  'Average Time': '2.5 hours'
};

console.log(formatKeyValue(data, { labelWidth: 15, indent: 4 }));
//     Total Tickets:  10
//     Success Rate:   85%
//     Average Time:   2.5 hours
```

---

#### `formatDuration(hours)`
Format duration in human-readable format.

**Parameters:**
- `hours` (number) - Duration in hours

**Returns:** `string` - Formatted duration

**Examples:**
```javascript
const { formatDuration } = require('../utils/format-utils');

formatDuration(0.5);   // "30 minutes"
formatDuration(1.0);   // "1 hour"
formatDuration(2.75);  // "2 hours 45 minutes"
formatDuration(25);    // "1 day 1 hour"
formatDuration(49.5);  // "2 days 1 hour 30 minutes"
```

---

#### `formatRelativeTime(timestamp)`
Format time relative to now.

**Parameters:**
- `timestamp` (string|Date) - Timestamp to format

**Returns:** `string` - Relative time

**Examples:**
```javascript
const { formatRelativeTime } = require('../utils/format-utils');

formatRelativeTime('2024-10-28T10:00:00Z');
// "2 hours ago" (if current time is 12:00)
// "1 day ago" (if next day)
// "just now" (if < 1 minute ago)
```

---

#### `formatPercentage(value, options)`
Format percentage with optional color indicators.

**Parameters:**
- `value` (number) - Percentage value (0-100)
- `options` (object, optional)
  - `decimals` (number) - Decimal places (default: 1)
  - `showColor` (boolean) - Show color indicators (default: false)

**Returns:** `string` - Formatted percentage

**Example:**
```javascript
const { formatPercentage } = require('../utils/format-utils');

formatPercentage(85.5);                              // "85.5%"
formatPercentage(85.5, { decimals: 0 });            // "86%"
formatPercentage(95.0, { showColor: true });        // "95.0% ✅"
formatPercentage(50.0, { showColor: true });        // "50.0% ⚠️"
```

---

#### `createSparkline(values)`
Create ASCII sparkline for trend visualization.

**Parameters:**
- `values` (Array<number>) - Values to visualize

**Returns:** `string` - Sparkline characters

**Characters:** `▁▂▃▄▅▆▇█` (8 levels)

**Example:**
```javascript
const { createSparkline } = require('../utils/format-utils');

const velocities = [2.5, 3.0, 2.8, 3.2, 3.5, 3.1, 3.4];
const sparkline = createSparkline(velocities);
console.log(sparkline); // "▃▅▄▆▇▅▇"
```

---

#### `formatTable(data, options)`
Format data as a table.

**Parameters:**
- `data` (Array<Array>) - 2D array (first row = headers)
- `options` (object, optional)
  - `align` (Array<string>) - Column alignments: "left", "right", "center"
  - `padding` (number) - Cell padding (default: 2)

**Returns:** `string` - Formatted table

**Example:**
```javascript
const { formatTable } = require('../utils/format-utils');

const data = [
  ['Name', 'Tickets', 'Points'],
  ['Alice', 5, 13],
  ['Bob', 3, 8]
];

console.log(formatTable(data, { align: ['left', 'right', 'right'] }));
// Name     Tickets  Points
// Alice          5      13
// Bob            3       8
```

---

#### `formatList(items, options)`
Format array as bulleted list.

**Parameters:**
- `items` (Array<string>) - List items
- `options` (object, optional)
  - `bullet` (string) - Bullet character (default: '•')
  - `indent` (number) - Indentation (default: 2)

**Returns:** `string` - Formatted list

**Example:**
```javascript
const { formatList } = require('../utils/format-utils');

const items = ['First item', 'Second item', 'Third item'];
console.log(formatList(items, { bullet: '-', indent: 4 }));
//     - First item
//     - Second item
//     - Third item
```

---

## Usage Best Practices

### 1. Always Use Shared Utilities
```javascript
// ❌ DON'T duplicate
getCurrentGitUser() {
  const email = execSync('git config user.email', { encoding: 'utf8' }).trim();
  return email.split('@')[0].replace(/\./g, '-');
}

// ✅ DO use shared utility
const { getCurrentGitUser } = require('../utils/git-utils');
const username = getCurrentGitUser();
```

### 2. Validate All User Inputs
```javascript
const { validateTicketId, validateDeveloperUsername } = require('../utils/validators');

// Validate before using
const ticketId = validateTicketId(userInput);
const username = validateDeveloperUsername(userInput);
```

### 3. Preserve Error Context
```javascript
const { StorageError } = require('../utils/error-handler');

try {
  return await this.store.load();
} catch (error) {
  // Wrap with context - don't lose original error
  throw new StorageError('load-data', 'data.json', error);
}
```

### 4. Use Consistent Formatting
```javascript
const { formatHeader, formatKeyValue } = require('../utils/format-utils');

// Consistent output across all commands
lines.push(formatHeader('COMMAND OUTPUT', { width: 80 }));
lines.push(formatKeyValue(data, { labelWidth: 15 }));
```

---

**Last Updated:** 2025-10-28
**Version:** 1.0
**Status:** Complete - All utilities documented
