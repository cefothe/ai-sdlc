# Developer Quick Start

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

### 2. Prerequisites
```bash
brew install gh      # macOS
gh auth login
```

### 3. Initialize Profile
```bash
/dev:init
# Prompts for: skills, proficiency levels, preferred work types
```

---

## Daily Workflow

### Get Next Ticket
```bash
/dev:next
# Shows: recommended ticket, match score, capacity
```

### Start Work
```bash
/dev:start MP-123
# Tracks: time, commits, blockers
```

### Record Blocker
```bash
/dev:blocker "Need API key from ops team"
# Detects severity, suggests actions
```

### Pause/Resume
```bash
/dev:pause "Urgent production issue"
/dev:resume
```

### Check Status
```bash
/dev:status
# Shows: current ticket, time, blockers
```

### Complete Work
```bash
/dev:done
# Updates: Jira/GitHub status, velocity metrics, team analytics
```

---

## Metrics & Reports

```bash
/dev:metrics                  # Velocity, cycle time, success rate
/dev:standup                  # Yesterday, today, blockers
/dev:standup --range=week     # Weekly summary
```

---

## Shell Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc
alias dn='/dev:next'
alias ds='/dev:start'
alias dd='/dev:done'
alias dm='/dev:metrics'
```

---

## Workflows

**Daily:**
```bash
/dev:next && /dev:metrics          # Morning: plan day
/dev:start MP-123                  # Start work
/dev:done && /dev:next             # Evening: wrap up, preview tomorrow
```

---

## Troubleshooting

**Command not found:**
```bash
npm --prefix ~/.claude run dev:next    # Global
cd .claude && npm run dev:next         # Local
```

**No tickets recommended:**
```bash
/dev:init --show     # Verify profile exists
/dev:init --update   # Update skills
```

**No metrics:**
```bash
# Complete at least one session first
/dev:start TEST-1 && /dev:done
```
