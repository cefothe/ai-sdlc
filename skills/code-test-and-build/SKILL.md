---
name: code-test-and-build
description: Check test suite and build process using Native Teams validation.
---


# /code:test-and-build

Check the test suite and build process in this branch.

## Launch Native Teams Build Validation

1. Create build team:
   ```
   TeamCreate(team_name="test-build-{timestamp}")
   ```

2. Spawn ALL agents in parallel:

   **REQUIRED** teammates:
   ```
   Task(subagent_type="general-purpose", team_name="test-build-{timestamp}", name="test-execution")
   Task(subagent_type="general-purpose", team_name="test-build-{timestamp}", name="static-analysis")
   Task(subagent_type="general-purpose", team_name="test-build-{timestamp}", name="build-config")
   ```

   **CONDITIONAL** teammates (based on project):
   ```
   Task(subagent_type="performance-engineer", team_name=..., name="build-performance")  # build/test perf
   Task(subagent_type="security-auditor", team_name=..., name="security-check")         # if security tools enabled
   ```

3. Each writes to `~/.claude/teams/test-build-{timestamp}/state/findings/{name}.jsonl`

4. Aggregate findings from JSONL, produce build/test report

5. Clean up:
   ```
   TeamDelete
   ```


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Pre-Build Validation

MANDATORY: Complete BEFORE running build/tests:
- [ ] Documentation checked for correct build commands
- [ ] Build system verified from docs (Maven vs Gradle vs npm)
- [ ] Clean build environment confirmed
- [ ] All dependencies available and up-to-date

## Build Validation

- [ ] Project builds successfully with no errors
- [ ] No compilation warnings in new/modified code
- [ ] All dependencies resolve correctly
- [ ] Build artifacts generated properly

## Test Execution Validation

MANDATORY: Launch **test-runner** agent for comprehensive analysis (prevents OOM):
- [ ] All unit tests pass (100% - no exceptions)
- [ ] All integration tests pass
- [ ] New tests added for new functionality
- [ ] Test coverage ≥90% for new/modified code
- [ ] Tests are deterministic and reliable (no flakiness)
- [ ] Tests follow verbose design for debugging
- [ ] No mock services used (per CLAUDE.md rules)

MEMORY OPTIMIZATION FOR TESTS:
- [ ] Large test outputs processed via test-runner agent
- [ ] Test results streamed, not accumulated in context
- [ ] Failed tests analyzed individually if many failures

## Code Quality Checks

- [ ] Lint passes with no violations
- [ ] Type checking passes (if applicable)
- [ ] No debugging code left (console.log, println, etc.)
- [ ] No TODO/FIXME comments in production code
- [ ] Code formatting consistent with project standards

## Quality Gates (ALL must pass to proceed)

- [ ] Build: Compiles without errors or warnings
- [ ] Tests: 100% pass rate, adequate coverage
- [ ] Lint: No style or quality violations
- [ ] Types: No type errors (if applicable)
- [ ] Performance: No obvious performance regressions
- [ ] Security: No obvious security issues

## Emergency Rollback Plan

If any quality gate fails:
- [ ] Document specific failure details
- [ ] Preserve current state (git stash if needed)
- [ ] Fix issues before proceeding
- [ ] Re-run full validation after fixes
- [ ] Never bypass quality gates
