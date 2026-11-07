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
design actually reach the code instead of being re-derived. ADRs the task implements
directly (task-/design-doc-referenced or own feature — `partition.primary`) are rendered
with full context/rationale/consequences/rejected options; the rest one line each.

The **spec** reaches the code the same way: `decision-engine/spec-context.js`
(`buildSpecForTask`) renders the task's approved PRD (`specRef.artifactPath`) + design
doc (`docs/design/<featureId>.md`) as a token-budgeted block (ACs/scope/schema/
interfaces first). `execute.js` feeds it via the `fetchSpec` seam (`makeSpecFetcher`)
into the plan, developer and review prompts, and **skips the ad-hoc design panel when
an approved design doc exists**; `execute.md` step 3c is the interactive equivalent.

Spec **substance** is enforced, not just structure: `prd-gate.js` (10 sections incl.
Non-goals/User flows/Edge cases/NFRs; >=2 list-item ACs; measurable metrics; no
unresolved open questions; min section length) and `design-gate.js` (concrete schema,
concrete interfaces, failure paths in data flow, test strategy mapping every PRD AC as
`ACn`, every linked ADR complete per `decisions.evaluateAdrQuality`). DoR gates 8/9 use
both. `backlog-task-new --prd` copies the PRD's ACs into the task verbatim.

**Product context for discovery.** PM/PO/CPO/CMO stay generic plugin agents; the
product knowledge lives once per repo in `docs/product/context.md` (scaffolded by init
from `docs/product/_template.md`: Vision, Personas, Current capabilities, Glossary,
Metric baselines, Regulatory constraints, Non-goals). `decision-engine/product-context.js`
gates it and renders it — plus an index of existing PRDs and the most related ones in
full, budgeted via the shared `doc-budget.js` — for the discovery panel and clarify
(`new.md` step 1b). When the doc exists, `prd-gate` refuses PRDs while it is invalid
and requires Target user to name a persona and Success metrics to cite a baseline.
Domain advisors join discovery by label (`resolveDiscoveryPanel`): `trading|execution|risk`
→ `grizzled-trader`, `compliance|regulatory` → `qa-compliance-engineer`.

## Harness-component flow (Barnett Studios components)

The execute pipeline plugs in published components behind their contracts, configured
by `.ai-sdlc/flow.yaml` (`pipeline/flow-config.js`; defaults apply without the file).
Components run as pinned ghcr images via `adapters/component-invoker.js` (ADR-0052
envelope: `ok` → use · `rejected` → fail · `error`/no docker → in-process fallback,
recorded in `result.degraded`). `components.mode: inprocess` never calls docker.

| Piece | Where | Behavior |
|---|---|---|
| Pace (conductr ADR-0061) | `decision-engine/pace.js`, `.ai-sdlc/pace.yaml` (default `pace.default.yaml`) | fast/normal/slow by path; unclassified = normal; HITL-claimed = slow; low/critical trust raises one layer, never lowers. Pre-impl (task references) gates the design panel; post-impl (real diff) caps reviewers and opens slow PRs as draft |
| Manifest (slicr contract) | `pipeline/manifest.js` | plan emits `{"execution-manifest": [...]}`; slicr `run-json` validates (in-process fallback, same rules); `none` → single-implementer path; `refused` → abort |
| RED-oracle executor | `pipeline/node-executor.js` | test author commits RED tests first; already-GREEN accepts flagged; per node: implementer edits only `node.files`, pipeline checks scope (no test edits, `new_deps`), runs accept, rolls back + retries, HALTs to a human |
| Sandbox (cordon) | `sandbox.mode: cordon` + `cordonRun` + `image` | accepts run via cordon's `cordon-run.sh`; requested-but-missing fails loud |
| HITL gate (commitward contract) | `decision-engine/hitl-gate.js`, `checkpoints.default.yaml` + `.ai-sdlc/checkpoints.yaml` | before push; fired + unacked → abort `hitl`. **Always stops for a human**: never auto-acked; an unevaluable registry blocks (stricter than commitward's fail-open) |
| Trust | `makeTrustFetcher` (promise ledger EMA tier) | raise-only input to pace |

`execute.md` steps 3d (pace), 4 (manifest), 5a (oracle nodes), 6c (HITL via
`AskUserQuestion`, ack recorded only in the human's words) are the interactive
equivalent. `init` scaffolds `flow.yaml`, `checkpoints.yaml`, `pace.yaml`.

## Architecture overview (system map)

`docs/architecture/overview.md` (template `docs/architecture/_template.md`, built from the
code by `/ai-sdlc:architecture`) holds Components (each with its backticked code paths),
Integration contracts (`A → B: mechanism, contract`), Data ownership, Cross-cutting
concerns, Deployment, Invariants and Key decisions. `decision-engine/architecture-context.js`
gates it and renders the slice a task reaches (components named in its spec or owning its
referenced paths, their contracts/data, all invariants). `spec-context` appends that slice
to every spec block (also for tasks without a PRD), so plan/implementer/reviewers and the
unattended design panel get it; `/ai-sdlc:design` hands the full doc to the architects.
When it exists, `design-gate` fails designs while it is invalid, and requires each design to
reference it (`architecture:` frontmatter) and name its components or declare
`New component: <name>` (added to the overview in the same change). Shared section checks
live in `decision-engine/doc-sections.js`.

## Context on demand, conformance, monorepo

- **Pull context (MCP):** `mcp/context-server.js` (dependency-free stdio MCP, registered as
  `ai-sdlc-context` in `.mcp.json`, in `ALWAYS_MCP` for every headless stage) serves
  `architecture_lookup` / `architecture_contracts` / `product_lookup` / `spec_lookup` /
  `decision_lookup` from `decision-engine/context-lookup.js`. Prompts carry
  `CONTEXT_TOOLS_GUIDANCE` (`pipeline/steps.js`). `loadMcpServers` expands `${CLAUDE_PLUGIN_ROOT}`.
- **Conformance:** `decision-engine/architecture-conformance.js` checks the real diff against
  the overview(s): `unowned-file`, `undeclared-coupling` (import across components without an
  `A → B` contract), `dependency-change`. Findings go to reviewers (not the author) and raise
  pace to slow; no overview → skipped + degraded.
- **Product context lifecycle:** PRDs add new personas/terms/baselines to the context in the
  same change (`new.md` 4a); a shipped feature is appended to Current capabilities in its own PR
  (`recordShippedCapability`, `flow.product.recordShipped`).
- **Monorepo:** `decision-engine/monorepo.js` (flow `monorepo.projects`, else workspace
  manifests). cxpak keeps one root index and is scoped per touched subproject
  (`--workspace <path>`, budget split, max 3); spec-context adds each touched subproject's own
  `<project>/docs/architecture/overview.md` slice; conformance and lookups resolve ownership
  across root + project overviews.

## Agents and skills use the project context

`rules/context-protocol.md` is the single source of a "Project context" block synced into every
agent (`agents/*.md`) and every `code-*`/`qa-*`/`testing-*` skill by
`node scripts/sync-context-protocol.js` (`--check` in CI via
`tests/unit/scripts/context-protocol-sync.test.js`): use the spec block, else the architecture
overview / product context / PRD-design-bug report / ADRs, use the lookup tools and cxpak, never
guess ownership. An explicit `tools:` allowlist excludes unlisted MCP tools, so the sync also
grants each allowlisted agent `mcp__plugin_ai-sdlc_{cxpak,ai-sdlc-context}__*` (interactive,
plugin-bundled names) and `mcp__{cxpak,ai-sdlc-context}__*` (headless strict `--mcp-config`).
Verified live (claude 2.1.308, stream-json init): before → 0 MCP tools for `java-pro` with cxpak
connected; after → both servers' tools in both modes. Edit the rule file, then re-run the sync.
The sync also grants each agent its **stage capabilities** from the plugin's capability maps
(`.ai-sdlc/capabilities.yaml` + the init stub, base + routed providers × base + routed grants):
MCP servers in both namings, web tools, and `Skill` for granted skills (e.g. design architects get
firecrawl / postgres-ro / clickhouse-ro / WebSearch). For repos that bind stages to other agents,
`capabilities.allowlistGaps` reports any grant an agent's allowlist would drop as a
`capability-grant` entry in `result.degraded`.

## Evidence, measurement and the maintain loop

- **Plan artifact + validation table:** the pipeline commits `docs/plans/<task>.md` (plan + manifest,
  `pipeline/plan-artifact.js`); `planDrift` (changed files the plan never names) goes to reviewers;
  the PR body is `pipeline/validation-report.js` (gates, ACs + evidence, review, conformance, pace,
  cost, degraded seams).
- **Cost + run records:** `executePipeline` meters every dispatch (`_meta.costUsd` from `claude -p`),
  enforces `flow.budget` (`maxCostUsd`/`maxCalls` → abort `budget`) and writes a run record
  (`recordRun` seam → `.ai-sdlc/runs.jsonl`, schema `run-record.schema.json`).
- **Delivery metrics** (`/ai-sdlc:metrics`, `measurement/delivery-metrics.js`): agentSuccessRate,
  costPerSuccess, reworkRate (7d), leadTimeDays, changeFailureRate (14d) + churn, vs a recorded
  baseline, each with an owner (`flow.metrics.owners`).
- **Agent-config evals** (`/ai-sdlc:evals`, `measurement/config-evals.js`): harvested from runs
  (base commit + accepts), re-run headless, gate config changes on pass rate (<20 tasks = UNDERPOWERED);
  CI template `templates/github/agent-config-evals.yml`.
- **Maintain loop** (`/ai-sdlc:maintain`, `pipeline/maintain.js`): `decision-engine/control-bands.js`
  (rolling σ + Western Electric, deterministic) → level 2 read-only diagnosis into a draft bug report,
  level 3 + pre-approved runbook; capped scheduled maintenance jobs → labelled backlog tasks; templates
  in `templates/`.
- **Review contract + lessons:** `REVIEW.md` (template `templates/REVIEW.md`, scaffolded by init) is
  rendered into reviewer prompts and applied to findings (`decision-engine/review-contract.js`: skip
  paths, nit cap); `/ai-sdlc:lessons` turns findings recurring across runs into proposed CLAUDE.md lines.
- **Library quality:** `scripts/lint-agents-skills.js` (errors fail CI) and the `usage-telemetry` hook
  (`promise/logs/usage.jsonl`, `measurement/usage-report.js`: top and never-used agents/skills).

## Bug flow and migration

**Bugs** enter through `/ai-sdlc:bug` (`commands/bug.md`), not new → design: a triaged
report at `docs/bugs/<bug-id>.md` (template `docs/bugs/_template.md`, gate
`decision-engine/bug-gate.js`: numbered repro steps, severity, a Reproduction naming a
runnable command, `status: confirmed` by a human). `backlog-task-new --bug` links it
(`specRef.source: bug`) and seeds ACs from it; DoR **gate 10** admits it (gates 8/9 do
not apply). At execute, spec-context renders the report (+ the regressed feature's PRD/
design via `relatedPrd`) with bug-fix instructions, the design panel is skipped, and the
plan's fix node accepts on the Reproduction test (RED → GREEN).

**Migration** (`/ai-sdlc:migrate`, `decision-engine/migrate.js`): scan every PRD,
design doc, ADR, the product context and open tasks against the current gates (in-flight
first); `--apply` adds only structure (template skeletons, `relatedPrd`, per-AC
placeholders — placeholders count as empty, so nothing passes by migration alone); agents
then fill content from evidence; ADR reasoning is added append-only via `decisions amend`
(gaps only, never overwrite); a human re-approves.

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

## Gate & dispatch speed

| Piece | Where |
|---|---|
| DoD runs **every** declared check concurrently (`spec.concurrency` caps), skips a check whose `paths:` no changed file matches, exports `AI_SDLC_BASE`/`AI_SDLC_CHANGED_FILES`, kills on `timeoutMinutes`; checks sharing `exclusive: <group>` never overlap; Ctrl-C kills every running check's process group; CLI `--base main` derives the changed set | `decision-engine/dod-gate.js`, `path-glob.js` |
| `type: github-checks` DoD check delegates to CI: opt-in `push`/`draftPr`, then waits on `gh pr checks` | `decision-engine/ci-checks.js` |
| Agent spawners are non-blocking (`asyncExec`) — `Promise.all` over a panel/team genuinely overlaps | `adapters/async-exec.js` |
| Per-provider codex `reasoningEffort` (capabilities.yaml) overrides the `high` review default | `adapters/codex-spawner.js` |
| Headless `claude -p` boots only the stage's granted MCP servers + cxpak (`--strict-mcp-config`) | `claude-code-spawner.js` `scopeMcpConfig` |
| ADR injection is relevance-filtered (referenced / foundational / own feature / lexical top-N); the rest listed by id | `decisions.js` `partitionDecisionsForTask` |

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
