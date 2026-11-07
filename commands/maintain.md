---
description: The maintain loop — deterministic control bands that turn metric breaches into draft bug reports, and scheduled, capped maintenance jobs that create backlog tasks
argument-hint: bands | jobs | all   (default all)
allowed-tools: Bash, Read, Write, Task, AskUserQuestion
---

# /ai-sdlc:maintain — close the loop after merge

People triage; they no longer start the work. Nothing here reaches `main` except through
the normal PR + review + HITL gates.

**Control bands** (`.ai-sdlc/bands.yaml`, template `${CLAUDE_PLUGIN_ROOT}/templates/bands.yaml`):
each metric's series comes from a deterministic source command; a rolling baseline +
Western Electric rules (`decision-engine/control-bands.js`) give a level — no model decides:
- level 1 → logged;
- level 2 → an agent diagnoses **read-only** into a **draft** bug report in `docs/bugs/`
  (a human confirms it, then `/ai-sdlc:bug` scaffolds the fix task);
- level 3 → the same, plus the tier's **pre-approved runbook** from `bands.yaml` (e.g. rollback).

**Maintenance jobs** (`.ai-sdlc/maintenance.yaml`, template `${CLAUDE_PLUGIN_ROOT}/templates/maintenance.yaml`):
feature-flag cleanup, dependency/CVE upgrades… each runs read-only on its days, creates at
most `maxOpen` minus its open tasks, labelled `maintenance:<name>` — managed loops, not
unbounded ones. Landed vs rejected PRs are logged as feedback for the job.

## Steps
1. Run: `node "${CLAUDE_PLUGIN_ROOT}/pipeline/maintain.js" ${1:-all}` and read the JSON report
   (also appended to `.ai-sdlc/maintain.log.jsonl`).
2. For each draft bug report: show it to the owner with `AskUserQuestion` — confirm (set
   `status: confirmed` → `/ai-sdlc:bug` step 6), schedule, or dismiss (dismissals tune the band).
3. For each maintenance task: review and set `dispatchable: true` to let `/ai-sdlc:execute` run it.
4. Scheduled: copy `${CLAUDE_PLUGIN_ROOT}/templates/github/maintain.yml` to `.github/workflows/`.
