# Product Manager Quick Start

## Setup (One-Time)

### 1. Install
**Global (Personal):**
```bash
git clone <repo> ~/.claude
cd ~/.claude && npm install
```

**Local (Team):**
```bash
cd your-project
git clone <repo> .claude
cd .claude && npm install
```

### 2. Configure Integrations
```bash
export JIRA_URL="https://your-domain.atlassian.net"
export JIRA_EMAIL="pm@company.com"
export JIRA_API_TOKEN="your-api-token"
gh auth login
```

### 3. Initialize
```bash
/pm:init
# Creates: prds/, epics/, docs/implementation-plans/
```

---

## Feature Planning

```bash
/pm:prd-new "Feature Name"        # Create PRD (wizard: goals, stories, criteria)
/pm:epic-decompose PRD-001        # Break into 3-5 epics with estimates
/code:plan EPIC-123               # Technical plan (multi-agent review, 95%+ coverage)
/pm:epic-sync EPIC-123            # Sync to GitHub (epic + sub-issues + links)
```

---

## Tracking & Reports

```bash
/dev:team                          # Team: active devs, tickets, blockers
/dev:sprint                        # Sprint: velocity, at-risk tickets, capacity
/pm:epic-status EPIC-123           # Epic: completed/in-progress/remaining
/pm:blocked                        # Show all blocked items
/pm:standup                        # Standup report
```

##  Workflows

**New feature:**
```bash
/pm:prd-new → /pm:epic-decompose → /code:plan → /pm:epic-sync
```

**Sprint health:**
```bash
/dev:sprint                        # Velocity, blockers, capacity
```

**Prioritize work:**
```bash
/pm:epic-list --sort=blocked       # Epics with most blockers first
```

**Sprint report:**
```bash
/dev:team --format=report          # Stakeholder report
```

---

## Sync

```bash
/sync:status                                    # Check connections
/sync:github-to-jira --dry-run                  # Preview
/sync:bidirectional --strategy=most-recent      # Full sync
```

**Strategies:** most-recent, local-wins, remote-wins, manual

---

## Team Analytics

```bash
/dev:metrics --team              # Velocity, cycle time, success rate
/pm:blocked                      # Bottlenecks, duration, suggestions
/dev:sprint --capacity           # Devs, hours, buffer
/pm:epic-list --filter=high-risk # Risk management
```

---

## Sprint Planning

**Before meeting:**
```bash
/dev:metrics --team && /pm:epic-list && /code:plan EPIC-*
```

**During meeting:**
```bash
/dev:sprint --capacity           # Show capacity
/pm:epic-sync                    # Create GitHub issues
```

## Troubleshooting

**Sync not working:**
```bash
/sync:status             # Check connection
echo $JIRA_URL           # Verify credentials
gh auth status
```

**No epics:**
```bash
/pm:prd-list             # List PRDs first
/pm:epic-decompose PRD-001
```

**Incomplete plan:**
```bash
# Ensure ticket has: description, acceptance criteria, constraints
/code:plan EPIC-123 --verbose
```
