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

1. **Run the DoD gate** against the base branch (default `main`) using
   `.ai-sdlc/dod-config.yaml`:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/dod-gate.js" --config .ai-sdlc/dod-config.yaml --base main
   ```
   `--base` derives the changed files (`git diff --name-only main...HEAD`) for the
   marker scan and `paths:` scoping, and exports `AI_SDLC_BASE` /
   `AI_SDLC_CHANGED_FILES` to every check command. The gate runs **every** declared
   check concurrently (each must exit 0) plus the marker scan, printing
   PASS/FAIL/SKIP and the duration per check. A `type: github-checks` check waits for
   CI on the branch's PR — run the gate in the background and wait for it.

2. **Gate the outcome (non-negotiable):**
   - Exit 0 → all enforced checks passed → the task **may** be marked Done / the PR opened.
   - Exit 2 → **BLOCKED**. Do NOT mark the task Done, do NOT open the PR. Report the
     failing check(s) and their output; fix the code (or route back to the implementer
     via an informed retry) and re-run. There is no override in enforce mode.

## Notes
- The build/test commands are per-project (`.ai-sdlc/dod-config.yaml`); set them to the
  real ones (e.g. `npm run typecheck` / `npx vitest run`, `mvn verify`, etc.).
- Set `spec.evaluationMode: warn` to report-without-blocking during adoption; flip to
  `enforce` once the suite is green — objective gates are safe to enforce immediately.
- "Tests pass" means the whole project is green — but the gate need not replay the whole
  matrix locally to prove it. Scope local checks to what changed (`paths:`, or a command
  that reads `AI_SDLC_CHANGED_FILES`, e.g. a changed-packages planner) and let a
  `type: github-checks` check hold the authoritative CI result.
