# ADR coverage checklist

The foundational decision areas a design pass is expected to reason about. Not
every area applies to every feature (a pure backend job has no frontend), but each
should be **consciously covered or consciously skipped** — never silently missed.
`decision-engine/adr-coverage.js` (`npm run adr-coverage`) scans the recorded ADRs
and reports which areas have no decision.

| # | Area | Record an ADR for … |
|---|---|---|
| 1 | **Backend stack** | language/runtime choice (Node/TS, Python, Go, …) and why |
| 2 | **Frontend framework** | if there's a UI: React/Next/Svelte/… and why |
| 3 | **Datastore** | database engine (Postgres/Mongo/…) and why, incl. future needs (geo, search, vector) |
| 4 | **External deps: build vs buy** | self-host vs hosted vs bespoke for scraping/auth/payments/etc., with cost + control + legal |
| 5 | **Resilience / retry** | retry policy, backoff, idempotency, failure handling, partial-run recovery |
| 6 | **Scale / data volume** | estimated volume + growth, partitioning/indexing, history/time-series retention |
| 7 | **Cost model** | the dominant cost driver and how it scales; fixed vs per-request |
| 8 | **Security / secrets** | credential handling across dev/prod, auth, secret storage |
| 9 | **Observability** | how health/failures/freshness are monitored; SLOs |
| 10 | **API / integration surface** | REST/GraphQL/tRPC/gRPC and why, given the consumers |
| 11 | **Read / query architecture** | for data-heavy products: search/facets/caching/read models (often the write-side design's blind spot) |
| 12 | **Deployment / infra topology** | how it runs and scales (single host, orchestrated, serverless) |

Rules:
- Each ADR is **atomic** (one decision) and carries Context / Options-with-pros-cons
  / Decision-rationale / Consequences / Confidence.
- The **detailed** design (schema DDL, module map, data flow) lives in the design
  doc; ADRs record the atomic decisions the design doc links.
- A decision the operator already made still gets an ADR — documenting *why*.
