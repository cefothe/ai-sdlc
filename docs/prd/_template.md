---
status: draft          # draft | approved  — a human sets `approved` (DoR gate 8 blocks draft)
owner: ''              # who owns this PRD
featureId: ''          # kebab slug; must match the task's specRef.featureId
relatedAdrs: []        # DEC-NNNN references, if any
acStyle: v2            # v2 = each AC is one observable outcome + a "Why:" and names no formats/field names (enforced)
---

# PRD: <Feature Name>

> Canonical structure — every `##` section below is REQUIRED and enforced by
> `prd-gate.js` (the same list `/ai-sdlc:new` writes from), so all PRDs are
> identical by construction. Keep the headings; fill the bodies concretely —
> this document is handed to the implementer and the reviewers verbatim.
> Enforced substance: every section >= 30 chars (except Open questions), >= 2
> acceptance criteria as list items, measurable success metrics, and no
> unresolved open questions at approval. Optional strategic sections (Why now,
> Go-to-market, Strategic fit) may be added for strategic/gtm/roadmap features.

## Problem
<The specific user/business problem: who is affected, when, how often, what it costs today. Cite evidence (tickets, data, quotes).>

## Target user
<The persona this is for — named exactly as in docs/product/context.md (enforced when that doc exists) — and the trigger situation where they hit the problem.>

## Success metrics
<1–3 measurable outcomes, each moving a baseline from docs/product/context.md: "activation: baseline 31% → target 36% within 30 days", "p95 login: currently 3.4s → < 2s".>

## Scope
<The smallest slice that delivers the outcome: the capabilities included in this feature, stated as behaviour.>

## Non-goals
<What this feature explicitly does NOT do (deferred or rejected), so the implementer and reviewers can flag scope creep.>

## User flows
<Step-by-step flows for each primary actor: trigger → steps → visible outcome. One numbered list per flow.>

## Acceptance criteria
- [ ] <ONE observable, binary-testable outcome (happy path), <= 300 chars. Why: what breaks for the user/business if it is not met.>
- [ ] <ONE observable outcome for the primary error/edge path. Why: ...>
<!-- An AC states the outcome, never the mechanism: "after a crash or retry the venue holds exactly one order per leg. Why: a duplicate order is a duplicate real-money position." Formats, field names and ref schemes go in the design, where each part gets a reason. -->

## Edge cases
<Error states, empty/limit states, concurrency, permissions, invalid input — and the expected user-visible behaviour for each.>

## Non-functional requirements
<Product-level quality bars: performance/latency, availability, data volume, privacy/compliance, accessibility, localization. Each with a target.>

## Open questions
<Anything to resolve BEFORE approval — each may become a Decision (ADR). Mark answered ones "→ answer" or write "None". Unresolved questions block approval.>
