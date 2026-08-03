# Test Execution

## Always use the test-runner agent

Use the test-runner subagent for all test execution. It captures full output,
analyzes failures, and surfaces actionable issues.

## Principles

- No mocking — use real services for accurate results
- Verbose output — capture everything for debugging
- One test at a time — don't move on until current passes
- Check test structure before assuming code bugs

## Cleanup

Always clean up after tests:
```bash
pkill -f "jest|mocha|pytest" 2>/dev/null || true
```
