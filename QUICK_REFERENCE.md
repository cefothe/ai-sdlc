# Quick Reference - Claude Code Cheat Sheet

## Most Used Commands

### Project Management
```bash
/pm:status          # Current project status
/pm:next            # Next recommended task
/pm:prd-new         # Create new PRD
/pm:epic-new        # Create new epic
/pm:sync            # Sync with Jira/GitHub
```

### Developer Workflow
```bash
/dev:next           # What should I work on?
/dev:start MP-123   # Start work session
/dev:status         # Check progress
/dev:blocker "..."  # Record blocker
/dev:done           # Complete session
/dev:metrics        # View metrics
```

### Code Tasks
```bash
/code:plan MP-123           # Create implementation plan
/code:validate-plan         # Verify plan accuracy (before implementing)
/code:implement-ticket      # Implement from plan
/code:explain-changes       # Walk through what just changed
/code:validate-changes      # WIP quality check (during implementation)
/code:review-pr             # Review pull request
/code:test                  # Run test suite
```

### AI SDLC Lifecycle
```bash
/ai-sdlc:init [dir]         # Scaffold .ai-sdlc/ + backlog into a repo (brownfield-safe)
/ai-sdlc:new "<title>"      # Product panel (PM/PO+CMO/CPO) shapes a PRODUCT-ONLY PRD
/ai-sdlc:design <slug>      # Architect panel -> design doc + comprehensive ADRs (the technical how)
/ai-sdlc:execute <task-id>  # Run one backlog task through the full pipeline
/ai-sdlc:review [base]      # Standalone cross-harness review team on a branch
```

---

## Critical Rules

### First-Time-Right
- ❌ No TODO comments
- ❌ No placeholder implementations
- ✅ Tests written WITH code (not after)
- ✅ All tests must pass before commit
- ✅ Complete error handling required
- ✅ Production-ready code on first implementation

### Parallel Execution
- ✅ **MUST** run in parallel when tasks are independent
- 1-2 agents: Use single message with multiple Task tool calls
- 3+ agents: Use Native Teams (TeamCreate → Task with team_name → JSONL → TeamDelete)
- ✅ NEVER create multiple issues sequentially
- ✅ ALWAYS spawn agents simultaneously

### Build System
- ✅ **ALWAYS** read documentation FIRST (CLAUDE.md, README.md)
- ❌ **NEVER** assume build system from file presence
- ✅ Documentation trumps file presence
- ✅ Verify before every build/test command

---

## Agent Selection

### Core Analysis (Always Use)
- **Files >1000 lines** → file-analyzer
- **Multi-file tracing** → code-analyzer
- **Test execution** → test-runner

### Architecture
- **API design** → backend-architect
- **Infrastructure** → cloud-architect
- **Design review** → architect-review

### Performance & Security
- **Performance** → performance-engineer
- **Backend security** → backend-security-coder
- **Frontend security** → frontend-security-coder
- **Security audit** → security-auditor

### Language Specialists
- **Java** → java-pro
- **TypeScript** → typescript-pro
- **Python** → python-pro
- **Go** → golang-pro
- **Rust** → rust-pro

---

## Validation Checklist

### Before ANY Operation
- [ ] Documentation reviewed (CLAUDE.md, README.md)
- [ ] Build system identified
- [ ] Dependencies available
- [ ] Pre-conditions met
- [ ] Rollback plan exists

### Before Commit
- [ ] All tests pass (100%)
- [ ] Build succeeds
- [ ] No lint errors
- [ ] No type errors
- [ ] No TODO comments
- [ ] Documentation updated

### Before Declaring Complete
- [ ] Zero TODOs
- [ ] Zero placeholders
- [ ] All error cases handled
- [ ] All tests written and passing
- [ ] Quality score ≥8/10
- [ ] Cross-agent validation complete

---

## Context Management

### Thresholds
- **85% usage**: Warning, prepare summary
- **90% usage**: MUST handoff to fresh agent
- **95% usage**: Emergency handoff

### Optimization
- Files >1000 lines → MUST use file-analyzer
- Multiple file reads → MUST batch in parallel
- High context usage → Spawn fresh agent

---

## Error Handling Pattern

### ❌ Never Do This
```javascript
try {
    // logic
} catch (error) {
    // Silent failure - FORBIDDEN
}
```

### ✅ Always Do This
```javascript
if (!data) {
    throw new Error('Data parameter is required');
}

try {
    // logic
} catch (ValidationError error) {
    logger.error(`Validation failed: ${error.message}`, error);
    throw new ProcessingError('Invalid data', error);
}
```

---

## Agent Protocols Quick Check

### When Agent Starts
1. Read ~/.claude/CLAUDE.md
2. Read project/.claude/CLAUDE.md
3. Read project/README.md
4. Detect context type
5. Acknowledge constraints
6. Validate can proceed

### When Gathering Information
1. Check source code first
2. Check official docs
3. Verify version matches
4. Score confidence (high/medium/low)
5. If low confidence → ask user

### When Making Changes
1. Why is this necessary?
2. What's the simplest approach?
3. Can I reuse existing code?
4. Check complexity budget
5. Monitor compliance

---

## Emergency Procedures

### Context Overflow
```
1. Create summary of work so far
2. Spawn fresh agent with summary
3. Hand off task to new agent
4. Original agent exits
```

### Build Failure
```
1. Stop immediately
2. Check documentation for correct build system
3. Verify all dependencies installed
4. Run clean build
5. If still failing → ask user
```

### Test Failures
```
1. DO NOT move forward
2. Analyze failure root cause
3. Fix implementation OR fix test
4. Re-run tests
5. All must pass before continuing
```

---

## Common Workflows

### Epic to Implementation
```
1. /pm:epic-new                  # Create epic
2. /pm:epic-decompose            # Break into tasks
3. /dev:next                     # Get recommended task
4. /code:plan MP-123             # Create implementation plan
5. /code:validate-plan           # Verify plan accuracy
6. /dev:start MP-123             # Start work
7. [implement phase N]
8. /code:explain-changes         # Understand what changed
9. /code:validate-changes        # Check progress before next phase
10. [repeat 7-9 for each phase]
11. /dev:done                    # Complete and sync
12. Repeat steps 3-11 for each task
```

### Bug Fix
```
1. /dev:start BUG-456            # Start work
2. code-analyzer → find root cause
3. test-runner → reproduce bug
4. Implement fix
5. test-runner → verify fix
6. /dev:done                     # Complete
```

### Native Teams
```bash
/teams:init              # Initialize team for current task
/teams:status            # Show team status
/teams:findings          # View aggregated JSONL findings
/teams:synthesize        # Synthesize findings into report
/teams:benchmark         # Run benchmark comparison
```

### Code Review
```
1. code-review-architect → comprehensive review
2. security-auditor → security check
3. test-runner → verify tests pass
4. Provide detailed feedback
5. Approve or request changes
```

---

## See Complete Documentation

- [Agent Protocols](docs/architecture/agent-protocols.md)
- [Agent Catalog](docs/architecture/agent-catalog.md)
- [Command Reference](docs/quick-reference/command-reference.md)
- [Parallel Execution](docs/architecture/parallel-execution.md)
- [Completion Standards](docs/architecture/completion-standards.md)
- [Validation Rules](docs/architecture/validation-rules.md)
- [Full CLAUDE.md](CLAUDE.md)
