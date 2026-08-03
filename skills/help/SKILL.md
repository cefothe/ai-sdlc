---
name: help
description: Command reference and help documentation.
---


# Claude Code Command Reference

Complete list of available commands organized by workflow.

## 📦 Project Management (`/pm:*`)

**Planning:**
- `/pm:prd-new` - Create Product Requirements Document
- `/pm:prd-list` - List all PRDs
- `/pm:prd-status` - Show PRD status
- `/pm:prd-parse` - Parse PRD into epic
- `/pm:prd-edit` - Edit existing PRD

**Epic Management:**
- `/pm:epic-list` - List all epics
- `/pm:epic-show` - Show epic details
- `/pm:epic-status` - Epic progress
- `/pm:epic-decompose` - Break into tasks
- `/pm:epic-start` - Launch parallel agents
- `/pm:epic-sync` - Sync to GitHub
- `/pm:epic-oneshot` - Decompose + sync in one step
- `/pm:epic-edit` - Edit epic details
- `/pm:epic-refresh` - Update epic progress
- `/pm:epic-close` - Close completed epic
- `/pm:epic-merge` - Merge epic from worktree

**Issue Tracking:**
- `/pm:issue-start` - Begin work with agents
- `/pm:issue-analyze` - Analyze and create streams
- `/pm:issue-show` - Show issue details
- `/pm:issue-status` - Check issue status
- `/pm:issue-edit` - Edit issue details
- `/pm:issue-sync` - Sync status
- `/pm:issue-close` - Close completed issue
- `/pm:issue-reopen` - Reopen closed issue

**Status & Reports:**
- `/pm:status` - Project overview
- `/pm:next` - Get next task
- `/pm:blocked` - Show blocked issues
- `/pm:standup` - Generate standup report
- `/pm:in-progress` - Show active work

**Maintenance:**
- `/pm:import` - Import GitHub issues
- `/pm:clean` - Clean up completed work
- `/pm:validate` - Validate structure

## 👨‍💻 Developer Workflow (`/dev:*`)

**Work Sessions:**
- `/dev:init` - Initialize developer profile
- `/dev:next` - AI-powered ticket recommendation
- `/dev:start <ticket>` - Start work session
- `/dev:status` - Check active session
- `/dev:done` - Complete session

**Session Management:**
- `/dev:blocker <desc>` - Record blocker
- `/dev:pause [reason]` - Pause session
- `/dev:resume` - Resume session

**Analytics:**
- `/dev:metrics` - Personal productivity metrics
- `/dev:standup` - Automated standup report
- `/dev:team` - Team-wide analytics
- `/dev:sprint` - Sprint planning insights

## 💻 Code Development (`/code:*`)

**Help:**
- `/code:help` - Code category help

**Implementation:**
- `/code:plan <ticket>` - Generate implementation plan with multi-agent review
- `/code:implement-ticket` - Plan and implement from ticket
- `/code:validate-implementation` - Validate against requirements
- `/code:test-and-build` - Comprehensive validation

**Code Quality:**
- `/code:commit` - Clean commit with quality gates
- `/code:review-pr` - Comprehensive PR validation (8/10 min)
- `/code:pr-create` - Automated PR creation
- `/code:code-rabbit` - Process CodeRabbit reviews

**Testing:**
- `/code:coverage` - Test coverage analysis (≥90% req)
- `/code:integration-test` - E2E integration testing
- `/code:smoke-test` - Production readiness
- `/code:load-test` - Performance under load

**Specialized:**
- `/code:hotfix-validate` - Emergency fix validation
- `/code:security-scan` - Security assessment
- `/code:perf-optimize` - Performance optimization
- `/code:deps-update` - Safe dependency updates
- `/code:tech-debt` - Technical debt tracking
- `/code:api-test` - API contract testing
- `/code:api-breaking` - Breaking change analysis
- `/code:config-validate` - Configuration validation

**Analysis:**
- `/code:consistency-docs` - Docs validation
- `/code:consistency-full` - Full codebase validation
- `/code:evaluate` - Security/architecture evaluation

## 🔄 Sync & Integration (`/sync:*`)

**Sync Commands:**
- `/sync:status` - Connection health check
- `/sync:github-to-jira` - GitHub → Jira (one-way)
- `/sync:jira-to-github` - Jira → GitHub (one-way)
- `/sync:bidirectional` - Two-way sync with conflict resolution

## 🧪 Testing (`/testing:*`)

- `/testing:run` - Execute tests with test-runner agent
- `/testing:prime` - Configure testing setup

## 🎯 Context Management (`/context:*`)

- `/context:create` - Create initial project context
- `/context:update` - Refresh existing context
- `/context:prime` - Load context in new sessions
- `/context:prompt` - Ephemeral prompt helper
- `/context:re-init` - Enhance CLAUDE.md

---

## 🚀 Quick Workflows

**New Feature:**
```
/pm:prd-new → /pm:epic-decompose → /code:plan → /dev:start → /code:implement-ticket → /code:test-and-build → /code:commit → /code:review-pr → /dev:done
```

**Daily Development:**
```
/dev:next → /dev:start → [work] → /code:test-and-build → /code:commit → /dev:done
```

**Code Review:**
```
/code:review-pr → [fixes if needed] → /code:test-and-build → /code:commit
```

**Emergency Hotfix:**
```
/code:hotfix-validate → /dev:start → [fix] → /code:test-and-build → /code:commit → /code:review-pr → /dev:done
```

---

## 📚 Documentation

- **PM Guide:** `docs/quickstart-pm.md`
- **Developer Guide:** `docs/quickstart-developer.md`
- **Full System:** `README.md`
- **Command Details:** Check individual command files in `commands/`

---

**Total Commands:** 107 (28 code + 5 context + 12 dev + 38 pm + 10 qa + 4 sync + 3 testing + 5 teams + 2 meta)

**Note**: This count includes functional commands. The `/help` and `/getting-started` commands are meta-documentation commands.

### Team Orchestration (`/teams:*`)

| Command | Description |
|---------|-------------|
| `/teams:init` | Initialize native team for current task |
| `/teams:status` | Show team status and teammate activity |
| `/teams:findings` | View aggregated findings from JSONL |
| `/teams:synthesize` | Synthesize findings into report |
| `/teams:benchmark` | Run benchmark comparison |

---

## 🔍 Command Discovery

- **By Category:** Commands organized by workflow (pm, dev, code, sync, testing, context)
- **Full Help:** Use `/help` for this comprehensive reference
- **Category Help:** Use `/code:help`, `/pm:help`, etc. for category-specific details
- **Quick Start:** Use `/getting-started` for workflow-based cheat sheet
