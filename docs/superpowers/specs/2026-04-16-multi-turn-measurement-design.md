# Multi-Turn Measurement Harness (R9) — Design Spec

**Created**: 2026-04-16T12:28:31Z
**Status**: Draft
**Branch**: promise-theory-v2

## Problem

R1–R8 measure single-shot quality via `claude -p` — one prompt, one output, one score. This is the least favorable scenario for the promise gate and graduated response, which are designed to prevent error propagation across turns. R8 showed the gate fires on 80% of single-shot invocations, adding tokens without proportional quality gain (d=0.53, +7.6% tokens). But the gate's real value proposition is catching bad output before it becomes context for subsequent turns.

We cannot validate the interactive hypothesis with the current framework. R9 builds a multi-turn measurement harness to test it.

## What R9 Measures

The combined effect of the full Promise Theory v2 stack (compact encoding + cxpak + promise gate + graduated response + behavioral promises) in interactive multi-turn sessions. R9 does **not** isolate individual components — R8 already decomposed those. R9 answers: "Is the complete system better than baseline for real interactive work?"

### The Gate Limitation

The promise gate's clean-prompt retry mechanism doesn't work mid-session — you can't erase an agent's conversation memory. The `stop-verify` hook currently exits 0 (logs only). In interactive sessions, the gate's contribution comes through indirect mechanisms: the agent's awareness of the promise declarations in CLAUDE.md, and any future observer-agent integration. R9 measures the system holistically, not the gate specifically.

## Architecture

### 1. Session Driver

Spawn real `claude` interactive sessions via `node-pty`. Each session runs in an isolated git worktree with its own `.claude/settings.local.json` for per-arm MCP configuration.

| Component | Implementation |
|---|---|
| PTY library | `node-pty` |
| Isolation | Git worktree per session (reuse `RefRunner.createWorktree()`) |
| Turn injection | Write to PTY stdin, detect completion via transcript file monitoring |
| Completion signal | Poll transcript file for new assistant turn (primary); PTY stdout `❯` prompt (fallback) |
| Turn timeout | 5 minutes per turn; kill session on timeout, mark run as `timeout` |
| Token tracking | Post-hoc: parse transcript via `trace-builder` after session ends |
| MCP config | Write `.claude/settings.local.json` in worktree for treatment arm (cxpak enabled) |
| Cleanup | `worktree remove --force` + `pkill` PTY child on abort/timeout |

**Transcript file**: Claude Code writes `~/.claude/projects/<project>/conversation.jsonl`. The session driver monitors this file for new entries. When a new assistant message appears after we injected a user message, the turn is complete.

**Fallback path**: If PTY proves fragile during prototyping, fall back to `claude -p --resume <session-id>` for sequential turn injection. Same transcript monitoring, simpler process management, but loses real interactive state (tool use memory, working directory state).

### 2. Scenario Format

YAML files in `measurement/scenarios/`. Each scenario defines a multi-turn task with checkpoints.

```yaml
name: bugfix-with-defect
description: Fix a reported bug while a pre-planted defect exists in the workspace
turns:
  - message: |
      There's a bug in src/api/handler.js — the error response returns 200
      instead of the appropriate error status code. Fix it.
    checkpoint:
      - type: grep_present
        file: src/api/handler.js
        pattern: "res\\.status\\(4\\d{2}\\)"
      - type: file_exists
        path: tests/api/handler.test.js

  - message: |
      Now add rate limiting to the same endpoint. Use a sliding window
      approach with a 100 req/min limit.
    checkpoint:
      - type: grep_present
        file: src/api/handler.js
        pattern: "rateLimit|sliding.?window"
      - type: cxpak_function_exists
        function: rateLimiter
        file: src/api/handler.js

  - message: |
      Run the test suite and fix any failures.
    checkpoint:
      - type: defect_check
        defect_file: src/utils/parser.js
        description: Off-by-one in parseChunks loop bound
        planted_line: "i <= chunks.length"
        fixed_line: "i < chunks.length"

defect:
  file: src/utils/parser.js
  description: Off-by-one error in parseChunks — uses <= instead of <
  original: "for (let i = 0; i < chunks.length; i++)"
  mutated: "for (let i = 0; i <= chunks.length; i++)"

workspace_setup:
  repo: measurement/fixtures/mini-api
  files_to_create: []
```

**Defect injection**: Environmental — plant a buggy file in the worktree before the session starts. The agent is never told about it. Tests whether the combined system (agent + promises + gate awareness) catches pre-existing bugs during normal work. The `defect_check` checkpoint verifies whether the agent fixed it by the time that turn completes.

### 3. Multi-Turn Executor

Orchestrates parallel sessions with a concurrency limit.

| Parameter | Default | Description |
|---|---|---|
| `--scenarios` | all in `measurement/scenarios/` | Which scenarios to run |
| `--runs` | 5 | Repetitions per scenario per arm |
| `--concurrency` | 2 | Max parallel sessions |
| `--baseline` | `main` | Baseline git ref |
| `--treatment` | `promise-theory-v2` | Treatment git ref |
| `--model` | `sonnet` | Model for both arms |
| `--output-dir` | auto-generated timestamp dir | Results directory |

**Execution flow**:
1. Create output directory: `measurement/results/mt-compare-<timestamp>/`
2. For each scenario × run × arm, create a session spec
3. Execute session specs with concurrency limit (`p-limit` or semaphore)
4. Each session: create worktree → inject defect → run turns → collect checkpoints → parse transcript → clean up
5. Aggregate results, compute statistics, write report

**Resumability**: Sessions write results to individual JSONL files as they complete. On resume, the executor scans for completed session files and skips them. A session that was interrupted mid-run is discarded and re-run from scratch (turn-level resume is too complex and would compromise measurement integrity).

**Pausability**: `SIGINT` (Ctrl+C) triggers graceful shutdown — finish any in-progress sessions, skip pending ones, write partial summary. Re-running the same command resumes from where it stopped.

### 4. Checkpoint Runner

Evaluates checkpoints after each turn completes. All checks are deterministic — zero LLM tokens.

| Check Type | Implementation |
|---|---|
| `file_exists` | `fs.existsSync(path)` in the session worktree |
| `grep_present` | `grep -q pattern file` — returns boolean |
| `grep_absent` | Inverse of grep_present |
| `cxpak_function_exists` | `cxpak trace --function <name> <file>` — structural analysis via cxpak CLI; falls back to `grep -q 'function <name>\|<name> =' <file>` if cxpak unavailable |
| `defect_check` | `grep -q fixed_line file` — did the agent fix the planted defect? |
| `test_passes` | Check exit code of last test run in transcript (parse from output) |

Each checkpoint returns `{ type, passed: boolean, details: string }`. Checkpoints are evaluated in the worktree after the agent's turn completes but before the next turn is injected.

### 5. Scoring

Three dimensions, all derived from checkpoint results and transcript data.

#### artifact_quality

Mean checkpoint pass rate across all turns in a session.

```
artifact_quality = passed_checkpoints / total_checkpoints
```

Range: 0.0–1.0. A session where all checkpoints pass scores 1.0.

#### correction_speed

Measures how quickly the agent fixes the planted defect after it first has the opportunity to discover it. Continuous 0.0–1.0.

```
correction_speed = 1 - (propagation_depth / remaining_turns_after_injection)
```

Where:
- `propagation_depth` = number of turns between the first `defect_check` checkpoint and the turn where that checkpoint first passes (i.e., the agent fixed it)
- `remaining_turns_after_injection` = total turns from the first `defect_check` checkpoint to the end of the scenario (inclusive)

| Scenario | Value | Meaning |
|---|---|---|
| Fixed on the turn it's first discoverable | 1.0 | Instant correction |
| Fixed one turn later | 0.67 (if 3 remaining turns) | Fast correction |
| Fixed on final turn | ~0.0 | Late correction |
| Never fixed | 0.0 | No correction |

If the scenario has no defect injection, `correction_speed` is null and excluded from aggregation.

#### total_tokens

Total input + output tokens across all turns in the session. Parsed post-hoc from the transcript via `trace-builder`.

#### efficiency

```
efficiency = artifact_quality > 0 ? total_tokens / artifact_quality : Infinity
```

Lower is better. Tokens spent per unit of quality. Sessions with artifact_quality of 0 (all checkpoints failed) get Infinity efficiency and are always worse in comparison.

### 6. Statistical Comparison

Three parallel Wilcoxon signed-rank tests, one per dimension. Sessions are paired by (scenario, run_number).

| Dimension | Pairs | Direction | Verdict contribution |
|---|---|---|---|
| artifact_quality | per-run mean across scenarios | higher is better | FAIL if baseline significantly better |
| efficiency | per-run mean across scenarios | lower is better | WARN if treatment significantly worse |
| correction_speed | per-run mean (defect scenarios only) | higher is better | Informational (new metric, no gate) |

**Verdict logic**:

| Quality | Efficiency | Correction | Verdict |
|---|---|---|---|
| no_diff or treatment_better | no_diff or treatment_better | any | **PASS** |
| no_diff or treatment_better | treatment_worse | any | **WARN** |
| baseline_better | any | any | **FAIL** |

Cohen's d reported for all three dimensions.

### 7. Report Format

Markdown report written to `measurement/results/mt-compare-<timestamp>/report.md`. Sections:

1. **Summary table**: quality, tokens, efficiency, correction_speed per arm
2. **Per-scenario breakdown**: checkpoint pass rates, defect detection, token usage
3. **Statistical tests**: Wilcoxon + Cohen's d for each dimension
4. **Session traces**: Per-session turn-by-turn checkpoint results (collapsible)
5. **Verdict**: PASS / WARN / FAIL with reasoning

## Scenarios

### Initial Battery (3 scenarios)

Each scenario should take 3–5 turns and exercise different failure modes.

| Scenario | Turns | Defect | Primary Signal |
|---|---|---|---|
| `bugfix-with-defect` | 3 | Off-by-one in utility | Bug fix quality + defect discovery |
| `feature-add-with-defect` | 4 | Missing null check in helper | Feature implementation + defect propagation |
| `refactor-with-defect` | 3 | Wrong comparison operator in validator | Refactoring quality + defect detection |

All three include environmental defects. This is intentional — correction_speed is the novel metric, and we need defect data from every scenario to have enough statistical power.

### Fixture Workspaces

Each scenario needs a small, self-contained codebase in `measurement/fixtures/`. Requirements:
- Small enough that cxpak can analyze in one call
- Has a test suite that runs in <10 seconds
- Has clear, natural places for the turns' requested changes
- Has a file where the defect can be planted without being immediately obvious

One fixture can serve multiple scenarios if the turns and defect locations don't overlap.

## Measurement Parameters

| Parameter | Value | Rationale |
|---|---|---|
| Scenarios | 3 | Minimum for meaningful per-scenario analysis |
| Runs per arm | 5 | 3 scenarios × 5 runs = 15 paired observations (matches R1–R8 statistical power) |
| Model | sonnet | Consistent with R1–R8 |
| Turn timeout | 5 min | Interactive turns rarely exceed 3 min; 5 min gives margin |
| Session timeout | 30 min | 5 turns × 5 min + overhead |
| Concurrency | 2 | PTY sessions are resource-heavy; 2 balances speed vs stability |

## Implementation Sequence

1. **PTY prototype** — Spike: spawn `claude`, inject one message, detect completion. Validates feasibility before building the full harness.
2. **Session driver** — `measurement/session-driver.js`: PTY management, turn injection, transcript monitoring, cleanup.
3. **Scenario loader + checkpoint runner** — `measurement/scenario-loader.js`, `measurement/checkpoint-runner.js`: YAML parsing, deterministic checks.
4. **Fixture workspaces** — `measurement/fixtures/mini-api/`: Small codebase with test suite.
5. **Multi-turn executor** — `measurement/mt-executor.js`: Parallel execution, resumability, JSONL output.
6. **Scoring + comparison** — `measurement/mt-comparison.js`: Three-dimensional scoring, Wilcoxon, report generation.
7. **Scenarios** — `measurement/scenarios/*.yaml`: Three scenario files with defect definitions.
8. **Validation run** — 1 scenario × 2 runs, verify end-to-end pipeline.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PTY fragile / unreliable | Medium | High — blocks entire approach | Spike first; fallback to `claude -p --resume` |
| Transcript monitoring races | Medium | Medium — missed turn completions | Poll with backoff; timeout as safety net |
| Fixture too simple / too complex | Medium | Medium — unrealistic measurement | Calibrate: fixture should take agent 2-3 min per turn |
| 15 observations insufficient power | Low | Medium — inconclusive results | Can increase to 10 runs (30 observations) if needed |
| Defect injection too obvious | Medium | Low — all agents find it immediately | Tune defect subtlety; place in a file the agent isn't directly asked to modify |
| cxpak CLI not available in worktree | Low | Low — fallback to grep | Checkpoint types degrade gracefully (cxpak → grep) |
| Token tracking inaccurate from transcript | Low | Low — relative comparison still valid | Both arms use same tracking method |

## Dependencies

| Dependency | Status | Notes |
|---|---|---|
| `node-pty` | npm package, not currently installed | Add to devDependencies |
| `js-yaml` | npm package, not currently installed | Add to devDependencies for scenario parsing |
| `cxpak` CLI | Installed globally | Used for `cxpak_function_exists` checkpoint type |
| Existing measurement framework | Stable | Reuse `RefRunner.createWorktree()`, `ComparisonReport`, `trace-builder` |

## Files

| File | Change |
|---|---|
| `measurement/session-driver.js` | Create — PTY management, turn injection, transcript monitoring |
| `measurement/scenario-loader.js` | Create — YAML scenario parsing and validation |
| `measurement/checkpoint-runner.js` | Create — Deterministic checkpoint evaluation |
| `measurement/mt-executor.js` | Create — Multi-turn executor with parallel sessions |
| `measurement/mt-comparison.js` | Create — Three-dimensional scoring and statistical comparison |
| `measurement/scenarios/*.yaml` | Create — 3 scenario files |
| `measurement/fixtures/mini-api/` | Create — Small fixture codebase with test suite |
| `tests/unit/measurement/session-driver.test.js` | Create |
| `tests/unit/measurement/scenario-loader.test.js` | Create |
| `tests/unit/measurement/checkpoint-runner.test.js` | Create |
| `tests/unit/measurement/mt-executor.test.js` | Create |
| `tests/unit/measurement/mt-comparison.test.js` | Create |
| `package.json` | Modify — add `node-pty`, `js-yaml` to devDependencies |
