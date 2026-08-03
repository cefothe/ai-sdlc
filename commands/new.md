---
description: Shape a new feature with the product panel (PM/PO, +CMO/CPO for strategic), write a PRD, scaffold a DoR-ready task, and check readiness
argument-hint: <feature title>   e.g. "feat: add SSO login via OAuth"
allowed-tools: Bash, Read, Write, Task, AskUserQuestion
---

# /ai-sdlc:new — shape and scaffold a new feature

Run the **discovery** panel to plan the feature `$ARGUMENTS` in the best possible
way, capture it as a PRD, then scaffold a DoR-shaped backlog task seeded from that
PRD. The unit of work is a well-shaped, ready task — not a thin stub.

## Steps

> **PRD is product-only. Never ask the operator technical questions here.**
> The what/why (problem, target user, value, success metrics, scope, priority)
> belongs in the PRD; the *how* (language, framework, database, hosting, libraries,
> APIs, self-host-vs-cloud, scraping approach, retry/scaling mechanics) is a
> **design-stage decision recorded as an ADR** by `/ai-sdlc:design` — not something
> to solicit while authoring the PRD. If the operator volunteers a technical
> constraint, note it as a *constraint* in the PRD (one line) and move on; do not
> ask them to choose a stack, DB, or infrastructure. Asking technical questions in
> this command is a defect.

1. **Seed inputs.** Take the feature title from `$ARGUMENTS`. Infer initial
   `labels` from the title/idea (e.g. `frontend`, `auth`, and — if the idea is a
   strategic/roadmap/go-to-market bet — `strategic`/`gtm`/`launch`/`roadmap`).
   The strategic labels decide whether the C-level lenses join the panel. If the
   idea's **product** intent or strategic weight is unclear, ask the operator with
   `AskUserQuestion` — but only **product** questions (who/why/what-success-looks-like),
   never technical ones.

2. **Resolve the discovery panel.** Read `.ai-sdlc/capabilities.yaml` →
   `stages.discovery`. The core panel is `product-manager` + `product-owner`;
   `routing` adds `cmo` for `strategic|gtm|launch|growth` and `cpo` for
   `strategic|roadmap|platform`. Compose the provider set from the inferred labels.

3. **Run the panel.** Dispatch each panelist via the **Task tool** (parallel; use
   Native Teams if 3+ per the dispatch rules), each with the feature idea and its
   own lens from its agent definition:
   - **product-manager** → problem, target user, why-now, success metrics, non-goals
   - **product-owner** → scope, acceptance criteria, references, priority, open questions
   - **cmo** (if routed) → positioning, segment, messaging, launch implications
   - **cpo** (if routed) → strategic fit, build/defer/drop, leverage, sequencing
   The panel is collaborative/advisory — no cross-harness constraint.

4. **Synthesize the PRD.** Write the PRD from the panel output into the
   framework's PRD location, following `docs/prd/_template.md` **exactly** — keep
   every canonical `##` heading (Problem, Target user, Success metrics, Scope,
   Acceptance criteria, Open questions); `prd-gate.js` enforces that structure.
   Set frontmatter `status: draft` and `featureId: <feature-slug>`.
   ```bash
   ID=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT+'/decision-engine/backlog-task-new').nextTaskId(process.cwd()))")
   ```
   Write `docs/prd/<feature-slug>.md` (slug from the title). If the CPO recommends
   **defer/drop**, surface that to the operator and stop unless they choose to proceed.

   Then validate it (structure enforced, quality advisory) and report both:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/prd-gate.js" "docs/prd/<feature-slug>.md" || true
   ```
   Fix any missing/empty sections.

4b. **Clarify (before approval).** Surface ambiguity so the human approves a
   *resolved* PRD, not a vague one. Run the deterministic clarify gate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/clarify-gate.js" "docs/prd/<feature-slug>.md" || true
   ```
   Then do the advisory pass: dispatch the `clarify` provider from
   `.ai-sdlc/capabilities.yaml` (`product-owner`) via the **Task tool** to read the
   PRD and list *unwritten* ambiguities as concrete questions (edge cases, undefined
   states, unnamed segments). Present unresolved open questions + the agent's
   questions to the operator to answer, and fold the answers back into the PRD.
   The PRD stays `status: draft` — a **human must review it and set
   `status: approved`** before the task can be admitted (DoR gate 8). Do NOT flip
   it to approved yourself, and do not proceed to scaffolding while the clarify
   gate reports unresolved questions.

5. **Scaffold the task from the PRD.** Fold the panel's conclusions into the task.
   The `--prd` flag emits a `specRef` block, which DoR gate 3 resolves — so a task
   pointing at a missing PRD is refused admission (the link can't rot):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/backlog-task-new.js" "<title>" --id "$ID" \
     --prd "docs/prd/<feature-slug>.md" --feature-id "<feature-slug>" \
     --labels <a,b> --refs <path1,path2,path3> \
     --ac "<criterion 1>" --ac "<criterion 2>" \
     --metric "<success metric 1>" --metric "<success metric 2>" \
     --priority <low|medium|high> --desc "<one-paragraph problem+scope>"
   ```

6. **Check readiness (DoR).** Report what still blocks dispatch:
   ```bash
   node -e "const R=process.env.CLAUDE_PLUGIN_ROOT;const{loadTaskFile}=require(R+'/decision-engine/backlog-task');const{loadDorConfig,evaluateDor}=require(R+'/decision-engine/dor-gate');const t=loadTaskFile(process.argv[1]);console.log(JSON.stringify(evaluateDor(t,{projectRoot:process.cwd(),config:loadDorConfig('.ai-sdlc/dor-config.yaml')}),null,2))" "backlog/tasks/${ID} - <slug>.md"
   ```
   - `admitted: true` → tell the operator to run `/ai-sdlc:execute ${ID}`.
   - Otherwise → list the failing gates and the exact fields to fix. Never auto-dispatch.

## Notes
- Small features stay lightweight: only PM+PO run unless a strategic label is set.
- Don't invent references — an unresolvable path fails the DoR gate; ask instead.
- The PRD is the durable record of *why*; the task is the buildable *what*.
- Non-interactive shortcut (skips the panel): `npm run task -- "<title>" --refs a,b,c --ac "..."`.
