---
status: draft          # draft | approved  — a human sets `approved` (DoR gate 8 blocks draft)
owner: ''              # who owns this PRD
featureId: ''          # kebab slug; must match the task's specRef.featureId
relatedAdrs: []        # DEC-NNNN references, if any
---

# PRD: <Feature Name>

> Canonical structure — every `##` section below is REQUIRED and enforced by
> `prd-gate.js` (the same list `/ai-sdlc:new` writes from), so all PRDs are
> identical by construction. Keep the headings; fill the bodies. Optional
> strategic sections (Why now, Non-goals, Go-to-market, Strategic fit) may be
> added for strategic/gtm/roadmap features.

## Problem
<The specific user/business problem: who is affected, when, how often, what it costs today.>

## Target user
<The segment this is for and the trigger situation where they hit the problem.>

## Success metrics
<1–3 measurable outcomes with a direction/target, e.g. "activation +5pp", "p95 < 2s".>

## Scope
<The smallest slice that delivers the outcome. What is in this feature vs. deferred.>

## Acceptance criteria
- [ ] <Observable, binary-testable outcome 1 (happy path)>
- [ ] <Observable, binary-testable outcome 2 (primary error/edge path)>

## Open questions
<Anything to resolve BEFORE dispatch — each may become a Decision (ADR). Write "None" when clear.>
