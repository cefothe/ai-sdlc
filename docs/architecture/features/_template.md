---
status: draft            # draft | approved
feature: ''              # kebab slug; matches docs/prd/<feature>.md and docs/design/<feature>.md
relatedPrd: ''           # docs/prd/<feature>.md
architecture: docs/architecture/overview.md
components: []           # EVERY component this feature/user journey touches, by its name in the overview
---

# Feature architecture: <Feature Name>

> The cross-service level between the system map and the design. The overview
> (`../overview.md`) shows every component; a component doc (`../components/`)
> shows one component inside; this doc shows ONE feature / user journey across
> every component it touches: who takes part, how they interact end to end, over
> which contracts, who owns the data, and the quality bar. Keep it HIGH-LEVEL —
> schema DDL, signatures, module internals and per-AC tests belong in the design
> doc (`docs/design/<feature>.md`), which is written against this one. Every `##`
> section is REQUIRED and enforced by `feature-architecture.js` (via the
> architecture and design gates); diagrams are fenced mermaid blocks drawn with
> the mermaid-diagrams skill.

## Journey
<The feature / user journey end to end in a few sentences: who starts it, the steps they experience, the outcome. Link the PRD (docs/prd/<feature>.md) — do not restate its ACs.>

## Components
<A mermaid flowchart of EVERY component in the frontmatter `components:` list and the contracts between them for this journey — required; each listed component must appear in it.>
<One list item per component: **Name** — its role in this journey (what it does here, what it does not).>

## Interactions
<A mermaid sequenceDiagram of the journey across the components, each listed component a participant, including the failure path (timeout / error / retry / compensation) — required.>
<One line per step where the prose adds what the diagram cannot: sync vs async, ordering, idempotency, consistency.>

## Contracts
<One list item per cross-component edge this journey uses: Caller → Callee: mechanism, contract. Each must be an Integration contract in the overview; a new one is added to the overview in the same change.>

## Data ownership
<Which component owns (alone writes) each piece of data this journey creates or changes, and who only reads it — and through which contract.>

## Quality attributes
<The non-functional bar for this journey across components: end-to-end latency budget and how it splits per component, availability / degradation when one component is down, volume and throughput, security and privacy boundaries.>

## Decisions
<The ADRs (DEC-NNNN) that shape this journey's architecture — one line each. The debate lives in the ADR.>