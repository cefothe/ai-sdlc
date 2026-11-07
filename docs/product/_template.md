---
owner: ''              # who keeps this current (product lead)
updated: ''            # ISO date of the last review
---

# Product context: <Product Name>

> The durable product knowledge every PRD is written against. `/ai-sdlc:new`
> injects this doc (plus an index of existing PRDs) into the discovery panel, so
> PM/PO/CPO/CMO shape features for THIS product instead of a generic one.
> Every `##` section is REQUIRED and enforced by `product-context.js`; while this
> doc is incomplete, `prd-gate.js` refuses to pass any PRD. Once it is valid,
> each PRD's Target user must name a persona below and its Success metrics must
> cite a baseline. Keep it short, factual and current — update it when a feature
> ships or a baseline moves.

## Vision
<Where the product is going in the next 12–24 months and the bet it is making. Two or three sentences.>

## Personas
<One list item per persona: bold name, then who they are, their job-to-be-done, and their main pain today.>
- **<Persona name>**: <role, context, job-to-be-done, top pain>

## Current capabilities
<What the product already does, grouped by area — the map a new feature must extend, not duplicate. Link PRDs/docs where they exist.>

## Glossary
<Domain terms with the exact meaning used in this product (one list item each), so PRDs, code and tests use one vocabulary.>

## Metric baselines
<The product metrics features move, each with its CURRENT value, date and source (dashboard/query). PRD success metrics are stated as baseline → target against these.>
- <Metric>: <current value> as of <date> (source: <dashboard/query>)

## Regulatory constraints
<Regulation, contractual and policy constraints every feature must respect (e.g. data residency, retention, consent, audit, licensing), with the rule each implies. Write "None beyond standard privacy law" only if truly so.>

## Non-goals
<Standing product non-goals — directions the product deliberately does not take — so the panel does not propose them.>
