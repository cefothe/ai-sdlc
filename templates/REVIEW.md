---
maxNits: 5            # at most this many minor/suggestion findings are kept per review
skip:                 # regex over file paths whose findings are discarded
  - "^src/gen/"
  - "(^|/)package-lock\\.json$"
  - "(^|/)docs/plans/"
---

## Review passes

Run each pass and tag every finding with its pass.

1. **Correctness** — bugs, logic errors, unhandled failure paths, race conditions, resource leaks.
2. **Security** — injection, authz gaps, secrets, unsafe deserialization, SSRF, path traversal.
3. **Compliance with the spec** — every acceptance criterion implemented; the design's data
   model, interfaces and data flow followed; nothing from Non-goals added; the committed plan
   (`docs/plans/<task>.md`) followed or updated.
4. **Architecture** — code in the component that owns it, cross-component calls only through
   declared contracts (`docs/architecture/overview.md`), invariants and ADRs honored.

## Severity

- **critical / major (Important)** — breaks behavior, leaks data, breaches a policy, contract or
  invariant, or misses an acceptance criterion. These block until fixed.
- **minor / suggestion (Nit)** — style, naming, small simplifications. Never block.

## Skip

- Generated code and lockfiles (see `skip` above); anything CI already enforces (formatting, lint).
