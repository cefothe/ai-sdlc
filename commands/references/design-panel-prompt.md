# Design-panel prompt (reusable)

The prompt each architect on the design panel is dispatched with. The point is to
force **comprehensive, non-anemic foundational ADRs** — the WHY behind every core
choice — not feature-internal mechanics only. Fill `{{PRODUCT}}`, `{{PRD_PATH}}`,
`{{DESIGN_PATH}}`, `{{DOMAIN_FOCUS}}`, and `{{ADR_RANGE}}` per architect.

---

DESIGN STAGE for {{PRODUCT}}. Read {{PRD_PATH}} (and {{DESIGN_PATH}} if present) for
context.

You produce **Architecture Decision Records**, not code. Your domain focus:
{{DOMAIN_FOCUS}}.

**Return your ADRs as structured TEXT only. Do NOT write any files and do NOT run
`decisions.js` — the orchestrator records everything centrally to avoid numbering
races and premature writes.** Your reserved ADR id range is **{{ADR_RANGE}}** (e.g.
DEC-0024..DEC-0033); number your ADRs within it and never outside it.

**CRITICAL RULE:** even where a choice appears already made (a stack named in the
PRD, a database the operator mentioned), you MUST still produce a full ADR
documenting the context, the real alternatives with pros AND cons, why the choice
wins, its consequences, and confidence. *A decision being made is exactly when the
ADR is written.* Do NOT skip a decision because it is "settled" — that is how the
reasoning gets lost.

For EACH decision in your domain, return this exact structure:
- **TITLE** (one line)
- **CONTEXT** — forces, constraints, and quantified scale expectations (state your
  assumptions and the numbers)
- **OPTIONS** — 2-4, each with explicit pros AND cons; include the rejected ones
- **DECISION** — the chosen option + rationale (why it beats the alternatives)
- **CONSEQUENCES** — positive and negative trade-offs, and what would trigger
  revisiting this decision
- **CONFIDENCE** — high / medium / low

Be skeptical, quantitative, and comprehensive. Cover every decision area in the
ADR coverage checklist that falls in your domain (see adr-coverage-checklist.md).
End with a short INTEGRITY note: the biggest architectural risk you see.

---

## Panel composition (route by product)

Dispatch these in parallel (a real team), each with a distinct `{{DOMAIN_FOCUS}}`:

- **backend-architect** — backend runtime/language, datastore engine, resilience/
  retry, data model at scale.
- **cloud-architect** (or deployment-engineer) — external-dependency build-vs-buy,
  infrastructure topology + scaling, cost model, rate-limiting where relevant.
- **data-engineer** — data volume/growth estimates, partitioning/indexing, history/
  time-series, dedup at scale. (Include for data-heavy products.)
- **architect-review** — frontend framework (if a UI), API surface, observability,
  security/secrets, and a cross-panel INTEGRITY REVIEW (do the decisions cohere;
  what's the biggest platform risk; what decision area is missing).

Then synthesize the panel output into ADRs with
`npm run decisions -- new --summary … --context … --rationale … --consequences …
--confidence …` and a design doc (docs/design/<feature>.md). Run
`npm run adr-coverage` and resolve or justify every missing area.
