---
status: draft            # draft | approved
feature: ''              # kebab slug; matches the task's specRef.featureId
relatedPrd: ''           # docs/prd/<slug>.md
relatedAdrs: []          # [DEC-0001, DEC-0002, ...] — the atomic decisions in this design
---

# Design: <Feature Name>

> The technical **how**, in detail. This is the artifact the PRD (what/why) and
> the atomic ADRs (individual decisions) sit between: it holds the full schema,
> module boundaries, and data flow. Produced by the design stage; every `##`
> section below is REQUIRED and enforced by `design-gate.js`. Keep decisions
> atomic in ADRs (linked from the Decisions section) — do NOT inline decision
> debates here; reference them.

## Context
<The problem and constraints (link the PRD). What this design must satisfy; assumptions.>

## Architecture
<Component / module boundaries. A diagram or a labelled list. How the pieces compose.>

## Data model
<The detailed schema — tables, columns, types, keys, indexes, constraints. Real DDL, not prose. This is the "detailed proposed database schema".>
<For any normalization/integration feature, lead with the **canonical entity model** (entities, fields, keys, relationships) and an explicit **field-mapping table**: each source's REAL field (from the grounded spec — not an assumed shape) → the canonical field, with type/unit conversions and how absent fields are represented. The canonical model is derived here from the real source contracts; if a source field is unverified, mark it and link the de-risking spike. The DDL below realizes this model in the chosen datastore.>

## Interfaces
<External surfaces: APIs, CLI, env vars, message formats, third-party endpoints.>

## Data flow
<How data moves through the system end to end; the sequence of stages; failure/retry paths.>

## Decisions
<Link every atomic architectural decision as an ADR: DEC-NNNN — one line each. The debate/options/consequences live in the ADR, not here.>

## Risks
<The things most likely to go wrong, and the mitigation or spike that de-risks them.>

## Test strategy
<How each layer is verified: unit (pure logic), integration (real deps), and any smoke/coverage checks tied to the PRD success metrics.>
