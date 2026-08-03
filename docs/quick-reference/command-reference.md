# Slash Command Reference

**CRITICAL**: ALL slash commands MUST be executed by MAIN agent, NOT sub-agents!

## Command Execution Pattern

**For ALL slash commands**:
1. `/category:command` → Resolve command path using ExecutionContext
2. **Command Resolution Order**:
   - Local first: `project/.claude/commands/category/command.md`
   - Global fallback: `~/.claude/commands/category/command.md`
3. **Execute directly** - NEVER use Task tool for slash commands

**Installation Modes:**
- **Global**: Commands at `~/.claude/commands/`, data at `project/.claude/`
- **Local**: Commands at `project/.claude/commands/`, data at `project/.claude/`
- **Hybrid**: Local commands override global, merged configuration

---

## /pm: Commands (Project Management)

Project management for epics, PRDs, issues, and synchronization with Jira/GitHub.

### Execution Rules

When encountering ANY `/pm:` command:
1. **Resolve command path**: Check local first (`project/.claude/commands/pm/`), then global (`~/.claude/commands/pm/`)
2. **Execute the instructions** using available tools (Task, Bash, Read, Write, etc.)
3. **Scripts use ExecutionContext**: Scripts adapt to installation mode automatically
4. **Data paths adapt**: PRDs, epics stored based on mode:
   - Global: `project/.claude/prds/`, `project/.claude/epics/`
   - Local: `.claude/prds/`, `.claude/epics/`
5. **PARALLEL EXECUTION**: For 1-2 agents, use multiple Task tool calls in a single message. For 3+ agents, use Native Teams (TeamCreate → Task with team_name → JSONL → TeamDelete)

### Common Commands

- `/pm:init` - Initialize project management structure
- `/pm:status` - Show current project status
- `/pm:next` - Get next recommended task
- `/pm:prd-new` - Create new PRD
- `/pm:epic-new` - Create new epic
- `/pm:epic-decompose` - Decompose epic into tasks
- `/pm:sync` - Synchronize with Jira/GitHub

**Pattern**: `/pm:COMMAND` → Read `~/.claude/commands/pm/COMMAND.md` → Execute directly

### Teams Commands (`/teams:*`)

- `/teams:init` - Initialize native team for current task
- `/teams:status` - Show team status and teammate activity
- `/teams:findings` - View aggregated findings from JSONL
- `/teams:synthesize` - Synthesize findings into report
- `/teams:benchmark` - Run benchmark comparison

**Pattern**: `/teams:COMMAND` → Read `commands/teams/COMMAND.md` → Execute directly

### Epic and Issue Creation Best Practices

When creating epics and issues:

1. **Always generate human-readable slugs**: Convert feature names to URL-friendly slugs
   ```bash
   SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
   ```

2. **Include documentation links**: Add bi-directional links between GitHub issues and documentation:
   - Epic docs: `/docs/epics/{epic-slug}.md`
   - Task docs: `/docs/tasks/{epic-slug}/{task-slug}.md`

3. **Maximize parallel execution**: When creating multiple issues or tasks, spawn agents in parallel whenever feasible

4. **Maintain traceability**: Every issue should reference relevant documentation, and docs should link back to issues

### Documentation Link Format

Always include these sections in GitHub issues:

```markdown
## 📚 Documentation
- **Epic Docs**: [View Epic Documentation](/docs/epics/{epic-slug}.md)
- **Task Docs**: [View Task Documentation](/docs/tasks/{epic-slug}/{task-slug}.md)
- **Related PRDs**: [View PRD](/docs/prds/{prd-slug}.md)
```

**Note**: Documentation paths adapt to installation mode:
- **Global installation**: Docs at `project/docs/`, metadata at `project/.claude/`
- **Local installation**: Everything at `project/.claude/` or `project/docs/`

---

## /dev: Commands (Developer Workflow)

AI-powered developer workflow for work tracking, metrics, and intelligent recommendations.

### Work Session Commands

- `/dev:init` - Initialize developer profile with skills and preferences
- `/dev:next` - Get AI recommendation for next ticket (considers skills, velocity, capacity)
- `/dev:start <ticket-id>` - Start work session with automatic tracking
- `/dev:status` - Check active session with real-time analytics
- `/dev:blocker <description>` - Record blocker with severity detection
- `/dev:pause [reason]` - Pause work session
- `/dev:resume` - Resume paused session
- `/dev:done` - Complete session, update metrics, sync with Jira/GitHub

### Analytics & Team Commands

- `/dev:metrics` - View personal productivity metrics (velocity, success rate, cycle time)
- `/dev:standup` - Generate automated standup report
- `/dev:team` - Team-wide analytics and health indicators
- `/dev:sprint` - AI-powered sprint planning with capacity management

**Pattern**: `/dev:COMMAND` → Resolve path (local first, then global) → Execute directly

**Data Storage**: Session data and metrics stored based on installation mode:
- Global: `project/.claude/dev-sessions/`, `project/.claude/dev-metrics/`
- Local: `.claude/dev-sessions/`, `.claude/dev-metrics/`

### Quick Developer Flow

```bash
/dev:next              # What should I work on?
/dev:start MP-123      # Start work
/dev:status            # Check progress
/dev:blocker "..."     # Hit a blocker
/dev:done              # Complete ticket
/dev:metrics           # How am I doing?
```

---

## /code: Commands (Implementation & Code Quality)

Code tasks including implementation planning, testing, PRs, security, and commits.

### /code:plan - Implementation Planning

**Purpose**: Generate comprehensive, production-ready implementation plans BEFORE writing code.

**Usage**:
```bash
/code:plan MP-123                    # With Jira ticket
/code:plan #456                      # With GitHub issue
/code:plan --interactive             # Interactive mode
/code:plan MP-123 --focus=security   # Focus on specific aspect
```

**Process Flow** (3-7 minutes):
1. **Ticket Analysis** (~30s) - Fetch from Jira/GitHub, extract requirements
2. **Codebase Analysis** (~1m) - Scan related files, dependencies, patterns
3. **CLAUDE.md Compliance** (~30s) - Validate against project rules
4. **Multi-Agent Review** (~2-5m) - 4-5 specialists review, debate, reach consensus
5. **Human Approval Gate** - User validates/approves agent feedback
6. **Plan Generation** (~10s) - Complete markdown with 10 sections
7. **Bidirectional Linking** - Plans link to tickets, tickets link to plans

**Multi-Agent Review**:
- **Always Included**: `security-auditor`, `performance-engineer`, `test-automator`
- **Conditionally Added**: `frontend-developer`, `backend-architect`, `database-optimizer`, `cloud-architect`
- **Consensus Threshold**: 80%+ approval rate required
- **Debate System**: Agents discuss disagreements until resolution

**Generated Plan Sections**:
1. Executive Summary (ticket, goal, complexity, time, risk)
2. 🚨 Critical Implementation Standards (Zero Tolerance Policy)
3. Current State Analysis (code inventory, problems, dependencies)
4. Target Architecture (design, patterns, compliance validation)
5. Implementation Phases (Test-First TDD approach - Task X.0 always writes tests FIRST)
6. Testing Strategy (unit 95%+, integration 90%+, E2E, performance)
7. Risk Assessment (high/medium/low with mitigation)
8. Rollout Plan (pre-deployment, deployment, post-deployment)
9. Multi-Agent Review (consensus summary, concerns, suggestions)
10. Success Criteria (comprehensive checklist)

**Zero Tolerance Policy**:
- ❌ NO TODO comments or placeholders
- ❌ NO shortcuts or incomplete implementations
- ✅ Task X.0 ALWAYS writes tests FIRST (TDD mandatory)
- ✅ 95%+ test coverage required
- ✅ Complete error handling and edge cases
- ✅ Production-ready code on first implementation

**Integration**:
- Works with `/pm:epic-decompose` for epic planning
- Referenced by `/dev:start` during work sessions
- Used by `/code:implement-ticket` as implementation blueprint
- Validated by `/code:review-pr` for adherence checks

**Pattern**: Based on `tradu/utop` implementation plan standards

**See**: `docs/commands/code-plan.md` for complete documentation

### /code:validate-plan - Plan Accuracy Verification

**Purpose**: Validate subagent conclusions using main agent for 100% accuracy.

**Usage**:
```bash
/code:validate-plan                      # Validate most recent plan
/code:validate-plan MP-123               # Validate specific plan
/code:validate-plan MP-123 --focus=security,performance
```

**Validates**:
- Cross-agent consistency (no contradictions)
- Technical accuracy (files exist, patterns match)
- Completeness (all requirements covered)
- Actionability (steps can be executed)

**Use after**: `/code:plan` before starting implementation

---

### /code:explain-changes - Change Walkthrough

**Purpose**: Walk through what was just done after each implementation step.

**Usage**:
```bash
/code:explain-changes                    # Explain uncommitted changes
/code:explain-changes --phase=2          # Explain specific phase
/code:explain-changes --plan=MP-123      # Compare to plan
```

**Provides**:
- Plain English summary of each change
- WHY each change was necessary
- Mapping back to plan/requirements
- Deviations from plan (if any)
- What's next

**Use after**: Completing each implementation step

---

### /code:validate-changes - WIP Validation

**Purpose**: Mini code review for work-in-progress that considers the plan.

**Usage**:
```bash
/code:validate-changes                   # Validate uncommitted changes
/code:validate-changes --plan=MP-123     # Validate against plan
/code:validate-changes --phase=2         # Validate phase completion
/code:validate-changes --quick           # Essential checks only
/code:validate-changes --thorough        # Full agent review
```

**Checks**:
- Plan alignment (expected vs actual progress)
- Quality gates (compile, lint, tests)
- Incremental test verification
- Course correction recommendations

**Use**: After each phase, before moving to next step

---

### Other Code Commands

- `/code:implement-ticket` - Implement ticket following plan
- `/code:review-pr` - Review pull request
- `/code:test` - Run test suite
- `/code:security-audit` - Security vulnerability scan
- `/code:commit` - Create commit with proper formatting

---

## /qa: Commands (Quality Assurance)

QA testing operations for comprehensive test generation and review.

- `/qa:test-plan` - Generate comprehensive test plan
- `/qa:functional-tests` - Generate functional test cases
- `/qa:performance-tests` - Generate performance test cases
- `/qa:security-tests` - Generate security test cases
- `/qa:chaos-tests` - Generate chaos/resilience test cases
- `/qa:compliance-tests` - Generate compliance test cases
- `/qa:reporting-tests` - Generate reporting test cases
- `/qa:automate-functional-tests` - Automate functional test cases
- `/qa:explore-ui` - Interactive UI exploration
- `/qa:full-cycle` - Full QA cycle: plan, test, review, automate

**Pattern**: `/qa:COMMAND` → Read `~/.claude/commands/qa/COMMAND.md` → Execute directly

---

## /context: Commands (Context Management)

Context management and optimization for long-running sessions.

- `/context:create` - Create initial context for a project
- `/context:update` - Update existing context
- `/context:prime` - Prime context for a session
- `/context:prompt` - Generate ephemeral context prompt
- `/context:re-init` - Enhance CLAUDE.md file

---

## /testing: Commands (Testing Operations)

Testing operations and test suite management.

- `/testing:run` - Run test suite
- `/testing:prime` - Prime testing environment
- `/testing:perf-e2e` - Create end-to-end performance tests

---

## Available Categories

| Category | Command Path (resolved by ExecutionContext) | Purpose |
|----------|------|---------|
| `/pm:*` | Local: `project/.claude/commands/pm/`<br>Global: `~/.claude/commands/pm/` | Project Management - epics, PRDs, issues, sync |
| `/dev:*` | Local: `project/.claude/commands/dev/`<br>Global: `~/.claude/commands/dev/` | Developer Workflow - work tracking, metrics, recommendations |
| `/code:*` | Local: `project/.claude/commands/code/`<br>Global: `~/.claude/commands/code/` | Code Tasks - implementation planning, testing, PRs, security, commits |
| `/qa:*` | Local: `project/.claude/commands/qa/`<br>Global: `~/.claude/commands/qa/` | QA Testing - test plans, functional, performance, security, chaos, compliance |
| `/teams:*` | Local: `project/.claude/commands/teams/`<br>Global: `~/.claude/commands/teams/` | Native Teams orchestration - init, status, findings, synthesize, benchmark |
| `/context:*` | Local: `project/.claude/commands/context/`<br>Global: `~/.claude/commands/context/` | Context management |
| `/testing:*` | Local: `project/.claude/commands/testing/`<br>Global: `~/.claude/commands/testing/` | Testing operations |

**Note**: Local commands always override global when both exist (hybrid mode)

---

## See Also

- [Parallel Execution Best Practices](./parallel-execution.md)
- [Agent Protocols](./agent-protocols.md)
- [Agent Catalog](./agent-catalog.md)
