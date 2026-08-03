# Project Conventions

## Error Handling
- All public functions return `{ success: boolean, data?, error? }` — never throw
- Use logger for all error conditions before returning
- Include error codes: VALIDATION_ERROR, AUTH_ERROR, RATE_LIMIT, NOT_FOUND, INTERNAL

## Configuration
- All magic numbers must come from src/config/index.js
- Never hardcode thresholds, limits, or header names

## Testing
- Tests use node:test runner (not Jest)
- One test file per source module in tests/
- Test files mirror source structure
- Test both success and error paths

## Code Style
- CommonJS (require/module.exports)
- Prefer const over let, never var
- Functions should be < 30 lines
- All modules export named functions/classes (no default exports)
