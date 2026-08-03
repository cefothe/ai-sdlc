---
name: code-validate-changes
description: Mini code review for WIP state that checks changes against the implementation plan at any point during development.
---

# /code:validate-changes

Mini code review for WIP state that considers the implementation plan.

## Purpose

Validate changes at any point during implementation (not just at PR time):
1. Check changes against the implementation plan
2. Catch issues early before they compound
3. Verify incremental progress is on track
4. Ensure quality gates are being met
5. Identify deviations that need course correction

**Use this when**: After completing a phase, before moving to the next step, or whenever you want a sanity check.

## Usage

```bash
# Validate all uncommitted changes
/code:validate-changes

# Validate against a specific plan
/code:validate-changes --plan=MP-123

# Validate specific phase completion
/code:validate-changes --phase=2

# Quick validation (essential checks only)
/code:validate-changes --quick

# Full validation with all agents
/code:validate-changes --thorough
```

## Validation Process

### Phase 1: Context Gathering
1. Load implementation plan (if exists)
2. Identify current phase/step
3. Get all changes (committed and uncommitted)
4. Determine expected state vs actual state

### Phase 2: Plan Alignment Check
```
Expected (from plan):
- [ ] File A should be created with X functionality
- [ ] File B should be modified to add Y
- [ ] Tests should cover Z scenarios

Actual (from changes):
- [ ] File A: ✅ Created, functionality matches
- [ ] File B: ⚠️ Modified, but missing edge case
- [ ] Tests: ❌ Only 2 of 4 scenarios covered
```

### Phase 3: Quality Gates (Phase-Appropriate)
Not full PR review - focused on current progress:
- [ ] Changes compile/lint without errors
- [ ] New code has corresponding tests
- [ ] No obvious security issues introduced
- [ ] No performance anti-patterns
- [ ] Consistent with existing patterns

### Phase 4: Incremental Test Verification
- Run tests for changed files only
- Verify new tests pass
- Check for test coverage of new code

### Phase 5: Course Correction Recommendations
- What needs to be fixed before proceeding?
- What can wait until later phases?
- Should we re-plan based on learnings?

## Validation Levels

### Quick (`--quick`)
- Syntax/compile check
- Linting
- Plan phase alignment
- ~30 seconds

### Standard (default)
- All quick checks
- Test execution for changed files
- Basic security scan
- Pattern consistency
- ~2 minutes

### Thorough (`--thorough`)
- All standard checks
- Full test suite
- Multi-agent review (lightweight)
- Performance baseline check
- ~5 minutes

## Output Format

```markdown
# WIP Validation Report

## Context
- Plan: {plan-file or "No plan found"}
- Current Phase: {N} of {M}
- Phase Goal: {description from plan}
- Changes: {N} files modified, {N} added, {N} deleted

## Plan Alignment

### Expected for Phase {N}:
From the plan, this phase should:
1. {expected deliverable 1}
2. {expected deliverable 2}
3. {expected deliverable 3}

### Actual Progress:
1. ✅ {deliverable 1}: Complete
2. ⚠️ {deliverable 2}: Partial - missing {specific gap}
3. ❌ {deliverable 3}: Not started

### Alignment Score: 7/10

## Quality Checks

| Check | Status | Details |
|-------|--------|---------|
| Compiles | ✅ | No errors |
| Lint | ⚠️ | 2 warnings (non-blocking) |
| Tests | ✅ | 12/12 passing |
| Coverage | ⚠️ | 78% (target: 90%) |
| Security | ✅ | No issues |
| Patterns | ✅ | Consistent with codebase |

## Issues Found

### Must Fix (Blocking)
1. **Missing test coverage**
   - File: `src/api/orders.ts`
   - New function `validateOrder()` has no tests
   - Impact: Cannot proceed to Phase 3

### Should Fix (Non-Blocking)
1. **Inconsistent error handling**
   - File: `src/api/orders.ts:45`
   - Uses `throw new Error()` but codebase uses custom errors
   - Recommendation: Use `OrderValidationError`

### Can Defer
1. **Performance optimization opportunity**
   - File: `src/db/queries.ts`
   - Query could use index hint
   - Recommendation: Address in Phase 4 (polish)

## Deviations from Plan

| Deviation | Severity | Justification Needed |
|-----------|----------|---------------------|
| Added utility function not in plan | Low | Acceptable if reusable |
| Skipped planned database migration | High | Requires re-planning |

## Recommendations

### Before Next Phase:
1. Add tests for `validateOrder()` function
2. Fix error handling consistency

### Consider Re-Planning If:
- Database migration is actually needed
- Scope has grown significantly

## Verdict
[ ] ✅ PROCEED - Ready for next phase
[ ] ⚠️ FIX FIRST - Address blocking issues
[ ] 🔄 RE-PLAN - Significant deviation detected
```

## Integration with Workflow

### Recommended Cadence
```
Plan Phase 1 → Implement → /code:validate-changes → Fix → Proceed
     ↓
Plan Phase 2 → Implement → /code:validate-changes → Fix → Proceed
     ↓
Plan Phase N → Implement → /code:validate-changes → Fix → PR
```

### With Other Commands
- **After `/code:explain-changes`**: Validate what you understood
- **Before `/code:commit`**: Ensure quality before committing
- **Before `/code:review-pr`**: Pre-flight check before formal review

## Differences from Other Commands

| Command | When | Scope | Depth |
|---------|------|-------|-------|
| `/code:validate-changes` | During development | WIP changes | Medium |
| `/code:validate-implementation` | End of implementation | Full feature | Deep |
| `/code:review-pr` | PR time | Complete PR | Comprehensive |

## Anti-Patterns This Catches

- Proceeding without tests
- Deviating from plan without acknowledgment
- Accumulating technical debt during implementation
- Skipping phases or steps
- Scope creep mid-implementation

## Notes

- Designed for rapid feedback (not full review)
- Plan-aware: knows what SHOULD be done vs what IS done
- Incremental: validates progress, not perfection
- Non-blocking by default: distinguishes must-fix from nice-to-have
