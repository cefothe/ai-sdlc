---
name: code-validate-implementation
description: Check the current branch against the ticket requirements using Native Teams validation.
---

# /dev:validate-implementation

Check the current branch against the ticket requirements.

## Launch Native Teams Validation

1. Create validation team:
   ```
   TeamCreate(team_name="validate-impl-{timestamp}")
   ```

2. Spawn ALL agents in parallel:

   **REQUIRED** teammates:
   ```
   Task(subagent_type="general-purpose", team_name="validate-impl-{timestamp}", name="code-review")
   Task(subagent_type="general-purpose", team_name="validate-impl-{timestamp}", name="test-validation")
   Task(subagent_type="security-auditor", team_name="validate-impl-{timestamp}", name="security")
   Task(subagent_type="general-purpose", team_name="validate-impl-{timestamp}", name="docs-config")
   ```

   **CONDITIONAL** teammates (based on changes):
   ```
   Task(subagent_type="performance-engineer", team_name=..., name="performance")  # if performance-critical
   Task(subagent_type="backend-architect", team_name=..., name="architecture")    # if architectural changes
   Task(subagent_type="android-expert", team_name=..., name="android")            # if Android changes
   Task(subagent_type="ios-expert", team_name=..., name="ios")                    # if iOS changes
   ```

3. Each writes to `~/.claude/teams/validate-impl-{timestamp}/state/findings/{name}.jsonl`

4. Aggregate findings from JSONL, produce validation report

5. Clean up:
   ```
   TeamDelete
   ```


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Implementation Completeness Check

- [ ] Does the implementation fully satisfy the acceptance criteria?
- [ ] Are all changes directly related to the ticket (no scope creep)?
- [ ] Are inputs, outputs, and side effects correct and well-documented?
- [ ] Does the feature integrate smoothly into the existing system?
- [ ] Are failure cases handled properly and logged where needed?
- [ ] Is the feature implementation maintainable and extensible?

## Code Quality Validation

- [ ] No code duplication introduced
- [ ] Consistent with existing codebase patterns
- [ ] Proper error handling and resource cleanup
- [ ] No dead or commented-out code
- [ ] Follows project naming conventions
- [ ] No over-engineering or unnecessary abstractions

## Test Coverage Validation

- [ ] New functionality has corresponding tests
- [ ] Tests are designed to reveal flaws (no cheater tests)
- [ ] Tests cover edge cases and error scenarios
- [ ] Tests are verbose for debugging purposes
- [ ] No mock services used (per CLAUDE.md rules)
- [ ] All tests pass consistently

## CLAUDE.md Compliance Check

Verify implementation follows ALL absolute rules:
- [ ] NO PARTIAL IMPLEMENTATION
- [ ] NO SIMPLIFICATION with TODO comments
- [ ] NO CODE DUPLICATION
- [ ] NO DEAD CODE
- [ ] COMPREHENSIVE TESTS for every function
- [ ] NO CHEATER TESTS
- [ ] CONSISTENT NAMING patterns
- [ ] NO OVER-ENGINEERING
- [ ] NO MIXED CONCERNS
- [ ] NO RESOURCE LEAKS
