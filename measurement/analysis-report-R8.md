# Measurement Analysis Report: R8 (Full Stack — Compact Encoding + cxpak + Promise Gate)

**Generated**: 2026-04-16
**Baseline**: promise-theory-v2 (5955c62, pre-observer-upgrade), 15 runs × 5 tasks = 75 records
**Treatment**: promise-theory-v2 (df3d44f, full observer upgrade), 15 runs × 5 tasks = 75 records
**Bonus run**: compact encoding only (no gate, no cxpak), 15 runs × 5 tasks = 75 records

## Measurement History

| Round | Ref | Description | Runs | Mean QS | Delta vs R1 | Sig? |
|-------|-----|-------------|------|---------|-------------|------|
| R1 | `main` (c5a12fa) | Imperative CLAUDE.md (baseline) | 15 | 6.88 | -- | -- |
| R2 | `promise-theory` (aac3488) | Promise-framed CLAUDE.md (no enforcement) | 15 | 7.04 | +0.16 | No |
| R3 | `promise-theory` (e24e46e) | Promise + closed-loop trust enforcement | 15 | 7.16 | +0.28 | No |
| R4 | `promise-theory` (474fa2b) | Promise v2: transparent framing, fixed verification | 30 | 6.87 | -0.01 | No |
| R5 | `promise-theory` (dfe23ce) | Always-on feedback injection into prompts | 30 | 6.45 | -0.43 | **Yes (p<0.05, harmful)** |
| R6 | `promise-theory` (b2785d2) | Output gate: verify post-output, retry clean | 30 | 7.37 | +0.49 | **Yes (p<0.01, d=0.74)** |
| R7 | `promise-theory-v2` | cxpak context + output density optimization | 15 | 7.60 | +0.72 | d=1.82, +quality, -15.5% tokens |
| **R8** | **`promise-theory-v2`** | **Full stack: compact encoding + cxpak + promise gate** | **15** | **7.01** | **+0.13** | **d=0.53, +quality, +7.6% tokens** |
| R8b | `promise-theory-v2` | Compact encoding only (no gate, no cxpak) | 15 | 6.79 | -0.09 | d=0.24, -14.4% tokens |

---

## 1. What Changed in R8

R8 tests the complete observer upgrade stack over the R7 baseline:

1. **Compact constraint encoding**: CLAUDE.md + 5 rules files rewritten using Header-Table Standard (20,150 → 12,735 bytes, 36.8% reduction)
2. **Promise registry**: 14 versioned promises (8 standing + 4 structural + 2 behavioral) replacing hardcoded STANDING_PROMISES
3. **Execution traces**: JSONL sidecar files with tool call sequence and token attribution
4. **Graduated response**: 4 trust tiers with proportional gate actions
5. **Promise gate**: Registry-based verification with clean-prompt retry (`--promise`)
6. **cxpak context**: Structured context via MCP (`--cxpak-prompt`)

R8b (bonus run) isolates the compact encoding effect by running without `--promise` or `--cxpak-prompt`.

---

## 2. Overall Statistics

### R8: Full Stack (compact + cxpak + gate)

| Metric | Baseline | R8 | Delta |
|--------|----------|-----|-------|
| Mean quality_score | 6.65 | **7.01** | **+0.36** |
| Tokens/invocation | 8,391 | 9,032 | **+7.6%** |
| Efficiency (tokens/QS point) | 1,261 | 1,288 | +2.1% |
| Errors | 0 | 0 | 0 |

### R8b: Compact Encoding Only

| Metric | Baseline | R8b | Delta |
|--------|----------|------|-------|
| Mean quality_score | 6.65 | 6.79 | +0.13 |
| Tokens/invocation | 8,391 | **7,183** | **-14.4%** |
| Efficiency (tokens/QS point) | 1,261 | **1,058** | **-16.1%** |
| Errors | 0 | 0 | 0 |

---

## 3. Per-Task Breakdown

### R8: Full Stack

| Task | Baseline | R8 | Delta | Gate Retry Rate |
|------|----------|----|-------|-----------------|
| code-plan | 7.00 | 7.27 | +0.27 | 80% (12/15) |
| degraded-input | 4.40 | 4.53 | +0.13 | 100% (15/15) |
| determinism-control | 7.07 | 6.60 | -0.47 | 80% (12/15) |
| multi-agent-coordination | 7.27 | 8.40 | **+1.13** | 60% (9/15) |
| single-agent-codegen | 7.53 | 8.27 | **+0.73** | 80% (12/15) |

### R8b: Compact Encoding Only

| Task | Baseline | R8b | Delta |
|------|----------|------|-------|
| code-plan | 7.00 | 7.60 | +0.60 |
| degraded-input | 4.40 | 4.40 | +0.00 |
| determinism-control | 7.07 | 7.00 | -0.07 |
| multi-agent-coordination | 7.27 | 7.67 | +0.40 |
| single-agent-codegen | 7.53 | 7.27 | -0.27 |

---

## 4. Statistical Tests

### R8: Full Stack

| Metric | Value |
|--------|-------|
| Wilcoxon direction | no_difference |
| W statistic | 15.5 |
| n (non-zero diffs) | 13 |
| Cohen's d | **0.528 (medium)** |

### R8b: Compact Encoding Only

| Metric | Value |
|--------|-------|
| Wilcoxon direction | no_difference |
| W statistic | 35 |
| n (non-zero diffs) | 14 |
| Cohen's d | 0.237 (small) |

---

## 5. Gate Analysis

The promise gate fired on **80% of invocations** (60/75), with an average of 1.80 gate attempts per task. This is the most aggressive gate behavior across all rounds.

| Task | Retry Rate | Interpretation |
|------|------------|----------------|
| degraded-input | 100% | Gate always fires on intentionally noisy input |
| code-plan | 80% | Planning output frequently missing error-handling |
| determinism-control | 80% | Structural verification catches inconsistencies |
| single-agent-codegen | 80% | Implementation-depth promise triggers retries |
| multi-agent-coordination | 60% | Lowest retry rate, highest quality gain (+1.13) |

The gate catches real issues (error-handling, implementation-depth) but in single-shot mode, the cost is ~22% more tokens per retry while the quality improvement is modest (+0.36). Tasks with the lowest retry rate (multi-agent-coordination) show the largest quality gain, suggesting the gate's value is in selective enforcement, not blanket retries.

---

## 6. Component Decomposition

R8 and R8b together allow decomposing the effect of each component:

| Component | Quality Effect | Token Effect | Net |
|-----------|---------------|-------------|-----|
| Compact encoding (R8b) | +0.13 | **-14.4%** | Pure efficiency gain |
| cxpak context (R7 delta) | +0.59 | -15.5% | Best single-shot improvement |
| Promise gate (R8 - R8b) | +0.23 | +22% | Quality at token cost |
| **Full stack (R8)** | **+0.36** | **+7.6%** | Gate overhead exceeds compact savings |

The compact encoding saves 14.4% tokens. The gate adds ~22% tokens (retries). Net: +7.6%. The gate's quality contribution (+0.23 over compact-only) doesn't justify the token cost in single-shot measurement.

---

## 7. Why Single-Shot Measurement Underestimates Interactive Value

**This is the most important finding of R8.**

The measurement framework tests `claude -p` — single prompt, single output. This is the *least favorable* scenario for the promise gate and the *most favorable* for cxpak context. In interactive multi-turn sessions, the value proposition inverts.

### Failure Modes Differ

| Failure mode | Single-shot (`claude -p`) | Interactive (multi-turn) |
|---|---|---|
| Incomplete context | cxpak solves directly | Agent explores iteratively; cxpak nice-to-have |
| Bad output | One output affected | Bad output becomes context for all subsequent turns |
| Error propagation | N/A (one turn) | Dominant failure mode — compounds across turns |
| Context degradation | N/A | Quality degrades as window fills |
| Drift | N/A | Agent gradually goes off-track |

### Component Value by Session Type

| Component | Single-shot value | Interactive value | Why |
|---|---|---|---|
| Compact encoding | -14% tokens once | -14% × every turn (compounds) | System prompt loaded every turn |
| cxpak context | High (replaces exploration) | Medium (agent can explore anyway) | Interactive agents have Read/Grep/Glob |
| Promise gate | Low (cxpak prevents errors) | **High (catches drift before it compounds)** | Preventing one bad turn saves all subsequent turns |
| Graduated response | None (no session history) | **High (adaptive enforcement)** | Focuses overhead on failing agents |
| Behavioral promises | None (no real exploration) | **Measurable (real tool use traces)** | read-before-write, exploration-breadth |
| Observer architecture | Overhead only | **Designed for this** | Dispatch, verify, retry clean |

### The Compounding Argument

Consider a 20-turn interactive session where the agent makes a bad implementation in turn 5:

- **Without gate**: Turns 6-20 build on the bad implementation. The agent may notice and fix it later, but context is polluted. Cost: 15 turns of degraded context.
- **With gate**: Turn 5 is caught and retried with a clean prompt. Turns 6-20 build on correct implementation. Cost: 1 retry (~22% of one turn's tokens).

The break-even point is roughly: if the gate prevents one compounding error per 5 turns, the token cost of retries is recouped by avoiding context pollution. At an 80% retry rate, the gate fires frequently enough that even a modest success rate at preventing propagation yields a net positive.

### What We Cannot Measure Yet

The current measurement framework (`claude -p`, 5-task battery, Wilcoxon signed-rank) cannot validate the interactive hypothesis. It would require:

1. **Multi-turn task battery** — tasks that require 5-20 turns with intermediate decisions
2. **Error propagation tracking** — measuring how early errors affect late-session quality
3. **Session-level quality scoring** — evaluating the final state, not individual turn quality
4. **Trace-based behavioral assessment** — using execution traces to verify read-before-write, exploration patterns

This is a fundamentally different measurement problem. Single-turn quality is a proxy metric; session outcome is the real metric.

---

## 8. Cumulative Progress (R1 → R8)

| Metric | R1 (baseline) | R7 (best single-shot) | R8 (full stack) | R8b (compact only) |
|--------|--------------|----------------------|-----------------|-------------------|
| Mean quality | 6.88 | **7.60** | 7.01 | 6.79 |
| Tokens/inv | baseline | -15.5% | +7.6% | **-14.4%** |
| Efficiency | baseline | **876 tok/pt** | 1,288 tok/pt | **1,058 tok/pt** |

For `claude -p` pipelines: R7 (cxpak + output density) remains optimal.
For interactive sessions: R8's full stack is likely superior, but unproven by current measurement.

---

## 9. Summary

**R8 achieves +0.36 quality (d=0.53) at +7.6% token cost. The gate fires on 80% of single-shot invocations, adding tokens without proportional quality gain.**

| Finding | Detail |
|---------|--------|
| Overall effect | +0.36 quality (7.01 vs 6.65) |
| Effect size | Cohen's d = 0.528 (medium) |
| Wilcoxon | no_difference |
| Token change | +7.6% (gate retries exceed compact savings) |
| Gate retry rate | 80% (60/75 invocations retried) |
| Compact encoding alone (R8b) | -14.4% tokens, +0.13 quality |
| vs R7 | R7 better for single-shot (more quality, fewer tokens) |

### The Architectural Lesson (Updated)

Eight rounds of measurement tell the complete story for single-shot:

1. **R1-R4**: Framing and enforcement alone don't reliably improve output.
2. **R5**: Feedback injection into the agent is actively harmful.
3. **R6**: Observer-side action (gate + retry) works.
4. **R7**: Better context in + stricter output rules = highest quality on fewest tokens.
5. **R8**: Full stack (gate + cxpak + compact) — gate and cxpak are partially redundant in single-shot. Both prevent bad output, but via different mechanisms. The gate costs tokens; cxpak saves them.

**But single-shot measurement is the wrong lens for the full system.** The observer architecture (registry, traces, graduated response, voting) is designed for interactive multi-turn sessions where error propagation — not incomplete context — is the dominant failure mode. R8's components address different problems:

- **cxpak** solves: "the agent doesn't know enough" (input quality)
- **Gate** solves: "the agent produced something bad" (output quality)
- **Graduated response** solves: "how hard should we check?" (adaptive overhead)
- **Compact encoding** solves: "the system prompt wastes tokens" (efficiency)

In single-shot, only input quality matters. In multi-turn, output quality compounds.

### Verdict: WARN (single-shot) / LIKELY PASS (interactive, unproven)

- Quality: improved (+0.36, d=0.53) but modest
- Tokens: increased (+7.6%) due to gate retries
- For `claude -p`: use R7 configuration (cxpak + density, no gate)
- For interactive: full stack likely superior, pending multi-turn measurement
