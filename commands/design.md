---
description: Run the design panel for a feature — dispatch architects, produce a design doc + comprehensive ADRs, and check ADR coverage
argument-hint: <feature-slug>   (matches docs/prd/<slug>.md)
allowed-tools: Bash, Read, Write, Task
---

# /ai-sdlc:design — architecture design stage

Turn an approved PRD into the technical **how**: a detailed design doc and a
comprehensive set of atomic ADRs. Produces artifacts, never code.

Feature is `$1` (its PRD is `docs/prd/$1.md`).

## Steps

1. **Read the contract.** Read `docs/prd/$1.md` (must be `status: approved`) and any
   existing `docs/design/$1.md`. If the PRD isn't approved, stop — design follows
   an approved PRD, not a draft.

2. **Allocate ADR number blocks up front (do this BEFORE dispatch).** Parallel
   agents that each pick "the next free DEC id" collide — this actually happened
   (two architects both wrote DEC-0024..0028). The orchestrator owns numbering:
   ```bash
   node -e "const{listDecisions}=require(process.env.CLAUDE_PLUGIN_ROOT+'/decision-engine/decisions.js');const ds=listDecisions(process.cwd());const max=ds.reduce((m,d)=>Math.max(m,Number((d.metadata.id.match(/DEC-(\d+)/)||[])[1]||0)),0);console.log('next free:',max+1)"
   ```
   From `next free`, hand each architect a **disjoint reserved range** (e.g. 10
   ids each): architect A → `DEC-<n>..<n+9>`, B → `<n+10>..<n+19>`, and so on.
   Pass the assigned range to each in its prompt.

3. **Dispatch the panel.** Read `.ai-sdlc/capabilities.yaml` → `stages.design` for
   the architect roster (route by labels). Dispatch them **in parallel via the Task
   tool** (a real team), each with the reusable prompt in
   `commands/references/design-panel-prompt.md`, filling `{{DOMAIN_FOCUS}}` and
   `{{ADR_RANGE}}` per architect. The panel is collaborative/advisory (no
   cross-harness constraint).

   Two non-negotiable rules in the prompt:
   - **Agents RETURN findings as structured text — they do NOT write ADR files or
     run `decisions.js`.** The orchestrator records everything centrally in step 5,
     so there are no write races and no premature side effects. If an agent writes
     files anyway, discard them and record from its text.
   - **Every core choice gets a full ADR — even the ones already decided in the
     PRD** (stack, datastore, external deps). A decision being made is when the ADR
     is written. Each ADR carries Context / Options (pros + cons) /
     Decision-rationale / Consequences / Confidence, and states its assigned DEC id
     from its allocated range.

4. **Synthesize the design doc.** Write `docs/design/$1.md` from
   `docs/design/_template.md` — the detailed schema/DDL, module boundaries, data
   flow, interfaces, risks, test strategy — and link every ADR in its Decisions
   section. Validate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/design-gate.js" "docs/design/$1.md" || true
   ```

5. **Record the ADRs — serially, from the panel's returned text.** The orchestrator
   (not the agents) writes each `Decision`, one at a time, so `nextId` allocates
   without contention. Use each architect's assigned DEC ids (from step 2) so
   numbering is deterministic and gap-free even if an agent crashed mid-run (you'll
   see the gap in its block and can re-dispatch just that range). One atomic
   `Decision` per choice, with the canonical sections:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/decisions.js" new --id DEC-<n> --summary "…" \
     --options "a:…,b:…" --context "…" --rationale "…" --consequences "…" --confidence high|medium|low
   ```
   (`scope: project` for foundational/platform decisions; feature scope for
   feature-internal ones.) The CLI warns if a decision is anemic — fill the sections.
   For many ADRs, a one-off Node script using `newDecision`+`writeDecision` in a
   loop is cleaner than N shell calls.

6. **Check ADR coverage.** Run the scanner and resolve every gap:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/adr-coverage.js" .
   ```
   For each area it reports as missing (stack, datastore, build-vs-buy, resilience,
   scale, cost, security, observability, api, read-path, …) either record the ADR
   or state explicitly why it's out of scope for this feature. Do not leave a
   foundational area silently undecided.

7. **Report.** List the ADRs (`npm run decisions -- list`), the design-doc validity,
   and any coverage gaps + the panel's biggest-risk note. ADRs are `proposed` and
   the design doc `draft` — a human ratifies before implementation.

## Notes
- Design produces **decisions + a design doc, never code.** Agents return findings;
  the orchestrator records. If an architect writes implementation files, discard them.
- Up-front ADR-number blocks + serial orchestrator recording prevent the numbering
  collision that parallel `nextId` allocation causes.
- Checklist of areas the panel must cover: `commands/references/adr-coverage-checklist.md`.
