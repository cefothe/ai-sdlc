#!/usr/bin/env bash
# Benchmark runner — iteration 0 — /qa:automate-functional-tests
#
# Compares the skill's "with rule" vs "without rule" configurations by running
# selected evals N times under each configuration and grading the outputs against
# evals.json assertions.
#
# Prerequisites:
#   - Claude Code CLI installed and authenticated against an LLM backend.
#   - jq, git, mvn available on PATH.
#   - The branch under test checked out (HEAD is the "with_skill" config).
#   - A Maven test project ($TEST_PROJECT_DIR) where the skill can write tests.
#
# Outputs:
#   - benchmark.json populated with per-eval pass rates and token usage.
#   - Per-run logs under runs/{config}/{eval_id}/run-{n}.log
#
# This script is INTENTIONALLY a scaffold — replace the placeholder `claude`
# invocations with the actual harness call once the project's automated eval
# runner is wired up. Until then, sections marked TODO-RUN are stubs that
# document the steps; the script will fail-fast at those points with a clear
# message.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVALS_JSON="$SKILL_ROOT/evals/evals.json"
BENCHMARK_JSON="$SCRIPT_DIR/benchmark.json"
RUNS_DIR="$SCRIPT_DIR/runs"

N_PER_CONFIG="${N_PER_CONFIG:-3}"
TEST_PROJECT_DIR="${TEST_PROJECT_DIR:?Set TEST_PROJECT_DIR to a Maven project where the skill can write tests}"
MODEL_ID="${MODEL_ID:-claude-opus-4-7}"
TEMPERATURE="${TEMPERATURE:-0.0}"

# Evals selected for iteration 0. Discriminating + control group.
SELECTED_EVALS=(1 9 10 13 14)

mkdir -p "$RUNS_DIR"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing required tool: $1" >&2; exit 1; }
}

require jq
require git
require mvn

# -----------------------------------------------------------------------------
# Step 1: snapshot the "with_skill" configuration (current HEAD)
# -----------------------------------------------------------------------------
WITH_SKILL_SHA="$(git -C "$SKILL_ROOT" rev-parse HEAD)"
echo "with_skill SHA: $WITH_SKILL_SHA"

# -----------------------------------------------------------------------------
# Step 2: build the "without_skill" configuration
#
# The without-skill config reverts the new rule statements from this branch
# while keeping all other framework context intact. The simplest reliable way
# to do this is a git worktree pointing at main, then re-applying every commit
# EXCEPT the ones that introduced the deserialize / parameterize rules.
#
# The commits introducing those rules on this branch are (subject-only; SHAs
# omitted because they will shift on rebase/squash):
#   - feat(qa): require deserialized-type assertions for REST and WebSocket responses
#   - feat(qa): require parameterizing repetitive automated tests
#   - fix(qa): close review findings on deserialize and parameterize rules
#   - fix(qa): close re-review findings
#   - fix(qa): close 3rd-pass skill-review findings
# To enumerate the exact set at run time:
#   git log --oneline --grep='deserialized\|parameterizing' origin/main..HEAD
#
# For iteration 0 the baseline is simply `main` (none of those commits applied).
# -----------------------------------------------------------------------------
WITHOUT_SKILL_REF="origin/main"
WITHOUT_WORKTREE="$(mktemp -d)/without_skill"
git -C "$SKILL_ROOT" worktree add "$WITHOUT_WORKTREE" "$WITHOUT_SKILL_REF"
trap 'git -C "$SKILL_ROOT" worktree remove --force "$WITHOUT_WORKTREE" 2>/dev/null || true' EXIT

WITHOUT_SKILL_SHA="$(git -C "$WITHOUT_WORKTREE" rev-parse HEAD)"
echo "without_skill SHA: $WITHOUT_SKILL_SHA (origin/main)"

# -----------------------------------------------------------------------------
# Step 3: run each eval N times under each config
# -----------------------------------------------------------------------------
run_eval() {
  local config="$1"        # with_skill | without_skill
  local eval_id="$2"
  local skill_path="$3"    # path to the skill root for this config (HEAD or worktree)

  local eval_entry
  eval_entry="$(jq -e --argjson id "$eval_id" '.evals[] | select(.id == $id)' "$EVALS_JSON")"

  local prompt
  prompt="$(echo "$eval_entry" | jq -r '.prompt')"
  local sample_input
  sample_input="$(echo "$eval_entry" | jq -r '.sample_input // empty')"

  for n in $(seq 1 "$N_PER_CONFIG"); do
    local run_dir="$RUNS_DIR/$config/$eval_id/run-$n"
    mkdir -p "$run_dir"

    echo "=== $config eval=$eval_id run=$n ==="
    echo "  prompt: $prompt"
    echo "  sample_input: $sample_input"
    echo "  skill_path: $skill_path"
    echo "  output: $run_dir"

    # TODO-RUN: replace the block below with the project's automated eval
    # harness call. The harness must:
    #   1. Point Claude Code at $skill_path so the agents/contexts/references
    #      for that config are loaded.
    #   2. Invoke the orchestrator with $prompt against a clean copy of
    #      $TEST_PROJECT_DIR.
    #   3. Capture stdout/stderr to $run_dir/run.log.
    #   4. Capture the generated test files and the review report under
    #      $run_dir/output/.
    #   5. Record token usage in $run_dir/tokens.json.
    echo "❌ TODO-RUN: harness invocation not yet wired up." >&2
    echo "   Manual reproduction: cd $TEST_PROJECT_DIR && claude --skill-path $skill_path '$prompt'" >&2
    return 1
  done
}

# -----------------------------------------------------------------------------
# Step 4: grade each run against evals.json assertions
# -----------------------------------------------------------------------------
# TODO-GRADE: implement a grader that for each run:
#   - For grading=file_exists: check the file under $run_dir/output/.
#   - For grading=grep_pattern: grep for `pattern` (and `negated_pattern` if
#     present) in the generated files.
#   - For grading=frontmatter_check: parse YAML frontmatter from the named
#     file and validate `required_fields` and `expected_values`.
#   - For grading=code_inspection: requires LLM judge (separate model call) or
#     human review. Mark as `manual` in the per-run grade and require a
#     reviewer to fill it in before benchmark.json can be marked final.
#   - For grading=conversation_check: search the run.log for `pattern`.
# Aggregate pass counts per assertion, per config, then write to benchmark.json.

# -----------------------------------------------------------------------------
# Step 5: write benchmark.json
# -----------------------------------------------------------------------------
# TODO-WRITE: replace the per-eval `null` placeholders in benchmark.json with
# the actual per-assertion pass counts, overall pass rate, and average token
# usage for each config. Update `summary.discriminating_evals`,
# `summary.non_discriminating_evals`, `summary.cost_delta_pct`, and write a
# concrete `summary.conclusion`. Stamp `captured_at` with the current UTC ISO
# timestamp and flip `status` from `"pending"` to `"complete"`.

echo
echo "This is iteration 0 scaffolding. To populate benchmark.json:"
echo "  1. Wire up the harness call in the TODO-RUN block above."
echo "  2. Wire up the grader in the TODO-GRADE block above."
echo "  3. Re-run this script."
echo "  4. Update README.md with the conclusions."
echo
echo "Selected evals for this iteration: ${SELECTED_EVALS[*]}"
echo "N per config: $N_PER_CONFIG"
exit 2
