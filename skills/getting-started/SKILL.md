---
name: getting-started
description: Getting started guide for Claude Code command system.
---


# Getting Started & Command Cheat Sheet

Quick reference for all Claude Code commands organized by workflow.

## 🚀 Quick Start (First Time Setup)

```bash
# Developers
/dev:init                    # Create your profile (skills, preferences)

# Product Managers
/pm:init                     # Initialize project structure
/sync:status                 # Verify integrations (GitHub, Jira)
```

## 👨‍💻 Daily Developer Workflow

```bash
/dev:next                    # AI recommends your next ticket
/dev:start MP-123            # Start work session
/dev:status                  # Check current session
/dev:blocker "description"   # Record blocker
/dev:pause "reason"          # Pause session
/dev:resume                  # Resume session
/dev:done                    # Complete session
/dev:metrics                 # View your velocity
```

## 📦 Product Management Workflow

```bash
# Planning
/pm:prd-new "Feature Name"   # Create PRD
/pm:epic-decompose PRD-001   # Break into epics
/code:plan EPIC-123          # Generate implementation plan

# Tracking
/pm:status                   # Project overview
/pm:next                     # Get next task
/pm:blocked                  # Show blockers
/pm:standup                  # Standup report

# Sync
/pm:epic-sync EPIC-123       # Create GitHub issues
/sync:bidirectional          # Full two-way sync
```

## 💻 Code Development

```bash
# Implementation
/code:plan MP-123            # Generate plan with review
/code:implement-ticket       # Plan + implement
/code:test-and-build         # Comprehensive validation

# Quality
/code:commit                 # Clean commit with gates
/code:review-pr              # Full PR validation (>9.0 quality)
/code:coverage               # Test coverage (≥90%)

# Specialized
/code:security-scan          # Security assessment
/code:perf-optimize          # Performance optimization
/code:hotfix-validate        # Emergency fix validation
```

## 🔄 Sync & Integration

```bash
/sync:status                 # Connection health
/sync:github-to-jira         # One-way GitHub → Jira
/sync:jira-to-github         # One-way Jira → GitHub
/sync:bidirectional          # Two-way sync with conflict resolution
```

## 🧪 Testing

```bash
/testing:run                 # Execute tests with analysis
/testing:prime               # Configure test setup
```

## 🎯 Context Management

```bash
/context:create              # Initial project context
/context:update              # Refresh context
/context:prime               # Load in new sessions
```

## 📊 Team Analytics

```bash
/dev:team                    # Team-wide metrics
/dev:sprint                  # Sprint planning insights
/dev:standup --range=week    # Weekly standup
```

## 🔥 Common Workflows

**New Feature (Full Cycle):**
```bash
/pm:prd-new → /pm:epic-decompose → /code:plan → /dev:start →
/code:implement-ticket → /code:test-and-build → /code:commit →
/code:review-pr → /dev:done
```

**Daily Development:**
```bash
/dev:next → /dev:start → [work] → /code:test-and-build →
/code:commit → /dev:done
```

**Emergency Hotfix:**
```bash
/code:hotfix-validate → /dev:start → [fix] → /code:test-and-build →
/code:commit → /code:review-pr → /dev:done
```

**Sprint Planning:**
```bash
/dev:metrics --team && /pm:epic-list && /code:plan EPIC-*
```

## 📚 Documentation

- **Developer Guide:** `docs/quickstart-developer.md`
- **PM Guide:** `docs/quickstart-pm.md`
- **Full Reference:** `/help`
- **System Docs:** `README.md`

## 💡 Tips

1. **Use `/dev:next`** daily - AI learns your preferences over time
2. **Always run `/code:test-and-build`** before committing
3. **Set `/code:review-pr` threshold ≥9.0** for production code
4. **Record blockers immediately** with `/dev:blocker` for accurate metrics
5. **Sync regularly** with `/sync:bidirectional --strategy=most-recent`

## 🆘 Troubleshooting

**Command not working?**
```bash
/sync:status                 # Check connections
```

**No profile found?**
```bash
/dev:init                    # Create profile
```

**Tests failing?**
```bash
/testing:run                 # Analyze failures
```

**Need help?**
```bash
/help                        # Full command reference
```

---

**Total Commands:** 107 across 8 categories (pm, dev, code, qa, sync, testing, context, teams)
**Most Used:** `/dev:start`, `/dev:done`, `/code:review-pr`, `/pm:status`
