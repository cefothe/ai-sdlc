# CLAUDE.md

## Overview

AI SDLC framework on Claude Code: Promise Theory verification, cxpak context, deterministic hooks, specialized agents.

## Build & Test

| Command | Scope |
|---|---|
| `npx jest tests/unit/promise/ tests/unit/measurement/ tests/integration/` | Full suite |
| `npx jest <path>` | Single file |
| Always use `test-runner` subagent | All test execution |

## Code Standards

| Rule ID | Constraint |
|---|---|
| complete-output | Zero TODO/FIXME/HACK markers |
| no-placeholders | No stub implementations |
| error-handling | All failure paths: try/catch or .catch() |
| tests-with-code | Tests written alongside implementation |
| no-dead-code | No commented-out blocks (3+ consecutive //) |
| resource-cleanup | .close(), finally, cleanup in all paths |
| implementation-depth | Substantial code, not prose |
| output-completeness | >500 chars output |
| test-assertion-deserialize | Java test files (unit `*Test.java` / IT `*IT.java` / **SIT `*SIT.java`** / `src/test/`, `src/sit/`, `tests/`): `response.as(Dto.class)` / `asList(Dto.class)` for assertions — no `response.body()`, `JsonNode`, `JsonPath`, `JSONObject`, `WebSocketResponse.getField` in assertion context. Carve-outs (Allure/logger attachments, `response.raw().headers()`, 204/304 status-only): resolved by `qa-code-reviewer` reviewer dispatch, not by this regex. From PR #32 integration; scope extended to unit + IT + SIT + e2e per tradu-georgi-ivanov 2026-06-08 review. |

## Output Rules

Token compounding: every unnecessary output token becomes input context on next turn.

| Rule | Detail |
|---|---|
| no-preambles | Never start with "Let me", "I'll", "Here's what" |
| no-summaries | No trailing recaps unless asked |
| no-narration | Execute silently between tool calls |
| code-changes | List files + describe changes, no prose wrapping |
| errors | file:line + message only |
| status | One line |

## Context Acquisition (REQUIRED)

Before implementing any change, acquire **token-budgeted** structural context (architecture, conventions, relevant files, blast radius) and read it before exploring. Do not skip this step — R7 proved d=1.82 quality improvement from structured input context vs working blind. Use the budget-honoring **CLI**:

```bash
cxpak overview --tokens 6k
```

For targeted follow-ups use the MCP ops `cxpak_graph` (op `trace`/`blast_radius`) and `cxpak_insight` (op `architecture`).

> **⚠ Do not use `cxpak_context` (op `context`/`briefing`) for the pre-action pack.** In cxpak 3.x that MCP op **ignores the token budget** and returns the entire repo index (hundreds of KB–MBs) — it overflows the tool-result cap and returns nothing usable (verified: `maxTokens:6000` → ~420 KB on a medium repo; ~1.8 M on a large one). The CLI `cxpak overview --tokens N` honors the budget; use it for the mandated context pack.

> **cxpak 3.x tool surface.** Op-based intent-tools: `cxpak_context` (ops `context`, `overview`, `context_for_task`, `stats` — **budget-broken, avoid for packing**), `cxpak_graph` (ops `trace`, `blast_radius`, `call_graph`, `api_surface`), `cxpak_review` (ops `review`, `diff`, `verify`), `cxpak_insight` (ops `health`, `risks`, `architecture`, `conventions`, `security_surface`). The pre-3.0 names (`cxpak_auto_context`, `cxpak_overview`, `cxpak_trace`) are gone. The plugin registers the server via `.mcp.json` (`cxpak serve --mcp .`); it activates when `cxpak` is on PATH.

## Architecture

Three pillars:

| Pillar | Location | Function |
|---|---|---|
| Promise Theory | `promise/` | Observer verifies post-output as telemetry; trust via EMA; on broken findings, `findings-interpreter.js` dispatches a reviewer subagent (R16) that emits structured `{action, feedback}` JSON — informed retry, not clean-prompt resampling. R15 (n=30) measured clean-prompt retry at d=-1.37 quality regression; R16 architecture replaces it. R5 still rules out raw feedback injection. |
| cxpak MCP | external, registered via `.mcp.json` | Token-budgeted context (cxpak 3.x, op-based): `cxpak_context` (context/overview), `cxpak_graph` (trace/blast_radius), `cxpak_review` (diff/verify), `cxpak_insight` (health/risks/architecture) — **`cxpak_context` op `context` must be called before implementation** |
| Hooks | `hooks/` | PostToolUse lint, Stop verify, PreToolUse build hygiene (100% **observation** coverage; non-blocking by design — R5 proved feedback injection harmful) |

Measurement framework (`measurement/`) validates changes via Wilcoxon signed-rank on 5-task battery.

## Agent Promise Model

Agents declare promises voluntarily. Observer assesses independently. Agent never sees assessment.

Standing promises: see `promise/registry.yaml` (19 promises, version 2.3 — 18 base + `test-assertion-deserialize` from PR #32 integration).

When the framework detects broken findings on a turn that touched Java test files — unit (`src/test/**/*.java`, `*Test.java`, `*Tests.java`), integration (`*IT.java`), system integration (`src/sit/**/*.java`, `*SIT.java`), or under `tests/` — `findings-interpreter.js` routes the reviewer dispatch to the `qa-code-reviewer` agent (rather than the generic `review-deterministic-findings` skill). That agent owns the carve-out logic for Allure diagnostics, `logger.*` calls, header checks via `response.raw().headers()`, and 204/304 statusCode-only assertions — single source of truth for test-code conventions.

## Per-Stage Capabilities (MCP / web / skills)

Each pipeline stage may declare a `capabilities` grant in `.ai-sdlc/capabilities.yaml`
— the external MCP servers, built-in web tools, and framework skills its agents are
permitted to use. This is how **design** scrapes the real vendor API docs (firecrawl)
and inspects a live schema (`postgres-ro`, added by routing only for `db`/`schema`
labels), while **review**/**discovery** get deep web research — without handing those
capabilities to every stage.

| Piece | Where |
|---|---|
| Grant declaration | `.ai-sdlc/capabilities.yaml` → `stages.<name>.capabilities` (`mcp`/`web`/`skills`); routing rules union more via `addCapabilities` (label-gated) |
| Resolution | `pipeline/capabilities.js` → `resolveStageCapabilities` / `capabilityToolNames` / `formatCapabilityGuidance` |
| Injection | `pipeline/execute.js` passes each grant to `spawn({tools})` + prompt guidance; `adapters/claude-code-spawner.js` maps it to `--allowedTools` |
| Server registration | `.mcp.json` (cxpak, firecrawl, postgres-ro, clickhouse-ro). `firecrawl`/`postgres-ro` launch via `npx`; `clickhouse-ro` is the **official** ClickHouse `mcp-clickhouse` (Python) via `uv run --with mcp-clickhouse` — needs `uv` on PATH. `postgres-ro` is Anthropic's **official reference** server `@modelcontextprotocol/server-postgres` (repo archived but functional; wraps queries in a READ ONLY transaction). `firecrawl` needs `FIRECRAWL_API_KEY`; `postgres-ro` needs `DATABASE_URL_RO`; `clickhouse-ro` needs `CLICKHOUSE_HOST`/`_PORT`/`_USER`/`_PASSWORD`. Unset servers simply don't connect. Both DB servers are read-only by design; still point them at a SELECT-only user |

Model is **advisory** (R5-consistent): a stage is only handed the tools in its grant;
nothing outside the grant is pre-approved. Add a server to `.mcp.json`, then grant it
to the stage(s) that should use it.

A grant may also set **`poc: true`** (design has it): the stage may run a small,
throwaway, read-only proof-of-concept to *validate* an external contract (hit the real
endpoint, check a response schema, confirm auth) before an ADR is locked — turning a
blocking spike into a confirmed decision. Evidence, never committed as product code.

## ADRs as implementation context

Recorded design decisions (`.ai-sdlc/_decisions/DEC-*.yaml`) are not just a DoR
admission gate — they're injected as **constraints** into the plan and the implementer.
`selectDecisionsForTask` (decision-engine/decisions.js) picks every project-scope ADR
plus any the task references; `steps.formatDecisionsContext` renders them as a
"CONSTRAINTS — honor these, cite the DEC id, stop and flag if one blocks the task"
block. `execute.js` feeds it via the `fetchDecisions` seam (`makeDecisionsFetcher`);
`execute.md` step 3b does the interactive equivalent. This is what makes front-loaded
design actually reach the code instead of being re-derived.

## Non-functional / scale (bounded working set)

Scale must be a **constraint**, not prose. `adr-coverage.js` has a `resource-budget`
area **distinct from `scale`**: a "TB → ClickHouse later" datastore ADR covers `scale`
but NOT `resource-budget`, which demands a decision on how v1 stays *bounded* at the
stated volume (streaming vs batch-all-into-RAM, per-batch/incremental crash-durable
writes, peak-memory ceiling, backpressure). A data-volume feature carries a matching
**non-functional acceptance criterion**, and the `scale`/`throughput`/`data` labels
route a cross-harness **NFR reviewer** (`performance-engineer`) onto the review team —
the lens that catches "FetchAll* holds 100k rows in memory before any write". design.md
also runs a **scale-probe PoC** and surfaces datastore-vs-ingestion scale contradictions
to the operator before recording (3c).

## Parallel implementation

When the plan decomposes a task into **file-disjoint work streams**, `execute.md` step 5
implements them in parallel via Native Teams (`parallel-worker`), **file-level isolation
inside the single Pattern-C worktree** (never worktree-per-stream, never overlapping
files), each worker given a targeted cxpak slice (`cxpak_graph` blast_radius/trace on its
files) + the ADR constraints + its plan section — then a **serial integration + full
build/test** over the merged tree (a green per-stream worker doesn't prove the whole
compiles). A too-small/too-coupled task yields one stream and the single path.

## Cross-Harness Execution (claude ↔ codex)

Reviewers are declared `harness: codex` so they never share the implementer's
harness — enforced at resolve time (`resolveReviewTeam` throws on a shared
harness) and cryptographically in `attestation/attestation.js`. That guarantee is
only *real* if codex-harness providers actually run on Codex, so the unattended
`spawn` seam is **harness-aware**:

| Piece | Where |
|---|---|
| Codex spawner | `adapters/codex-spawner.js` → `makeCodexSpawner` shells `codex exec … --json -s read-only --skip-git-repo-check`, parses the final `agent_message` JSONL event, normalizes to a canonical verdict stamped `harness: 'codex'` |
| Router | `adapters/claude-code-spawner.js` → `makeHarnessSpawner({ spawners:{ claude, codex } })` dispatches by `provider.harness`; absent/unknown → claude fallback |
| Wiring | `makeClaudeCodeSeams({ codexModel })` builds both and routes; `spawn` is the router |

Model on a **ChatGPT-login account**: fixed by plan (verified default
`gpt-6-astra`); every explicit `-m`/`-c model=` is rejected with HTTP 400, so no
model is forced by default — passing `codexModel` there *breaks* dispatch (only
set it on an API-key account that supports selection). Reasoning effort *is*
adjustable and Codex defaults it to `none`, too weak for review — so
`makeClaudeCodeSeams` sets `codexReasoningEffort: 'high'` (→ `-c
model_reasoning_effort="high"`) for the reviewer stage. Reviewers run `-s
read-only`. Codex must be installed + logged in (`codex login status`). The
capability grant's `tools` allowlist is **not** yet forwarded to codex (MCP for
codex needs `~/.codex/config.toml`); prompt guidance still applies.

## Agent Dispatch

| Scale | Method |
|---|---|
| 1-2 agents | Task tool, parallel calls in one message |
| 3+ agents | Native Teams (TeamCreate → Task → JSONL → TeamDelete) |

Proactive subagents: `file-analyzer` (>1000 lines), `code-analyzer` (multi-file), `test-runner` (all tests).

## Info Sources

Priority: CLAUDE.md → README.md → docs/ → package files. If insufficient: ask user.

## Philosophy

Skeptical, concise, no flattery. No partial implementations, simplifications, code duplication, dead code, cheater tests, over-engineering, mixed concerns, resource leaks.

## Git

Clean commit messages. No Claude footer. No co-authored-by.

## Emergency

| Situation | Action |
|---|---|
| Context overflow (90%+) | Spawn fresh agent with summary |
| Build/test failure | Stop, check docs, fix, verify |
| Uncertain approach | Check docs, then ask user |
