---
status: draft            # draft | approved
feature: ''              # kebab slug; matches the task's specRef.featureId
relatedPrd: ''           # docs/prd/<slug>.md
relatedAdrs: []          # [DEC-0001, DEC-0002, ...] — the atomic decisions in this design
architecture: docs/architecture/overview.md   # the system map this design is written against (required when it exists)
---

# Design: <Feature Name>

> The technical **how**, in detail. This is the artifact the PRD (what/why) and
> the atomic ADRs (individual decisions) sit between: it holds the full schema,
> module boundaries, and data flow. Produced by the design stage; every `##`
> section below is REQUIRED and enforced by `design-gate.js`. Keep decisions
> atomic in ADRs (linked from the Decisions section) — do NOT inline decision
> debates here; reference them.
>
> This doc is handed to the implementer and reviewers verbatim, so the gate
> enforces substance: every section >= 30 chars; Data model has DDL / a schema
> code block / a field table; Interfaces names concrete signatures, endpoints,
> flags or env vars; Data flow states failure/retry behaviour; Test strategy
> maps every PRD acceptance criterion (AC1..ACn); every linked ADR records
> context, rationale, consequences and >= 2 described options; and, when the repo
> has docs/architecture/overview.md, the design references it and names the
> components it touches (or declares a new one).

## Context
<The problem and constraints (link the PRD). What this design must satisfy; assumptions.>

## Architecture
<Which components from docs/architecture/overview.md this design changes (by their names there), and how they connect — through which existing integration contracts. A component, contract or data owner that does not exist yet is declared "New component: <name>" with its responsibility and code location, and added to the architecture overview in the same change. Honor its invariants; call out any you must bend and why.>

## Data model
<The detailed schema — tables, columns, types, keys, indexes, constraints. Real DDL, not prose. This is the "detailed proposed database schema".>
<For any normalization/integration feature, lead with the **canonical entity model** (entities, fields, keys, relationships) and an explicit **field-mapping table**: each source's REAL field (from the grounded spec — not an assumed shape) → the canonical field, with type/unit conversions and how absent fields are represented. The canonical model is derived here from the real source contracts; if a source field is unverified, mark it and link the de-risking spike. The DDL below realizes this model in the chosen datastore.>

## Interfaces
<External surfaces with concrete signatures: endpoint paths + request/response shapes, function/module signatures, CLI flags, env vars, message formats, third-party endpoints. Prefer a table or code block.>

## Data flow
<How data moves through the system end to end; the sequence of stages; and for each stage what happens on failure (error handling, retries/backoff, timeouts, idempotency, rollback).>

## Decisions
<Link every atomic architectural decision as an ADR: DEC-NNNN — one line each. The debate/options/consequences live in the ADR, not here. Each linked ADR must record context, rationale, consequences and >= 2 described options.>

## Risks
<The things most likely to go wrong, and the mitigation or spike that de-risks them.>

## Test strategy
<How each layer is verified: unit (pure logic), integration (real deps), smoke/coverage tied to the PRD success metrics. Map EVERY PRD acceptance criterion by number:>
- AC1 — <test layer + what proves it>
- AC2 — <test layer + what proves it>
