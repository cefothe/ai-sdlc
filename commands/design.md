---
description: Turn an approved PRD into the technical how — architects propose high-level designs, a chair converges them into one architecture, then record ADRs + a design doc and scaffold the DoR-ready backlog task from them
argument-hint: <feature-slug>   (matches docs/prd/<slug>.md)
allowed-tools: Bash, Read, Write, Task, AskUserQuestion
---

# /ai-sdlc:design — architecture design stage

Turn an approved PRD into the technical **how**: a detailed design doc and a
comprehensive set of atomic ADRs — then scaffold the buildable backlog task
**from** them. This is the stage that owns task creation: a task never exists
before its architecture does, and DoR gate 9 refuses to admit a feature task
whose design doc is not approved. Produces artifacts + one task, never code.

Feature is `$1` (its PRD is `docs/prd/$1.md`).

## Steps

1. **Read the contract.** Read `docs/prd/$1.md` (must be `status: approved`) and any
   existing `docs/design/$1.md`. If the PRD isn't approved, stop — design follows
   an approved PRD, not a draft.

1b. **Ground the external contracts BEFORE proposing (integration features).** If the
   feature integrates any external API, protocol, or third-party service (venue APIs,
   payment rails, FIX, webhooks, an SDK — anything whose shape you do not own),
   **gather the real contract first.** You may **not** invent endpoint shapes, field
   names, pagination, rate limits, auth models, or fee/pricing formulas. Ask the
   operator, with `AskUserQuestion`, for whatever is missing:
   - the API spec (OpenAPI/Swagger, docs URL, or an in-repo path), per venue/service;
   - sample real responses (list + detail) for the resources being mirrored;
   - the auth model, and the **real** rate limits + pagination (from headers/docs);
   - any fee/pricing formula, with its source.
   Also gather the **sizing inputs** the architecture will rest on — market/record
   counts, read/write rates, latency targets, data volume — from real telemetry or
   the operator, not a guess. Pass everything collected to the panel as ground truth.

   Whatever cannot be sourced is a **blocking open question**, recorded as such: the
   dependent decisions are capped at `confidence: low`, the design doc's Risks list
   each unverified contract as a pre-implementation **spike**, and you tell the
   operator the design is provisional until the specs are supplied. A design built on
   assumed contracts that reads as `confidence: high` is the exact failure this gate
   exists to stop — do not produce one.

1c. **Ground the environment & platform BEFORE proposing (stack + deployment).** The
   **language/runtime** and the **deployment topology** are decided from the
   operator's actual environment — never invented. Detect what the repo already
   fixes: scan for stack manifests (`package.json`, `go.mod`, `pom.xml`,
   `build.gradle`, `pyproject.toml`, `Cargo.toml`, Dockerfiles, IaC, CI configs). If
   the repo already commits to a stack/platform, that is a **constraint**, not an
   open choice — the ADR records *why it fits*, not a fresh bake-off. If the repo is
   greenfield (no manifests), you do **not** know the answer — ask the operator with
   `AskUserQuestion`:
   - existing/preferred **languages & runtimes**, and any team/org stack standard;
   - the **deployment target** (k8s, ECS/Fargate, serverless, VMs, on-prem) and its
     constraints; CI/CD; regions; runtime/ops model and real ops capacity.
   Do **not** treat `.ai-sdlc/capabilities.yaml` agent routing as evidence of the
   team's stack — it configures which agent handles a language, not what you run.
   Do **not** assert "established team runtime", "team convention", or "modest ops
   capacity" as fact: if the operator did not tell you and the repo does not show it,
   it is unknown. Unknown stack/deployment inputs → present the choice to the operator
   (or record at `confidence: low` with "verify by: operator") — never a fabricated
   `confidence: high` stack or topology ADR.

   **Decisions are recorded only after the panel converges (Phase 3) — never during
   the parallel fan-out.** Recording per-architect, in parallel, is what produced
   the old failure mode: four blind lenses each locking in ~10 ADRs in a reserved
   range, with no shared architecture, silent contradictions between ranges, and
   gaps where an architect wrote 3 of its 10. Architecture must converge *before*
   any DEC id is assigned.

1d. **Validate by PoC before locking the contract (optional; integration/API features).**
   When `stages.design.capabilities.poc` is granted and the feature rests on an external
   API/protocol you don't own, you MAY de-risk it with a **small, throwaway** proof-of-concept
   instead of only reading docs — the fastest way to turn a **blocking spike** into a
   **confirmed decision**. Run a minimal, **read-only** probe in a scratch dir (`mktemp -d`,
   never the repo) to confirm the *real* behavior the design will rest on:
   - the endpoint shape + a real list/detail **response schema** (curl/httpie + a tiny script);
   - the **auth** model actually works (a token round-trips);
   - **pagination**, **rate-limit headers**, and any **fee/pricing** field, as they truly are.

   **Scale probe (when the design rests on a data-volume figure).** If the feature has a
   volume/throughput number (N records, req/s, TB), the PoC must also turn that number from
   an *assumption* into a *measurement*: fetch the real page/total count and measure or
   extrapolate the **working-set memory** for the shape the design implies. A measured "the
   full set is ~40k markets × ~KB each = hundreds of MB held at once" is exactly what forces
   the streaming / bounded-memory decision (below) instead of a batch-all-into-RAM implementation
   discovered in production.

   Guardrails: **time-box** it; **read-only / idempotent** calls only (no writes to a live
   system); **never log secrets** (reference the env var, don't echo it); the PoC is
   **evidence, not product code** — do not commit it. Feed the captured output to the panel
   as ground truth, and attach it to the relevant ADR: a passing PoC **raises** that decision's
   `confidence` (spike resolved); a failing/inconclusive one **keeps** it a `confidence: low`
   pre-implementation spike with the finding recorded. Whatever you could not actually confirm
   stays a blocking open question — a PoC that *didn't* run is not a validated contract.

2. **Phase 1 — Propose (parallel, NO ADRs yet).** Read `.ai-sdlc/capabilities.yaml`
   → `stages.design` for the architect roster (route by labels). Resolve the stage's
   **capability grant** and pass it to every architect so grounding (step 1b/1c) uses
   real sources, not guesses:
   ```bash
   node -e "const{loadCapabilityMap,resolveStageCapabilities,formatCapabilityGuidance,capabilityToolNames}=require(process.env.CLAUDE_PLUGIN_ROOT+'/pipeline/capabilities');const m=loadCapabilityMap('.ai-sdlc/capabilities.yaml');const ctx={labels:process.argv.slice(1)};const g=resolveStageCapabilities(m,'design',ctx);console.log(JSON.stringify({tools:capabilityToolNames(g),guidance:formatCapabilityGuidance(g)}))" <task-labels...>
   ```
   Give each architect Task the resolved `tools` as its allowlist and append the
   `guidance` line to its prompt — e.g. firecrawl to **scrape/download the real vendor
   API docs**, `postgres-ro` (when the task carries a `db`/`schema` label) to **inspect
   the live schema**, and `deep-research`/WebSearch for prior art. Dispatch the panel
   **in parallel**, each with the **§Proposal** prompt in
   `commands/references/design-panel-prompt.md`, filling `{{DOMAIN_FOCUS}}` per
   architect — **but dispatch by harness** so the panel is genuinely cross-model:
   - **`harness: claude` (or unset)** architects → the **Task tool** (a real team).
   - **`harness: codex`** architects → the **Codex bridge**, so they truly run on a
     different model (not an inert Task on claude). Pipe the same §Proposal prompt in:
     ```bash
     printf '%s' "$PROMPT" | node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-dispatch.mjs" \
       --type design --role solution-architect-codex --name architect-review
     ```
     Treat its stdout as that architect's proposal. This is diversity-of-perspective
     (claude ∥ codex), converged by the Phase-2 chair — not attestation.

   Each returns, **as structured text only**, a HIGH-LEVEL architecture
   proposal from its lens: the recommended shape, key components/module boundaries,
   and the *candidate decision points* it raises — each named, with 2-4 options and
   their trade-offs, and a leaning. **No DEC numbers, no ADR files, no `decisions.js`,
   no design doc.** Numbering and recording are deferred on purpose (see Phase 3).
   If an agent writes files anyway, discard them and keep only its text.

3. **Phase 2 — Debate, converge, then discuss with the operator (before ANY ADR).**
   The proposals WILL overlap and conflict; this is where the panel *actually discusses
   its choices*. **Never jump from proposals straight to recording** — recording an ADR
   is the *commit*, and it must follow a discussion, not replace one.

   **3a. Critique round — REQUIRED whenever the proposals disagree.** Find every
   decision where two architects pick a different option, assert contradictory facts,
   or differ **numerically** (a fee-bps figure, a rate limit, a sizing number — exactly
   the 175-vs-350 bps kind of split). For each such conflict, give every Phase-1
   architect the *other* proposals and the **§Critique** prompt in
   `commands/references/design-panel-prompt.md` — **"defend or concede, with evidence."**
   Cross-model (claude vs codex) disagreements MUST be debated, not smoothed. Only skip
   this round when the proposals genuinely agree on every decision.

   **3b. Converge.** Dispatch `architect-review` as **chair** with **all** Phase-1
   proposals AND the 3a critique + resolutions, using the **§Convergence** prompt. It
   produces a single coherent **target architecture** (the agreed shape + why it wins)
   and the **consolidated decision list** — deduped, one entry per real choice, each
   with the debated options, the chosen one, why the alternatives lost, a `confidence`,
   and an explicit **`unresolved:`** note for anything the debate could not settle. The
   chair may **not** silently pick a winner for an unresolved conflict, nor average two
   disagreeing numbers — an unsettled item stays flagged.

   **3c. Discuss the decision list with the operator — the gate before recording.**
   Present the consolidated list (still **no DEC ids, no files, nothing written**):
   each decision's chosen option, alternatives, rationale, and confidence. Call out
   **up front** (a) every `unresolved` conflict, (b) every `confidence: low` decision,
   (c) **any place grounding/PoC CONTRADICTED the PRD/ground-truth** (e.g. a fee the
   PRD called "~0%" that live data shows at 100 bps — that contradiction is discussed,
   never silently reconciled into an ADR), and (d) **any scale contradiction** — a
   recorded volume/TB figure whose ingestion/processing data-flow would hold the whole
   dataset in memory (a "we'll use ClickHouse later" datastore ADR sitting next to a
   `fetch-all → normalize → write` v1 that never bounds its working set). A large-N
   design **must** carry an explicit **resource-budget** decision (streaming / per-batch
   upserts / peak-memory ceiling / incremental crash-durable writes), not just a
   future-datastore ADR. Use `AskUserQuestion` for the calls that change an ADR's content
   or confidence. **Do not batch-write ADRs the operator has not seen.** Proceed to
   Phase 3 only after the operator signs off on the decision set.

4. **Phase 3 — Allocate DEC ids + record serially (only after the 3c sign-off).** Only
   now that the decisions are agreed **and the operator has signed off on the list**,
   number them. Get the next free id and assign **contiguously** — the decisions come
   from the converged list, not from any single agent, so there is no parallel-`nextId`
   race to dodge and no reserved-range gaps to reconcile:
   ```bash
   node -e "const{listDecisions}=require(process.env.CLAUDE_PLUGIN_ROOT+'/decision-engine/decisions.js');const ds=listDecisions(process.cwd());const max=ds.reduce((m,d)=>Math.max(m,Number((d.metadata.id.match(/DEC-(\d+)/)||[])[1]||0)),0);console.log('next free:',max+1)"
   ```
   The orchestrator (not the agents) records each decision one at a time. **Every
   core choice gets a full ADR — even the ones the PRD already named** (stack,
   datastore, external deps): a decision being made is exactly when its ADR is
   written. Options = the debated alternatives; rationale = why convergence chose one:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/decisions.js" new --id DEC-<n> --summary "…" \
     --options "a:…,b:…" --context "…" --rationale "…" --consequences "…" --confidence high|medium|low
   ```
   (`scope: project` for foundational/platform decisions; feature scope for
   feature-internal ones.) The CLI warns if a decision is anemic — fill the sections.
   For many ADRs, a one-off Node script using `newDecision`+`writeDecision` in a
   loop is cleaner than N shell calls.

5. **Synthesize the design doc.** Write `docs/design/$1.md` from
   `docs/design/_template.md` — reflecting the **agreed** architecture: the detailed
   schema/DDL, module boundaries, data flow, interfaces, risks, test strategy — and
   link every recorded ADR in its Decisions section. Validate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/design-gate.js" "docs/design/$1.md" || true
   ```

6. **Check ADR coverage.** Run the scanner and resolve every gap:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/adr-coverage.js" .
   ```
   For each area it reports as missing (stack, datastore, build-vs-buy, resilience,
   scale, **resource-budget**, cost, security, observability, api, read-path, …) either
   record the ADR or state explicitly why it's out of scope. Do not leave a foundational
   area silently undecided. **`resource-budget` is distinct from `scale`:** a
   "TB → columnar later" datastore ADR covers `scale` but does **not** satisfy
   `resource-budget` — that area demands a decision on how v1 stays *bounded* at the
   stated volume (streaming vs batch-all-into-RAM, per-batch/incremental crash-durable
   writes, a peak-memory ceiling, backpressure). If it's a gap on a data-volume feature,
   record that ADR **and** carry a matching non-functional acceptance criterion into the
   task (step 7) so the implementer and the NFR/scale reviewer both see it.

7. **Scaffold the backlog task — from the PRD *and* the design.** Now that the
   architecture exists, fold both the product contract and the technical decisions
   into one DoR-shaped task. The `--prd` flag emits the `specRef` block (gate 3 +
   gate 8 resolve it); seed `--refs` with the **design doc** and the concrete
   surfaces the ADRs name, so gate 9's design link and gate 3's ≥3 references are
   both satisfied. Allocate the id first:
   ```bash
   ID=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT+'/decision-engine/backlog-task-new').nextTaskId(process.cwd()))")
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/backlog-task-new.js" "<title>" --id "$ID" \
     --prd "docs/prd/$1.md" --feature-id "$1" \
     --labels <a,b> --refs "docs/design/$1.md,<surface1>,<surface2>" \
     --ac "<criterion 1>" --ac "<criterion 2>" \
     --metric "<success metric 1>" --metric "<success metric 2>" \
     --priority <low|medium|high> --desc "<one-paragraph problem+scope, grounded in the ADRs>"
   ```
   For a **data-volume / throughput** feature, include the `resource-budget` decision as a
   **non-functional acceptance criterion** and add a `scale` (or `performance`/`throughput`/
   `data`) **label** — the AC makes the constraint testable and the label routes the NFR/scale
   reviewer onto the review team. Example AC: *"ingestion holds ≤ one page/batch in memory and
   upserts per batch; a crash after K records retains those K (no all-or-nothing venue write)."*

8. **Check readiness (DoR).** Report what still blocks dispatch — gate 9 will fail
   until the design doc is `status: approved` (and, if the project sets
   `designGate.requireCoverage`, until ADR coverage is complete):
   ```bash
   node -e "const R=process.env.CLAUDE_PLUGIN_ROOT;const{loadTaskFile}=require(R+'/decision-engine/backlog-task');const{loadDorConfig,evaluateDor}=require(R+'/decision-engine/dor-gate');const t=loadTaskFile(process.argv[1]);console.log(JSON.stringify(evaluateDor(t,{projectRoot:process.cwd(),config:loadDorConfig('.ai-sdlc/dor-config.yaml')}),null,2))" "backlog/tasks/${ID} - <slug>.md"
   ```
   - `admitted: true` → tell the operator to run `/ai-sdlc:execute ${ID}`.
   - Otherwise → list the failing gates and the exact fields to fix. Never
     auto-dispatch, and never set the design doc or PRD to `approved` yourself —
     a human ratifies.

9. **Report.** List the ADRs (`npm run decisions -- list`), the design-doc validity,
   any coverage gaps + the panel's biggest-risk note, and the scaffolded task id
   with its DoR verdict. ADRs are `proposed` and the design doc `draft` — a human
   ratifies both before the gate admits the task for implementation.

## Notes
- Design produces **decisions + a design doc + one backlog task, never code.**
  Agents return findings; the orchestrator records the ADRs and scaffolds the task.
  If an architect writes implementation files, discard them.
- Task creation lives here, not in `/ai-sdlc:new`, on purpose: seeding the task
  from the ADRs (not the raw PRD) is what guarantees no task predates its design.
- **Propose → debate → converge → discuss with the operator → record**, in that
  order. The debate (3a) is **required whenever proposals disagree** — a numeric or
  factual split (e.g. 175 vs 350 bps) is resolved with evidence, never smoothed by the
  chair. Recording (Phase 3) is the **commit** and is **gated on an explicit operator
  sign-off of the decision list (3c)** — never batch-write ADRs the operator hasn't
  seen. Architects never record ADRs in parallel; the orchestrator numbers the agreed,
  signed-off decisions contiguously and records them serially. This replaces both the
  old per-architect reserved DEC ranges *and* the failure mode where the chair silently
  reconciled real disagreements and the skill jumped straight to writing ADRs.
- Checklist of areas the panel must cover: `commands/references/adr-coverage-checklist.md`.
