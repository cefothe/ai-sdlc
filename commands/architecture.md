---
description: Create or refresh the high-level architecture overview (docs/architecture/overview.md) from the real codebase — the system map every design doc references and every agent is given
argument-hint: [refresh]   (default: create when missing, otherwise refresh against the code)
allowed-tools: Bash, Read, Write, Edit, Task, Skill, AskUserQuestion
---

# /ai-sdlc:architecture — the system map

`docs/architecture/overview.md` is the one document that tells every agent what the
system's components are, which code each owns, how they connect, who owns which
data, and which rules no change may break. It is:

- **required by the design gate** — while it exists and is incomplete no design doc
  passes; when valid, every design doc must reference it (`architecture:` frontmatter)
  and name the components it touches, or declare `New component: <name>`;
- **injected** — `/ai-sdlc:design` hands it to the architects, and `/ai-sdlc:execute`
  gives the planner, implementer and reviewers the slice their task reaches (its
  components, their contracts and data ownership, every invariant).

It describes the system **as built**, never as wished. Aspirations belong in ADRs and
design docs.

## Steps

1. **Ground in the code (read-only).** Build the evidence before writing a line:
   ```bash
   cxpak overview --tokens 6k
   ```
   plus the MCP ops `cxpak_insight` (op `architecture`, `conventions`) and `cxpak_graph`
   (op `api_surface`, `call_graph`) for the module boundaries and the calls that cross
   them. Read the existing ADRs (`npm run decisions -- list`), `README.md`, deployment
   files (Dockerfile, compose, k8s/helm, CI workflows) and any existing
   `docs/architecture*` material.

2. **Draft with the architects.** Dispatch `architect-review` and `backend-architect`
   (add `cloud-architect` when deployment is non-trivial) via the **Task tool** with the
   evidence. Each component must name the code it lives in (backticked paths); each
   integration contract is an edge `Caller → Callee: mechanism, contract <location>`
   taken from real call sites, not inferred from names; data ownership states who
   writes each store; invariants are rules the code already holds (or that an ADR
   mandates). Where the code violates an intended rule, record the rule AND the
   violation as a risk to raise — do not paper over it.

3. **Write** `docs/architecture/overview.md` from
   `${CLAUDE_PLUGIN_ROOT}/docs/architecture/_template.md`, keeping every `##` section.
   On a refresh, edit in place: add new components/contracts, remove ones the code no
   longer has, and keep the doc's own history in git. The overview is the **general
   level** — what the components are, how they connect, who owns what data.

3a. **One doc per component.** For every component in the list, write
   `docs/architecture/components/<slug>.md` from
   `${CLAUDE_PLUGIN_ROOT}/docs/architecture/components/_template.md` and link it from the
   component's entry (`Details: [components/<slug>.md](components/<slug>.md)`). It is the
   **detailed level**, grounded in that component's code (`cxpak_graph` api_surface /
   call_graph on its paths): responsibility and non-responsibilities, every code path the
   overview gives it, concrete interfaces, dependencies (through which contracts), owned
   data, internal structure, key flows, failure modes, the ADRs that bind it, and how it is
   tested. Components are independent, so draft their docs in parallel (one architect per
   few components via the Task tool). Missing docs can be scaffolded with
   `node "${CLAUDE_PLUGIN_ROOT}/decision-engine/migrate.js" --apply` — scaffolds count as
   empty until filled.

3b. **Diagrams (required).** Whoever writes the doc draws its diagrams in the same pass —
   load the `mermaid-diagrams` skill (Skill tool) and add fenced mermaid blocks: a component
   diagram (flowchart or C4Container) in **Components** showing every component and the
   contracts between them, and at least one `sequenceDiagram` per critical cross-component
   flow in **Integration contracts**; in each component doc, a flowchart or classDiagram in
   **Internal structure** and a `sequenceDiagram` with the failure path in **Key flows**.
   Diagrams match the text — the gate fails a component
   diagram that leaves out a listed component (`diagram-missing-component`). Only a large
   brownfield refresh (many components drawn from the code) is delegated, to the
   `mermaid-expert` agent following the same skill.

4. **Validate** until clean — the overview, every component doc and every feature
   architecture (`docs/architecture/features/<feature>.md`, written per PRD by
   `/ai-sdlc:design`; a refresh that renames or removes a component or contract updates
   the feature docs that use it):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/architecture-context.js" --validate
   ```

5. **Human review.** Present the component map, the contract edges and the invariants
   with `AskUserQuestion`; fold corrections in. The operator owns this document — set
   `owner` and `updated` from their answer.

5b. **Existing features (brownfield).** A project that already has PRDs/designs gets a
   feature architecture for each of them — the cross-service view of every journey. Once
   the overview and component docs validate, run `/ai-sdlc:migrate` (its scan lists every
   feature with the components the evidence ties it to; `--apply` scaffolds the docs and
   step 4 has architects write them from the code). On a refresh that renames, splits or
   removes a component or contract, the root gate fails every feature doc that still uses
   the old one — update those in the same change.

6. **Re-check the designs.** `node "${CLAUDE_PLUGIN_ROOT}/decision-engine/migrate.js"`
   shows which existing design docs now need to reference the overview, name their
   components or get a feature architecture (`--apply` scaffolds one per design, with the
   overview components the design names).

## Keeping it current
- `/ai-sdlc:design`: a design that adds or changes a component, contract or data owner
  updates this overview in the same change.
- Changes under `docs/architecture/` are `slow` pace (draft PR, full review), and the DoD
  gate re-runs the architecture validation whenever a change touches `docs/architecture/`
  (an execute that edits the overview or a component doc cannot leave it invalid).
- Re-run `/ai-sdlc:architecture refresh` after large refactors.
