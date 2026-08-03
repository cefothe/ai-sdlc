---
paths:
  - "**/*.sh"
  - "**/*.bash"
  - "**/*.zsh"
---

# Shell Scripts

## Header

Always start with:
```bash
#!/usr/bin/env bash
set -euo pipefail
```

| Rule | Detail |
|---|---|
| pipefail | set -o pipefail makes failing_cmd \| grep return non-zero from failing_cmd |
| nounset | set -u catches undefined vars ($UNDEFINED in rm -rf $UNDEFINED/ deletes from /) |

## Quoting

| Rule | Detail |
|---|---|
| quote-all | "$var" not $var (unquoted = word splitting + glob expansion, * expands to all files) |
| double-brackets | [[ ]] not [ ] (handles word splitting, supports regex =~) |

## Cleanup

| Rule | Detail |
|---|---|
| trap | trap cleanup EXIT runs on success/failure/signals (or temp files + jobs leak) |
| mktemp | tmpfile=$(mktemp) not /tmp/myapp.tmp (hardcoded = race conditions + symlink attacks) |
| kill-jobs | trap 'kill $(jobs -p) 2>/dev/null; cleanup' EXIT |

## Common Pitfalls

| Rule | Detail |
|---|---|
| cd-guard | cd /some/dir \|\| exit 1 (unguarded cd failure = wrong directory) |
| local-masking | local var=$(failing_command) always succeeds — split to: local var; var=$(failing_command) |
| newlines | Command substitution strips trailing newlines (matters for checksums) |
| heredoc | <<'EOF' (quoted) no expansion, <<EOF (unquoted) expands vars |
