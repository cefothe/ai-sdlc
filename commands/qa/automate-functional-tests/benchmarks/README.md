# Benchmarks — `/qa:automate-functional-tests`

Empirical measurements of the skill's effect on agent output. Each `iteration-N/`
directory captures one comparison: `with-skill` vs `without-skill` (or
`with-rule-X` vs `without-rule-X` for an additive rule change). Iterations are
**append-only** — never delete or rewrite earlier ones. Missing low-numbered
iterations are a cherry-picking red flag in skill reviews.

## Directory layout

```
benchmarks/
  README.md                    — this file
  iteration-0/                 — first measurement (baseline for the deserialize-only / parameterize rules)
    README.md                  — methodology, configuration, conclusions for this iteration
    benchmark.json             — machine-readable results
    run.sh                     — runner script that reproduces the measurement
  iteration-1/                 — next measurement after rule refinements
    ...
```

Each iteration MUST contain `README.md`, `benchmark.json`, and `run.sh`. The
JSON is the canonical source for pass rates and cost metrics; the README is the
human-readable interpretation.

## Schema — `benchmark.json`

```jsonc
{
  "iteration": 0,
  "captured_at": "ISO-8601 timestamp",
  "skill_version": "matches commands/qa/automate-functional-tests.md frontmatter `version`",
  "rule_under_test": "short identifier for what this iteration measures",
  "model": {
    "id": "claude-opus-4-7 | claude-sonnet-4-6 | ...",
    "temperature": 0.0,
    "max_tokens": 16384
  },
  "configurations": {
    "without_skill": {
      "description": "Baseline: skill rule statements absent from agent context. CLAUDE.md still loaded — measures incremental rule value, not total agent capability.",
      "modifications": "list of files/sections temporarily removed or reverted"
    },
    "with_skill": {
      "description": "Current main: all skill rule statements present.",
      "modifications": "none — current main"
    }
  },
  "n_per_config": 3,
  "evals": [
    {
      "eval_id": 13,
      "eval_name": "repetitive-tests-parameterization",
      "without_skill": {
        "n_runs": 3,
        "per_assertion_pass": [0, 0, 0, 0],  // counts of passes for each assertion across N runs
        "overall_pass_rate": 0.0
      },
      "with_skill": {
        "n_runs": 3,
        "per_assertion_pass": [3, 3, 3, 3],
        "overall_pass_rate": 1.0
      },
      "delta": 1.0,
      "tokens_with_skill_avg": 0,
      "tokens_without_skill_avg": 0,
      "cost_delta_pct": 0.0
    }
  ],
  "summary": {
    "rules_validated": ["deserialize-for-assertions", "parameterize-repetitive-tests"],
    "discriminating_evals": [],
    "non_discriminating_evals": [],
    "regressions": [],
    "conclusion": "human-written summary"
  }
}
```

## Methodology (must follow for every iteration)

1. **Pick the model.** Record exact ID and temperature in `benchmark.json`.
   Don't compare results across model changes — start a new iteration with
   `skill_version` and `model.id` both updated.
2. **Define the baseline.** "Without skill" means: revert the rule additions
   (typically the most recent commit on this branch, or revert a specific set
   of files). Keep CLAUDE.md and all framework context files loaded — we want
   to measure the rule's incremental value, not the total agent capability.
3. **Run each eval N times per configuration.** Minimum N=3. Use the same
   sample-input files and the same orchestrator prompt for both configs.
4. **Grade by `evals.json` assertions.** Do not change assertions between runs
   in the same iteration. If assertions change, that's a new iteration.
5. **Record per-assertion pass counts**, not just overall pass rate. The
   review-skill protocol distinguishes discriminating from non-discriminating
   assertions; you need per-assertion data to apply that distinction.
6. **Capture token usage** for each configuration. Cost delta is
   `(with_tokens − without_tokens) / without_tokens`.
7. **Write the conclusion in `README.md`**, including which evals were
   discriminating, which weren't, and any regressions.

## When to add a new iteration

- A rule is added, removed, or substantively reworded.
- The skill version is bumped (minor or major).
- The model under test changes.
- Eval definitions change (new assertions, new sample inputs).

Iterations are append-only — earlier ones stay in the tree. If `iteration-0/`
was discarded because the result was unfavorable, that's a cherry-picked
benchmark and the skill review will flag it.
