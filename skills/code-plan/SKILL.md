---
name: code-plan
description: Generate a bulletproof, production-ready implementation plan with multi-agent expert review and consensus.
---

# /code:plan - Create Comprehensive Implementation Plan


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Purpose

Generate a bulletproof, production-ready implementation plan for a ticket that includes:
- Comprehensive requirement analysis
- Current state assessment with file inventory
- Multi-agent expert review and consensus
- Test-first approach (TDD mandatory)
- CLAUDE.md compliance validation
- Phase-by-phase implementation steps
- Risk assessment and mitigation
- Complete rollout strategy

## Usage

```bash
# With ticket ID (auto-fetches from Jira/GitHub)
/code:plan MP-123

# With ticket ID and custom focus
/code:plan MP-123 --focus=security

# Interactive mode (prompts for details)
/code:plan
```

## Process Flow

1. **Ticket Analysis**: Fetch ticket details from Jira/GitHub
2. **Requirement Extraction**: Parse functional and non-functional requirements
3. **Codebase Analysis**: Scan existing code, dependencies, patterns
4. **CLAUDE.md Compliance**: Verify alignment with project rules
5. **Multi-Agent Review**: 4-5 specialist agents provide independent feedback
6. **Consensus Building**: Agents debate until agreement reached
7. **Human Approval**: Present plan for user validation
8. **Plan Generation**: Create detailed implementation document
9. **Ticket Linking**: Update ticket with plan link (bidirectional)

## Multi-Agent Review Process (Native Teams)

1. Create review team:
   ```
   TeamCreate(team_name="plan-review-{ticket-id}")
   ```

2. Spawn ALL review agents in parallel:

   **Always Included**:
   ```
   Task(subagent_type="backend-architect" or "frontend-developer", team_name="plan-review-{ticket-id}", name="architecture")
   Task(subagent_type="security-auditor", team_name="plan-review-{ticket-id}", name="security")
   Task(subagent_type="performance-engineer", team_name="plan-review-{ticket-id}", name="performance")
   Task(subagent_type="test-automator", team_name="plan-review-{ticket-id}", name="testing")
   ```

   **Conditionally Included**:
   ```
   Task(subagent_type="database-optimizer", team_name=..., name="database")     # if DB changes detected
   Task(subagent_type="cloud-architect", team_name=..., name="infrastructure")  # if infrastructure changes
   Task(subagent_type="android-expert", team_name=..., name="android")          # for Android/Kotlin
   Task(subagent_type="ios-expert", team_name=..., name="ios")                  # for iOS/Swift
   ```

3. Each writes to `~/.claude/teams/plan-review-{ticket-id}/state/findings/{name}.jsonl`

4. Lead synthesizes findings, resolves disagreements, builds consensus

5. Clean up:
   ```
   TeamDelete
   ```

## Output

Creates `/docs/implementation-plans/{ticket-id}-{slug}.md` with:

### Document Structure

```markdown
# Implementation Plan: {TICKET-ID} - {Feature Name}

## Executive Summary
- Ticket, Goal, Complexity, Time Estimate, Risk Level

## 🚨 CRITICAL IMPLEMENTATION STANDARDS
- Zero Tolerance Policy (from CLAUDE.md)
- Project-specific rules
- Quality gates

## Current State Analysis
- Code inventory (files, lines, purpose)
- Problems with current implementation
- Dependencies
- Technical Debt

## Target Architecture
- System design diagrams
- Technology choices with rationale
- Design patterns
- Compliance validation

## Implementation Phases
### Phase N: [Name] [Time]
**Task N.0: Write Tests FIRST (TDD)**
- Test requirements with code snippets
- Acceptance criteria

**Task N.1: [Implementation Step]**
- File paths
- Exact changes
- Verification commands

**Verification**:
```bash
# Commands to verify phase complete
```

## Testing Strategy
- Unit tests (95%+ target)
- Integration tests
- E2E tests
- Performance tests

## Risk Assessment
- High/Medium/Low risks with mitigation

## Rollout Plan
- Pre-deployment checklist
- Deployment strategy
- Post-deployment validation

## Multi-Agent Review
- Individual agent feedback
- Consensus summary
- Required changes
- Optional enhancements

## Success Criteria
- Checkboxes for all requirements

---
**Status**: Draft/Under Review/Approved
**Created**: [Date]
**Approved By**: [Username]
```

## Compliance Checks

The plan MUST validate against:
- ✅ CLAUDE.md rules (project-specific constraints)
- ✅ Architecture docs (existing patterns)
- ✅ Security standards (OWASP, best practices)
- ✅ Performance SLAs (response times, throughput)
- ✅ Test coverage requirements (95%+ or project-specific)

## Human Approval Gate

After multi-agent consensus, the command:
1. Presents plan summary to user
2. Shows agent feedback highlights
3. Lists required changes (if any)
4. Asks for approval: Approve / Request Changes / Cancel

**If approved**: Saves plan and updates ticket
**If changes requested**: Returns to agent review with feedback
**If cancelled**: Discards draft (can resume later)

## Examples

### Example 1: Backend Feature

```bash
/code:plan MP-456

# Output:
# 📋 Analyzing ticket MP-456: Add risk limit validation to order service
# 🔍 Scanning codebase for related files...
# 📚 Reading CLAUDE.md and architecture docs...
# 🤖 Spawning expert agents for review...
#    - backend-architect
#    - security-auditor
#    - performance-engineer
#    - database-optimizer
#    - test-automator
#
# ⏳ Agents are reviewing (this may take 2-3 minutes)...
#
# ✅ Consensus reached! 5/5 agents approved with suggestions.
#
# 📄 Plan Summary:
# - Phases: 4 (Foundation, Core Logic, Integration, Polish)
# - Time Estimate: 3 days
# - Test Coverage: 95%+
# - Risk Level: Medium
#
# 🔍 Agent Highlights:
# - backend-architect: ✅ Approved. Suggests using Strategy pattern for validators.
# - security-auditor: ⚠️ Concern: Input validation must include decimal precision checks.
# - performance-engineer: ✅ Approved. Cache risk limits to avoid DB queries per order.
#
# Do you approve this plan? [Approve / Request Changes / Cancel]
```

### Example 2: Frontend Feature

```bash
/code:plan PROJ-789

# Similar flow but spawns frontend-specific agents:
# - frontend-developer
# - ui-ux-designer
# - frontend-security-coder
# - performance-engineer
# - test-automator
```

### Example 3: Mobile Feature

```bash
/code:plan MOB-123

# Similar flow but spawns mobile-specific agents:
# - android-expert (if Android changes)
# - ios-expert (if iOS changes)
# - mobile-security-coder
# - performance-engineer
# - test-automator
# - ui-ux-designer
```

## Integration with Other Commands

- **`/pm:epic-decompose`**: Plans can reference epic goals
- **`/dev:start`**: Developers reference plan when starting work
- **`/code:implement-ticket`**: Uses plan as implementation blueprint
- **`/code:review-pr`**: Validates PR adherence to plan

## Notes

- Plans are versioned if modified during implementation
- Agent review takes 2-5 minutes (parallel execution)
- Complex features may require multiple review rounds
- Plans stored in git (committed with implementation)

## Configuration

Configure in `{projectRoot}/config/code-plan.json`:

```json
{
  "defaultAgents": ["backend-architect", "security-auditor", "performance-engineer", "test-automator"],
  "testCoverageTarget": 95,
  "consensusThreshold": 0.8,
  "planTemplate": "standard",
  "autoLinkTickets": true,
  "requireHumanApproval": true
}
```

---

**Use this command at the START of implementation** to catch issues before they become code.
