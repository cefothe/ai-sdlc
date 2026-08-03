# Measurement Analysis Report: R1 vs R4 (Promise Verification v2)

**Generated**: 2026-03-18
**R1 (Baseline)**: Imperative CLAUDE.md, 15 runs x 5 tasks = 75 records (0 errors)
**R4 (Treatment)**: Promise verification v2 (transparent framing, fixed verification, 8 promises, faster EMA), 30 runs x 5 tasks = 150 records (1 error)

## Measurement History

| Round | Ref | Description | Runs | Mean QS | Date |
|-------|-----|-------------|------|---------|------|
| R1 | `main` (c5a12fa) | Imperative CLAUDE.md (baseline) | 15 | 6.88 | 2026-03-14 |
| R2 | `promise-theory` (aac3488) | Promise-framed CLAUDE.md (no enforcement) | 15 | 7.04 | 2026-03-15 |
| R3 | `promise-theory` (e24e46e) | Promise + closed-loop trust enforcement | 15 | 7.16 | 2026-03-16 |
| R4 | `promise-theory` (474fa2b) | Promise v2: transparent framing, fixed verification, 8 promises, faster EMA | 30 | 6.87 | 2026-03-17 |

---

## 1. Overall Statistics

| Metric | R1 (n=75) | R4 complete (n=149) | Delta |
|--------|-----------|---------------------|-------|
| Mean quality_score | 6.88 | 6.87 | -0.01 |
| Median quality_score | 7.00 | 7.00 | 0.00 |
| Stdev (sample) | 1.62 | 1.54 | -0.08 |
| tests_present % | 80.0% (60/75) | 80.5% (120/149) | +0.5pp |
| error_handling_present % | 24.0% (18/75) | 20.8% (31/149) | -3.2pp |
| docs_referenced % | 0.0% (0/75) | 4.0% (6/149) | +4.0pp |

R4 including the 1 error record (n=150): mean = 6.83, median = 7.00.

The overall means are virtually identical. R4 shows marginally tighter variance (stdev 1.54 vs 1.62) and a small improvement in docs_referenced (4.0% vs 0.0%), but a decline in error_handling_present (20.8% vs 24.0%).

---

## 2. Per-Task Breakdown

### code-plan

| Metric | R1 (n=15) | R4 (n=29) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 8.33 +/- 0.98 | 7.72 +/- 1.22 | -0.61 |
| tests_present % | 100.0% | 96.6% | -3.4pp |
| error_handling_present % | 66.7% | 41.4% | -25.3pp |
| Avg duration_ms | 141,358 | 218,020 | +76,662 |

Code-plan is R4's largest regression. R1 scored 9 in 10 of 15 runs; R4 scored 9 in only 13 of 29 complete runs (plus one score of 4 from a near-error in run 29). The error_handling drop (-25.3pp) is notable.

### degraded-input

| Metric | R1 (n=15) | R4 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 4.80 +/- 1.37 | 4.80 +/- 1.35 | +0.00 |
| tests_present % | 26.7% | 20.0% | -6.7pp |
| error_handling_present % | 0.0% | 0.0% | +0.0pp |
| Avg duration_ms | 21,531 | 38,814 | +17,283 |

Degraded-input is the weakest task in both datasets and shows zero change. Neither framework elicits error handling for degraded inputs.

### determinism-control

| Metric | R1 (n=15) | R4 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 6.60 +/- 1.06 | 6.80 +/- 0.76 | +0.20 |
| tests_present % | 86.7% | 93.3% | +6.7pp |
| error_handling_present % | 0.0% | 0.0% | +0.0pp |
| Avg duration_ms | 87,693 | 114,311 | +26,618 |

Small improvement in mean score (+0.20) and reduced variance (stdev 0.76 vs 1.06). Tests_present improves by 6.7pp.

### multi-agent-coordination

| Metric | R1 (n=15) | R4 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 7.67 +/- 0.98 | 8.13 +/- 1.01 | +0.47 |
| tests_present % | 100.0% | 100.0% | +0.0pp |
| error_handling_present % | 33.3% | 56.7% | +23.3pp |
| Avg duration_ms | 123,506 | 219,572 | +96,066 |

R4's strongest improvement. Mean score rises +0.47 and error_handling jumps +23.3pp. R4 scores 9 on 20 of 30 runs vs R1's 6 of 15.

### single-agent-codegen

| Metric | R1 (n=15) | R4 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 7.00 +/- 1.13 | 6.93 +/- 0.69 | -0.07 |
| tests_present % | 86.7% | 93.3% | +6.7pp |
| error_handling_present % | 20.0% | 6.7% | -13.3pp |
| Avg duration_ms | 62,953 | 127,786 | +64,833 |

Near-identical mean, but R4 has notably lower variance (stdev 0.69 vs 1.13). Tests improve; error_handling declines.

### Per-Task Summary

| Task | R1 Mean | R4 Mean | Delta | Direction |
|------|---------|---------|-------|-----------|
| code-plan | 8.33 | 7.72 | -0.61 | R1 better |
| degraded-input | 4.80 | 4.80 | +0.00 | Tied |
| determinism-control | 6.60 | 6.80 | +0.20 | R4 better |
| multi-agent-coordination | 7.67 | 8.13 | +0.47 | R4 better |
| single-agent-codegen | 7.00 | 6.93 | -0.07 | ~Tied |

R4 gains on 2 tasks, loses on 1, ties on 2. The code-plan regression (-0.61) roughly offsets the multi-agent-coordination gain (+0.47).

---

## 3. Paired Comparison (R4 Runs 1-15 vs R1 Runs 1-15)

### Per-Run Average Quality Scores

| Run | R1 | R4 | Diff (R4-R1) |
|-----|----|----|-------------|
| 1 | 7.00 | 6.40 | -0.60 |
| 2 | 5.60 | 7.00 | +1.40 |
| 3 | 6.80 | 7.40 | +0.60 |
| 4 | 7.20 | 7.40 | +0.20 |
| 5 | 6.80 | 6.80 | 0.00 |
| 6 | 7.20 | 7.20 | 0.00 |
| 7 | 7.20 | 6.80 | -0.40 |
| 8 | 8.20 | 6.80 | -1.40 |
| 9 | 6.40 | 7.50* | +1.10 |
| 10 | 7.20 | 6.00 | -1.20 |
| 11 | 7.20 | 7.60 | +0.40 |
| 12 | 6.80 | 7.20 | +0.40 |
| 13 | 6.40 | 6.80 | +0.40 |
| 14 | 6.80 | 7.20 | +0.40 |
| 15 | 6.40 | 7.80 | +1.40 |

*Run 9 R4 averaged over 4 complete tasks (1 error excluded).

### Difference Statistics

| Metric | Value |
|--------|-------|
| Mean diff | +0.18 |
| Median diff | +0.40 |
| SD of diffs | 0.83 |
| Positive diffs | 9 |
| Negative diffs | 4 |
| Tied (zero) diffs | 2 |

### Wilcoxon Signed-Rank Test

| Metric | Value |
|--------|-------|
| n (non-zero diffs) | 13 |
| W+ (sum of positive ranks) | 57.5 |
| W- (sum of negative ranks) | 33.5 |
| Checksum W+ + W- | 91.0 = 13x14/2 |

| Significance Level | W_crit (n=15) | W_crit (n=13) | W- | Result |
|--------------------|---------------|---------------|------|--------|
| alpha = 0.10 (two-tailed) | 25 | 21 | 33.5 | **Not significant** |
| alpha = 0.05 (two-tailed) | 21 | 17 | 33.5 | **Not significant** |

W- = 33.5 exceeds all critical values. The paired difference is not statistically significant at any conventional threshold.

### Effect Size

| Metric | Value |
|--------|-------|
| Cohen's d | 0.22 |
| Interpretation | Small |
| Computation | 0.18 / 0.83 (mean diff / SD of diffs) |

The effect size is small. The high variance in paired differences (SD = 0.83 on a mean of 0.18) means the signal is dominated by noise.

---

## 4. Full 30-Run R4 Statistics

### Per-Run Average Quality Scores (n=30 runs)

| Statistic | Value |
|-----------|-------|
| Mean | 6.88 |
| Stdev | 0.47 |
| Min | 5.80 (run 29) |
| Max | 7.80 (run 15) |
| Q1 | 6.60 |
| Median | 6.80 |
| Q3 | 7.20 |
| SE | 0.09 |
| 95% CI (t-based) | [6.70, 7.05] |

### All 30 Run Averages

| Run | n tasks | Avg QS | Run | n tasks | Avg QS |
|-----|---------|--------|-----|---------|--------|
| 1 | 5 | 6.40 | 16 | 5 | 6.60 |
| 2 | 5 | 7.00 | 17 | 5 | 6.80 |
| 3 | 5 | 7.40 | 18 | 5 | 7.20 |
| 4 | 5 | 7.40 | 19 | 5 | 6.80 |
| 5 | 5 | 6.80 | 20 | 5 | 7.20 |
| 6 | 5 | 7.20 | 21 | 5 | 6.40 |
| 7 | 5 | 6.80 | 22 | 5 | 7.20 |
| 8 | 5 | 6.80 | 23 | 5 | 6.40 |
| 9 | 4 | 7.50 | 24 | 5 | 6.80 |
| 10 | 5 | 6.00 | 25 | 5 | 6.60 |
| 11 | 5 | 7.60 | 26 | 5 | 6.60 |
| 12 | 5 | 7.20 | 27 | 5 | 7.20 |
| 13 | 5 | 6.80 | 28 | 5 | 6.40 |
| 14 | 5 | 7.20 | 29 | 5 | 5.80 |
| 15 | 5 | 7.80 | 30 | 5 | 6.40 |

### Raw Score Statistics (n=149 complete records)

| Statistic | Value |
|-----------|-------|
| Mean | 6.87 |
| Stdev (sample) | 1.54 |
| Min | 4 |
| Max | 9 |
| Q1 | 7 |
| Median | 7 |
| Q3 | 7 |

### Temporal Drift: First 15 vs Last 15 Runs

| Segment | n records | Mean QS |
|---------|-----------|---------|
| Runs 1-15 | 74 | 7.05 |
| Runs 16-30 | 75 | 6.69 |
| Delta | | -0.36 |

R4 quality drifts downward over time. The first 15 runs (mean 7.05) outperform the last 15 (mean 6.69) by 0.36 points. This suggests the promise framework does not sustain early-run performance, or that trust accumulation causes behavioral changes that degrade output quality.

---

## 5. Trust Mechanics (R4 Only)

### Overview

| Metric | Value |
|--------|-------|
| Trust records (non-null trust_before/after) | 149 |
| Mean trust_before | 0.6550 |
| Mean trust_after | 0.6617 |
| Min trust observed | 0.4912 |
| Max trust observed | 0.8935 |
| Trust exclusions (trust_exhausted=true) | 0 |
| Rebindings (rebinding_triggered=true) | 0 |

No trust exhaustion or rebinding events occurred across all 150 records. The corrective pathways of the trust mechanism were never activated.

### Trust Trajectory by Task

| Task | n | Mean Before | Mean After | Delta |
|------|---|-------------|------------|-------|
| code-plan | 29 | 0.7629 | 0.7746 | +0.0117 |
| multi-agent-coordination | 30 | 0.7591 | 0.7695 | +0.0104 |
| determinism-control | 30 | 0.6201 | 0.6254 | +0.0054 |
| single-agent-codegen | 30 | 0.5977 | 0.6023 | +0.0046 |
| degraded-input | 30 | 0.5388 | 0.5403 | +0.0015 |

Trust is tracked per-promise (per-task). Code-plan and multi-agent-coordination accumulate trust fastest because they consistently score 7 or 9. Degraded-input remains near its starting value (0.50) because its scores are consistently low (4-5), limiting trust growth.

### Trust Trajectory Over Time

**code-plan**: Trust climbs from 0.50 (run 1) to a peak of 0.8935 (run 28), then drops to 0.8257 after run 29 (which scored 4). By run 30, it recovers slightly to 0.8386. The EMA is responsive to failures.

**degraded-input**: Trust oscillates between 0.49 and 0.56 across all 30 runs. It never builds momentum because the task consistently produces low-quality output. The trust signal accurately reflects that the agent is not fulfilling promises for this task.

---

## 6. Score Distribution

| Score | R1 Count | R1 % | R4 Count | R4 % |
|-------|----------|------|----------|------|
| 4 | 14 | 18.7% | 24 | 16.1% |
| 5 | 0 | 0.0% | 4 | 2.7% |
| 6 | 1 | 1.3% | 1 | 0.7% |
| 7 | 43 | 57.3% | 88 | 59.1% |
| 8 | 0 | 0.0% | 2 | 1.3% |
| 9 | 17 | 22.7% | 30 | 20.1% |
| **Total** | **75** | **100%** | **149** | **100%** |

Note: One additional R4 error record (score 0) is excluded from this table.

Both distributions are bimodal, concentrated at 4 and 7, with a secondary peak at 9. R4 introduces scores of 5 and 8 that are absent in R1, suggesting slightly more gradation. The core distribution shape is unchanged.

| Aggregate | R1 | R4 |
|-----------|----|----|
| Score >= 7 | 81.3% (61/75) | 80.5% (120/149) |
| Score = 9 | 22.7% (17/75) | 20.1% (30/149) |
| Score = 4 | 18.7% (14/75) | 16.1% (24/149) |

---

## 7. Comparison with Previous Rounds

| Round | Framework | Runs | Mean QS | Delta vs R1 |
|-------|-----------|------|---------|-------------|
| R1 | Imperative CLAUDE.md | 15 | 6.88 | -- |
| R2 | Promise (no enforcement) | 15 | 7.04 | +0.16 |
| R3 | Promise + closed-loop trust | 15 | 7.16 | +0.28 |
| R4 first 15 runs | Promise v2 | 15 | 7.05 | +0.17 |
| R4 all 30 runs | Promise v2 | 30 | 6.87 | -0.01 |

Key observations:

1. **R1 baseline is perfectly reproducible**: The previous and current R1 both yield mean = 6.88 across 15 runs. This confirms measurement stability.

2. **R4 first-half matches R3/R2**: R4's first 15 runs (mean 7.05) are close to R3's 15 runs (7.16) and R2's 15 runs (7.04), suggesting promise-based frameworks produce a modest early uplift of approximately +0.15 to +0.28.

3. **R4 regresses over 30 runs**: At 30 runs, R4 mean drops to 6.87 -- equal to baseline. The uplift observed in earlier rounds does not persist at scale.

4. **The treatment effect, if any, is small and unstable**: R3 showed +0.28 over baseline; R4 first-half shows +0.17; R4 full shows -0.01. The 95% confidence interval for R4's 30-run mean is [6.70, 7.05], which straddles the baseline value of 6.88.

5. **15-run measurements may overestimate the effect**: All prior rounds measured 15 runs. R4's 30-run data reveals that the apparent +0.17 improvement in the first half vanishes when more data is collected. This raises questions about whether R2's +0.16 and R3's +0.28 would also regress to baseline with more runs.

---

## 8. Summary and Interpretation

**R4 (promise verification v2) does not produce a statistically significant improvement over the R1 imperative baseline.**

| Finding | Detail |
|---------|--------|
| Overall effect | Near zero (mean diff = -0.01 at 30 runs) |
| Paired test (15 runs) | Not significant (Wilcoxon W- = 33.5, p > 0.10) |
| Cohen's d | 0.22 (small) |
| Score distribution | Unchanged bimodal shape |
| Temporal stability | R4 degrades from 7.05 (first 15) to 6.69 (last 15) |
| Trust mechanics | Functional but never triggered corrective action |
| Duration | R4 tasks run 50-100% slower on average |

### What R4 Does Well

- **multi-agent-coordination**: Consistent improvement (+0.47 mean, +23.3pp error_handling)
- **Variance reduction**: Tighter scores in determinism-control (stdev 0.76 vs 1.06) and single-agent-codegen (stdev 0.69 vs 1.13)
- **Docs referencing**: 4.0% vs 0.0% (small but nonzero improvement)
- **Score gradation**: Introduces intermediate scores (5, 8) absent in R1

### What R4 Does Not Improve

- **code-plan**: Regresses by -0.61 with a 25.3pp error_handling drop
- **degraded-input**: Unchanged -- the hardest task remains unsolved by either framework
- **Overall mean**: Converges to baseline over 30 runs
- **Duration**: All tasks take substantially longer under R4

### Trust System Assessment

The trust system accumulates state correctly but has no operational impact. Zero exclusions and zero rebindings mean the corrective feedback loop never engaged. The system functions as observability infrastructure (tracking which promises are met) rather than as an active governance mechanism.

For trust to drive behavior change, either: (a) the threshold for corrective action needs to be lower, (b) the consequences of low trust need to be more visible to the agent at prompt time, or (c) the trust signal needs to feed back into the prompt in a way that changes agent behavior before reaching the exclusion threshold.

### Methodological Note on Sample Size

R4 is the first round measured at 30 runs. The temporal drift observed (first-half mean 7.05, second-half mean 6.69) suggests that 15-run measurements may systematically overestimate treatment effects. Future rounds should use 30 runs minimum to establish reliable estimates, and should report first-half vs second-half statistics to check for drift.
