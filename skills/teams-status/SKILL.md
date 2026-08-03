---
name: teams-status
description: Check Native Teams status and progress.
---


# /teams:status - Check Team Progress

Display current status of an Native Team from external state.

## Usage

```
/teams:status [team-id]
```

If `team-id` not provided, list all active teams.

## Execution

### List All Teams (no argument)

```bash
ls -la ~/.claude/teams/ | grep -v archive
```

Output:
```
Active Native Teams:
- team-1707745200: PR Review #123 (3 teammates, 12 findings)
- team-1707748800: Feature Implementation (4 teammates, in progress)
```

### Specific Team Status

Validate team-id and read manifest and findings:

```bash
# Validate team-id (MANDATORY before any filesystem operation)
TEAM_ID="{team-id}"  # substitute actual value
if [[ ! "$TEAM_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]]; then
  echo "❌ Invalid team-id: must be alphanumeric with hyphens/underscores, max 64 chars"
  exit 1
fi

TEAM_DIR="$HOME/.claude/teams/$TEAM_ID"

# Read manifest
cat "$TEAM_DIR/manifest.json"

# Count findings per teammate
for f in "$TEAM_DIR"/state/findings/*.jsonl; do
  name=$(basename "$f" .jsonl)
  count=$(wc -l < "$f")
  echo "$name: $count findings"
done

# Check for checkpoints (indicates context issues)
ls "$TEAM_DIR"/state/checkpoints/

# Check for handoffs
ls "$TEAM_DIR"/state/handoffs/
```

## Output Format

```
Native Team: {team-id}
Task: {task-description}
Status: {active|complete|needs_recovery}
Created: {timestamp}

Teammates:
┌─────────────────┬──────────┬──────────┐
│ Name            │ Findings │ Status   │
├─────────────────┼──────────┼──────────┤
│ security        │ 5        │ complete │
│ performance     │ 3        │ active   │
│ architecture    │ 2        │ complete │
│ testing         │ 0        │ pending  │
└─────────────────┴──────────┴──────────┘

Total findings: 10
Checkpoints: 1 (security handed off)
Handoffs: 1

Findings by severity:
- Critical: 1
- High: 3
- Medium: 4
- Low: 2

Use /teams:findings {team-id} to view details.
```

## Implementation

1. Read `manifest.json` for team metadata
2. Count lines in each `state/findings/*.jsonl`
3. Parse findings for severity counts
4. Check `state/checkpoints/` for any handoffs
5. Determine overall status
