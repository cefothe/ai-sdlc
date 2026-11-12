---
description: Migrate existing PRDs, design docs, ADRs, the product context and open tasks to the current gates — and write a feature architecture for every existing feature — scan, add structure, fill content from evidence, then a human re-approves
argument-hint: [--only prd|design|feature|adr|tasks]   (default: everything, in-flight first)
allowed-tools: Bash, Read, Write, Edit, Task, AskUserQuestion
---

# /ai-sdlc:migrate — bring existing artifacts up to the current flow

The gates got stricter: PRDs need 10 grounded sections; design docs need a concrete
schema, interfaces, failure paths and a test strategy mapping every PRD AC; ADRs need
context / rationale / consequences / described alternatives; PRDs tie to a product
context; bug tasks need a bug report; every feature (an approved PRD or a design doc)
needs a feature architecture `docs/architecture/features/<feature>.md` — the feature /
user journey across every component it touches. Artifacts written before that fail DoR gates
8/9/10 and block their tasks. This command migrates them **without inventing
anything**: deterministic structure first, then content drawn only from evidence,
then a human re-approves.

## Steps

1. **Scan (read-only).** See what fails, ordered by in-flight impact (artifacts that
   open tasks depend on first):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/migrate.js" || true
   ```
   Show the operator the report and confirm scope (everything, or `--only` a kind).

2. **Product context first.** Every PRD is checked against it. If missing or
   incomplete, fill `docs/product/context.md` by asking the operator **product**
   questions (personas, metric baselines with source + date, regulatory
   constraints, current capabilities) — or by deriving current capabilities from
   existing PRDs/README. Validate:
   `node "${CLAUDE_PLUGIN_ROOT}/decision-engine/product-context.js" --validate`.

2b. **Architecture overview next.** Every design doc must reference it and name its
   components. If `docs/architecture/overview.md` is missing or incomplete, run
   `/ai-sdlc:architecture` (built from the real code via cxpak) before migrating designs.
   Feature architectures are only asked for once the overview is written — they are
   checked against its components and contracts.

3. **Add structure (deterministic).**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/migrate.js" --apply || true
   ```
   Adds missing section skeletons from the templates, the design's `relatedPrd`
   link and per-AC test-strategy placeholders, scaffolds the product context if
   absent, and scaffolds `docs/architecture/features/<feature>.md` for every feature that
   has none, with `components:` set from the scan's **evidence** (components its design or
   PRD names, plus the owners of the code paths its open and completed backlog tasks
   reference — each listed with its source in the report, with the overview contracts
   between them). Skeletons are template placeholders, which the gates treat as empty — the
   artifacts still fail until step 4 writes real content. No status is changed.

4. **Fill content from evidence — never invent.** For each failing artifact (in-flight
   first), dispatch via the **Task tool** with the artifact, its gate `reasons`, and
   the evidence: the code (`cxpak_graph` trace / `cxpak_insight` architecture), git
   history of the feature, linked tasks/PRs, the related PRD/design/ADRs, the product
   context.
   - **PRD** → `product-owner` (+ `product-manager` for problem/metrics): fill Non-goals,
     User flows, Edge cases, NFRs, measurable baseline → target metrics, persona-named
     Target user. What the evidence cannot answer goes to **Open questions** for the
     operator — not into the body as a guess.
   - **Design doc** → `architect-review` (+ `backend-architect`): write the schema/DDL,
     interface signatures and data-flow failure paths **as the code actually
     implements them**; map each PRD AC in Test strategy (`AC1 — integration: …`) to
     the tests that exist or must be written. Where the code and the doc disagree,
     surface the conflict to the operator — do not silently pick one.
   - **Feature architecture** → `architect-review` (+ `backend-architect` for a journey across
     many services), one feature per dispatch, in parallel across features. Give it the
     scaffold, the report's evidence (components with sources, candidate contracts), the PRD
     (Journey and User flows), the design doc, the component docs of the evidence components,
     and the code: trace the journey's entry point across components with `cxpak_graph`
     (`trace` / `call_graph` / `blast_radius`) and `architecture_lookup`. It writes, **as the
     code actually runs it**: the confirmed `components:` list (drop an evidence component the
     journey does not reach; add one the trace reaches — say which and why), the Journey, a
     component diagram and an end-to-end `sequenceDiagram` with the failure path (load the
     `mermaid-diagrams` skill), the Contracts it really uses (each an overview contract —
     a real call with no overview contract is a gap to fix in the overview, flagged to the
     operator, not wired around), data ownership, quality attributes as measured or
     specified (unknown → say so; never invent a latency figure), and the DEC ids that shape
     it. Stay high-level — the detail stays in the design doc. Validate each:
     `node "${CLAUDE_PLUGIN_ROOT}/decision-engine/feature-architecture.js" docs/architecture/features/<feature>.md`.
     A shipped feature with no PRD has no feature to migrate; capture it through
     `/ai-sdlc:new` first if it needs one.
   - **ADR** → `architect-review`: reconstruct context / rationale / consequences and
     the rejected alternatives from the design doc, commits and code. Record them
     append-only (gaps only; an ADR whose decision itself changed must be superseded
     by a new ADR, not amended):
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/decision-engine/decisions.js" amend --id DEC-NNNN \
       --context "…" --rationale "…" --consequences "…" \
       --describe "chosen-option:why it won" --add-options "alt:why it was rejected"
     ```
     If the reasoning genuinely cannot be recovered, ask the operator; do not fabricate.
   - **Open tasks** → re-seed ACs from the PRD (append the missing PRD ACs to the task's
     AC block verbatim); triage every `bug`-labelled task without a report through
     `/ai-sdlc:bug` so it links one.

5. **Re-run the gates** until the scan is clean (or only items the operator chose to
   defer remain):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/migrate.js"
   ```

6. **Human re-approval.** A migrated PRD/design that was `approved` was approved for
   different content, and a feature architecture is new content: the operator reviews each
   one (component list, diagrams, contracts) and sets `status: approved`. Present each one's diff to the operator with `AskUserQuestion`;
   they keep or set `status: approved` only after reviewing it. Never approve on their
   behalf. Then re-run the DoR check (`/ai-sdlc:design` step 8) for the in-flight tasks.

## Notes
- Changes to `.ai-sdlc/_decisions/`, `docs/prd|design|product/` are `slow` pace and the
  migration PR opens as a draft; edits to gate/policy files still stop at the HITL gate.
- Migrate on a branch and land it as one reviewed PR per artifact family (product
  context + PRDs, then feature architectures, then designs + ADRs) so reviewers can follow it.
- `node "${CLAUDE_PLUGIN_ROOT}/decision-engine/feature-architecture.js" --matrix` shows the
  resulting feature × component matrix.
