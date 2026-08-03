---
name: teams-init
description: Initialize Native Teams for parallel agent execution.
---


# /teams:init - Initialize Native Team

Initialize external state for a Native Team session.

## Prerequisites

Native Teams must be enabled:
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

Or in `~/.claude/settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

## Usage

```
/teams:init [task-description]
```

## Arguments

- `task-description` (optional): Brief description of the team's task (e.g., "Review PR #123", "Implement auth feature")

## Execution

### Step 1: Verify Native Teams Enabled

Check that `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set:
```bash
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

If not set, warn user:
```
⚠️  Native Teams not enabled!

Enable with:
  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

Or add to ~/.claude/settings.json:
  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

### Step 2: Generate and Validate Team ID

```bash
TEAM_ID="team-$(date +%s)"

# Validate team-id (MANDATORY before any filesystem operation)
if [[ ! "$TEAM_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]]; then
  echo "❌ Invalid team-id: '$TEAM_ID'"
  echo "   Must be alphanumeric with hyphens/underscores, max 64 chars"
  exit 1
fi
```

### Step 3: Create External State Directory

```bash
umask 077
mkdir -p "$HOME/.claude/teams/$TEAM_ID/state"/{checkpoints,findings,handoffs}
chmod 700 "$HOME/.claude/teams/$TEAM_ID"
```

### Step 4: Initialize Manifest

Write to `~/.claude/teams/$TEAM_ID/manifest.json`:

```json
{
  "teamId": "{TEAM_ID}",
  "created": "{ISO_TIMESTAMP}",
  "task": "{task-description}",
  "nativeTeamsEnabled": true,
  "status": "ready",
  "members": []
}
```

### Step 5: Display Setup Complete

```
✅ Native Team initialized: {TEAM_ID}

External state: ~/.claude/teams/{TEAM_ID}/
├── state/findings/     ← Teammate discoveries (JSONL)
├── state/checkpoints/  ← Context snapshots
└── state/handoffs/     ← Transfer records

NEXT: Spawn teammates with natural language:

  "Create an agent team for {task-description}. Spawn teammates:
   - {role1}: {focus}, write to state/findings/{role1}.jsonl
   - {role2}: {focus}, write to state/findings/{role2}.jsonl
   All use JSONL: {ts, type, severity, file, line, msg}
   Checkpoint at 80% context."

KEYBOARD SHORTCUTS:
  Shift+Up/Down  → Select teammate
  Ctrl+T         → Toggle task list
  Enter          → View teammate session
```

## Output Format

```
✅ Native Team initialized

Team ID: {TEAM_ID}
Task: {task-description}
State: ~/.claude/teams/{TEAM_ID}/

Native teams: ✅ Enabled
Ready to spawn teammates via natural language.

Quick start - copy and customize:
────────────────────────────────
Create an agent team to {task}. Spawn teammates:
- analyst: Focus on {area1}, write findings to ~/.claude/teams/{TEAM_ID}/state/findings/analyst.jsonl
- reviewer: Focus on {area2}, write findings to ~/.claude/teams/{TEAM_ID}/state/findings/reviewer.jsonl
JSONL format: {"ts":"...","type":"...","severity":"...","file":"...","line":N,"msg":"..."}
Checkpoint at 80% context to state/checkpoints/.
────────────────────────────────
```

## Related Commands

- `/teams:status {team-id}` - Check team progress
- `/teams:findings {team-id}` - View accumulated findings
- `/teams:synthesize {team-id}` - Generate final report from external state

## Protocol Reference

Implements initialization phase of `protocols/team-orchestration.yaml` (Native Teams).
