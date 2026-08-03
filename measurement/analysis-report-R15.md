# Measurement Analysis Report: R15 (Pilot — Bug-Discovery Loop, Lift-and-Shift to CI)

**Generated**: 2026-05-07
**Baseline**: `main` — 18 multi-turn sessions written before pilot stop (n=15 for `cross-module-auth-refactor`; n=3 for `cross-module-batch-pipeline`; n=0 for `cross-module-data-migration`)
**Treatment**: `promise-theory-v2` — pilot only (n=1 × 3 scenarios = 3 sessions, `--promise --mcp-config ~/.claude/.mcp.json`)
**Framework**: Multi-turn measurement (`mt-executor.js`) with two corrections shipped during R15

R15 is a **pilot run, not a full statistical comparison.** Its purpose is to verify that two bugs surfaced during R15-attempt-1 are properly fixed end-to-end before lifting the full n=15 treatment to CI.

---

## 1. Bugs Surfaced and Fixed During R15

### Bug A: Verifier penalised cxpak as if it were absent context

`promise/behavioral-verifier.js::verifyReadBeforeWrite` only counted direct `Read` tool calls in the trace. When the agent satisfied the read-before-write contract via cxpak (the framework-directed pattern under v2.3), the verifier flagged `read-before-write` as broken at `high` confidence and triggered spurious gate retries. The retries inflated tokens and corrupted treatment data on R15-attempt-1 (declared null and void).

**Fix** (commit `9a256ca`): when the trace contains any cxpak context tool (whitelist + `cxpak_*` prefix), `read-before-write` returns `kept` with evidence "context acquired via cxpak (structured)". 8 regression tests added.

### Bug B: Worktree overlay made cxpak useless

`mt-executor.js::createWorktree` previously did `git worktree add` from the omnius repo, then `copyFixture` overlaid `mini-api` on top. Result: every agent worktree contained 342 files (`~3.5M tokens` per `cxpak overview`) — the omnius framework code AND the tiny fixture. cxpak indexed the overlay, returning either truncated/noisy output or 35-character error responses. Agents learned cxpak was useless and fell back to direct `Read`.

**Empirical signal from the overlay pilot:**

```
cxpak_auto_context result_chars (overlay):
  35  35  35  35  35   ← 5 calls, all error/empty
```

**Fix** (this PR): `createWorktree` now creates a clean `git init`'d directory; framework code is locked via `switchGlobalConfig` (`~/.claude` swap) and not duplicated into the agent's workdir. Per-fixture index = ~24 files instead of 342. 3 regression tests added.

```
cxpak_auto_context result_chars (isolated):
  48,601  48,504  48,648  49,664  49,194  2,283   ← 6 calls, useful context
```

The 2,283-char outlier is `queueService.js`, which doesn't exist yet (the agent is being asked to create it) — cxpak correctly returns minimal context for new-file tasks.

---

## 2. Pilot Results (Isolated Worktree, --promise, n=1 × 3)

| Scenario | cxpak calls | Gate retries | Quality | Tokens | Efficiency |
|---|---|---|---|---|---|
| `cross-module-auth-refactor` | 2 | 0 | **1.000** | 23,987 | 23,987 |
| `cross-module-batch-pipeline` | 1 | 0 | **0.800** | 41,761 | 52,201 |
| `cross-module-data-migration` | 3 | 0 | **0.889** | 57,797 | 65,022 |

All sessions called cxpak, all completed without gate retries (Bug A fix exercised end-to-end), all returned useful cxpak responses (Bug B fix exercised end-to-end).

### Comparison: Overlay vs Isolated (same 3-session pilot config, different worktree mode)

| Scenario | Overlay q / tokens / retries | Isolated q / tokens / retries | Δ quality | Δ tokens |
|---|---|---|---|---|
| auth-refactor | 0.750 / 42,103 / **1** | 1.000 / 23,987 / 0 | +0.25 | **−43%** |
| batch-pipeline | 0.800 / 62,766 / 0 | 0.800 / 41,761 / 0 | 0 | **−33%** |
| data-migration | 0.889 / 51,219 / 0 | 0.889 / 57,797 / 0 | 0 | +13% |

The overlay pilot represents the verifier-fix-only world (Bug A fixed, Bug B not). The isolated pilot represents both fixes in place. Quality recovers and tokens drop substantially on the two scenarios where cxpak made a measurable difference; data-migration is roughly flat (consistent with the high-variance pattern that scenario has shown across R12–R14).

### Comparison: Treatment Pilot vs Baseline run-1

| Scenario | Baseline run1 q / tokens | Baseline n=15 μ | Treatment q / tokens | Δ q vs run1 | Δ q vs μ |
|---|---|---|---|---|---|
| auth-refactor | 0.875 / 21,572 | 0.908 (n=15) | 1.000 / 23,987 | **+0.13** | **+0.09** |
| batch-pipeline | 0.800 / 38,845 | (n=3, μ=0.800) | 0.800 / 41,761 | 0 | 0 |
| data-migration | (no run1) | (no data) | 0.889 / 57,797 | n/a | n/a |

Treatment is +0.09 above the n=15 baseline mean on `auth-refactor` and matches baseline on `batch-pipeline`. Tokens are +7–11% on the two paired scenarios — the price of promise verification + cxpak — well within the range observed in R12 (efficiency d=1.06) and R14 (efficiency d=0.69).

---

## 3. Scope and Caveats

This is **n=1 per scenario.** Statistical significance is impossible at this size; the pilot's only claim is *the two fixes work end-to-end and the system is in a state worth measuring at n=15 in CI.*

**What R15 pilot deliberately does NOT establish:**
- Wilcoxon p-value or Cohen's d (n=1)
- Whether quality improvement on `auth-refactor` generalises across a full battery
- Whether token overhead stays bounded under the full 4-turn × 5-run × 3-scenario matrix

**What R15 pilot DOES establish:**
- The verifier no longer penalises cxpak (Bug A fixed)
- cxpak now returns useful context per fixture (Bug B fixed)
- Quality on the two paired scenarios meets or exceeds baseline
- Token overhead is comparable to R12/R14 ranges
- Full n=15 treatment can be run with confidence

---

## 4. Validation Timeline Update

| Run | Quality (d) | Efficiency (d) | Trust | Registry | Verdict |
|-----|-------------|----------------|-------|----------|---------|
| R10 | 0.08 (negligible) | 0.57 (medium) | 0.67–0.83 | v2.1 (15) | PASS |
| R11 | 0.22 (small) | 0.68 (medium) | 0.81–0.86 | v2.2 (17) | PASS |
| R12 | 0.21 (small) | **1.06 (large)** | 0.86–0.88 | v2.2 (17) + MCP | PASS |
| R13 | **1.55 (very large)** | -2.07 (cost) | 0.77–0.82 | v2.3 (18) + cxpak prompt | WARN |
| R14 | 1.03 (no_diff) | 0.69 (no_diff) | 0.79–0.83 | v2.3 (18) + instrumentation | **PASS** |
| **R15-attempt-1** | (invalidated) | (invalidated) | (invalidated) | v2.3 + 4 review-driven fixes | **NULL** (Bug A) |
| **R15 pilot** | n=1, indicative | n=1, indicative | (TBD at n=15) | v2.3 + 4 review fixes + Bug A/B | **PILOT PASS** |
| R15 (CI) | TBD | TBD | TBD | (no further code change) | Pending |

---

## 5. Lift-to-CI Plan

The treatment phase will be run in CI rather than locally:
- ~1.5–2h per local R-run is poor developer ergonomics
- CI gives reproducible environment without `~/.claude` swap requiring an omnius clone
- Cost (~$3–6 API per R-run) is bounded and visible

The CI workflow PR will follow this PR; no further code change to the framework is needed for R15 to run.

## 6. Test Coverage

- **502 unit + integration tests pass** (`npx jest`), up from 445 before this PR
- 8 new regression tests for cxpak-aware verifier (Bug A)
- 3 new regression tests for isolated-fixture worktree (Bug B)
- All existing measurement tests continue to pass against the new worktree implementation
