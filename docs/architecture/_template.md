---
owner: ''              # who keeps this current (tech lead / architect)
updated: ''            # ISO date of the last review
---

# Architecture overview: <System Name>

> The system map every design doc is written against and every agent is given:
> the architects get it in `/ai-sdlc:design`, the planner, implementer and
> reviewers get the parts their task touches in `/ai-sdlc:execute`. It answers
> "which component owns this, and how do components connect" so a change uses
> the existing seams instead of inventing new coupling. Every `##` section is
> REQUIRED and enforced by `architecture-context.js`; while this doc is
> incomplete no design doc passes the design gate. A design that adds or changes
> a component, contract or data owner updates this doc in the same change.

## System overview
<What the system does, for whom, and its boundary: the external systems and actors it talks to.>

## Components
<A mermaid flowchart (or C4Container) of every component and the contracts between them — required.>
<One list item per component: bold name, the code it lives in (backticked paths), its single responsibility, and what it exposes.>
- **<Component>** (`path/to/component/`): <responsibility>. Exposes: <API / events / CLI>.

## Integration contracts
<A mermaid sequenceDiagram of at least one key interaction across components — required (one per critical flow is better).>
<How components connect — one list item per edge: caller → callee, the mechanism (HTTP, gRPC, queue/topic, DB view, library call), and where the contract lives (OpenAPI file, schema, interface).>
- <Caller> → <Callee>: <mechanism>, contract `<path or name>`

## Data ownership
<Which component owns which data store / entities. Only the owner writes; others read through its contract.>

## Cross-cutting concerns
<Authentication/authorization, configuration and secrets, observability (logs/metrics/traces), error handling and retries, i18n — the shared mechanisms every component uses.>

## Deployment
<Runtime topology: services/processes, environments, how they are built and deployed, scaling units.>

## Invariants
<Rules every change must honor — one list item each, e.g. "no component reads another's tables", "all external calls go through the gateway client with timeouts".>
- <invariant>

## Key decisions
<The foundational ADRs that shaped this architecture: DEC-NNNN — one line each.>
