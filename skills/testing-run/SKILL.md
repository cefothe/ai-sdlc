---
name: testing-run
description: Run tests with proper configuration and reporting.
---

<!-- ai-sdlc:context-protocol:begin — generated from rules/context-protocol.md; edit there and run `node scripts/sync-context-protocol.js` -->
## Project context (read before acting)

1. **A SPECIFICATION / BUG FIX / SYSTEM ARCHITECTURE block in your prompt is the contract.** Work from it first.
2. **Otherwise — or when your work reaches beyond that block — consult the project's own documentation:**
   - `docs/architecture/overview.md`: components and the code each owns, the contracts that connect them, data ownership, invariants (monorepo: also `<subproject>/docs/architecture/overview.md`)
   - `docs/architecture/features/<feature>.md`: one feature / user journey across every component it touches — participants, end-to-end interactions, contracts, data ownership (`architecture_lookup` with `feature`)
   - `docs/product/context.md`: personas, glossary, current capabilities, regulatory constraints
   - the task's PRD (`docs/prd/`), design doc (`docs/design/`) or bug report (`docs/bugs/`), and the ADRs in `.ai-sdlc/_decisions/`
3. **Use the lookup tools when you have them:** ai-sdlc-context (`architecture_lookup`, `architecture_contracts`, `product_lookup`, `spec_lookup`, `decision_lookup`) and cxpak (`cxpak_graph` trace / blast_radius, `cxpak_insight` architecture / conventions; or `cxpak overview --tokens 6k [--workspace <subproject>]` via Bash). Never use cxpak's `cxpak_context` op `context` — it ignores the token budget.
4. **Never guess** which component owns a file, how two components connect, or what a domain term means — look it up. If it is not documented, say so and flag it instead of inventing it.
5. **Change code only in the component that owns it**, connect only through declared contracts, honor every invariant and recorded ADR. If one blocks the task, stop and flag it.
<!-- ai-sdlc:context-protocol:end -->

# Run Tests

Execute tests with the configured test-runner agent.


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Usage
```
/testing:run [test_target]
```

Where `test_target` can be:
- Empty (run all tests)
- Test file path
- Test pattern
- Test suite name

## Quick Check

```bash
# Check if testing is configured
test -f {projectRoot}/testing-config.md || echo "❌ Testing not configured. Run /testing:prime first"
```

If test target provided, verify it exists:
```bash
# For file targets
test -f "$ARGUMENTS" || echo "⚠️ Test file not found: $ARGUMENTS"
```

## Instructions

### 1. Determine Test Command

Based on testing-config.md and target:
- No arguments → Run full test suite from config
- File path → Run specific test file
- Pattern → Run tests matching pattern

### 2. Execute Tests

Use the test-runner agent from `{projectRoot}/agents/test-runner.md`:

```markdown
Execute tests for: $ARGUMENTS (or "all" if empty)

Requirements:
- Run with verbose output for debugging
- No mocks - use real services
- Capture full output including stack traces
- If test fails, check test structure before assuming code issue
```

### 3. Monitor Execution

- Show test progress
- Capture stdout and stderr
- Note execution time

### 4. Report Results

**Success:**
```
✅ All tests passed ({count} tests in {time}s)
```

**Failure:**
```
❌ Test failures: {failed_count} of {total_count}

{test_name} - {file}:{line}
  Error: {error_message}
  Likely: {test issue | code issue}
  Fix: {suggestion}

Run with more detail: /testing:run {specific_test}
```

**Mixed:**
```
Tests complete: {passed} passed, {failed} failed, {skipped} skipped

Failed:
- {test_1}: {brief_reason}
- {test_2}: {brief_reason}
```

### 5. Cleanup

```bash
# Kill any hanging test processes
pkill -f "jest|mocha|pytest" 2>/dev/null || true
```

## Error Handling

- Test command fails → "❌ Test execution failed: {error}. Check test framework is installed."
- Timeout → Kill process and report: "❌ Tests timed out after {time}s"
- No tests found → "❌ No tests found matching: $ARGUMENTS"

## Important Notes

- Always use test-runner agent for analysis
- No mocking - real services only
- Check test structure if failures occur
- Keep output focused on failures
