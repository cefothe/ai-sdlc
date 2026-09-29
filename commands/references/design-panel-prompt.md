# Design-panel prompts (reusable)

The design panel runs in phases: architects **propose** high-level designs in
parallel (§Proposal); when the proposals disagree they **critique** each other's
conflicts (§Critique); then a chair **converges** them into one agreed architecture
(§Convergence). ADRs are numbered and recorded by the orchestrator only *after*
convergence **and an explicit operator sign-off of the decision list** — never by the
architects, never during the fan-out, never before the disagreements are resolved.
This is what makes the decisions cohere instead of four blind lenses each locking in
its own range — and stops the chair from silently reconciling a real disagreement.

---

## §Proposal — per-architect prompt (Phase 1, parallel)

Fill `{{PRODUCT}}`, `{{PRD_PATH}}`, `{{DESIGN_PATH}}`, and `{{DOMAIN_FOCUS}}` per
architect. Every architect on the roster gets this same prompt with a distinct
`{{DOMAIN_FOCUS}}`.

---

DESIGN STAGE for {{PRODUCT}} — PROPOSAL PHASE. Read {{PRD_PATH}} (and
{{DESIGN_PATH}} if present) for context. Your domain focus: {{DOMAIN_FOCUS}}.

You produce a **high-level architecture proposal**, not ADRs and not code. This is a
proposal that will be **debated and reconciled with the other architects' proposals
before any decision is recorded** — so argue your reasoning, don't lock anything in.

**GROUND TRUTH ONLY — do not invent.** If this feature integrates an external API or
service, use only contract facts (endpoints, field names, pagination, rate limits,
auth, fee/pricing formulas) that appear in the specs/samples supplied with this task.
Do **not** guess an endpoint shape or a rate limit, and do not fabricate sizing
numbers (record counts, req rates, volumes, latencies). **The same applies to the
environment**: the **language/runtime** and **deployment topology** follow the
operator-supplied stack + platform (or the repo's existing manifests) provided with
this task. Do **not** assert "established team runtime", "team convention", or "ops
capacity" as fact, and do **not** treat the agent roster / capabilities routing as
evidence of the team's stack. Every fact you cannot source from the supplied material
— contract, quantity, OR environment — goes in an explicit
**ASSUMPTIONS-REQUIRING-VERIFICATION** list, and any candidate decision resting on such
an assumption is capped at **CONFIDENCE: low** with a one-line "verify by:
<spike/spec/operator>". A decision that depends on an unverified contract, quantity, or
environment fact can never be high-confidence. If the material you'd need is absent,
say so loudly and present the choice as options for the operator — that is a finding,
not a detail to paper over.

**Return structured TEXT only. Do NOT number decisions (no DEC ids), do NOT write
any files, do NOT run `decisions.js`, do NOT write a design doc.** Numbering and
recording happen centrally after the panel converges.

Return exactly this structure:

- **PROPOSED ARCHITECTURE** — the shape you recommend for your domain: key
  components / module boundaries / data flow, in a few tight paragraphs. State your
  quantified assumptions (scale, volume, latency, cost) explicitly.
- **CANDIDATE DECISIONS** — the decision points your architecture raises. For EACH:
  - **TITLE** (one line)
  - **CONTEXT** — the forces/constraints and the numbers behind it
  - **OPTIONS** — 2-4, each with explicit pros AND cons (include the ones you reject)
  - **LEANING** — which option you favour and why it beats the alternatives
  - **CONFIDENCE** — high / medium / low
  Cover every area in the ADR coverage checklist that falls in your domain (see
  `adr-coverage-checklist.md`). Even a choice the PRD appears to have settled is a
  candidate decision here — surface it so it can be debated and recorded, not lost.
  **If your domain touches data:** the **canonical data/domain model** is a required,
  first-class candidate decision — the entities, fields, keys, relationships, and (for
  a normalization/integration feature) the field-mapping from each source's REAL
  contract to the canonical model. Derive it from the grounded specs; do not smuggle
  it into the datastore-engine choice, and do not assume the source field set.
  **Analysis depth scales with how load-bearing and irreversible the decision is.**
  For an irreversible, foundational choice (data model, datastore, an external
  contract), genuinely *work* the options — quantify from grounded inputs and show how
  the design is derived — rather than listing three and picking one. A thin options
  list is fine on a reversible, low-blast decision; on the data model it is not.
- **DEPENDENCIES & CONFLICTS** — where your proposal depends on, or would clash with,
  another domain's likely choices (name them, so the chair can reconcile).
- **INTEGRITY** — the single biggest architectural risk you see.

Be skeptical, quantitative, and comprehensive. This is a proposal to be challenged.

---

## §Critique — per-architect prompt (Phase 2, required when proposals disagree)

Run this BEFORE convergence for every decision where two proposals pick a different
option, assert contradictory facts, or differ numerically (a fee-bps figure, a rate
limit, a sizing number). Send it to each Phase-1 architect with the *other* proposals
pasted in. Fill `{{PRODUCT}}`, `{{YOUR_PROPOSAL}}`, `{{OTHER_PROPOSALS}}`, and
`{{CONFLICTS}}` (the specific disagreements to adjudicate). The point is a real
argument on the merits — not a vote, not an average.

---

DESIGN STAGE for {{PRODUCT}} — CRITIQUE PHASE. Your proposal:

{{YOUR_PROPOSAL}}

The other architects proposed:

{{OTHER_PROPOSALS}}

These specific decisions are in conflict across the panel:

{{CONFLICTS}}

For EACH conflict, **defend or concede — with evidence**:
- If you defend your choice: give the concrete evidence (a real API response, a doc/spec
  citation, a measured number, a named trade-off). Assertion without evidence is not a defense.
- If you concede: say so plainly and state which option now wins and why.
- For a **numeric or factual** disagreement (e.g. 175 vs 350 bps): do not split the
  difference — one of you is wrong. Show the calculation or the source that settles it,
  or mark it explicitly as **needs a spike / operator call** if it genuinely cannot be
  settled from available evidence.

Return structured TEXT only, per conflict: `{ conflict, position: defend|concede,
evidence, resolved_option | unresolved_reason }`. No files, no DEC ids.

---

## §Convergence — chair prompt (Phase 2, single agent: architect-review)

Dispatch `architect-review` as chair with **all** Phase-1 proposals pasted in. Fill
`{{PRODUCT}}`, `{{PRD_PATH}}`, and `{{PROPOSALS}}`.

---

DESIGN STAGE for {{PRODUCT}} — CONVERGENCE PHASE. The PRD is {{PRD_PATH}}. Below are
the architects' independent high-level proposals:

{{PROPOSALS}}

You are the **chair**. Your job is to reconcile these into ONE coherent architecture
and a single, deduped decision list — resolving conflicts explicitly rather than
stapling the proposals together. Return structured TEXT only (no files, no DEC ids —
the orchestrator numbers and records afterward).

Return exactly this structure:

- **AGREED ARCHITECTURE** — the single target design the whole panel should build to:
  components, boundaries, data flow, and how the domains fit together. Where
  proposals conflicted, state which way you resolved it and why.
- **CONSOLIDATED DECISIONS** — one entry per real choice, deduped across proposals.
  For EACH, ready for the orchestrator to record verbatim as an ADR:
  - **TITLE**
  - **CONTEXT** — forces, constraints, quantified assumptions
  - **OPTIONS** — the alternatives actually debated across the proposals, pros + cons
  - **DECISION** — the chosen option + rationale (why it beats the alternatives)
  - **CONSEQUENCES** — positive and negative trade-offs; what would trigger revisiting
  - **CONFIDENCE** — high / medium / low
  - **SCOPE** — `project` (foundational/platform) or feature-scoped
- **UNVERIFIED CONTRACTS & ASSUMPTIONS** — collect every ASSUMPTIONS-REQUIRING-
  VERIFICATION item from the proposals. Each decision that rests on one is capped at
  `confidence: low` and carries a "verify by: <spike/spec/operator>". Do NOT launder an
  assumed contract or an invented quantity into a high-confidence decision — if the
  supplied specs don't establish it, it stays low-confidence and surfaces here.
- **UNRESOLVED** — any conflict you could NOT settle on the merits. Escalate these to
  the operator with the trade-off framed; do NOT paper over them with a silent pick.
- **COVERAGE** — confirm every ADR-coverage-checklist area is either decided above or
  explicitly declared out of scope for this feature (with a one-line why).
- **INTEGRITY** — the biggest platform-level risk in the agreed architecture.
