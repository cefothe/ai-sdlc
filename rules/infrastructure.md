---
paths:
  - "**/Dockerfile*"
  - "**/docker-compose*"
  - "**/.dockerignore"
  - "**/k8s/**"
  - "**/helm/**"
  - "**/manifests/**"
  - "**/deploy/**"
---

# Infrastructure

## Docker

| Rule | Detail |
|---|---|
| multi-stage | Separate build from runtime — no compilers/package managers in production images |
| pin-versions | FROM node:22.14-alpine3.21 not :latest or :22 (reproducible builds need exact tags) |
| layer-order | COPY lockfile → install deps → COPY source (maximizes cache hits) |
| non-root | RUN addgroup -S app && adduser -S app -G app then USER app (root = escalation vector) |
| copy-chown | COPY --chown=app:app . . not RUN chown (chown doubles layer size) |
| no-secret-args | ARG visible in docker history — use RUN --mount=type=secret (BuildKit) |
| healthcheck | HEALTHCHECK directive required for orchestrator detection of unresponsive process |
| dockerignore | Exclude .git, node_modules, .env, tests, docs (leaks secrets + bloats images) |
| alpine-musl | Alpine uses musl libc — native glibc modules segfault — use -slim (Debian) for native deps |

## Kubernetes

| Rule | Detail |
|---|---|
| resources | Requests AND limits on every container (no limits = OOM, no requests = bad scheduling) |
| probes | Liveness restarts, readiness removes from endpoints — slow-start needs readiness only with initialDelaySeconds |
| security-context | runAsNonRoot + readOnlyRootFilesystem + allowPrivilegeEscalation: false + drop: ["ALL"] |
| pdb | Pod disruption budgets for availability during drains: minAvailable: 1 or maxUnavailable: 1 |
| anti-affinity | Spread across nodes/zones (all replicas on one node = single point of failure) |
| graceful-shutdown | preStop + SIGTERM handler + terminationGracePeriodSeconds must agree (default 30s) |
| network-policy | Explicit deny-all ingress + allowlist (no NetworkPolicy = no isolation) |
| no-latest | Use semver tags or SHA digests — :latest is mutable |
| immutable-config | ConfigMaps/Secrets with immutable: true — create new versions instead of mutating |

## Helm

| Rule | Detail |
|---|---|
| values-api | Every configurable value in values.yaml with defaults — no hardcoded template values |
| quote | {{ .Values.name \| quote }} — unquoted YAML misinterprets "true", "1.0", "null" |
| required | {{ required "database.host is required" .Values.database.host }} — fail at install time |
