# Developer Commands - Quick Reference Guide

**Quick lookup for common patterns and utilities when working with dev commands.**

---

## 📋 Table of Contents
- [Command Template](#command-template)
- [Shared Utilities Cheat Sheet](#shared-utilities-cheat-sheet)
- [Error Handling Patterns](#error-handling-patterns)
- [Validation Patterns](#validation-patterns)
- [Common Pitfalls](#common-pitfalls)

---

## Command Template

Copy this template when creating a new command:

```javascript
/**
 * Command Description
 *
 * Detailed explanation of what this command does.
 *
 * Usage:
 *   node ~/.claude/src/dev/command-name.js [args] [options]
 *
 * Examples:
 *   node ~/.claude/src/dev/command-name.js example-arg
 *   node ~/.claude/src/dev/command-name.js --option=value
 */

const Store = require('../intelligence/storage/store');

// Shared utilities
const { validateInput } = require('../utils/validators');
const {
  OperationError,
  ValidationError,
  StorageError,
  exitWithError
} = require('../utils/error-handler');
const { formatHeader, formatKeyValue } = require('../utils/format-utils');

class CommandName {
  constructor(deps = {}) {
    // Allow dependency injection for testing
    this.store = deps.store || new Store();
  }

  /**
   * Parse command line arguments
   *
   * @param {Array<string>} args - Command args
   * @returns {Object} Parsed options
   * @throws {ValidationError} If arguments are invalid
   */
  parseArgs(args) {
    const options = {
      // Default options
    };

    try {
      for (const arg of args) {
        // Parse arguments with validation
      }
      return options;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new OperationError('command-name', 'parse-args', error);
    }
  }

  /**
   * Format output
   *
   * @param {Object} data - Data to format
   * @returns {string} Formatted output
   */
  formatOutput(data) {
    const lines = [];
    lines.push(formatHeader('COMMAND OUTPUT', { width: 80 }));
    // Format output
    return lines.join('\n');
  }

  /**
   * Run command
   *
   * @param {Array<string>} args - Command arguments
   * @returns {Promise<void>}
   */
  async run(args) {
    try {
      // Phase 1: Parse arguments
      const options = await this.parseArgsWithContext(args);

      // Phase 2: Load/validate data
      const data = await this.loadDataWithContext();

      // Phase 3: Process
      const result = this.process(data, options);

      // Phase 4: Display result
      const output = this.formatOutput(result);
      console.log(output);
    } catch (error) {
      exitWithError(error);
    }
  }

  /**
   * Parse arguments with error context
   * @private
   */
  async parseArgsWithContext(args) {
    try {
      return this.parseArgs(args);
    } catch (error) {
      throw new OperationError('command-name', 'parse-args', error);
    }
  }

  /**
   * Load data with error context
   * @private
   */
  async loadDataWithContext() {
    try {
      const data = await this.store.load();
      if (!data) {
        throw new ValidationError(
          'No data found\n' +
          '  Initialize first: npm run command:init'
        );
      }
      return data;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new StorageError('load-data', 'data.json', error);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const command = new CommandName();
  const args = process.argv.slice(2);
  command.run(args);
}

module.exports = CommandName;
```

---

## Shared Utilities Cheat Sheet

### Git Operations
```javascript
const {
  getCurrentGitUser,
  getCurrentBranch,
  getCurrentCommit,
  getCommitsSince,
  isGitRepository
} = require('../utils/git-utils');

// Get current user
const username = getCurrentGitUser(); // "john-doe"

// Get current branch
const branch = getCurrentBranch(); // "feature/my-feature"

// Get commits since a specific commit
const commits = getCommitsSince('abc123');
// Returns: [{ sha, message, files: [{ name, additions, deletions }] }]

// Check if in git repo
if (isGitRepository()) {
  // Do git operations
}
```

### Label Parsing
```javascript
const {
  extractPriority,
  extractType,
  extractStoryPoints,
  extractAllMetadata
} = require('../utils/label-parser');

// Extract individual metadata
const priority = extractPriority(labels); // "high"
const type = extractType(labels); // "story"
const points = extractStoryPoints(labels); // 8

// BEST: Extract all at once (single pass - O(n))
const metadata = extractAllMetadata(labels);
// Returns: { priority: 'high', type: 'story', storyPoints: 8 }
```

### Validation
```javascript
const {
  validateTicketId,
  validateDeveloperUsername,
  validatePositiveInteger,
  validateEnum,
  sanitizeJQL
} = require('../utils/validators');

// Validate ticket ID
const ticketId = validateTicketId(input); // "PROJ-123" or throws

// Validate username (security - prevent injection)
const username = validateDeveloperUsername(input); // throws if invalid

// Validate positive integer with range
const days = validatePositiveInteger(value, 'days', { min: 1, max: 365 });

// Validate enum
const sortBy = validateEnum(value, ['velocity', 'tickets'], 'sort');

// Sanitize JQL (CRITICAL for security)
const safeValue = sanitizeJQL(userInput);
const jql = `assignee = "${safeValue}"`;
```

### Error Handling
```javascript
const {
  OperationError,
  ValidationError,
  ApiError,
  StorageError,
  ConfigurationError,
  exitWithError
} = require('../utils/error-handler');

// User input errors (exit code 1)
throw new ValidationError(
  'Invalid input\n' +
  '  Expected: npm run command <arg>\n' +
  '  Try: npm run command example'
);

// API errors (exit code 2)
throw new ApiError('fetch-tickets', 'JIRA', error, { retry: true });

// Storage errors (exit code 2)
throw new StorageError('load-data', 'data.json', error);

// Operation errors with context
throw new OperationError('command-name', 'phase-name', error);

// Exit with proper code and formatting
exitWithError(error);
```

### Formatting
```javascript
const {
  formatHeader,
  formatKeyValue,
  formatDuration,
  formatRelativeTime,
  formatPercentage,
  createSparkline,
  formatTable
} = require('../utils/format-utils');

// Header
lines.push(formatHeader('MY COMMAND OUTPUT', { width: 80 }));

// Key-value pairs
const data = {
  'Total': '10 tickets',
  'Success Rate': '85%',
  'Average Time': '2.5 hours'
};
lines.push(formatKeyValue(data, { labelWidth: 15, indent: 2 }));

// Duration
const duration = formatDuration(2.75); // "2 hours 45 minutes"

// Relative time
const when = formatRelativeTime('2024-10-28T10:00:00Z'); // "2 hours ago"

// Percentage with color
const percent = formatPercentage(85.5, { showColor: true, decimals: 1 });

// Sparkline for trends
const values = [2.5, 3.0, 2.8, 3.2, 3.5];
const sparkline = createSparkline(values); // "▃▅▄▆▇"

// Table
const tableData = [
  ['Name', 'Tickets', 'Points'],
  ['Alice', 5, 13],
  ['Bob', 3, 8]
];
lines.push(formatTable(tableData, { align: ['left', 'right', 'right'] }));
```

---

## Error Handling Patterns

### Pattern 1: Context Helper Methods
**Always wrap operations in context helpers:**

```javascript
// In run() method
const data = await this.loadDataWithContext();

// Context helper (private method)
/**
 * Load data with error context
 * @private
 */
async loadDataWithContext() {
  try {
    const data = await this.store.load();
    if (!data) {
      throw new ValidationError(
        'No data found\n' +
        '  Initialize first: npm run command:init'
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new StorageError('load-data', 'data.json', error);
  }
}
```

### Pattern 2: Validation Errors with Helpful Messages
**Always include actionable suggestions:**

```javascript
if (!ticketId) {
  throw new ValidationError(
    'Ticket ID is required\n' +
    '  Usage: npm run dev:start <ticket-id>\n\n' +
    '  Examples:\n' +
    '    npm run dev:start PROJ-123\n' +
    '    npm run dev:start #456'
  );
}
```

### Pattern 3: Preserve Original Error Context
**Don't lose the original error:**

```javascript
async loadDataWithContext() {
  try {
    return await this.store.load();
  } catch (error) {
    // Re-throw ValidationError as-is
    if (error instanceof ValidationError) throw error;

    // Wrap system errors with context
    throw new StorageError('load-data', 'data.json', error);
    //                      ^operation   ^file       ^original
  }
}
```

---

## Validation Patterns

### Pattern 1: Validate Early, Fail Fast
```javascript
parseArgs(args) {
  const options = { days: 30 };

  try {
    for (const arg of args) {
      if (arg.startsWith('--days=')) {
        const value = parseInt(arg.split('=')[1], 10);
        // Validate immediately - don't wait
        options.days = validatePositiveInteger(value, 'days', { min: 1, max: 365 });
      }
    }
    return options;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new OperationError('command-name', 'parse-args', error);
  }
}
```

### Pattern 2: Chain Validations
```javascript
// Validate multiple aspects
const ticketId = args[0];

// 1. Check presence
if (!ticketId) {
  throw new ValidationError('Ticket ID is required');
}

// 2. Validate format
validateTicketId(ticketId);

// 3. Additional checks
if (ticketId.startsWith('TEST-')) {
  throw new ValidationError('Test tickets not allowed in production');
}
```

### Pattern 3: Sanitize External Data
```javascript
// ALWAYS sanitize data going to external APIs
const username = validateDeveloperUsername(input); // prevent injection
const safeUsername = sanitizeJQL(username); // extra safety for JQL

const jql = `project = "${sanitizeJQL(projectKey)}" AND assignee = "${safeUsername}"`;
```

---

## Common Pitfalls

### ❌ DON'T: Hard-code dependencies
```javascript
// BAD - can't test
class Command {
  constructor() {
    this.store = new Store(); // Hard-coded!
  }
}
```

### ✅ DO: Use dependency injection
```javascript
// GOOD - testable
class Command {
  constructor(deps = {}) {
    this.store = deps.store || new Store();
  }
}
```

---

### ❌ DON'T: Swallow errors
```javascript
// BAD - loses error context
try {
  await this.store.load();
} catch (error) {
  console.error('Error loading data');
  process.exit(1);
}
```

### ✅ DO: Preserve error context
```javascript
// GOOD - preserves full context
async loadDataWithContext() {
  try {
    return await this.store.load();
  } catch (error) {
    throw new StorageError('load-data', 'data.json', error);
  }
}
```

---

### ❌ DON'T: Use execSync directly
```javascript
// BAD - duplicated code
getCurrentGitUser() {
  try {
    const email = execSync('git config user.email', { encoding: 'utf8' }).trim();
    return email.split('@')[0].replace(/\./g, '-');
  } catch (error) {
    throw new Error('Could not get git user');
  }
}
```

### ✅ DO: Use shared utilities
```javascript
// GOOD - uses shared utility
const { getCurrentGitUser } = require('../utils/git-utils');
const username = getCurrentGitUser();
```

---

### ❌ DON'T: Format output manually
```javascript
// BAD - inconsistent formatting
console.log('═'.repeat(80));
console.log(`  MY COMMAND`);
console.log('═'.repeat(80));
```

### ✅ DO: Use format utilities
```javascript
// GOOD - consistent formatting
const { formatHeader } = require('../utils/format-utils');
lines.push(formatHeader('MY COMMAND', { width: 80 }));
```

---

### ❌ DON'T: Skip input validation
```javascript
// BAD - vulnerable to injection
const jql = `assignee = "${username}"`;
```

### ✅ DO: Always validate and sanitize
```javascript
// GOOD - safe from injection
const { validateDeveloperUsername, sanitizeJQL } = require('../utils/validators');
validateDeveloperUsername(username);
const jql = `assignee = "${sanitizeJQL(username)}"`;
```

---

### ❌ DON'T: Use generic error messages
```javascript
// BAD - not helpful
throw new Error('Invalid input');
```

### ✅ DO: Provide actionable messages
```javascript
// GOOD - tells user what to do
throw new ValidationError(
  'Ticket ID is required\n' +
  '  Usage: npm run dev:start <ticket-id>\n' +
  '  Example: npm run dev:start PROJ-123'
);
```

---

### ❌ DON'T: Parse labels multiple times
```javascript
// BAD - O(n²) - iterates labels 3 times
const priority = extractPriority(labels);
const type = extractType(labels);
const points = extractStoryPoints(labels);
```

### ✅ DO: Parse once with extractAllMetadata
```javascript
// GOOD - O(n) - single pass
const { extractAllMetadata } = require('../utils/label-parser');
const { priority, type, storyPoints } = extractAllMetadata(labels);
```

---

## Testing Your Command

### Unit Test Template
```javascript
const CommandName = require('../src/dev/command-name');

describe('CommandName', () => {
  describe('parseArgs', () => {
    it('should parse valid arguments', () => {
      const command = new CommandName();
      const options = command.parseArgs(['--days=30', '--sort=velocity']);
      expect(options.days).toBe(30);
      expect(options.sortBy).toBe('velocity');
    });

    it('should throw ValidationError for invalid days', () => {
      const command = new CommandName();
      expect(() => {
        command.parseArgs(['--days=0']); // min is 1
      }).toThrow('days must be between 1 and 365');
    });
  });

  describe('run', () => {
    it('should execute successfully with mocked dependencies', async () => {
      const mockStore = {
        load: jest.fn().mockResolvedValue({ data: 'test' })
      };

      const command = new CommandName({ store: mockStore });
      await command.run(['--days=30']);

      expect(mockStore.load).toHaveBeenCalled();
    });
  });
});
```

---

## Performance Tips

### 1. Use Single-Pass Algorithms
```javascript
// GOOD - process all labels in one pass
const { extractAllMetadata } = require('../utils/label-parser');
const metadata = extractAllMetadata(labels);
```

### 2. Cache Git Operations
```javascript
// Cache branch name if used multiple times
this.currentBranch = this.currentBranch || getCurrentBranch();
```

### 3. Batch External API Calls
```javascript
// Load multiple tickets in one API call instead of loops
const tickets = await this.apiClient.fetchBatch(ticketIds);
```

---

## Quick Checklist

When creating/modifying a command, verify:

- [ ] ✅ Dependency injection in constructor
- [ ] ✅ Input validation in parseArgs()
- [ ] ✅ Context helper methods for all operations
- [ ] ✅ Shared utilities used (no duplication)
- [ ] ✅ Proper error types with context
- [ ] ✅ exitWithError() instead of process.exit()
- [ ] ✅ Consistent formatting (formatHeader, formatKeyValue)
- [ ] ✅ Phase-based run() method with comments
- [ ] ✅ JQL/input sanitization where applicable
- [ ] ✅ All tests passing after changes

---

## Need Help?

- **Architecture Overview:** `/Users/lb/.claude/docs/architecture/dev-commands-refactoring.md`
- **Shared Utilities:** `/Users/lb/.claude/src/utils/`
- **Example Commands:** `/Users/lb/.claude/src/dev/`
- **Tests:** `/Users/lb/.claude/test/`

---

**Last Updated:** 2025-10-28
