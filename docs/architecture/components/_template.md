---
component: ''          # the name exactly as listed in docs/architecture/overview.md → Components
owner: ''              # who keeps this current
updated: ''            # ISO date of the last review
---

# Component: <Component name>

> The detailed level under the system map: how ONE component works inside. The
> overview (`../overview.md`) says what the components are and how they connect;
> this doc gives the planner, implementer and reviewers of a task that touches
> the component everything they need to change it safely. Every `##` section is
> REQUIRED and enforced by `component-docs.js` (via the architecture gate);
> diagrams are fenced mermaid blocks drawn with the mermaid-diagrams skill. A
> change to the component's interfaces, dependencies, data or structure updates
> this doc in the same change.

## Responsibility
<What this component does and, just as important, what it deliberately does not do (which neighbour owns that instead).>

## Code
<Every path the overview gives this component, backticked, plus the main packages/files inside it and what each holds.>
- `path/to/component/` — <what lives here>

## Interfaces
<Everything the component exposes, concretely: function/method signatures, endpoints with request/response shape, events/topics with payload, CLI commands and flags, env vars. Who calls each.>

## Dependencies
<What it calls — other components (through which contract in the overview's Integration contracts) and external systems/libraries — and why.>

## Data
<The stores/tables/files it owns (it alone writes them) and the ones it only reads through another component's contract. Key fields, retention, consistency rules.>

## Internal structure
<A mermaid flowchart or classDiagram of the parts inside the component (types, workers, queues, modules) and how they relate — required.>
<One line per part: name — role.>

## Key flows
<A mermaid sequenceDiagram of the component's main flow, including its failure/retry path — required. Add one per important flow.>

## Failure modes
<What can go wrong and what the component does about it: errors and how they are classified, retries/backoff, timeouts, limits/backpressure, what it surfaces to operators (metrics, alerts, logs).>

## Decisions
<The ADRs (DEC-NNNN) and invariants that constrain this component — one line each, with what they mean here.>

## Testing
<How the component is tested: unit/integration/contract tests, where they live, the fixtures/fakes they use, and the command that runs them.>
