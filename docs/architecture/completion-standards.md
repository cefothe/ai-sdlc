# Completion Standards - Zero Tolerance for Incomplete Work

## Critical Principle: GET IT RIGHT THE FIRST TIME

See protocol specification for complete details (paths resolved by ExecutionContext):
- Global: `~/.claude/protocols/first-time-right.yaml`
- Local: `project/.claude/protocols/first-time-right.yaml`

**No TODOs. No placeholders. No "refactor later". Complete, production-ready code on first implementation.**

---

## Definition of "Complete"

A task is only considered complete when ALL of the following are verified:

### BLOCKING REQUIREMENTS (must pass before any other checks)

1. ✅ **Zero TODO/FIXME comments** - Complete the work NOW, not later
2. ✅ **Zero placeholder implementations** - No `throw new UnsupportedOperationException()`
3. ✅ **Zero commented-out code** - Delete it (it's in git history)
4. ✅ **All error cases handled** - Every method has complete error handling
5. ✅ **All edge cases handled** - Null, empty, boundaries, concurrency
6. ✅ **All resources cleaned up** - Files, connections, listeners, memory
7. ✅ **Tests written WITH code** - Not after, WITH implementation

### STANDARD REQUIREMENTS (after blocking requirements pass)

8. ✅ **Code compiles** without warnings or errors
9. ✅ **All tests pass** (100% - with appropriate coverage for the project)
10. ✅ **Documentation updated** with implementation details where applicable
11. ✅ **Integration tested** with dependent components if applicable
12. ✅ **Acceptance criteria verified** by stakeholder or reviewer

---

## Anti-Patterns That Are NEVER Acceptable

- ❌ **Commented-out code** as "temporary" solutions
- ❌ **TODO comments** for core functionality
- ❌ **Placeholder methods** that throw UnsupportedOperationException or similar
- ❌ **"It works on my machine"** without proper integration testing
- ❌ **Missing error handling** with silent failures
- ❌ **Swallowing exceptions** without proper logging and re-throwing
- ❌ **Magic numbers** without constants or clear explanation
- ❌ **Null returns** instead of proper error handling or Optional
- ❌ **Incomplete implementations** marked for "later completion"

---

## Mandatory Error Handling Pattern

Every method must handle errors properly:

### ❌ NEVER DO THIS:

```javascript
function processData(data) {
    try {
        // business logic
    } catch (error) {
        // Silent failure - ABSOLUTELY FORBIDDEN
    }
}
```

**Problems**:
- Silent failures hide bugs
- No logging for debugging
- Cannot trace issues
- Violates fail-fast principle

### ✅ ALWAYS DO THIS:

```javascript
function processData(data) {
    if (!data) {
        throw new Error('Data parameter is required');
    }

    try {
        // business logic
    } catch (ValidationError error) {
        logger.error(`Data validation failed: ${error.message}`, error);
        throw new ProcessingError('Invalid data provided', error);
    } catch (error) {
        logger.error(`Unexpected error processing data: ${error.message}`, error);
        throw new ProcessingError('Failed to process data', error);
    }
}
```

**Best Practices**:
- Validate inputs first
- Catch specific exceptions
- Log all errors with context
- Re-throw with wrapped exception
- Preserve stack trace
- Provide actionable error messages

---

## Error Handling Checklist

For every method, verify:

- [ ] Input validation at method start
- [ ] Specific exception types (not generic `catch (Exception)`)
- [ ] Logging with context and stack trace
- [ ] Proper exception wrapping and re-throwing
- [ ] Resource cleanup in finally blocks
- [ ] No silent failures or swallowed exceptions
- [ ] Meaningful error messages for debugging

---

## Testing Standards

### Test Quality Requirements

- **No fictional APIs**: Always verify method signatures exist before writing tests
- **Complete mocks**: All required mock setup must be present and correct
- **Real constructors**: Use actual constructor signatures, not imagined ones
- **Error scenarios**: Test both success and failure cases
- **Integration coverage**: Test component interactions, not just unit logic

### Test Coverage Guidelines

| Project Type | Minimum Coverage | Testing Strategy |
|-------------|------------------|------------------|
| High-frequency systems | 95%+ | No mocks, cluster testing, performance invariants |
| Regulated systems | 95%+ | Appropriate mocking, approval workflows, audit trails |
| Web applications | 90%+ | Component testing, E2E testing, accessibility validation |
| Enterprise systems | 90%+ | Unit + integration + system testing |

### Test Structure

Every test must include:

```javascript
describe('Feature Name', () => {
    // Setup
    beforeEach(() => {
        // Initialize clean state
    });

    // Teardown
    afterEach(() => {
        // Clean up resources
    });

    // Happy path
    it('should handle valid input correctly', () => {
        // Arrange
        const input = validData();

        // Act
        const result = processData(input);

        // Assert
        expect(result).toBeDefined();
        expect(result.status).toBe('success');
    });

    // Error cases
    it('should throw error for null input', () => {
        expect(() => processData(null)).toThrow('Data parameter is required');
    });

    it('should handle validation errors', () => {
        const invalidInput = { /* invalid data */ };
        expect(() => processData(invalidInput)).toThrow(ValidationError);
    });

    // Edge cases
    it('should handle empty input', () => {
        expect(() => processData({})).toThrow();
    });

    it('should handle large input', () => {
        const largeInput = generateLargeDataset();
        const result = processData(largeInput);
        expect(result).toBeDefined();
    });
});
```

---

## Code Review Requirements

Before any code review or PR submission:

### 1. Self-Review Checklist

- [ ] No anti-patterns exist
- [ ] All error cases handled
- [ ] No TODO/FIXME comments
- [ ] No commented-out code
- [ ] No placeholder implementations
- [ ] All resources properly cleaned up
- [ ] Logging appropriate and informative

### 2. Run Full Test Suite

- [ ] All tests pass locally
- [ ] No flaky tests
- [ ] Coverage meets requirements
- [ ] Performance tests pass (if applicable)

### 3. Check for TODOs

- [ ] Remove all TODO comments
- [ ] Convert legitimate future work to proper issues
- [ ] Document any intentional limitations

### 4. Error Handling Audit

- [ ] All exceptions properly handled
- [ ] No swallowed exceptions
- [ ] Logging present for all error paths
- [ ] Error messages are actionable

### 5. Documentation Review

- [ ] API documentation updated
- [ ] README updated (if applicable)
- [ ] Inline comments for complex logic
- [ ] Architecture docs updated (if applicable)

---

## Quality Gates - Task Completion Only

**ENFORCED AT TASK COMPLETION**: Quality gates run when marking task complete (not during development)

### MINIMUM QUALITY SCORE: 8/10

Required to complete tasks

### Scoring Breakdown

- ✅ **Test Coverage**: ≥90% required
- ✅ **Code Complexity**: Within project limits
- ✅ **Documentation**: Complete and current
- ✅ **Performance**: Meets SLA requirements
- ✅ **Security**: No critical vulnerabilities

### Development Flow

During development, focus on progress:
- ❌ **Some tests failing** (while fixing) - ALLOWED
- ❌ **TODO comments** - ALLOWED temporarily
- ❌ **Work-in-progress commits** - ALLOWED

### Task Completion

When declaring task complete:

```markdown
## COMPLETION STATUS: ✅ COMPLETE

## QUALITY SCORE: X.X/10.0 (PASS/FAIL)
- Tests: X.X/3.0 (coverage + success + quality)
- Code: X.X/2.0 (complexity + style)
- Documentation: X.X/2.0 (API + project docs)
- Performance: X.X/2.0 (speed + resources)
- Security: X.X/1.0 (vulnerabilities + practices)

## BLOCKING GATES
- [x] All tests pass (100%)
- [x] Code compiles without errors
- [x] No security vulnerabilities
- [x] Documentation updated
```

---

## Cross-Agent Validation

**QUALITY ASSURANCE**: Each agent validates previous work

Required validators:
- ✅ **Code-review-architect**: Validates implementation quality
- ✅ **Test-runner**: Validates test completeness and success
- ✅ **File-analyzer**: Validates code changes and impacts

**Single agent completion REJECTED**: Must have cross-validation

---

## Common Completion Failures

### Failure 1: "It Mostly Works"

**Problem**: Core functionality works but edge cases fail

**Solution**: Test all edge cases before declaring complete
- Null/undefined inputs
- Empty collections
- Boundary values
- Concurrent access
- Resource exhaustion

### Failure 2: "I'll Add Tests Later"

**Problem**: Tests not written WITH implementation

**Solution**: Write tests DURING implementation
- Test-First TDD approach
- Task X.0 always writes tests FIRST
- Implementation follows test design

### Failure 3: "Just a Quick TODO"

**Problem**: TODO comments for core functionality

**Solution**: Complete the work NOW or create proper issue
- Remove all TODOs before commit
- If future work needed, create GitHub issue
- Document limitations in README, not code

### Failure 4: "Temporary Hack"

**Problem**: Commented-out code or placeholder implementations

**Solution**: Complete implementation or don't commit
- No commented-out code (use git history)
- No placeholders (throw UnsupportedOperationException)
- Production-ready code only

---

## CRITICAL: Task Completion Criteria

**A task is NEVER complete if**:

- ❌ **Build fails** - Fix compilation errors immediately
- ❌ **Tests fail** - Debug and fix test failures before moving on
- ❌ **Linting fails** - Address all linting issues
- ❌ **Type errors exist** - Resolve all type checking errors
- ❌ **Pre-validation skipped** - Must complete validation checklist
- ❌ **Quality score < 8/10** - Must meet minimum quality standards

**NEVER mark a task as complete, commit changes, or move to next task until**:

- ✅ **Pre-validation completed** - All prerequisites verified
- ✅ **Build succeeds** - Code compiles without errors
- ✅ **All tests pass** - No failing or broken tests
- ✅ **Lint passes** - No linting violations
- ✅ **Type check passes** - No type errors
- ✅ **Quality validated** - Meets all quality gates
- ✅ **Rollback tested** - Recovery procedure verified

---

## Final Checklist: Before Declaring Complete

Use this checklist before marking any task as complete:

### Code Quality
- [ ] Zero TODO/FIXME comments
- [ ] Zero placeholder implementations
- [ ] Zero commented-out code
- [ ] No magic numbers
- [ ] No code duplication
- [ ] Proper naming conventions

### Error Handling
- [ ] All error cases handled
- [ ] All edge cases handled
- [ ] Proper exception types
- [ ] Complete logging
- [ ] No swallowed exceptions
- [ ] Meaningful error messages

### Resource Management
- [ ] All files closed
- [ ] All connections released
- [ ] All listeners removed
- [ ] Memory properly freed
- [ ] No resource leaks

### Testing
- [ ] Tests written WITH code
- [ ] All tests pass
- [ ] Coverage meets requirements
- [ ] Edge cases tested
- [ ] Error cases tested
- [ ] Integration tested

### Documentation
- [ ] API docs updated
- [ ] README updated (if applicable)
- [ ] Inline comments for complex logic
- [ ] Architecture docs updated (if applicable)

### Validation
- [ ] Build succeeds
- [ ] Lint passes
- [ ] Type check passes
- [ ] Pre-validation completed
- [ ] Quality score ≥8/10
- [ ] Cross-agent validation complete

---

## See Also

- [Agent Protocols - first-time-right.yaml](./agent-protocols.md#7-first-time-rightyaml)
- [Validation Rules](./validation-rules.md)
- Quality Gates (paths resolved by ExecutionContext):
  - Global: `~/.claude/quality-gates/`
  - Local: `project/.claude/quality-gates/`
- Templates (paths resolved by ExecutionContext):
  - Global: `~/.claude/templates/`
  - Local: `project/.claude/templates/`
