---
description: Triage a bug into a reproducible, confirmed bug report and scaffold the fix task — the bug flow's entry point (no PRD/design; the reproduction is the RED oracle)
argument-hint: <symptom | GitHub issue URL/number | incident id>
allowed-tools: Bash, Read, Write, Task, AskUserQuestion
---

# /ai-sdlc:bug — triage a bug into a dispatchable fix task

Features flow `new` (PRD) → `design` (design doc + ADRs) → `execute`. A bug does
not need a PRD or an architecture — it needs a **triaged, reproducible report**.
This command turns `$ARGUMENTS` into `docs/bugs/<bug-id>.md` and a backlog task
linked to it (`specRef.source: bug`). DoR gate 10 admits the task only when the
report is valid and a human has set `status: confirmed`; gates 8/9 (PRD/design)
do not apply to bug tasks.

At execute time the report is the spec: the test author turns its
**Reproduction** into a failing test first, the fix node's accept runs it (RED →
GREEN), reviewers check the fix against it, and the HITL gate still applies.

## Steps

1. **Intake.** Gather the raw report:
   - a GitHub issue → `gh issue view <n> --json title,body,labels,comments`;
   - an incident/log/test failure → read what the operator points at;
   - plain text → ask the operator (with `AskUserQuestion`) for whatever the template
     needs and you cannot find: environment/version, exact steps, expected vs actual,
     who is affected. Never invent reproduction steps or error text.
   Pick a kebab `bug-id` (e.g. `order-cancel-double-refund`).

2. **Is it a bug?** If the "expected behavior" is not specified anywhere (no PRD AC,
   contract, test or documented behavior says so), it is a **feature request** — say
   so and hand off to `/ai-sdlc:new` instead. If it duplicates an open bug report in
   `docs/bugs/`, link to it and stop.

3. **Triage (read-only investigation).** Dispatch `debugger` (and `error-detective`
   for log/stack-trace evidence) via the **Task tool** with the raw report. They:
   - locate the suspected cause (files/functions) using `cxpak_graph` (`trace` /
     `blast_radius`) and the code — read-only, no fixes;
   - try to reproduce with existing commands/tests (never against production data);
   - design the **Reproduction**: the failing test that proves the bug — file path,
     the assertion, and the exact command to run it (RED before the fix, GREEN after);
   - identify the feature this regresses (`docs/prd/<slug>.md` → `relatedPrd`) and any
     ADRs the fix must honor (`relatedAdrs`).
   Load the product context for severity/impact framing:
   `node "${CLAUDE_PLUGIN_ROOT}/decision-engine/product-context.js" "$ARGUMENTS"`.

4. **Write the report** at `docs/bugs/<bug-id>.md` from `docs/bugs/_template.md`
   (`${CLAUDE_PLUGIN_ROOT}/docs/bugs/_template.md`), keeping every `##` section,
   `status: draft`, `severity` one of critical/major/minor/trivial (justified by
   Impact). Validate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/bug-gate.js" "docs/bugs/<bug-id>.md" || true
   ```
   Fix every `reasons` entry except `status`.

5. **Human confirms the triage.** Show the operator the report (summary, severity,
   reproduction, suspected cause) with `AskUserQuestion`. Only the human sets
   `status: confirmed` — never flip it yourself. `critical` severity: also ask whether
   it is a hotfix (adds the `hotfix` label).

6. **Scaffold the fix task** — ACs come from the report (reproduction passes,
   expected behavior holds, no regression); add `--ac` only for extra criteria:
   ```bash
   ID=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT+'/decision-engine/backlog-task-new').nextTaskId(process.cwd()))")
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/backlog-task-new.js" "fix: <symptom>" --id "$ID" \
     --bug "docs/bugs/<bug-id>.md" --labels "<severity>,<area>" \
     --refs "docs/bugs/<bug-id>.md,<suspected file 1>,<suspected file 2>" \
     --priority <high for critical/major|medium|low> --desc "<one paragraph: symptom, impact, suspected cause>"
   ```
   Add the `security` label when the bug is a vulnerability (routes the security
   reviewer) and `scale`/`performance` for a performance regression.

7. **Check readiness.** Run the DoR check from `/ai-sdlc:design` step 8 on the new task.
   Gate 10 fails until the report is `status: confirmed`. When `admitted: true`, tell
   the operator to run `/ai-sdlc:execute ${ID}`.

## Notes
- The reproduction test is written by the test author inside the execute worktree,
  not here — this command changes only `docs/bugs/` and `backlog/`.
- A fix that touches a HITL checkpoint (migrations, CI, secrets, CLAUDE.md, …) still
  stops for human sign-off before push.
- If triage shows the "bug" is a design flaw (the design itself is wrong), record it:
  the fix needs an ADR (`/ai-sdlc:design`), not a patch.
