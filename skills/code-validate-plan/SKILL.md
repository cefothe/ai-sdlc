---
name: code-validate-plan
description: Validate implementation plan conclusions from subagents for logical consistency and accuracy.
---


Validate conclusions from subagents using the main agent for 100% accuracy.

## Purpose

After `/code:plan` generates an implementation plan using multiple specialized agents, this command:
1. Reviews all agent conclusions for logical consistency
2. Identifies conflicts or gaps between agent recommendations
3. Validates technical accuracy of agent findings
4. Ensures the plan is actionable and complete
5. Catches errors in agent reasoning before implementation begins

**Use this when**: You want to verify the plan is trustworthy before investing time in implementation.

## Usage

```bash
# Validate the most recent plan
/code:validate-plan

# Validate a specific plan file
/code:validate-plan MP-123

# Validate with focus on specific concerns
/code:validate-plan MP-123 --focus=security,performance
```

## Validation Process

### Phase 1: Plan Retrieval
1. Locate the plan in `docs/implementation-plans/`
2. Extract agent conclusions and recommendations
3. Identify all claims that need verification

### Phase 2: Cross-Agent Consistency Check
Verify agents are aligned:
- [ ] No contradicting recommendations between agents
- [ ] Security and performance recommendations don't conflict
- [ ] Test strategy covers all implementation phases
- [ ] Architectural decisions align with existing patterns

### Phase 3: Technical Accuracy Validation
For each agent conclusion, verify:
- [ ] Referenced files actually exist
- [ ] Proposed patterns match codebase conventions
- [ ] Dependencies are available and compatible
- [ ] Time estimates are realistic for complexity
- [ ] Risk assessments are complete

### Phase 4: Completeness Audit
Ensure nothing is missing:
- [ ] All acceptance criteria have implementation steps
- [ ] Every implementation step has corresponding tests
- [ ] Error handling is planned for all failure modes
- [ ] Rollback strategy is feasible
- [ ] No implicit assumptions left unstated

### Phase 5: Actionability Check
Verify the plan can be executed:
- [ ] Steps are ordered correctly (dependencies respected)
- [ ] Each step is independently verifiable
- [ ] Commands and code snippets are syntactically correct
- [ ] File paths are accurate and complete

## Validation Categories

### Must Pass (Blocking)
- **Consistency**: No contradictions between agents
- **Accuracy**: All file references and patterns verified
- **Completeness**: All requirements have implementation steps
- **Testability**: Every change has verification method

### Should Pass (Warning)
- **Optimality**: Better approaches not identified
- **Efficiency**: No redundant or unnecessary steps
- **Clarity**: All steps are unambiguous

## Output Format

```markdown
# Plan Validation Report: {TICKET-ID}

## Summary
- Plan: {plan-file}
- Created: {date}
- Agents: {list}
- Validation: PASSED / FAILED / WARNINGS

## Cross-Agent Consistency
✅ No contradictions found
OR
❌ Conflict: {agent1} recommends X, but {agent2} recommends Y
   Resolution: {suggested resolution}

## Technical Accuracy
✅ All file references valid
✅ Patterns match codebase
OR
❌ Issue: {description}
   File: {path}
   Expected: {what should be}
   Found: {what was claimed}

## Completeness
✅ All acceptance criteria covered
OR
⚠️ Gap: Acceptance criterion "{criterion}" has no implementation step

## Actionability
✅ All steps can be executed as written
OR
❌ Issue: Step {N} cannot be executed
   Reason: {explanation}
   Fix: {suggested correction}

## Recommendations
1. {recommendation}
2. {recommendation}

## Verdict
[ ] APPROVED - Plan is ready for implementation
[ ] NEEDS REVISION - Issues must be fixed first
[ ] REJECTED - Plan requires major rework
```

## Integration with Workflow

1. **After `/code:plan`**: Run validate-plan before implementation
2. **Before `/code:implement-ticket`**: Ensure plan is validated
3. **If validation fails**: Return to planning phase with findings

## Anti-Patterns Detected

This command specifically catches:
- Agents agreeing without thorough analysis
- Copy-paste recommendations not tailored to context
- Missing edge cases in test strategy
- Optimistic time estimates without justification
- Security recommendations without implementation details

## Notes

- Validation typically takes 1-2 minutes
- Uses the main agent's broader context to verify specialist conclusions
- Does not re-run specialist agents (uses their existing output)
- Creates audit trail for plan decisions
