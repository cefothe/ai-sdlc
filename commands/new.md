---
description: Shape a new feature with the product panel (PM/PO, +CMO/CPO for strategic), write a PRD, and hand off to /ai-sdlc:design. Ends at a reviewed PRD — no task is scaffolded here.
argument-hint: <feature title>   e.g. "feat: add SSO login via OAuth"
allowed-tools: Bash, Read, Write, Task, AskUserQuestion
---

# /ai-sdlc:new — shape a new feature (PRD only)

Run the **discovery** panel to plan the feature `$ARGUMENTS` in the best possible
way and capture it as a PRD. **This command ends at a reviewed PRD.** It does
**not** scaffold a backlog task — going straight from a product idea to a
dispatchable task skips architecture, which is a defect. The technical *how*
(design doc + ADRs) and the buildable task both come next, in `/ai-sdlc:design`.

Lifecycle: `new` (PRD, the why/what) → `design` (design doc + ADRs + task, the
how) → `execute` (build). DoR gate 9 enforces this — a feature task cannot be
admitted for dispatch until its design doc is approved.

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

5. **Stop and hand off to design.** Do **not** scaffold a task. The PRD stays
   `status: draft` until a human reviews it and sets `status: approved`. Report to
   the operator:
   - the PRD path (`docs/prd/<feature-slug>.md`) and its gate result;
   - any unresolved clarify questions still to fold in;
   - the next command: once the PRD is approved, run
     **`/ai-sdlc:design <feature-slug>`** — that stage produces the design doc +
     ADRs (the technical *how*) and scaffolds the DoR-shaped backlog task from
     them. `/ai-sdlc:new` never emits a task, and never tells the operator to run
     `/ai-sdlc:execute` — a task that has not been through design cannot be
     admitted (DoR gate 9).

## Notes
- Small features stay lightweight: only PM+PO run unless a strategic label is set.
- The PRD is the durable record of *why*. The buildable *what* (the task) is
  scaffolded in `/ai-sdlc:design`, seeded from the PRD **and** the ADRs — so no
  task exists before its architecture does.
- Architecture is not a product question. If the operator asks "how do we build
  it?", answer: that's decided in `/ai-sdlc:design` and recorded as ADRs.
