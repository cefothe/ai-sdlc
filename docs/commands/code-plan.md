# `/code:plan` Command Documentation

## Overview

The `/code:plan` command generates comprehensive, bulletproof implementation plans with multi-agent expert review and consensus. It's designed to catch architectural issues, security vulnerabilities, and edge cases **before** they become code.

## Philosophy

> **"Measure twice, cut once"** - A 30-minute planning session can save days of refactoring.

The command embodies the principles of:
- **Test-Driven Development**: Tests planned before implementation
- **Multi-Perspective Analysis**: 4-5 specialist agents review independently
- **Zero Tolerance**: No TODOs, no placeholders, complete implementations only
- **Risk Mitigation**: Identify issues upfront, not during code review
- **Documentation-First**: Plans become living documentation

## When to Use

### ✅ **DO Use `/code:plan` For**:
- New features (backend, frontend, full-stack)
- Complex refactoring (affecting multiple components)
- Performance-critical changes
- Security-sensitive features
- Database schema changes
- Infrastructure modifications
- API design
- Integration with external systems

### ❌ **DON'T Use `/code:plan` For**:
- Trivial bug fixes (typos, simple logic errors)
- Documentation-only changes
- Configuration tweaks
- Minor styling updates
- Tasks that take < 2 hours to complete

## Usage

### Basic Usage

```bash
# With Jira ticket
/code:plan MP-123

# With GitHub issue
/code:plan #456

# Interactive mode (prompts for details)
/code:plan --interactive
```

### Advanced Options

```bash
# Focus on specific aspect
/code:plan MP-123 --focus=security
/code:plan MP-123 --focus=performance
/code:plan MP-123 --focus=architecture

# Skip ticket linking (for draft plans)
/code:plan MP-123 --no-link

# Verbose output
/code:plan MP-123 --verbose
```

## Process Flow

### 1. **Ticket Analysis** (~30 seconds)
- Fetches ticket from Jira or GitHub
- Extracts functional and non-functional requirements
- Identifies acceptance criteria
- Parses user stories
- Determines scope (frontend, backend, database, infrastructure)
- Estimates complexity (low/medium/high)

### 2. **Codebase Analysis** (~1 minute)
- Scans for related files
- Analyzes existing implementation patterns
- Identifies technical debt
- Maps dependencies (internal and external)
- Generates code inventory table

### 3. **CLAUDE.md Compliance** (~30 seconds)
- Reads global ~/.claude/CLAUDE.md
- Reads project-specific ./CLAUDE.md
- Extracts CRITICAL/MANDATORY rules
- Validates alignment with architecture docs
- Checks security and performance requirements

### 4. **Multi-Agent Review** (~2-5 minutes)
Spawns 4-5 specialist agents based on scope:

**Always Included**:
- `security-auditor` - Security validation
- `performance-engineer` - Performance requirements
- `test-automator` - Test strategy review

**Conditionally Included**:
- `frontend-developer` - For UI changes
- `backend-architect` - For API/service changes
- `database-optimizer` - For DB changes
- `cloud-architect` - For infrastructure changes
- `frontend-security-coder` - For frontend security
- `backend-security-coder` - For backend security

Each agent:
1. Reviews plan independently (parallel execution)
2. Provides structured feedback:
   - ✅ Approvals (what looks good)
   - ⚠️ Concerns (potential issues)
   - 💡 Suggestions (optional improvements)
3. Debates with other agents if disagreements exist
4. Reaches consensus (80%+ approval rate required)

### 5. **Consensus Building** (~30 seconds)
- Aggregates agent feedback
- Categorizes concerns by severity (high/medium/low)
- Calculates consensus rate
- Determines if plan is approved
- Highlights critical issues requiring resolution

### 6. **Human Approval Gate**
Presents summary to user:
```
📊 Consensus Summary

Strong consensus reached! 4/4 agents approved.
   Approval rate: 100%

💡 Agent Suggestions:
   • backend-architect: Consider using Strategy pattern for validators
   • performance-engineer: Cache risk limits to avoid DB queries per order
   • security-auditor: Add rate limiting to prevent brute force attacks

📝 Plan Summary:
   Ticket: MP-456
   Complexity: medium
   Phases: 4
   Test Coverage Target: 95%+

Do you approve this plan? [Approve / Request Changes / Cancel]
```

Options:
- **Approve**: Saves plan and updates ticket
- **Request Changes**: (Future) Sends back to agents with feedback
- **Cancel**: Discards draft

### 7. **Plan Generation & Saving** (~10 seconds)
- Generates comprehensive markdown document
- Saves to `/docs/implementation-plans/{ticket-id}-{slug}.md`
- Updates ticket with plan link (bidirectional)
- Commits plan to git (recommended)

## Output Structure

The generated plan follows this structure:

### 1. Executive Summary
- Ticket ID and summary
- Goal (one sentence)
- Complexity (low/medium/high)
- Time estimate (days/hours)
- Risk level (high/medium/low)

### 2. Critical Implementation Standards
- Zero Tolerance Policy
- CLAUDE.md rules
- Project-specific constraints
- Quality gates (test coverage, linter, security)

### 3. Current State Analysis
- **Code Inventory**: Table of related files with line counts
- **Problems**: Issues with current implementation
- **Technical Debt**: Known issues to address
- **Dependencies**: Internal and external

### 4. Target Architecture
- System design (components, interactions, data flow)
- Technology choices with rationale
- Design patterns to use
- **Compliance Validation**:
  - ✅ CLAUDE.md alignment
  - ✅ Architecture alignment
  - ✅ Security requirements
  - ✅ Performance SLAs

### 5. Implementation Phases
Each phase includes:
- **Goal**: What this phase achieves
- **Time Estimate**: Hours or days
- **Tasks**:
  - **Task N.0: Write Tests FIRST (TDD)**
    - Test requirements with code snippets
    - Acceptance criteria
  - **Task N.1-N.X: Implementation steps**
    - File paths
    - Exact changes
    - Verification commands
- **Verification**: How to confirm phase complete

**Standard Phases**:
1. **Foundation**: Infrastructure setup + tests
2. **Core Logic**: Main business logic implementation
3. **Integration** (if needed): Connect components
4. **Polish & Documentation**: Edge cases, optimization, docs

### 6. Testing Strategy
- **Unit Tests**: 95%+ target, scenarios
- **Integration Tests**: 90%+ target, scenarios
- **E2E Tests**: Key user flows
- **Performance Tests**: SLA validation

### 7. Risk Assessment
- **High Risk**: Critical issues with mitigation + contingency
- **Medium Risk**: Potential issues with mitigation
- **Low Risk**: Standard risks

### 8. Rollout Plan
- **Pre-Deployment Checklist**: Tests, review, security, docs
- **Deployment Strategy**: Feature flags, rollback, monitoring
- **Post-Deployment Validation**: Smoke tests, metrics, regressions

### 9. Multi-Agent Review
- **Consensus Summary**: Approval rate, agent votes
- **Critical Concerns Addressed**: High-priority issues resolved
- **Agent Suggestions Incorporated**: Improvements integrated

### 10. Success Criteria
Checklist of requirements:
- ✅ All acceptance criteria met
- ✅ 100% test pass rate
- ✅ 95%+ code coverage
- ✅ Zero security vulnerabilities
- ✅ Performance SLAs met
- ✅ Documentation complete
- ✅ Code review approved
- ✅ Human approval obtained

## Examples

### Example 1: Backend Feature

**Ticket**: `MP-456 - Add risk limit validation to order service`

```bash
$ /code:plan MP-456

📋 Implementation Plan Generator

✓ Ticket MP-456: Add risk limit validation to order service

🔍 Analyzing requirements...
🔍 Scanning codebase...
📚 Validating CLAUDE.md compliance...
📝 Drafting implementation plan...
🤖 Spawning expert agents for review...
   Spawning 5 agents:
   - backend-architect
   - security-auditor
   - performance-engineer
   - database-optimizer
   - test-automator

⏳ Agents are reviewing (this may take 2-5 minutes)...

✅ Consensus reached! 5/5 agents approved with suggestions.

📊 Consensus Summary

Strong consensus reached! 5/5 agents approved.
   Approval rate: 100%

💡 Agent Suggestions:
   • backend-architect: Use Strategy pattern for different validator types
   • security-auditor: Add input validation for decimal precision
   • performance-engineer: Cache risk limits (TTL: 60s) to reduce DB load

📝 Plan Summary:
   Ticket: MP-456
   Complexity: medium
   Phases: 4 (1 day, 2 days, 1 day, 0.5 days)
   Test Coverage Target: 95%+
   Risk Level: medium

Do you approve this plan? [Approve / Request Changes / Cancel] Approve

✓ Plan saved: docs/implementation-plans/mp-456-add-risk-limit-validation.md
✓ Ticket updated with plan link

✨ Implementation plan complete!
```

### Example 2: Frontend Feature

**Ticket**: `PROJ-789 - Build real-time dashboard with WebSocket updates`

**Plan Highlights**:
- **Agents**: frontend-developer, ui-ux-designer, frontend-security-coder, performance-engineer, test-automator
- **Complexity**: high
- **Phases**: 5 (includes separate UI and WebSocket integration phases)
- **Key Concerns**:
  - Performance: Virtual scrolling required for large datasets
  - Security: Validate all WebSocket messages, sanitize before rendering
  - UX: Loading states, error recovery, offline handling
- **Testing Strategy**:
  - Unit: Component logic, data transformations
  - Integration: WebSocket connection management
  - E2E: Full user flow with real-time updates
  - Performance: Render time < 16ms (60fps), handle 1000+ updates/sec

### Example 3: Database Migration

**Ticket**: `DB-101 - Migrate user table to add multi-factor authentication fields`

**Plan Highlights**:
- **Agents**: database-optimizer, backend-architect, security-auditor, test-automator
- **Complexity**: high (schema change + data migration)
- **Phases**: 5 (includes rollback testing phase)
- **Critical Concerns**:
  - **Downtime**: Zero-downtime migration required
  - **Data Integrity**: Validate no data loss
  - **Rollback**: Must be able to rollback safely
- **Testing Strategy**:
  - Unit: Migration script logic
  - Integration: Application code with new schema
  - E2E: User flows with MFA enabled
  - Migration Testing: Test on production copy with 1M+ rows

## Best Practices

### 1. **Use Early in Development**
- Create plan **before** writing any code
- Catches issues when they're cheap to fix
- Prevents technical debt from accumulating

### 2. **Commit Plans to Git**
```bash
git add docs/implementation-plans/mp-456-*.md
git commit -m "docs: Add implementation plan for MP-456"
```

### 3. **Reference Plan During Implementation**
- Check off phases as you complete them
- Use verification commands to confirm progress
- Update plan if requirements change (version it)

### 4. **Use Plan in Code Review**
- PR description: "Implements plan from [link]"
- Reviewers validate adherence to plan
- Easier to spot deviations

### 5. **Learn from Plans**
- Review past plans for patterns
- Identify common risks
- Improve estimation accuracy

## Troubleshooting

### Issue: Ticket Not Found

**Error**: `Unable to fetch ticket: MP-123`

**Causes**:
- Ticket doesn't exist
- No Jira/GitHub credentials configured
- Incorrect ticket ID format

**Solution**:
```bash
# Check credentials
echo $JIRA_URL
echo $JIRA_EMAIL
echo $GITHUB_TOKEN

# Verify ticket exists
gh issue view 123  # For GitHub
# Or check Jira web UI

# Try with correct format
/code:plan MP-123   # Jira (PROJ-NUM)
/code:plan #456     # GitHub (#NUM or NUM)
```

### Issue: Agent Review Takes Too Long

**Symptom**: Agents reviewing for > 5 minutes

**Causes**:
- Complex ticket with many requirements
- Large codebase to analyze
- Network latency

**Solution**:
- Be patient (quality takes time)
- Use `--focus` to limit scope
- Break complex tickets into smaller ones

### Issue: Consensus Not Reached

**Symptom**: Agents have conflicting feedback

**Causes**:
- Ambiguous requirements
- Multiple valid approaches
- Unresolved architectural decisions

**Solution**:
- Clarify ticket requirements
- Add more details to ticket description
- Create ADR (Architecture Decision Record) first
- Use "Request Changes" to refine plan

### Issue: Plan Too Generic

**Symptom**: Plan lacks specific file paths and code snippets

**Causes**:
- Insufficient ticket details
- No related files found in codebase
- Generic ticket description

**Solution**:
- Add more details to ticket (acceptance criteria, examples)
- Reference existing files in ticket
- Use `--verbose` for more detailed analysis

## Configuration

### Global Configuration

Create `~/.claude/config/code-plan.json`:

```json
{
  "defaultAgents": [
    "backend-architect",
    "security-auditor",
    "performance-engineer",
    "test-automator"
  ],
  "testCoverageTarget": 95,
  "consensusThreshold": 0.8,
  "planTemplate": "standard",
  "autoLinkTickets": true,
  "requireHumanApproval": true,
  "verboseOutput": false
}
```

### Project Configuration

Create `./.claude/config/code-plan.json` (overrides global):

```json
{
  "testCoverageTarget": 100,
  "additionalAgents": ["data-scientist"],
  "customPhases": [
    "Foundation",
    "Core Logic",
    "ML Model Training",
    "Integration",
    "Polish & Documentation"
  ]
}
```

## Integration with Other Commands

### With `/pm:epic-decompose`
```bash
# Decompose epic
/pm:epic-decompose EPIC-123

# Create plan for first task
/code:plan TASK-456
```

### With `/dev:start`
```bash
# Create plan first
/code:plan MP-789

# Start work (references plan)
/dev:start MP-789

# Plan link shown in work session
```

### With `/code:implement-ticket`
```bash
# Create plan first
/code:plan MP-101

# Implement using plan as blueprint
/code:implement-ticket MP-101
```

### With `/code:review-pr`
```bash
# Create PR
gh pr create

# Review validates adherence to plan
/code:review-pr 42
```

## FAQ

### Q: How long does plan generation take?
**A**: 3-7 minutes total:
- Ticket analysis: 30s
- Codebase scan: 1min
- Multi-agent review: 2-5min
- Human approval: Variable
- Plan generation: 10s

### Q: Can I skip agent review?
**A**: Not recommended. Agent review is what makes plans bulletproof. However, you can adjust `consensusThreshold` in config.

### Q: What if agents disagree?
**A**: The `context-manager` agent facilitates debate until consensus or majority vote. High-priority concerns must be resolved.

### Q: Can I edit the plan after generation?
**A**: Yes! Plans are markdown files. Edit and commit. Consider versioning:
```bash
cp plan.md plan-v1.md
# Edit plan.md
git add plan.md plan-v1.md
git commit -m "docs: Update plan based on implementation findings"
```

### Q: Do I need a plan for every ticket?
**A**: No. Use for:
- Medium/high complexity (3+ story points)
- Security-sensitive features
- Performance-critical changes
- Architecture changes
- New component introductions

Skip for:
- Trivial bug fixes
- Documentation updates
- Config changes
- < 2 hour tasks

### Q: Can I use plans for legacy refactoring?
**A**: Absolutely! Plans are especially valuable for refactoring:
- Document current state thoroughly
- Identify technical debt
- Plan incremental changes
- Define rollback strategy
- Test each phase independently

## See Also

- [CLAUDE.md](../../CLAUDE.md) - Implementation standards
- [Architecture Docs](../architecture/) - System design patterns
- [ADR Template](../adrs/template.md) - Architecture Decision Records
- [`/code:implement-ticket`](../../commands/code/implement-ticket.md) - Execute the plan
- [`/code:review-pr`](../../commands/code/review-pr.md) - Validate implementation

---

**Last Updated**: 2025-10-30
**Command Version**: 1.0.0
