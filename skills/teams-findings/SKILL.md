---
name: teams-findings
description: View Native Teams findings from JSONL.
---


# /teams:findings - View Team Findings

Display accumulated findings from all teammates in an Native Team.

## Usage

```
/teams:findings {team-id} [--severity critical|high|medium|low] [--type vulnerability|bug|performance]
```

## Arguments

- `team-id` (required): Team identifier
- `--severity` (optional): Filter by severity level
- `--type` (optional): Filter by finding type

## Execution

### Validate and Read All Findings

```bash
# Validate team-id (MANDATORY before any filesystem operation)
TEAM_ID="{team-id}"  # substitute actual value
if [[ ! "$TEAM_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]]; then
  echo "❌ Invalid team-id: must be alphanumeric with hyphens/underscores, max 64 chars"
  exit 1
fi

TEAM_DIR="$HOME/.claude/teams/$TEAM_ID"

# Concatenate all findings
cat "$TEAM_DIR"/state/findings/*.jsonl
```

### Parse and Display

Read JSONL, parse each line as JSON, format for display.

## Output Format

```
Findings for team: {team-id}
Total: {N} findings from {M} teammates

CRITICAL (1):
────────────────────────────────
[security] src/auth/login.js:42
  SQL injection in user lookup
  Evidence: db.query(`SELECT * FROM users WHERE id = ${userId}`)
  Fix: Use parameterized query

HIGH (3):
────────────────────────────────
[security] src/auth/session.js:78
  Session token exposed in URL
  Evidence: redirect(`/dashboard?token=${token}`)
  Fix: Use HTTP-only cookie

[performance] src/api/orders.js:156
  N+1 query in order listing
  Evidence: orders.forEach(o => loadItems(o.id))
  Fix: Use eager loading with JOIN

[architecture] src/services/payment.js:23
  Circular dependency with billing module
  Evidence: import { billing } from './billing' (which imports payment)
  Fix: Extract shared interface

MEDIUM (4):
────────────────────────────────
...

LOW (2):
────────────────────────────────
...

────────────────────────────────
Source files:
- state/findings/security.jsonl (5 findings)
- state/findings/performance.jsonl (3 findings)
- state/findings/architecture.jsonl (2 findings)
```

## Filtering Examples

```bash
# Critical only
/teams:findings team-123 --severity critical

# All vulnerabilities
/teams:findings team-123 --type vulnerability

# High severity bugs
/teams:findings team-123 --severity high --type bug
```

## Implementation

1. Read all `state/findings/*.jsonl` files
2. Parse each line as JSON
3. Apply filters if specified
4. Sort by severity (critical → high → medium → low → info)
5. Group and display with context
