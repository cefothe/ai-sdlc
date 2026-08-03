# Promise Theory v2: Observer Upgrade

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the observer from an 8-promise grep-based outcome checker to a structurally-aware, trace-enabled, team-orchestrated verification framework — without changing anything the agent sees.

**Architecture:** The observer becomes a first-class coordinator agent that dispatches workers via Native Teams, verifies output using cxpak-backed structural analysis and execution traces, and gates quality through clean-prompt retry. The agent's experience is unchanged. The observer's capability is transformed.

**Invariant:** The agent never sees an assessment. Verification is observer-side. Retry is clean-prompt. Trust is a property of the observer, not feedback to the agent. R5 proved feedback injection harmful. This spec invests entirely in observer sophistication.

---

## 1. Compact Constraint Encoding

### Problem

CLAUDE.md and rules/ files are the agent's working environment. Every token loaded has a cost — both in context budget and in signal-to-noise ratio. Current files use mixed formats: prose paragraphs, bullet lists, tables, code blocks. No standard. No way to measure salience.

### Design

Define a constraint encoding standard and apply it to all behavioral rules.

**Format: Header-Table Standard**

| Element | Format | Example |
|---|---|---|
| Section grouping | `## H2` header | `## Code Standards` |
| Rule sets | Pipe-delimited table with rule ID | `\| no-markers \| Zero TODO/FIXME/HACK \|` |
| Single rules | One-line bullet with ID prefix | `- **no-markers**: Zero TODO/FIXME/HACK` |
| Non-obvious WHY | Inline parenthetical after rule | `(R5 proved feedback injection harmful)` |
| Thresholds | In rule cell, not separate prose | `\| function-length \| Max 50 lines per function \|` |

**Encoding principles:**
1. Tables over bullets for rule sets (scannable, uniform structure)
2. Rule IDs as anchors — kebab-case, matching standing promise IDs where applicable
3. One line per rule — no multi-sentence explanations
4. Section headers only for grouping — no prose between sections
5. Prose only for non-obvious WHY — if removing the explanation wouldn't confuse a reader, remove it

**Applied to:**
- `CLAUDE.md` — target ~30% token reduction
- `rules/*.md` — target ~40% reduction on prose-heavy files (security.md, cloud-iac.md, ci-cd.md)
- Promise registry (Section 5) — rule IDs align with CLAUDE.md table rows

**Measurement:** R8 compares compact-encoded branch vs R7 baseline. Metrics: tokens saved, quality delta, promise-keeping rate change per standing promise.

---

## 2. cxpak-Backed Standing Promises

### Problem

The observer's 8 standing promises use grep/regex. They catch surface markers (TODO, FIXME, commented-out blocks) but can't verify structural quality — invalid imports, oversized functions, copy-paste duplication, architectural boundary violations. These are the failures that actually reach production.

### Design

**New module: `promise/cxpak-verifier.js`**

Thin MCP client that:
1. Spawns `cxpak serve --mcp .` as child process (stdio transport)
2. Sends JSON-RPC requests (cxpak:trace, cxpak:overview)
3. Parses responses into verification results (same shape as existing promises)
4. Kills process on completion
5. Timeout: 10s — if cxpak hangs, skip gracefully (never block)

**New standing promises:**

| Promise ID | Checks | cxpak tool | Confidence | Threshold |
|---|---|---|---|---|
| import-validity | All imports/requires resolve to real files | cxpak:trace | high | 0 unresolved |
| function-length | No function exceeds line threshold | cxpak:trace | high | 50 lines default |
| duplication | No copy-paste blocks above threshold | cxpak:overview | medium | 10 lines default |
| architectural-boundary | Modified files stay in expected layers | cxpak:overview | medium | Project-configurable |

**Graceful degradation:** If cxpak is not installed or times out, these 4 promises are absent (not broken). The 8 grep-based promises still run. Observer logs `cxpak_available: false`. Trust calculation only includes promises that were checked.

**Language coverage:** cxpak supports 42 languages. These promises work on any output the agent produces — no per-language tool detection needed.

**Integration with existing observer:**

```
ObservabilityChecker.verifyAll(output, options)
  1. Run 8 grep-based promises (unchanged)
  2. If cxpak available: run 4 structural promises via CxpakVerifier
  3. If trace available: run 2 behavioral promises (Section 3)
  4. Merge all results into single array (same shape)
  5. Return to caller (stop-verify.js or observer agent)
```

---

## 3. Execution Traces

### Problem

The observer sees final output but not process. When a run scores low, the first question is "what did the agent do?" Currently unanswerable. No tool call sequence, no token attribution, no visibility into exploration patterns.

### Design

**Trace format: JSONL**

One trace file per invocation. Each line is a trace event:

```jsonl
{"ts":"2026-04-15T10:32:00.000Z","ev":"fingerprint","model":"sonnet-4-6","claude_md_hash":"a3f8c2","rules_loaded":["security.md","java-trading.md"],"promises_active":14,"registry_version":"2.1","cxpak_available":true}
{"ts":"2026-04-15T10:32:01.204Z","ev":"tool","name":"Read","args_summary":"CLAUDE.md","tokens":{"in":245,"out":0}}
{"ts":"2026-04-15T10:32:02.891Z","ev":"tool","name":"Grep","args_summary":"pattern:handleOrder src/","tokens":{"in":120,"out":340}}
{"ts":"2026-04-15T10:32:05.102Z","ev":"tool","name":"Write","args_summary":"src/order.js","tokens":{"in":890,"out":1205}}
{"ts":"2026-04-15T10:32:08.340Z","ev":"gate","result":"pass","broken":[],"attempts":1}
{"ts":"2026-04-15T10:32:08.341Z","ev":"end","total_tokens":{"in":4200,"out":2800},"duration_ms":8341}
```

**Event types:**

| ev | Payload | Purpose |
|---|---|---|
| fingerprint | model, claude_md_hash, rules_loaded, promises_active, registry_version, cxpak_available, cxpak_version | Environment snapshot for reproducibility |
| tool | name, args_summary (≤80 chars), tokens.in, tokens.out | Tool call record |
| gate | result (pass/fail/skip), broken[], attempts | Gate decision |
| retry | attempt, reason | Clean-prompt retry triggered |
| escalate | from_model, to_model, trust_score | Model escalation |
| end | total_tokens, duration_ms, quality_score | Invocation summary |

**Token optimization:**
- `args_summary` truncated to 80 chars (file path or pattern, not content)
- No raw output — stays in existing raw output files
- Typical trace: 10-30 events per invocation, ~2-4KB

**Two collection modes, same format:**

| Mode | Source | Collector | Storage |
|---|---|---|---|
| Live | Conversation transcript JSONL | stop-verify.js via trace-builder | promise/logs/traces/ (gitignored) |
| Measurement | claude -p response | executor.js via trace-builder | measurement/results/\<run\>/traces/ |

**Shared module: `promise/trace-builder.js`**

```
buildTrace(transcriptEvents) → TraceEvent[]
  - Iterates message blocks from transcript or claude -p response
  - Extracts tool_use: name, truncated args
  - Extracts token usage from API response metadata
  - Returns ordered TraceEvent array
```

**Behavioral promises (enabled by traces):**

| Promise ID | Checks | Source | Confidence |
|---|---|---|---|
| read-before-write | Agent read related files before modifying them | trace + cxpak:trace | medium |
| exploration-breadth | Agent read ≥N architecturally-related files | trace + cxpak:overview | low |

These activate when both trace and cxpak are available. Absent otherwise (graceful degradation).

**Trace analysis module: `measurement/trace-analyzer.js`**

Pure functions for post-hoc analysis:

| Function | Input | Output |
|---|---|---|
| loadTrace(path) | .trace.jsonl path | TraceEvent[] |
| tokenAttribution(events) | TraceEvent[] | Map\<tool_name, {in, out, pct}\> |
| filesAccessed(events) | TraceEvent[] | {read: string[], written: string[]} |
| explorationRatio(events) | TraceEvent[] | float (read events / total) |
| timeToFirstWrite(events) | TraceEvent[] | ms before first Write/Edit |
| toolSequence(events) | TraceEvent[] | string[] (ordered tool names) |

---

## 4. Majority Voting

### Problem

A single agent's output has inherent variance. The same agent on the same task might score 6 or 8. This noise limits measurement sensitivity (R7 couldn't reach Wilcoxon significance at n=14) and reduces confidence in critical outputs.

### Design

**N independent agents per task. Observer takes consensus.**

The observer (coordinator agent or executor.js) spawns N workers with identical, clean prompts. Each worker runs independently — no shared context, no knowledge of other workers. Observer collects N outputs, scores each, takes median.

**Measurement mode: `--voters N` flag on executor.js**

```bash
node measurement/executor.js --ref promise-theory-v2 --runs 15 --voters 3
```

Execution per run×task:
1. Spawn N workers (sequential by default, `--parallel-voters` for concurrent)
2. Each worker: invokeAgent → collectTrace → scoreOutput
3. Median quality score = consensus record
4. Individual scores logged for variance analysis

**metrics.jsonl schema additions:**

| Field | Type | Purpose |
|---|---|---|
| voter | int\|null | Voter index (null = consensus) |
| voter_count | int | N voters used |
| agreement_stddev | float | Stddev of voter scores (consensus only) |
| status | string | "consensus" or "voter" |

**Backward compatibility:** `--voters 1` (default) produces identical output to current format. compare.js filters on `status !== "voter"`.

**Live mode: observer-dispatched voting**

The observer agent (Section 6) dispatches N workers via Native Teams when trust tier warrants it. Same pattern — N clean prompts, observer collects and compares.

**Score aggregation:**
- Median (not mean) — robust to single outlier
- agreement_stddev — logged as stability signal. High disagreement (>2.0) flags ambiguous tasks

**Trace files per voter:** `<run>-<task_id>-v<N>.trace.jsonl`. Each voter's process is independently traced.

---

## 5. Promise Registry

### Problem

Promises are scattered: 8 hardcoded in standing-promises.js, agent-specific in markdown frontmatter, 6 new across cxpak-verifier and trace-builder. Three locations, two formats, no versioning. As the promise vocabulary grows, this becomes unmaintainable.

### Design

**Single source of truth: `promise/registry.yaml`**

```yaml
version: "2.0"

promises:
  # Standing promises (grep-based, always available)
  complete-output:
    type: standing
    method: grep
    confidence: high
    requires: null
    threshold: 0 TODO/FIXME/HACK markers
  no-placeholders:
    type: standing
    method: grep
    confidence: high
    requires: null
    threshold: 0 placeholder patterns
  error-handling:
    type: standing
    method: grep_absent
    confidence: high
    requires: null
  tests-with-code:
    type: standing
    method: file_check
    confidence: medium
    requires: null
  no-dead-code:
    type: standing
    method: consecutive_comments
    confidence: high
    requires: null
    threshold: 3 consecutive comment lines
  resource-cleanup:
    type: standing
    method: grep_absent
    confidence: medium
    requires: null
  implementation-depth:
    type: standing
    method: grep_absent
    confidence: high
    requires: null
  output-completeness:
    type: standing
    method: output_length
    confidence: medium
    requires: null
    threshold: 500 chars

  # Structural promises (cxpak-backed)
  import-validity:
    type: structural
    method: cxpak:trace
    confidence: high
    requires: cxpak
    threshold: 0 unresolved imports
  function-length:
    type: structural
    method: cxpak:trace
    confidence: high
    requires: cxpak
    threshold: 50 lines
  duplication:
    type: structural
    method: cxpak:overview
    confidence: medium
    requires: cxpak
    threshold: 10 duplicate lines
  architectural-boundary:
    type: structural
    method: cxpak:overview
    confidence: medium
    requires: cxpak

  # Behavioral promises (trace + cxpak)
  read-before-write:
    type: behavioral
    method: trace+cxpak
    confidence: medium
    requires: [trace, cxpak]
  exploration-breadth:
    type: behavioral
    method: trace+cxpak
    confidence: low
    requires: [trace, cxpak]
```

**Registry loader: `promise/registry-loader.js`**

```
loadRegistry() → { version, promises: Map<id, PromiseSpec> }
  - Reads promise/registry.yaml
  - Validates schema
  - Returns typed promise specifications

availablePromises(env) → PromiseSpec[]
  - env: { cxpak: boolean, trace: boolean }
  - Filters registry by requires field
  - Returns only promises that can be verified in current environment
```

**Versioning:** `version` field bumps when promises are added, removed, or thresholds change. Metrics records reference the registry version. Historical measurements are comparable only within the same registry version — version change triggers a new baseline measurement.

**Per-project overrides:** Projects can place a `promise/overrides.yaml` to disable promises or adjust thresholds:

```yaml
overrides:
  function-length:
    threshold: 80          # legacy codebase, relaxed
  architectural-boundary:
    enabled: false          # no layer enforcement for this project
```

**ObservabilityChecker reads registry at startup** instead of hardcoded STANDING_PROMISES array. The checker loads the registry, filters by environment, and runs all available promises.

---

## 6. Observer Agent Architecture

### Problem

The observer is currently split across two unrelated implementations: stop-verify.js (hook, observational only, no retry) and executor.js (measurement, clean-prompt retry, model escalation). Live sessions have no quality gating. The hook can't orchestrate retries without injecting feedback.

### Design

**The observer is a coordinator agent.** It dispatches workers, verifies output, and gates quality — all within a single session. The agent never sees an assessment.

**Architecture:**

```
User Request
    │
    ▼
Observer (coordinator agent)
    │
    ├── Reads trust ledger for current context
    ├── Selects trust tier → determines verification level
    │
    ├── Dispatches Worker A (Agent tool / Native Teams)
    │     └── Worker A executes task
    │     └── Stop hook fires: deterministic checks, writes results, exit 0
    │
    ├── Reads verification results from promise/logs/
    │
    ├── Gate decision:
    │     ├── PASS → present Worker A's output to user
    │     ├── FAIL + trust warrants retry →
    │     │     ├── Kill Worker A context
    │     │     ├── Dispatch Worker B (clean prompt, model per trust tier)
    │     │     │     └── Worker B executes task (zero knowledge of A)
    │     │     │     └── Stop hook fires again
    │     │     ├── Read Worker B's results
    │     │     ├── Compare A vs B, keep best
    │     │     └── Present best to user
    │     └── FAIL + critical trust →
    │           ├── Escalate model
    │           ├── Dispatch Worker B (escalated model)
    │           ├── Flag for human review
    │           └── Present with advisory
    │
    └── Update trust ledger
```

**Two operating modes, same observer logic:**

| Mode | Observer implementation | Worker dispatch |
|---|---|---|
| Interactive | Coordinator agent in session | Agent tool / Native Teams |
| Measurement | executor.js | `claude -p` subprocess |

**Activation:** The observer agent is configured in `.claude/agents/observer.md`. When the framework is installed (global or local), the observer is the default entry point. Users interact with the observer; the observer dispatches workers. This is transparent — the user's experience is unchanged, they just get quality-gated output.

For users who want direct agent access without observer gating (e.g., quick questions, exploration), the observer recognizes low-stakes requests and passes them through without dispatching a worker. The observer's routing logic:
- **Task requires code output** → dispatch worker, verify, gate
- **Question / explanation / exploration** → handle directly, no worker dispatch
- **User explicitly opts out** → pass through (e.g., `--no-gate` flag or session config)

**Hook role (unchanged):**
stop-verify.js does deterministic work only:
1. Read transcript → buildTrace()
2. Run available promises (registry-based)
3. Write results to `promise/logs/stop-verify.jsonl`
4. Write trace to `promise/logs/traces/<session-id>.trace.jsonl`
5. Exit 0. Always.

The hook never triggers retries, never spawns agents, never makes gate decisions. It produces data. The observer reads data and acts.

**Observer agent definition: `agents/observer.md`**

Frontmatter declares the observer's own promises (meta-level):
```yaml
promises_offered:
  - clean-retry: "Retry prompts contain zero reference to previous attempts"
  - trust-based-routing: "Model selection follows trust tier table"
  - output-comparison: "Best output selected by quality score, not recency"
```

The observer is itself subject to promise verification — a higher-order application of the framework.

---

## 7. Graduated Response

### Problem

Current system: trust < 0.2 → model escalation. One threshold, one action. With 14 promises, traces, and voting infrastructure, the observer has rich information but a single lever.

### Design

**Trust tier table with proportional response:**

| Trust Tier | Range | Verification | Gate Action | Voting |
|---|---|---|---|---|
| High | > 0.8 | All available promises | Accept output | None |
| Medium | 0.5 – 0.8 | All promises + tightened thresholds | Retry with same model on failure | None |
| Low | 0.2 – 0.5 | All promises + tightened thresholds | Retry with more capable model | Optional (observer decides) |
| Critical | < 0.2 | All promises + tightened thresholds | Escalated model + human flag | Mandatory 3 voters |

**Tightened thresholds at lower trust:**

| Promise | High/Medium | Low | Critical |
|---|---|---|---|
| function-length | 50 lines | 40 lines | 30 lines |
| duplication | 10 lines | 8 lines | 5 lines |
| output-completeness | 500 chars | 750 chars | 1000 chars |

Thresholds defined in registry.yaml per trust tier.

**Per-dimension trust (future-ready):**

TrustManager tracks trust per promise category:
- `trust.standing` — content-level (TODO, placeholders, tests)
- `trust.structural` — code quality (imports, function length, duplication)
- `trust.behavioral` — process quality (exploration, read-before-write)

An agent with high standing trust but low structural trust gets tightened structural thresholds, not blanket escalation. The observer's response matches the specific weakness.

**Model selection table:**

| Trust Tier | Default Model | Retry Model |
|---|---|---|
| High | User's configured model | N/A (no retry) |
| Medium | User's configured model | Same model |
| Low | User's configured model | Next tier up |
| Critical | Next tier up from configured | Best available |

**Max retries:** 2 (configurable). After max retries, observer presents best output with quality advisory to user. Never loops indefinitely.

---

## Summary

### What changes

| # | Addition | New Files | Modified Files |
|---|---|---|---|
| 1 | Compact Constraint Encoding | — | CLAUDE.md, rules/*.md |
| 2 | cxpak-Backed Promises | promise/cxpak-verifier.js | promise/observability-checker.js |
| 3 | Execution Traces | promise/trace-builder.js, measurement/trace-analyzer.js | hooks/stop-verify.js, measurement/executor.js |
| 4 | Majority Voting | — | measurement/executor.js |
| 5 | Promise Registry | promise/registry.yaml, promise/registry-loader.js, promise/overrides.yaml | promise/observability-checker.js, promise/standing-promises.js (deprecated) |
| 6 | Observer Agent | agents/observer.md | — |
| 7 | Graduated Response | — | promise/trust-manager.js |

### Standing promises: 8 → 14

| Type | Count | Requires | Confidence |
|---|---|---|---|
| Standing (grep) | 8 | Nothing | high/medium |
| Structural (cxpak) | 4 | cxpak | high/medium |
| Behavioral (trace+cxpak) | 2 | trace + cxpak | medium/low |

### Promise Theory advancement

| Aspect | v1 (current) | v2 (this spec) |
|---|---|---|
| Promise vocabulary | 8 grep-based | 14 across 3 types |
| Verification backend | regex/string matching | cxpak structural analysis (42 languages) |
| Process visibility | None | Full execution traces |
| Observer confidence | Single score | N-voter consensus |
| Promise management | Hardcoded array | Versioned registry with overrides |
| Live quality gating | Observe-only | Observer agent with clean-prompt retry |
| Trust response | Binary (escalate at 0.2) | Graduated (4 tiers, per-dimension) |
| Environment tracking | model + ref only | Full session fingerprint |

### Invariant preserved

The agent never sees an assessment. Every addition is observer-side. Retry is clean-prompt. Trust is never communicated to the agent. R5's lesson holds.
