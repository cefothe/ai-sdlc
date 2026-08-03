# Measurement Analysis Report: R5 (Always-On Feedback Loop)

**Generated**: 2026-03-19
**R1 (Baseline)**: Imperative CLAUDE.md, 15 runs x 5 tasks = 75 records (0 errors)
**R5 (Treatment)**: Always-on feedback loop — trust scores + broken promise history injected into every prompt, 30 runs x 5 tasks = 150 records (1 error)

## Measurement History

| Round | Ref | Description | Runs | Mean QS | Date |
|-------|-----|-------------|------|---------|------|
| R1 | `main` (c5a12fa) | Imperative CLAUDE.md (baseline) | 15 | 6.88 | 2026-03-14 |
| R2 | `promise-theory` (aac3488) | Promise-framed CLAUDE.md (no enforcement) | 15 | 7.04 | 2026-03-15 |
| R3 | `promise-theory` (e24e46e) | Promise + closed-loop trust enforcement | 15 | 7.16 | 2026-03-16 |
| R4 | `promise-theory` (474fa2b) | Promise v2: transparent framing, fixed verification, 8 promises, faster EMA | 30 | 6.87 | 2026-03-17 |
| **R5** | **`promise-theory` (dfe23ce)** | **Always-on feedback loop: inject trust + broken promises into every prompt** | **30** | **6.45** | **2026-03-19** |

---

## 1. Overall Statistics

| Metric | R1 (n=75) | R5 complete (n=149) | Delta |
|--------|-----------|---------------------|-------|
| Mean quality_score | 6.88 | 6.45 | **-0.43** |
| Median quality_score | 7.00 | 7.00 | 0.00 |
| tests_present % | 80.0% (60/75) | 73.8% (110/149) | -6.2pp |
| error_handling_present % | 24.0% (18/75) | 8.7% (13/149) | **-15.3pp** |
| docs_referenced % | 0.0% (0/75) | 6.0% (9/149) | +6.0pp |

R5 is the worst-performing round measured. The overall mean (6.45) is 0.43 points below baseline — a meaningful decline. error_handling_present drops by 15.3pp. tests_present also declines by 6.2pp. The only improvement is docs_referenced (+6.0pp).

---

## 2. Per-Task Breakdown

### code-plan

| Metric | R1 (n=15) | R5 (n=29) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 8.33 | 7.28 | **-1.05** |
| tests_present % | 100.0% | 93.1% | -6.9pp |
| error_handling_present % | 66.7% | 24.1% | **-42.6pp** |
| Avg duration (s) | 141 | 186 | +45 |
| Score dist | {7:5, 9:10} | {4:2, 7:20, 9:7} | Fewer 9s |

Largest single-task regression. R1 produced score 9 in 67% of runs; R5 produces score 9 in only 24%. error_handling collapses from 66.7% to 24.1%.

### degraded-input

| Metric | R1 (n=15) | R5 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 4.80 | 4.70 | -0.10 |
| tests_present % | 26.7% | 13.3% | -13.4pp |
| error_handling_present % | 0.0% | 0.0% | 0.0pp |
| Avg duration (s) | 22 | 101 | +79 |
| Score dist | {4:11, 7:4} | {4:17, 5:9, 7:4} | More 5s, fewer 7s |

Still the weakest task. R5 introduces score-5 outputs (9 of 30) that were absent in R1, but these replace potential 7s rather than improving 4s. Duration increases 4.5x for no quality gain.

### determinism-control

| Metric | R1 (n=15) | R5 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 6.60 | 6.20 | -0.40 |
| tests_present % | 86.7% | 73.3% | -13.4pp |
| error_handling_present % | 0.0% | 0.0% | 0.0pp |
| Avg duration (s) | 88 | 101 | +13 |
| Score dist | {4:3, 7:12} | {4:8, 7:22} | Higher proportion of 4s |

R5 produces more score-4 results (27% vs 20%). tests_present declines meaningfully.

### multi-agent-coordination

| Metric | R1 (n=15) | R5 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 7.67 | 7.00 | **-0.67** |
| tests_present % | 100.0% | 100.0% | 0.0pp |
| error_handling_present % | 33.3% | 0.0% | **-33.3pp** |
| Avg duration (s) | 124 | 192 | +68 |
| Score dist | {7:9, 9:6} | {7:30} | No 9s at all |

Notable regression. R1 scored 9 on 40% of runs; R5 scores exactly 7 on all 30 runs. Complete loss of variance — the feedback loop appears to "flatten" output to score 7. error_handling drops from 33.3% to 0%.

### single-agent-codegen

| Metric | R1 (n=15) | R5 (n=30) | Delta |
|--------|-----------|-----------|-------|
| Mean quality_score | 7.00 | 7.07 | +0.07 |
| tests_present % | 86.7% | 90.0% | +3.3pp |
| error_handling_present % | 20.0% | 20.0% | 0.0pp |
| Avg duration (s) | 63 | 97 | +34 |
| Score dist | {4:1, 7:11, 9:3} | {6:3, 7:24, 9:3} | Similar |

The only task that holds steady. Near-identical mean, tests_present, and error_handling_present. Duration increases but quality is preserved.

### Per-Task Summary

| Task | R1 Mean | R5 Mean | Delta | Direction |
|------|---------|---------|-------|-----------|
| code-plan | 8.33 | 7.28 | -1.05 | **R1 much better** |
| multi-agent-coordination | 7.67 | 7.00 | -0.67 | **R1 better** |
| determinism-control | 6.60 | 6.20 | -0.40 | R1 better |
| degraded-input | 4.80 | 4.70 | -0.10 | ~Tied |
| single-agent-codegen | 7.00 | 7.07 | +0.07 | ~Tied |

R5 loses on 3 tasks, ties on 2, wins on none. Every delta is negative or neutral.

---

## 3. Paired Comparison (R5 Runs 1-15 vs R1 Runs 1-15)

### Per-Run Average Quality Scores

| Run | R1 | R5 | Diff (R5-R1) |
|-----|----|----|-------------|
| 1 | 7.00 | 6.25* | -0.75 |
| 2 | 5.60 | 6.40 | +0.80 |
| 3 | 6.80 | 5.80 | -1.00 |
| 4 | 7.20 | 6.60 | -0.60 |
| 5 | 6.80 | 7.00 | +0.20 |
| 6 | 7.20 | 6.20 | -1.00 |
| 7 | 7.20 | 7.00 | -0.20 |
| 8 | 8.20 | 6.60 | -1.60 |
| 9 | 6.40 | 7.20 | +0.80 |
| 10 | 7.20 | 6.40 | -0.80 |
| 11 | 7.20 | 6.40 | -0.80 |
| 12 | 6.80 | 5.80 | -1.00 |
| 13 | 6.40 | 6.00 | -0.40 |
| 14 | 6.80 | 6.60 | -0.20 |
| 15 | 6.40 | 6.40 | +0.00 |

*Run 1 R5 averaged over 4 complete tasks (1 error excluded).

### Difference Statistics

| Metric | Value |
|--------|-------|
| Mean diff | **-0.44** |
| SD of diffs | 0.68 |
| Positive diffs | 3 |
| Negative diffs | 11 |
| Tied (zero) diffs | 1 |

### Wilcoxon Signed-Rank Test

| Metric | Value |
|--------|-------|
| n (non-zero diffs) | 14 |
| W+ (sum of positive ranks) | 18 |
| W- (sum of negative ranks) | 87 |
| Checksum W+ + W- | 105 = 14×15/2 |

| Significance Level | W_crit (n=14) | W+ | Result |
|--------------------|---------------|------|--------|
| alpha = 0.10 (two-tailed) | 25 | 18 | **Significant** |
| alpha = 0.05 (two-tailed) | 21 | 18 | **Significant** |
| alpha = 0.02 (two-tailed) | 16 | 18 | Not significant |

**W+ = 18 < W_crit = 21 (alpha = 0.05). The always-on feedback loop produces a statistically significant quality regression at the 5% level.**

### Effect Size

| Metric | Value |
|--------|-------|
| Cohen's d | -0.64 |
| Interpretation | **Medium** |
| Computation | -0.44 / 0.68 (mean diff / SD of diffs) |

The effect size is medium and negative. This is the first round to produce a measurable, directional effect — and it goes the wrong way.

---

## 4. Full 30-Run R5 Statistics

### Per-Run Average Quality Scores (n=30 runs)

| Statistic | Value |
|-----------|-------|
| Mean | 6.45 |
| Stdev | 0.44 |
| Min | 5.80 (runs 3, 12, 25, 27, 29) |
| Max | 7.40 (run 28) |
| Q1 | 6.05 |
| Median | 6.40 |
| Q3 | 6.70 |

### Temporal Drift: First 15 vs Last 15 Runs

| Segment | n records | Mean QS |
|---------|-----------|---------|
| Runs 1-15 | 74 | 6.45 |
| Runs 16-30 | 75 | 6.45 |
| Delta | | 0.00 |

Unlike R4, R5 shows no temporal drift. Quality is consistently depressed throughout. The feedback loop produces a stable but lower-quality equilibrium.

---

## 5. Score Distribution

| Score | R1 Count | R1 % | R5 Count | R5 % |
|-------|----------|------|----------|------|
| 4 | 14 | 18.7% | 27 | 18.1% |
| 5 | 0 | 0.0% | 9 | 6.0% |
| 6 | 1 | 1.3% | 3 | 2.0% |
| 7 | 43 | 57.3% | 100 | 67.1% |
| 9 | 17 | 22.7% | 10 | 6.7% |
| **Total** | **75** | **100%** | **149** | **100%** |

Key shift: score-9 outputs halved from 22.7% to 6.7%. Score-7 inflated from 57.3% to 67.1%. The feedback loop suppresses high-quality outliers while maintaining the same floor of score-4 results.

| Aggregate | R1 | R5 |
|-----------|----|----|
| Score >= 7 | 81.3% (61/75) | 73.8% (110/149) |
| Score = 9 | 22.7% (17/75) | **6.7% (10/149)** |
| Score = 4 | 18.7% (14/75) | 18.1% (27/149) |

---

## 6. Cross-Round Comparison

| Round | Framework | Runs | Mean QS | Delta vs R1 | Sig? |
|-------|-----------|------|---------|-------------|------|
| R1 | Imperative CLAUDE.md | 15 | 6.88 | -- | -- |
| R2 | Promise (no enforcement) | 15 | 7.04 | +0.16 | No |
| R3 | Promise + closed-loop trust | 15 | 7.16 | +0.28 | No |
| R4 | Promise v2 (30 runs) | 30 | 6.87 | -0.01 | No |
| **R5** | **Always-on feedback loop** | **30** | **6.45** | **-0.43** | **Yes (p<0.05)** |

### Trajectory

```
R3  7.16  ██████████████████████████████████████  ← peak
R2  7.04  ████████████████████████████████████
R1  6.88  ██████████████████████████████████      ← baseline
R4  6.87  ██████████████████████████████████
R5  6.45  █████████████████████████████           ← regression
```

Each additional layer of promise infrastructure has moved the needle further from R3's peak and below baseline. The progression is: reframing alone (R2, +0.16) > enforcement (R3, +0.28, but questionable at n=15) > more enforcement (R4, -0.01, baseline at n=30) > feedback injection (R5, -0.43, significant regression).

---

## 7. Diagnosis: Why the Feedback Loop Hurts

### 7.1 Attention Competition

The always-on feedback loop injects trust scores and broken promise evidence into every prompt. This adds ~200-500 tokens of meta-context that competes with the actual task for the model's attention. The model spends tokens addressing the feedback rather than solving the problem.

### 7.2 Score-9 Suppression

R5's most striking feature is the collapse of score-9 outputs (from 22.7% to 6.7%). The feedback framing appears to make the model "play it safe" — producing adequate but unremarkable output (score 7) rather than attempting the higher-quality implementations that occasionally produce 9s. The feedback acts as a conservative prior.

### 7.3 Error Handling Collapse

error_handling_present drops from 24.0% to 8.7% overall, and from 33.3% to 0.0% in multi-agent-coordination. The model may interpret the feedback as "focus on what you're told to do" rather than "also handle edge cases." Promise compliance becomes a substitute for quality.

### 7.4 Duration Increase Without Quality Gain

Every task runs slower under R5 (total avg duration: 135s vs 87s). The model processes the feedback preamble and generates more hedging/acknowledgment text, consuming compute without improving output quality.

### 7.5 Stable Depression

Unlike R4 (which drifted downward over time), R5 is uniformly depressed: first-half and second-half means are identical (6.45). This suggests the feedback loop establishes a lower-quality equilibrium from the start, rather than degrading over time.

---

## 8. Summary

**The always-on feedback loop (R5) produces a statistically significant quality regression (p < 0.05, Cohen's d = -0.64) compared to the imperative baseline (R1).**

| Finding | Detail |
|---------|--------|
| Overall effect | **-0.43 points** (6.45 vs 6.88) |
| Paired test | **Significant** (Wilcoxon W+ = 18, p < 0.05) |
| Cohen's d | **-0.64 (medium, negative)** |
| Score-9 rate | Halved (22.7% → 6.7%) |
| error_handling | Collapsed (24.0% → 8.7%) |
| Temporal drift | None — uniformly depressed |
| Duration | +55% slower on average |

### Conclusion

Injecting trust scores and broken-promise evidence directly into the prompt is counterproductive. The feedback acts as a conservative bias that suppresses high-quality output, eliminates error handling, and increases latency. The simpler imperative CLAUDE.md (R1) outperforms every promise-theory variant when measured at 30 runs.

The progression across five rounds tells a clear story:
1. **Promise reframing alone** (R2) is neutral-to-slightly-positive
2. **Adding enforcement machinery** (R3/R4) adds complexity without benefit
3. **Injecting feedback into prompts** (R5) actively degrades quality

The promise-theory hypothesis — that framing rules as promises with trust-based enforcement improves agent output quality — is not supported by the evidence. The intervention that showed the most promise (R3, +0.28) was measured at n=15 and likely reflects sampling noise, as R4 demonstrated when it regressed to baseline at n=30.
