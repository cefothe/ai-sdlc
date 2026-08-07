---
description: Scaffold .ai-sdlc/ config + backlog into a repo (brownfield-safe, non-destructive) and report the triage
argument-hint: [dir] [--workspace]   defaults to the current directory
allowed-tools: Bash, Read
---

# /ai-sdlc:init — bootstrap the framework into a project

Scaffold the AI SDLC control plane (`.ai-sdlc/` config + `backlog/`) into the
target repo. Brownfield-safe: every file is written **only when absent**, no
source is ever modified, and seeded tasks land as `dispatchable:false` pending
DoR triage.

Target directory is `$1` (defaults to the current working directory). Pass
`--workspace` for a multi-repo workspace layout.

## Steps

1. **Run the init engine.** It detects greenfield vs. brownfield, non-destructively
   scaffolds config/backlog, seeds the backlog from source TODO/FIXME markers,
   bootstraps proposed ADRs, and writes a triage report:
   ```bash
   node init/init.js ${1:-.} ${2}
   ```
   - Non-zero exit → print the error and **stop**.
   - Never overwrite operator edits or existing source — the engine already
     guarantees this; if it reports a scaffold write error, surface it.

1b. **Build the cxpak index (the context lever).** If `cxpak` is on PATH, warm the
   repo's structural index so the pre-implement `cxpak_context` call is hot from the
   first task — this is the d=1.82 pre-action lever (R7/R8) the pipeline is built
   around:
   ```bash
   cd ${1:-.} && cxpak overview >/dev/null 2>&1 || true   # builds the persistent .cxpak/ index
   ```
   Indexing is **optional, not blocking** — if `cxpak` isn't installed, note it in
   the triage and continue (the `.mcp.json` the plugin ships will index lazily once
   cxpak is available). Recommend the operator add `.cxpak/` to the repo's
   `.gitignore` (it's a local cache).

2. **Read the triage report.** Open `${1:-.}/.ai-sdlc/triage-report.json` and
   report to the operator:
   - mode (greenfield / brownfield) and files created vs. skipped,
   - seeded tasks (all `dispatchable:false` — they need DoR triage first),
   - proposed ADRs (`lifecycle:proposed` — ratify via architect review),
   - whether cxpak indexing ran.

3. **Next steps (print, don't auto-run).** Tell the operator that before any
   task can be dispatched they must:
   - triage seeded tasks against the DoR gate (`.ai-sdlc/dor-config.yaml`),
   - review `.ai-sdlc/capabilities.yaml` to confirm the stage→agent bindings,
   - ratify or reject the proposed ADRs.

## Notes
- Idempotent: re-running only fills in missing files; it will not clobber an
  existing `.ai-sdlc/`.
- Equivalent shell entry point: `npm run init` (wraps the same engine).
