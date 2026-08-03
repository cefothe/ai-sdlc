# Promise Theory Restructure: Design Specification

**Date:** 2026-03-13
**Status:** Draft (rev 3 — addresses all spec review findings)
**Branch:** `promise-theory` (to be created from `main`)
**Scope:** Semantic layer restructure of ai-sdlc around Promise Theory

---

## 1. Problem Statement

The ai-sdlc system orchestrates ~95 autonomous AI agents through 12 protocol YAML files, ~107 commands, and quality gates. The current architecture uses **obligation/imposition semantics** ("MUST", "ZERO TOLERANCE", "MANDATORY") to govern agents that are fundamentally autonomous — LLMs cannot be coerced, only prompted.

This creates three systemic weaknesses:

1. **No verification.** Protocols are enforced through prompt engineering. There is no mechanism to verify an agent actually followed a protocol. The system is trust-based with no trust measurement.
2. **No consequences.** An agent can violate every protocol and nothing happens. No detection, no response, no adaptation.
3. **No feedback loop.** The system is open-loop. Agents produce outputs but outcomes do not feed back into protocol refinement or agent selection.

Promise Theory (Burgess, 2004) offers a formally grounded alternative: autonomous agents declare voluntary promises about their own behavior, fulfillment is independently observed, and trust evolves based on observed outcomes. Impositions succeed at best 50/50 without supporting promises. The hypothesis is that promise-based framing produces higher quality, more deterministic outcomes from autonomous AI agents.

---

## 2. Hypothesis

Restructuring the ai-sdlc semantic layer from obligation semantics to promise semantics will:

- Increase agent protocol compliance rates
- Increase first-pass output quality
- Improve multi-agent coordination efficiency
- Improve system resilience under degraded conditions
- Increase output determinism across identical runs
- Improve developer experience

These claims will be validated through automated measurement (10-run task battery) and a company-wide team trial (1 week).

---

## 3. Promise Theory Model

### 3.1 Core Transformation

Every interaction in the system is reframed from imposition to promise:

| Current (Obligation) | Promise Theory |
|---|---|
| "You MUST read CLAUDE.md" | Agent promises: "I will read and reference CLAUDE.md" — Observable: first output cites CLAUDE.md content |
| "ZERO TOLERANCE for TODOs" | Agent promises: "My output will contain zero TODO/FIXME" — Observable: automated grep |
| "Quality score >= 8/10 (self-reported)" | Agent promises: "I will pass these N verifiable checks" — Observable: each check independently measured |
| Parent agent assigns task to sub-agent | Parent declares need (-b), sub-agent declares capability (+b), binding forms |
| "MANDATORY protocol compliance" | Agent declares which protocols it promises to follow, verification checks each one |

### 3.2 Promise Anatomy

Every expectation in the system becomes:

1. **A promise declaration (+b)** — what the agent commits to doing (its own behavior only)
2. **An acceptance (-b)** — what the consumer expects to receive
3. **An observability criterion** — how fulfillment is independently verified (not self-reported), with a confidence rating
4. **A ledger entry** — recorded outcome (kept / broken / partial)

### 3.3 Foundational Axiom

An agent can only promise its own behavior. No agent may make promises on behalf of another. This is enforced structurally: promise declarations live inside each agent's definition, not in a central authority document.

---

## 4. Scope: What Changes, What Doesn't

### 4.1 Two Change Layers

**The spec is honest about scope.** There are two distinct change layers, not one:

**Layer 1: Prompt-layer rewrite (system-wide semantic change)**

This is a rewrite of every prompt/instruction file in the system. It changes what agents read and how they're framed. It touches many files but the changes are systematic (template-based transformation, not bespoke).

| Component | Approx. Count | Change |
|---|---|---|
| CLAUDE.md | 1 | Obligation registry becomes Promise registry |
| Protocols | 12 YAML files | Rewritten as promise specifications with observability criteria |
| Agent definitions | ~105 .md + 3 .yaml | Each agent declares +promises (offers), -promises (acceptances), verification criteria |
| Quality gates | ~6 files | Self-reported scores become independently verifiable promise checks |
| Rules | 12 .md files | Shift from "you MUST" to "agent promises" with observable verification |
| Templates | ~19 files | Add promise fulfillment section to output templates |

**Total prompt-layer files affected: ~155.** The changes are systematic (template-based transformation), but this is a significant rewrite.

**Revert cost for Layer 1:** `git checkout main -- protocols/ agents/ quality-gates/ rules/ templates/ CLAUDE.md`. Mechanical, but touches ~155 files. Not a "flip a switch" revert — requires a coordinated branch switch.

**Layer 2: Runtime hook (single integration point)**

One new runtime hook at agent task completion. This is the promise engine, observability checker, trust manager, and ledger. Truly additive — removing it means deleting the `promise/` directory and removing one function call.

| Component | Purpose |
|---|---|
| Promise Engine (`promise/promise-engine.js`) | Core: runs verification, updates trust, handles re-binding |
| Observability Checker (`promise/observability-checker.js`) | Implements all verification methods |
| Trust Manager (`promise/trust-manager.js`) | Trust score computation, per-agent history |
| Consumer Promises (`promise/consumer-promises.yaml`) | Default consumer -b declarations |
| Ledger Writer (`promise/ledger-writer.js`) | Writes to `~/.claude/promise-ledger/` |

**Revert cost for Layer 2:** Delete `promise/` directory, remove hook call. Trivial.

### 4.2 Unchanged (Infrastructure Layer)

| Component | Rationale |
|---|---|
| `src/core/` (execution-context, platform, paths, filesystem) | Plumbing with no obligation semantics |
| `src/integrations/` (Jira, GitHub, Confluence sync) | API clients, pure infrastructure |
| `src/pm/` (status, next, search) | Data queries, no agent behavioral framing |
| `src/dev/` (session lifecycle, metrics) | Workflow tracking, works as-is |
| `src/intelligence/` (recommendation engine, profiles) | Analytics, independent of framing |
| `src/utils/` (validators, formatters, error handlers) | Utility code |
| `tests/` | Existing tests stay. New measurement tests are added |

### 4.3 New Components: Measurement Infrastructure

Built on main FIRST (Phase 0), before branching. Both branches share identical measurement code. See Section 10.4 for phasing rationale.

| Component | Purpose |
|---|---|
| Task Battery (`measurement/task-battery.js`) | 5-task battery for automated measurement |
| Metrics Collector (`measurement/metrics-collector.js`) | Reads outputs, computes per-run metrics |
| Baseline Runner (`measurement/baseline-runner.js`) | Orchestrates battery runs |
| Comparison Report (`measurement/comparison-report.js`) | Statistical comparison with effect sizes |

### 4.4 Deferred to Later Iteration

| Component | Rationale for Deferral |
|---|---|
| Cascade Tracer | Architecturally complex. Most agent interactions are parent-to-sub-agent, not long chains. Adds implementation risk without proportional experimental value for Phase 1 |
| Consumer Tiers (4 levels) | Premature optimization. Use single tier for experiment (full verification). Expand based on real usage data |

---

## 5. Protocol Structure

### 5.1 Protocol Template

Each protocol is rewritten to this structure:

```yaml
name: <protocol-name>
type: promise-specification

promises:
  - id: <unique-promise-id>
    direction: +b          # agent offers this behavior
    declaration: "<what the agent commits to>"
    observable_by:
      - method: <verification-method>
        confidence: high|medium|low
        check: "<specific verifiable criterion>"

acceptance:
  - id: <acceptance-id>
    direction: -b          # agent accepts being verified
    declaration: "<what the agent accepts>"

consequences:
  kept:
    trust_increment: <float, weighted by verification confidence>
  broken:
    trust_decrement: <float, weighted by verification confidence>
```

### 5.2 Verification Confidence Levels

Not all promises are equally verifiable. The spec acknowledges this explicitly:

| Confidence | Meaning | Trust Weight | Examples |
|---|---|---|---|
| **high** | Mechanical, deterministic verification | 1.0x | grep for TODO/FIXME, file_check for test existence, AST duplicate detection |
| **medium** | Heuristic, proxy-based verification | 0.6x | Token metric as proxy for context efficiency, cyclomatic complexity as proxy for simplicity |
| **low** | Output-structure dependent, fragile | 0.3x | Checking if output "references CLAUDE.md," checking for "confidence declaration" in output |

Trust adjustments are multiplied by confidence weight. A broken high-confidence promise (grep found TODOs) has 3.3x the trust impact of a broken low-confidence promise (output didn't seem to reference docs). This prevents noisy low-confidence checks from dominating trust evolution.

### 5.3 Protocol Transformation Summary

| Protocol | Key Promise Shift | Strongest Verification |
|---|---|---|
| agent-compliance | "MUST read docs" becomes promises context-awareness | low — output content analysis |
| uncertainty-handling | "MUST ask when unsure" becomes promises confidence declaration | low — output structure |
| context-optimization | "MUST use sub-agents" becomes promises efficient context usage | medium — token metrics |
| information-sources | "MUST follow source hierarchy" becomes promises source citation | medium — citation presence |
| simplicity-enforcement | "MUST not over-engineer" becomes promises minimal complexity | medium — AST complexity |
| agent-consensus | "MUST get multi-agent review" becomes promises independent analysis | medium — review trail |
| first-time-right | "ZERO TODOs" becomes promises complete output | **high** — grep + file_check |
| output-budget-management | "MUST manage output quality" becomes promises quality-density | medium — scoring |
| team-orchestration | "MUST use Native Teams for 3+" becomes promises coordination method | medium — team ledger |

**Observation:** The promises that are most mechanically verifiable (zero TODOs, tests exist, no duplicates) are the same things the current obligation system could theoretically check but doesn't. The promise system's advantage is that it actually checks them and records results. The weaker promises (context-awareness, confidence declaration) may not drive trust meaningfully, but they still prime the agent's framing — which is the behavioral hypothesis under test.

### 5.4 Agent Definition Structure

Each agent definition receives a promise header. These promises are **both metadata for the checker AND part of the agent's prompt**. The LLM sees its own promise declarations as part of its instructions.

```yaml
promises_offered:  # +b — included in agent prompt AND used by checker
  - id: complete-output
    declaration: "I will produce complete output with zero TODO/FIXME markers"
    verification: { method: grep, confidence: high, pattern: "TODO|FIXME|HACK" }
  - id: tested-code
    declaration: "I will include tests for all code I produce"
    verification: { method: file_check, confidence: high, check: "test file exists" }
  - id: resource-cleanup
    declaration: "I will close all resources I open"
    verification: { method: ast_analysis, confidence: medium, check: "open handles" }

promises_accepted:  # -b
  - "I accept the task description and context provided"
  - "I accept independent verification of my output"
```

### 5.5 Promise Lifecycle: From Declaration to Verification

This section shows exactly how promises flow through the system.

**Step 1: Agent Selection**
Parent agent or user invokes a command. The system selects an agent (e.g., `code-analyzer`). Trust score for this agent is read from the local ledger (or 0.5 if new).

**Step 2: Prompt Assembly**
The agent's prompt is assembled from:
1. CLAUDE.md (now a promise registry, not obligation list)
2. The agent's .md definition (now includes promise declarations)
3. The relevant protocol YAML (now a promise specification)
4. The task-specific context

The agent sees something like:

```
## Your Promises
You have made the following promises. Your output will be independently verified against each.

- [complete-output] I will produce complete output with zero TODO/FIXME markers
- [tested-code] I will include tests for all code I produce
- [resource-cleanup] I will close all resources I open

Verification is automatic. Your trust score reflects your history of keeping these promises.
Current trust score: 0.72

## Task
[actual task description]
```

**Step 3: Agent Produces Output**
The agent does its work. Its output is captured.

**Step 4: Observability Checker Runs**
The promise engine loads this agent's promise list, runs each verification method against the output, records results.

**Step 5: Trust Update**
Trust score adjusted based on results, weighted by verification confidence.

**Step 6: Ledger Write**
Full record written to `~/.claude/promise-ledger/`.

**Step 7: Consumer Acceptance**
If consumer -b promises are defined, checker results determine acceptance/re-binding.

### 5.6 CLAUDE.md Transformation

The master document shifts from an obligation list to a promise registry:

```markdown
## Promise Registry

Every agent in this system makes the following standing promises.
Fulfillment is independently verified. Trust scores reflect observed history.

### Standing Promises (all agents)

| Promise | Verification | Confidence | Consequence (broken) |
|---|---|---|---|
| Complete implementation | grep: zero TODO/FIXME | high | trust -0.2 |
| No code duplication | AST: duplicate detection | high | trust -0.1 |
| Resource cleanup | AST: open handles checked | medium | trust -0.09 |
| Error handling | AST: try/catch around external calls | medium | trust -0.09 |
| Tests with code | file_check: test file exists | high | trust -0.2 |
| Context awareness | output: references project context | low | trust -0.045 |
```

---

## 6. Consequence Model

### 6.1 Trust Scores

Each **agent prompt template** accumulates a trust score based on promise fulfillment history. Trust reflects the observed reliability of a specific prompt template when executed by the underlying LLM, not the reliability of a persistent process.

- Starts at **0.5** (neutral, no evidence)
- Kept promises: trust increases (diminishing returns approaching 1.0), weighted by verification confidence
- Broken promises: trust decreases (sharp penalty), weighted by verification confidence

Trust formula:

```
# Per-run aggregation: compute a single weighted observation from all promises
run_observation = sum(observation_i * confidence_weight_i) / sum(confidence_weight_i)

where:
  observation_i = 1.0 (kept) | 0.0 (broken) | 0.5 (partial)  -- for each promise
  confidence_weight_i = 1.0 (high) | 0.6 (medium) | 0.3 (low) -- for each promise

# Trust update: one update per run, not per promise
trust(t) = decay_factor * trust(t-1) + (1 - decay_factor) * run_observation

where:
  decay_factor = 0.85 (configurable)
```

**Aggregation rationale:** Trust is updated once per run using a confidence-weighted mean across all promises. This prevents the order of promise evaluation within a run from affecting the result. A run with 3 high-confidence kept promises and 1 high-confidence broken promise produces `run_observation = (3*1.0 + 1*0.0) / 4 = 0.75`. If the broken promise were low-confidence: `(3*1.0*1.0 + 1*0.0*0.3) / (3*1.0 + 1*0.3) = 0.91` — the high-confidence kept promises dominate appropriately.

**Why decay_factor = 0.85 (not 0.95):** With 10 automated runs per branch and a 1-week team trial, trust must move fast enough to differentiate agent prompt templates. At 0.85, starting from 0.5, a perfectly performing agent reaches ~0.82 after 10 runs (entering the high-trust tier). A consistently failing agent drops to ~0.22 (entering the low-trust tier). This ensures the trust-based behavioral tiers (Section 6.2) are actually exercised during the experiment. The decay factor can be tuned post-experiment based on observed convergence rates.

**Why decay exists for prompt templates:** The underlying LLM model can change (model updates, version bumps). Decay ensures that trust reflects recent observations, not stale history from a prior model version.

### 6.2 Trust-Based System Response

| Trust Level | System Response |
|---|---|
| High (> 0.8) | Light-touch verification: only high-confidence checks run |
| Medium (0.5 - 0.8) | Full verification: all checks run |
| Low (0.2 - 0.5) | Full verification + broken promise history injected into prompt on next invocation |
| Critical (< 0.2) | Agent flagged in daily report. System warns user before invocation. Does NOT auto-exclude — user decides |

**Key distinction from the original spec:** Trust scores do NOT auto-exclude agents from a selection pool. "Agents" are prompt templates, not interchangeable workers. A low-trust `code-analyzer` cannot be replaced by a `frontend-developer`. Instead:
- Low trust triggers **prompt augmentation**: the agent's broken promise history is injected into its next invocation, giving it specific guidance on what to improve
- Critical trust triggers **user notification**: the system warns "this agent has low trust (0.18) — recent broken promises: [list]. Proceed?"
- The user makes the exclusion decision, not the system

### 6.3 Feedback Loop

- Promise fulfillment rates feed into **prompt augmentation** — low-trust agents receive their failure history as context
- Repeated broken promises on specific promise types trigger **promise review** — if >60% of agents break the same promise, the promise is flagged as potentially unrealistic
- Aggregate data surfaces **systemic issues** in daily reports

This closes the loop the current system lacks. The system learns from observed outcomes.

---

## 7. Consumer Acceptance Promises (-b)

### 7.1 Structure

Every consumer of agent output declares what it will and won't accept:

```yaml
consumer_promises:  # -b declarations
  - id: code-safety
    declaration: "I will not accept output containing known vulnerability patterns"
    verification: ast_analysis
    on_rejection: rebind

  - id: completeness
    declaration: "I will not accept output with TODO/FIXME placeholders"
    verification: grep
    on_rejection: rebind

  - id: test-presence
    declaration: "I will not accept implementation without accompanying tests"
    verification: file_check
    on_rejection: rebind
```

### 7.2 Binding Model

A task proceeds when +b and -b overlap:

```
Agent (+b): "I will produce clean, tested code"
Consumer (-b): "I will accept code that passes these checks"

         +b intersection -b = binding formed
                    |
              Agent does work
                    |
           Observability checker runs
                    |
     Overlap confirmed --> output accepted, trust++
     No overlap --> binding failed --> re-binding
```

### 7.3 Re-binding Rules

**Theoretical honesty:** Re-binding is an automated system behavior that intercepts output and decides whether to retry. This is a **pragmatic departure from pure Promise Theory**, where the observer would merely record the failure. We accept this departure because the alternative (always delivering broken output to the user) defeats the purpose. The system acts as a consumer exercising its own -b promise, not as an authority imposing on the agent.

**How re-binding triggers:** When a consumer -b promise has `on_rejection: rebind` and the observability checker finds the corresponding +b promise broken, the re-binding flow activates. The attempt counter is tracked per `(task_id, promise_id)` pair in the current run. If no consumer -b defines `on_rejection: rebind` for a given promise, the output is accepted regardless and the broken promise is only recorded in the ledger.

| Attempt | Action | Rationale |
|---|---|---|
| 1st | Re-bind: same agent, prompt includes specific broken promise and its evidence | Agent gets immediate clear signal. No "benefit of the doubt" when consumer explicitly rejects |
| 2nd | Re-bind: different agent (if one with equivalent capability and higher trust exists) | This prompt template failed this promise with guidance — try another |
| 3rd | Deliver output with broken-promise annotation, escalate to human | System cannot resolve autonomously. Human decides |

**Note:** The attempt sequence only applies to promises covered by consumer -b `on_rejection: rebind`. Promises without consumer rejection rules are always observed-and-recorded only (no re-binding). This creates two classes of promises: those the system actively enforces via consumer acceptance, and those it passively observes.

### 7.4 Consumer Configuration

For Phase 1 (experiment), use a single consumer tier: **full verification on all runs**. Consumer tier differentiation (strict/medium/light) is deferred to post-experiment iteration based on real usage patterns.

---

## 8. Observability Checker

### 8.1 Verification Methods

| Method | Confidence | Implementation | Example |
|---|---|---|---|
| `grep` | high | Pattern match against output text | `TODO\|FIXME\|HACK` -> 0 matches = kept |
| `file_check` | high | Verify files created/modified | Tests exist alongside implementation |
| `ast_analysis` | high/medium | Parse code output structurally | Duplicate detection (high), complexity (medium) |
| `output_contains` | low | Check for required content | Output references CLAUDE.md specifics |
| `output_structure` | low | Validate structural elements | Has constraints section before implementation |
| `token_metric` | medium | Context efficiency measurement | Sub-agent used when output > 1000 lines |
| `timing` | high | Completion within bounds | Multi-agent task completed, no hung processes |

### 8.2 Execution Flow

```
Agent completes task
       |
Checker loads agent's promise list
       |
For each promise:
  Run verification method
  Record: { promise_id, result, confidence, evidence, timestamp }
       |
Write to Promise Ledger
       |
Update trust score (weighted by confidence)
       |
If consumer -b promises defined:
  Evaluate acceptance criteria
  If failed: trigger re-binding per Section 7.3
```

### 8.3 Design Principles

- The checker **observes and records** promise fulfillment
- Trust adjustments are weighted by verification confidence — noisy checks don't dominate
- Consumer acceptance promises (-b) are the mechanism for output rejection and re-binding
- Re-binding is acknowledged as a pragmatic departure from pure observation (see Section 7.3)
- The checker never blocks the agent during execution — it operates post-hoc

---

## 9. Promise Ledger

### 9.1 Location

```
~/.claude/promise-ledger/
  agents/
    {agent-id}.jsonl            # per-agent trust history
    trust-scores.json           # current trust scores (computed from history)
  runs/
    {run-id}.jsonl              # all promises from a single run
  reports/
    {date}-summary.json         # daily aggregates
```

### 9.2 Gitignore

The ledger is a local runtime artifact, not version-controlled. Added to `.gitignore`.

### 9.3 Per-Machine Trust

Trust scores are local to each machine. Each developer's system builds its own ledger from its own observations. This aligns with Promise Theory: trust is local to the observer. There is no central authority declaring agent trustworthiness.

**Team trial data collection:** During Phase 5 (team trial), developers export their ledger data via a collection script that copies `~/.claude/promise-ledger/reports/` to a shared location. Trust scores remain per-machine; the exported data is observational records used for aggregate analysis only. No machine imports another machine's trust scores.

### 9.4 Ledger Record Format

```json
{
  "run_id": "<uuid>",
  "timestamp": "<ISO 8601>",
  "agent_id": "<agent name>",
  "task_id": "<task identifier>",
  "promises_declared": [
    {
      "promise_id": "<id>",
      "direction": "+b",
      "declaration": "<text>",
      "verification_confidence": "high|medium|low"
    }
  ],
  "verification_results": [
    {
      "promise_id": "<id>",
      "method": "<verification method>",
      "confidence": "high|medium|low",
      "result": "kept|broken|partial",
      "evidence": "<what was found or not found>",
      "timestamp": "<ISO 8601>"
    }
  ],
  "trust_score_before": 0.5,
  "trust_score_after": 0.55,
  "rebinding_triggered": false,
  "rebinding_attempt": 0,
  "completion_time_ms": 45000,
  "tokens_used": 12500,
  "human_intervention_required": false
}
```

---

## 10. Automated Measurement Framework

### 10.1 Experimental Design

- **Automated baseline:** No human involvement in data collection
- **Per-person paired samples:** Each developer is their own control (for the team trial phase)
- **10 runs per branch:** Smart sampling with 5 representative tasks per run
- **Statistical approach:** Exploratory with directional evidence (see Section 10.6 for power analysis)

### 10.2 Task Battery (per run)

| # | Task | Covers | Est. Time |
|---|---|---|---|
| 1 | Single-agent code generation with specific protocol requirements | Compliance, Quality, Determinism | ~3 min |
| 2 | `/code:plan` on a predefined ticket | Compliance, Quality, Coordination | ~10 min |
| 3 | Multi-agent parallel task (3+ agents) | Coordination, Resilience | ~15 min |
| 4 | Degraded-input task (ambiguous requirements) | Resilience, Quality | ~3 min |
| 5 | Determinism control (identical every run) | Determinism | ~3 min |

**5 tasks per run. ~35 minutes per run. 10 runs = ~6 hours per branch.**

Tasks 1-4 can rotate variants across runs (different tickets, different code tasks) within the same difficulty band to avoid overfitting. Task 5 is identical every run to directly measure variance.

### 10.3 Measurement Points

For each task, the collector records:

```json
{
  "task_id": "<identifier>",
  "run_number": 1,
  "branch": "main|promise",
  "timestamp": "<ISO 8601>",
  "agent_id": "<agent>",
  "promises_declared": [],
  "promises_kept": [],
  "promises_broken": [],
  "verification_results": {
    "todo_count": 0,
    "fixme_count": 0,
    "error_handling_present": true,
    "tests_present": true,
    "docs_referenced": true,
    "ast_complexity": 6,
    "duplicate_blocks": 0
  },
  "quality_score": 8.5,
  "completion_time_ms": 45000,
  "tokens_used": 12500,
  "rebinding_triggered": false,
  "human_intervention_required": false
}
```

### 10.4 Execution Schedule

```
Phase 0: Build measurement infrastructure (on main)
  Build measurement/ directory (task battery, collector, reporter)
  Merge to main
  Let it stabilize
  This ensures BOTH branches have identical measurement code
  Eliminates confound: measurement infrastructure itself affecting results

Phase 1: Baseline (automated)
  Freeze main (post Phase 0 merge)
  Run task battery 10x on main
  Output: baseline_metrics.jsonl (50 task records)

Phase 2: Build promise branch
  Create branch from main (which now includes measurement infra)
  Restructure semantic layer (Layer 1: protocols, agents, CLAUDE.md, etc.)
  Implement promise engine + observability checker (Layer 2: runtime hook)

Phase 3: Promise measurement (automated)
  Run identical task battery 10x on promise branch
  Output: promise_metrics.jsonl (50 task records)

Phase 4: Analysis
  Per-metric comparison (n=10 paired runs, n=50 paired tasks)
  Effect size (Cohen's d) + 95% confidence intervals
  Variance comparison (F-test on determinism task)
  Generate comparison report

Phase 5: Team trial (1 week)
  Company switches to promise branch
  Daily DX survey per person:
    - "Did the system fight you today?" (1-5)
    - "Did you trust the agent outputs?" (1-5)
    - "Did you have to redo agent work?" (count)
    - Free text: "What surprised you?"
  Ledger data exported from all machines for aggregate analysis

Phase 6: Final analysis
  Automated metrics + team DX data + aggregate ledger analysis
  Decision: adopt, iterate, or revert
```

### 10.5 Metrics Summary

| Category | Metric | Measurement Method |
|---|---|---|
| Agent compliance | Protocol promise fulfillment rate | Observability checker across all protocol promises |
| Task completion quality | Independent quality score (not self-reported) | Automated verification checks (grep, AST, file_check) |
| Coordination efficiency | Multi-agent task time, conflict rate, merge failures | Timing + git status analysis |
| Resilience | Graceful degradation rate under ambiguous input | Output quality score on degraded tasks |
| Determinism | Output variance across identical runs | Statistical variance on determinism control task |
| Developer experience | Survey scores, rework count | Daily per-person survey (team trial phase) |
| Re-binding rate | How often the system self-corrects | Ledger: rebinding_triggered count |
| Trust evolution | How trust scores change over time | Ledger: trust_score time series |

### 10.6 Statistical Power & Interpretation

With n=10 paired runs, the Wilcoxon signed-rank test has adequate power to detect **large** effect sizes (Cohen's d > 0.8) but limited power for moderate effects. This means:

- **If Promise Theory produces a large improvement** (>= 20% compliance increase, >= 15% quality increase): the automated measurement will detect it with statistical confidence
- **If the improvement is moderate** (10-20%): the automated measurement provides directional evidence but not statistical proof. The team trial (Phase 5) provides supplementary evidence
- **If the improvement is small** (< 10%): the automated measurement cannot distinguish from noise. A larger study would be needed

**This is acknowledged and acceptable.** The automated phase is designed to catch large effects and flag direction. The team trial provides ecological validity. Together they inform the adopt/iterate/revert decision. The success criteria (Section 13) are framed as directional thresholds, not p-value gates.

**Quality score units:** "10% increase" means 10% relative improvement (e.g., 7.0 → 7.7, not 7.0 → 17.0).

---

## 11. Integration Architecture

### 11.1 Integration Points (Honest Assessment)

**Runtime hook (1 point):**
The promise engine hooks in at agent task completion: `Agent completes → promise-engine.verify() → ledger write → trust update → output returned`. This is one function call, easy to add/remove.

**Prompt-layer changes (system-wide):**
Every protocol, agent definition, CLAUDE.md, quality gate, rule, and template is rewritten. This is not one integration point — it is a coordinated semantic rewrite of ~155 files. The changes are systematic (template-based) but the revert requires switching back to the main branch entirely or cherry-picking infrastructure changes.

### 11.2 File Structure

```
promise/                              # Layer 2: Runtime hook (NEW)
  promise-engine.js
  observability-checker.js
  trust-manager.js
  consumer-promises.yaml
  ledger-writer.js

measurement/                          # Phase 0: Measurement infra (NEW, merged to main first)
  task-battery.js
  metrics-collector.js
  baseline-runner.js
  comparison-report.js
  tasks/
    single-agent-codegen.md
    code-plan.md
    multi-agent-coordination.md
    degraded-input.md
    determinism-control.md
```

### 11.3 Dependency Direction

```
Agent definitions ----> promise declarations (embedded in each agent .md)
Protocols -----------> promise specifications (rewritten .yaml)
CLAUDE.md -----------> promise registry (rewritten)
Quality gates -------> observability specifications (rewritten)
Templates -----------> include promise fulfillment section (modified)

promise-engine.js ---> observability-checker.js (runs checks)
                   --> trust-manager.js (updates scores)
                   --> ledger-writer.js (persists results)

measurement/ --------> promise-engine.js (collects data, promise branch only)
                   --> comparison-report.js (analyzes data)
```

No circular dependencies. Promise engine depends on checker and ledger. Measurement depends on promise engine (on the promise branch) or runs standalone checks (on main baseline). Nothing else depends on promise engine.

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rewritten protocols confuse agents, quality drops | Medium | High | Baseline measurement provides revert threshold. If quality drops >10% relative, revert |
| Promise overhead adds latency to every task | Low | Medium | Checker is post-hoc. Does not block agent execution |
| ~95 agent definitions are tedious to rewrite | High | Low | Template-based transformation. Promise headers follow a pattern |
| Trust scores converge too slowly for 1-week trial | Medium | Medium | Start trust at 0.5 (neutral), use aggressive early learning rate |
| Team finds promise language confusing | Low | Medium | Team interacts with commands, not raw protocols. Behavioral change is under the hood |
| Measurement battery doesn't capture real-world complexity | Medium | Medium | Battery is supplemented by real team usage data during trial week |
| Low-confidence verifications produce noisy trust data | Medium | Medium | Confidence-weighted trust adjustments prevent noise from dominating |
| Re-binding loops waste tokens/time on broken tasks | Low | Medium | Max 4 attempts with escalation. 1st attempt always accepts. Cost bounded |
| Prompt-layer revert is not trivial | Low | High | Git branch switch. Team trial has defined end date. Revert = switch back to main |

---

## 13. Success Criteria

The restructure is considered successful if the promise branch demonstrates **directional improvement** across these thresholds:

1. **Agent compliance rate** shows directional increase (target: >= 15% relative, measured by high-confidence observability checks)
2. **Quality score** (independently measured) shows directional increase (target: >= 10% relative)
3. **Determinism** (output variance on control task) shows directional decrease (target: >= 20% relative reduction in variance)
4. **Re-binding rate** shows the system self-corrects issues before human sees them (any non-zero rate is signal)
5. **DX survey** shows no regression (team trial mean scores stable or improved)
6. **No metric regresses** by more than 5% relative compared to baseline

**Decision framework:**
- Criteria 1-4 met with statistical confidence + 5-6 hold → **Adopt** (promise branch becomes main)
- Criteria show directional improvement but lack statistical confidence + 5-6 hold → **Iterate** (extend trial, increase sample size)
- Any metric regresses beyond threshold → **Investigate** root cause before deciding
- DX survey shows regression → **Revert** regardless of automated metrics

---

## 14. Rollback Plan

### During Automated Measurement (Phases 1-4)
No rollback needed. Both branches exist independently. Measurement runs are isolated.

### During Team Trial (Phase 5)
- Team trial has a **defined end date** (1 week)
- If critical issues surface mid-trial: `git checkout main` across all machines. The promise branch is not deleted — it's preserved for analysis
- Developer commits made during the trial on the promise branch: cherry-picked onto main if needed via `git cherry-pick` or rebased

### Post-Trial Revert
- If decision is "revert": team switches back to main. Promise branch preserved as reference
- Measurement infrastructure (Phase 0, on main) is kept regardless — it's valuable independent of Promise Theory
- Local promise ledgers (`~/.claude/promise-ledger/`) can be deleted or preserved for research

---

## 15. References

- Burgess, M. (2004-2005). Promise Theory: initial formalization in systems management context. DSOM Conference.
- Burgess, M. (2008). Static Theory of Promises: introducing observability and uniformity axioms.
- Burgess, M. & Bergstra, J.A. (2014). *Promise Theory: Principles and Applications*. ISBN 9781495437779.
- Burgess, M. (2015). *Thinking in Promises*. O'Reilly Media.
- Burgess, M. (2020). Information and Causality in Promise Theory. arXiv:2004.12661.
- [Promise Theory - Wikipedia](https://en.wikipedia.org/wiki/Promise_theory)
- [Mark Burgess - Promise Theory](https://markburgess.org/promises.html)
- [Grokipedia - Promise Theory](https://grokipedia.com/page/promise_theory)
