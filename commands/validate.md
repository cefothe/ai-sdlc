---
description: Run the hard-enforced Definition-of-Done gate — build + full tests + no incomplete-work markers — before a task is Done / a PR opens
argument-hint: [task-id]   (optional; scopes the marker scan to the task's changed files)
allowed-tools: Bash, Read
---

# /ai-sdlc:validate — Definition-of-Done gate (hard-enforced)

The exit counterpart to the DoR gate: a task is NOT Done and a PR is NOT opened
until this passes. It runs the project's build + full test suite and scans the
changed files for incomplete-work markers. **Objective checks — they block the
pipeline (not the author), so they are enforced, unlike the advisory promise gate.**

## Steps

1. **Determine changed files** (for the marker scan): `git diff --name-only <base>...HEAD`
   (base defaults to `main`). Pass each as `--file` below.

2. **Run the DoD gate** using `.ai-sdlc/dod-config.yaml`:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/dod-gate.js" --config .ai-sdlc/dod-config.yaml \
     $(git diff --name-only main...HEAD | sed 's/^/--file /')
   ```
   The gate runs the configured `build` and `test` commands (each must exit 0) and
   the marker scan. It prints PASS/FAIL per check.

3. **Gate the outcome (non-negotiable):**
   - Exit 0 → all enforced checks passed → the task **may** be marked Done / the PR opened.
   - Exit 2 → **BLOCKED**. Do NOT mark the task Done, do NOT open the PR. Report the
     failing check(s) and their output; fix the code (or route back to the implementer
     via an informed retry) and re-run. There is no override in enforce mode.

## Notes
- The build/test commands are per-project (`.ai-sdlc/dod-config.yaml`); set them to the
  real ones (e.g. `npm run typecheck` / `npx vitest run`, `mvn verify`, etc.).
- Set `spec.evaluationMode: warn` to report-without-blocking during adoption; flip to
  `enforce` once the suite is green — objective gates are safe to enforce immediately.
- This runs the FULL suite, not a subset — "tests pass" means the whole project is green.
