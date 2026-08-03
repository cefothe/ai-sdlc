# Measurement Analysis Report: R6 (Output Gate — Observer Assesses, Agent Stays Clean)

**Generated**: 2026-03-20
**R1 (Baseline)**: Imperative CLAUDE.md, 15 runs x 5 tasks = 75 records (0 errors)
**R6 (Treatment)**: Output gate — promise verification post-output, clean retry on gate failure, no feedback injection, 30 runs x 5 tasks = 150 records (0 errors)

## Measurement History

| Round | Ref | Description | Runs | Mean QS | Delta vs R1 | Sig? |
|-------|-----|-------------|------|---------|-------------|------|
| R1 | `main` (c5a12fa) | Imperative CLAUDE.md (baseline) | 15 | 6.88 | -- | -- |
| R2 | `promise-theory` (aac3488) | Promise-framed CLAUDE.md (no enforcement) | 15 | 7.04 | +0.16 | No |
| R3 | `promise-theory` (e24e46e) | Promise + closed-loop trust enforcement | 15 | 7.16 | +0.28 | No |
| R4 | `promise-theory` (474fa2b) | Promise v2: transparent framing, fixed verification | 30 | 6.87 | -0.01 | No |
| R5 | `promise-theory` (dfe23ce) | Always-on feedback injection into prompts | 30 | 6.45 | -0.43 | **Yes (p<0.05)** |
| **R6** | **`promise-theory` (b2785d2)** | **Output gate: verify post-output, retry clean** | **30** | **7.37** | **+0.49** | **Yes (p<0.02)** |

---

## 1. Overall Statistics

| Metric | R1 (n=75) | R6 (n=150) | Delta |
|--------|-----------|------------|-------|
| Mean quality_score | 6.88 | **7.37** | **+0.49** |
| Median quality_score | 7.00 | 7.00 | 0.00 |
| Errors | 0 | 0 | 0 |
| tests_present % | 80.0% (60/75) | **87.3% (131/150)** | +7.3pp |
| error_handling_present % | 24.0% (18/75) | **33.3% (50/150)** | **+9.3pp** |
| docs_referenced % | 0.0% (0/75) | 5.3% (8/150) | +5.3pp |
| Gate retried % | N/A | 62.0% (93/150) | -- |
| Avg gate attempts | N/A | 1.62 | -- |

R6 improves on every quality dimension. The gate fired on 62% of invocations — meaning the first output frequently failed high-confidence promise checks, and the clean retry produced better output.

---

## 2. Per-Task Breakdown

### code-plan

| Metric | R1 (n=15) | R6 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 8.33 | 8.00 | -0.33 |
| Score dist | {7:5, 9:10} | {7:15, 9:15} | Proportionally similar |
| error_handling_present % | 66.7% | 50.0% | -16.7pp |
| tests_present % | 100.0% | 100.0% | 0.0pp |
| gate_retried | N/A | 2/30 | -- |

Code-plan shows a small regression (-0.33) with fewer error_handling hits. Gate rarely fires — this task naturally produces high-quality output.

### degraded-input

| Metric | R1 (n=15) | R6 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 4.80 | **6.03** | **+1.23** |
| Score dist | {4:11, 7:4} | {4:6, 5:8, 7:11, 8:5} | Major shift |
| error_handling_present % | 0.0% | 0.0% | 0.0pp |
| tests_present % | 26.7% | **53.3%** | **+26.7pp** |
| gate_retried | N/A | 30/30 (100%) | -- |

**Largest single-task improvement across all six rounds.** The gate fires on every single invocation (first output always fails high-confidence checks). The retry consistently produces better output — score-4 rate drops from 73% to 20%, and score-7+ rate jumps from 27% to 53%. Tests_present doubles.

### determinism-control

| Metric | R1 (n=15) | R6 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 6.60 | 6.60 | 0.00 |
| Score dist | {4:3, 7:12} | {4:4, 7:26} | Similar |
| error_handling_present % | 0.0% | 0.0% | 0.0pp |
| tests_present % | 86.7% | 86.7% | 0.0pp |
| gate_retried | N/A | 25/30 (83%) | -- |

Identical mean — gate fires frequently but doesn't improve the score. The retry recovers some outputs from 4→7 but at a similar rate to R1.

### multi-agent-coordination

| Metric | R1 (n=15) | R6 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 7.67 | **8.47** | **+0.80** |
| Score dist | {7:9, 9:6} | {7:8, 9:22} | Far more 9s |
| error_handling_present % | 33.3% | **73.3%** | **+40.0pp** |
| tests_present % | 100.0% | 100.0% | 0.0pp |
| gate_retried | N/A | 13/30 (43%) | -- |

**Best overall task performance.** Score-9 rate jumps from 40% to 73%. error_handling nearly triples. The gate selectively retries weaker outputs and the second attempt frequently includes error handling that pushes score from 7 to 9.

### single-agent-codegen

| Metric | R1 (n=15) | R6 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 7.00 | **7.77** | **+0.77** |
| Score dist | {4:1, 7:11, 9:3} | {6:1, 7:17, 9:12} | More 9s |
| error_handling_present % | 20.0% | **43.3%** | **+23.3pp** |
| tests_present % | 86.7% | **96.7%** | +10.0pp |
| gate_retried | N/A | 23/30 (77%) | -- |

Strong improvement. Score-9 rate quadruples from 20% to 40%. error_handling more than doubles.

### Per-Task Summary

| Task | R1 Mean | R6 Mean | Delta | Direction |
|------|---------|---------|-------|-----------|
| degraded-input | 4.80 | 6.03 | **+1.23** | **R6 much better** |
| multi-agent-coordination | 7.67 | 8.47 | **+0.80** | **R6 much better** |
| single-agent-codegen | 7.00 | 7.77 | **+0.77** | **R6 better** |
| determinism-control | 6.60 | 6.60 | 0.00 | Tied |
| code-plan | 8.33 | 8.00 | -0.33 | R1 slightly better |

R6 improves 3 tasks, ties 1, slightly regresses 1. Net effect: strongly positive.

---

## 3. Paired Comparison (R6 Runs 1-15 vs R1 Runs 1-15)

### Per-Run Average Quality Scores

| Run | R1 | R6 | Diff (R6-R1) |
|-----|----|----|-------------|
| 1 | 7.00 | 7.20 | +0.20 |
| 2 | 5.60 | 8.00 | +2.40 |
| 3 | 6.80 | 7.20 | +0.40 |
| 4 | 7.20 | 7.40 | +0.20 |
| 5 | 6.80 | 8.00 | +1.20 |
| 6 | 7.20 | 7.80 | +0.60 |
| 7 | 7.20 | 7.80 | +0.60 |
| 8 | 8.20 | 7.00 | -1.20 |
| 9 | 6.40 | 6.80 | +0.40 |
| 10 | 7.20 | 7.60 | +0.40 |
| 11 | 7.20 | 7.40 | +0.20 |
| 12 | 6.80 | 7.80 | +1.00 |
| 13 | 6.40 | 7.00 | +0.60 |
| 14 | 6.80 | 7.00 | +0.20 |
| 15 | 6.40 | 8.20 | +1.80 |

### Difference Statistics

| Metric | Value |
|--------|-------|
| Mean diff | **+0.60** |
| SD of diffs | 0.81 |
| Positive diffs | **14** |
| Negative diffs | 1 |
| Tied (zero) diffs | 0 |

### Wilcoxon Signed-Rank Test

| Metric | Value |
|--------|-------|
| n (non-zero diffs) | 15 |
| W+ (sum of positive ranks) | 108 |
| W- (sum of negative ranks) | 12 |
| Checksum W+ + W- | 120 = 15×16/2 |

| Significance Level | W_crit (n=15) | W- | Result |
|--------------------|---------------|------|--------|
| alpha = 0.10 (two-tailed) | 25 | 12 | **Significant** |
| alpha = 0.05 (two-tailed) | 21 | 12 | **Significant** |
| alpha = 0.02 (two-tailed) | 16 | 12 | **Significant** |
| alpha = 0.01 (two-tailed) | 15 | 12 | **Significant** |

**W- = 12 < W_crit = 15 (alpha = 0.01). The output gate produces a statistically significant improvement at the 1% level.**

### Effect Size

| Metric | Value |
|--------|-------|
| Cohen's d | **+0.74** |
| Interpretation | **Medium-large** |
| Computation | 0.60 / 0.81 (mean diff / SD of diffs) |

---

## 4. Score Distribution

| Score | R1 Count | R1 % | R6 Count | R6 % |
|-------|----------|------|----------|------|
| 4 | 14 | 18.7% | 10 | 6.7% |
| 5 | 0 | 0.0% | 8 | 5.3% |
| 6 | 1 | 1.3% | 1 | 0.7% |
| 7 | 43 | 57.3% | 77 | 51.3% |
| 8 | 0 | 0.0% | 5 | 3.3% |
| 9 | 17 | 22.7% | **49** | **32.7%** |
| **Total** | **75** | **100%** | **150** | **100%** |

Key shifts:
- Score-4 rate drops from 18.7% to **6.7%** (gate recovers many 4s on retry)
- Score-9 rate rises from 22.7% to **32.7%** (gate retry sometimes produces 9s)
- Score-8 appears (3.3%) — new intermediate grade from retry

| Aggregate | R1 | R6 |
|-----------|----|----|
| Score >= 7 | 81.3% (61/75) | **87.3% (131/150)** |
| Score = 9 | 22.7% (17/75) | **32.7% (49/150)** |
| Score = 4 | 18.7% (14/75) | **6.7% (10/150)** |

---

## 5. Temporal Drift

| Segment | n records | Mean QS |
|---------|-----------|---------|
| Runs 1-15 | 75 | 7.48 |
| Runs 16-30 | 75 | 7.27 |
| Delta | | -0.21 |

Mild drift (-0.21) but both halves exceed baseline (6.88). Unlike R5 which was uniformly depressed, R6 starts strong and stays above baseline throughout.

---

## 6. Gate Mechanics

### Gate Activation by Task

| Task | Gate Fired | Rate | Improvement |
|------|-----------|------|-------------|
| degraded-input | 30/30 | 100% | +1.23 mean |
| determinism-control | 25/30 | 83% | 0.00 mean |
| single-agent-codegen | 23/30 | 77% | +0.77 mean |
| multi-agent-coordination | 13/30 | 43% | +0.80 mean |
| code-plan | 2/30 | 7% | -0.33 mean |

The gate fires most on tasks where the first output frequently lacks error handling or implementation depth. `degraded-input` triggers 100% of the time — the first output is almost always prose or incomplete, and the retry forces actual implementation.

### Why the Gate Works

The gate rejects output based on high-confidence promise checks (TODO/FIXME presence, error handling absence, implementation depth absence). When rejected, the same clean prompt is re-sent. The key difference from R5:

1. **No feedback injection**: The agent doesn't know its first output was rejected
2. **Clean retry**: Same prompt, fresh context — natural variance produces different output
3. **Best-of-N selection**: The executor keeps the highest-scoring output across attempts
4. **Observer-side action**: The system (observer) decides to retry — the agent (promiser) is autonomous

This conforms to Promise Theory: the observer assesses promise fulfillment and adjusts its own behavior (retry). The agent is never told about the assessment.

---

## 7. R5 vs R6 — Direct Comparison

| Metric | R5 (inject feedback) | R6 (output gate) | Delta |
|--------|---------------------|-------------------|-------|
| Mean QS | 6.45 | **7.37** | **+0.92** |
| Score-9 rate | 6.7% | **32.7%** | **+26.0pp** |
| Score-4 rate | 18.1% | **6.7%** | **-11.4pp** |
| error_handling % | 8.7% | **33.3%** | **+24.6pp** |
| tests_present % | 73.8% | **87.3%** | **+13.5pp** |
| degraded-input mean | 4.70 | **6.03** | **+1.33** |
| multi-agent mean | 7.00 | **8.47** | **+1.47** |

R6 outperforms R5 on every metric. The architectural insight — verify post-output instead of injecting feedback — produces a 0.92-point quality improvement.

---

## 8. Summary

**The output gate (R6) produces a statistically significant quality improvement over baseline (p < 0.01, Cohen's d = +0.74).**

| Finding | Detail |
|---------|--------|
| Overall effect | **+0.49 points** (7.37 vs 6.88) |
| Paired test | **Significant at p < 0.01** (Wilcoxon W- = 12) |
| Cohen's d | **+0.74 (medium-large, positive)** |
| Score-9 rate | +10pp (22.7% → 32.7%) |
| Score-4 rate | -12pp (18.7% → 6.7%) |
| error_handling | +9.3pp (24.0% → 33.3%) |
| tests_present | +7.3pp (80.0% → 87.3%) |
| Gate activation | 62% of invocations retried |
| Temporal stability | Both halves above baseline |

### The Architectural Lesson

Six rounds of measurement tell a clear story about Promise Theory applied to LLM agents:

1. **R1 (baseline)**: Direct rules work. Mean 6.88.
2. **R2 (promise framing)**: Reframing rules as promises is neutral. Mean 7.04.
3. **R3 (trust enforcement)**: Adding trust tracking has no reliable effect. Mean 7.16 at n=15, but…
4. **R4 (more enforcement)**: …regresses to baseline at n=30. Mean 6.87.
5. **R5 (feedback injection)**: Injecting assessment results into prompts **actively hurts**. Mean 6.45. Significant regression.
6. **R6 (output gate)**: Assessing post-output and retrying clean **works**. Mean 7.37. Significant improvement.

The principle: **the observer adjusts its own behavior (retry/accept/escalate) based on promise assessment. The agent remains autonomous and never sees the assessment.** This is Promise Theory as Burgess formulated it — not obligation theory dressed in promise language.

### Cost-Benefit

The output gate costs ~62% more compute (1.62 average attempts per task). In exchange:
- Score-4 rate drops by 64% (18.7% → 6.7%)
- Score-9 rate increases by 44% (22.7% → 32.7%)
- error_handling improves by 39% (24.0% → 33.3%)

For measurement purposes, this is clearly worthwhile. For production use, the gate retry threshold can be tuned to balance cost vs quality.
