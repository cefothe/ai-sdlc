# Iteration 0 — Baseline measurement for deserialize-only + parameterize rules

**Status:** scaffold-only (results not yet populated). The directory, schema,
and reproduction script are in place; `benchmark.json` carries
`status: "pending"` until a human or CI runs the suite end-to-end. Subsequent
iterations append; this directory is never deleted.

## What this iteration measures

The skill branch `feat/qa-deserialize-only-api-assertions` introduces two new
cross-cutting rules:

1. **Deserialize for assertions** — REST/WebSocket response assertions must use
   `response.as(Dto.class)` / `response.asList(Dto.class)` / `message.as(Dto.class)`.
   Forbidden in assertion context: `response.body()`, `JsonNode`, `JsonPath`,
   `ObjectMapper.readTree`, `org.json.*`, `WebSocketResponse.fields()` /
   `.getField(...)` / `.rawJson()`.
2. **Parameterize repetitive tests** — when 2+ tests share an
   arrange-act-assert shape and differ only in input/expected values, combine
   into a single `@ParameterizedTest`. Carve-out: keep tests separate when each
   name encodes a semantically distinct scenario.

Iteration 0 is the **first empirical check** that these rules produce the
intended agent behavior across the eval suite. It compares:

- **without_skill**: rule statements removed from `agents/qa-automation-architect.md`,
  `agents/qa-code-reviewer.md`, the three reference prompts under `references/`,
  and the four context YAML files (`FRAMEWORK_CONTEXT.yaml`, `TEST_PATTERNS.yaml`,
  `API_TESTING_GUIDE.yaml`, `API_QUICK_REFERENCE.yaml`). CLAUDE.md and all other
  framework rules remain in place.
- **with_skill**: current state of the branch (all rule statements present).

Both configurations are run against the same sample inputs with the same model,
temperature, and orchestrator behavior.

## Discriminating evals (expected to differ between configs)

- Eval 1 — `small-api-only` (assertions 7, 8 cover deserialize)
- Eval 13 — `repetitive-tests-parameterization` (parameterize rule)
- Eval 14 — `parameterize-carve-out-distinct-scenarios` (carve-out)

## Non-discriminating evals (expected to pass identically — control group)

- Eval 9 — `negative-empty-file` (Step 0 error handling)
- Eval 10 — `negative-file-not-found` (Step 0 validation)
- Eval 6 — `ui-skip-exploration` (orchestration flag handling)

## How to populate this iteration

```bash
cd ~/.claude/commands/qa/automate-functional-tests/benchmarks/iteration-0/
bash run.sh   # see run.sh for prerequisites and outputs
```

The runner script:
1. Snapshots the current branch (`with_skill` config).
2. Generates a temporary worktree at `without_skill` config (rule statements
   reverted via patch).
3. Executes each eval N=3 times against each configuration.
4. Grades each run against `evals.json` assertions.
5. Aggregates results and writes `benchmark.json`.

## Interpreting results

After populating, this README MUST be updated with:

- Per-eval pass-rate deltas (with vs. without).
- Token-cost delta as a percentage.
- A list of any assertions that passed in both configs (non-discriminating —
  these need to be sharpened in the next iteration or removed).
- A list of any assertions that failed in both configs (the rule itself or the
  agent prompt may be insufficient — escalate).
- Conclusion: APPROVED / NEEDS-WORK with specific follow-ups.

## Manual grading burden

Several assertions in the selected evals require a human or LLM-judge reviewer
because they cannot be checked by pure regex / file-exists / frontmatter grading.
The `run.sh` grader marks `code_inspection` assertions as `manual` — those need
to be filled in before `benchmark.json` can flip from `status: pending` to
`status: complete`.

Breakdown for the iteration-0 eval set:

| Eval | # auto-graded | # manual (code_inspection) | Notes |
|---|---|---|---|
| 1 — `small-api-only` | 6 | 2 (assertions 3, 8) | Service-class zero-defensive check + review-report classification check |
| 13 — `repetitive-tests-parameterization` | 2 | 2 (assertions 2, 4) | "No 2+ near-identical @Test methods" + review-report MAJOR-count check |
| 14 — `parameterize-carve-out-distinct-scenarios` | 1 | 3 (assertions 1, 2, 3) | All three carve-out checks are scoped to the three token-validation tests and require reading the generated file |
| 9 — `negative-empty-file` | 4 | 0 | Pure conversation_check |
| 10 — `negative-file-not-found` | 2 | 0 | Pure conversation_check |

**Total manual assertions across the selected evals**: 7 (out of 22 total
assertions, ~32%). At N=3 runs per configuration × 2 configurations (with/without
skill) × 5 evals × 7 manual assertions ≈ **42 manual judgements per iteration**.

**Estimated reviewer time**: ~30 seconds per judgement (read the generated file
+ scan the review report + decide pass/fail) = **~20 minutes of focused review
per iteration**. Front-load this: do all 42 judgements in one sitting rather
than interleaved with other work, since the reviewer needs the same mental
model loaded for each.

**Mitigation options for later iterations**:
1. Replace some `code_inspection` assertions with sharper `grep_pattern` regexes
   where possible (e.g. eval 1.3 could partially be checked by counting `try`,
   `if`, `switch` tokens inside service-class method bodies — not perfect but
   catches the common case).
2. Wire up an LLM-judge grader against the `code_inspection.pattern` field
   (which is already written as a natural-language rubric). Two-model agreement
   (judge A + judge B, agree-or-escalate-to-human) is cheaper than 42 human
   reviews per iteration and reduces grader-bias risk that a single judge
   introduces.
3. Cache manual judgements by `(eval_id, run_n, file_hash)` so reruns at the
   same skill version don't re-grade unchanged outputs.

## Known limitations of this iteration

- N=3 is the minimum; statistical confidence is modest. Iteration 1 should use
  N=5 if cost permits.
- The `without_skill` baseline only removes rule *statements* — it doesn't
  retrain the model. If the model has prior exposure to similar idioms from
  CLAUDE.md or general training data, baseline pass rates may be non-zero even
  when the rule is absent. That's fine: it just means the rule's incremental
  value is the delta, not the absolute with-skill pass rate.
- The carve-out eval (#14) measures one carve-out scenario (token-validation
  failures). Other carve-out boundaries (different error categories, different
  domain rules) are not yet exercised — additional carve-out evals are queued
  for iteration 1 (see "Queued for iteration 1" below).

## Queued for iteration 1

The following five evals were added to `evals.json` (ids 15–19) but are NOT
included in iteration-0's selected set. They exist to close coverage gaps
identified during the iteration-0 skill review:

| Eval | Coverage gap |
|---|---|
| 15 — `websocket-deserialize` | WebSocket counterpart to evals 1 / 13 — the rule covers WS but iteration-0 only exercises REST |
| 16 — `allure-diagnostic-carve-out` | Regression check that the rule does NOT over-correct on legitimate Allure / logger raw-body usages |
| 17 — `paginated-envelope-response` | Verifies the "list vs envelope" rewrite documented in fix-prompt.md (use `as(WrapperClass.class)`, NOT `asList(...)`) |
| 18 — `empty-body-carve-out` | Verifies the 204 / 304 / empty-body carve-out (assert only `statusCode()`, no `response.as(...)` on empty bodies) |
| 19 — `header-assertion-carve-out` | Verifies the `response.raw().headers().firstValue(...)` carve-out in isolation (eval 18 only brushes it as an if-present check) |

Each has a corresponding `evals/sample-input-{15..19}-*.md` sample file. To
include them in iteration 1, add their IDs to `SELECTED_EVALS` in `run.sh` and
re-baseline the without-skill config against this branch's `HEAD` (not
`origin/main`) so the without-skill config retains iteration-0's rule additions
and only iteration-1 changes are measured.
