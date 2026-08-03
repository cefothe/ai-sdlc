# Promise Theory v2 — Evidence-Based Rewrite

**Date**: 2026-04-07
**Branch**: `promise-theory-v2`
**Baseline**: R6 (mean QS 7.37, p<0.01 vs imperative baseline)
**Goal**: Match R6 quality with significantly fewer tokens, validated by R7 measurement

---

## 1. Problem Statement

The ai-sdlc repo is ~60% dead weight. The audit found:

- `src/` (60+ JS files): abandoned, CLI entrypoint doesn't exist, 3 commits total
- `commands/dev/*`, `commands/sync/*`, `commands/context/*`, `commands/pm/*`: never used after creation
- ~85 of 95 agent files: bulk-generated, only touched by automated promise header sweeps
- `protocols/` (13 YAML files): zero runtime consumers, pure prompt weight
- `quality-gates/` (6 files): zero runtime consumers
- `templates/` (19 files): zero runtime consumers
- `contexts/` (6 of 7 top-level files): referenced by zero commands/agents
- CLAUDE.md at ~450 lines (Anthropic recommends <200)

Meanwhile, Claude Code natively provides what we duplicate: agent types, skills system, hooks (23+ events with 100% enforcement vs CLAUDE.md's ~70%), agent teams, auto-compaction, checkpointing, permissions, MCP.

Research validates the direction:

| Finding | Source |
|---|---|
| Every model gets worse as input length increases | Chroma context rot study, 18 frontier models |
| CLAUDE.md ≈ 70% compliance, hooks = 100% | Anthropic docs |
| Monolithic CLAUDE.md → ~60% correct first response; layered → ~80% | Crosley, 650 files |
| Generic TDD instructions without targeted test context: regressions go from 6% → 9.94% | TDAD paper |
| AI reviewing AI code is structurally circular without executable specs | arxiv 2603.25773 |
| Multi-agent consensus degrades quality up to 37.6% | Feb 2026 paper |
| "Never send an LLM to do a linter's job" | Multiple sources |

## 2. Design Principles

1. **Deterministic over advisory** — Hooks for enforcement, CLAUDE.md for guidance
2. **Less context, better output** — Token budgets are quality budgets
3. **Observer assesses, agent stays clean** — Promise Theory: verify post-output, never inject feedback (R5 proved injection harmful)
4. **Deterministic checks first, LLM judgment for residual** — Linting, type checking, tests before LLM review
5. **Token budget everything** — cxpak for context, explicit budgets per call
6. **The rewrite is mostly deletion + rewiring** — No new infrastructure modules without proven need

## 3. The Three Load-Bearing Pillars

The system reduces to three things that work together:

### 3.1 Promise Theory (verification + trust)

What R6 proved (p<0.01, Cohen's d=+0.74). Four legs that must all be present:

| Leg | Implementation |
|---|---|
| Agent voluntarily declares promises | `promises_offered` in agent frontmatter |
| Observer independently assesses | `promise/observability-checker.js` |
| Trust emerges from observation | `promise/trust-manager.js` (EMA) |
| Receiver adjusts behavior | Executor gate retry, model escalation |

**Critical fix**: Currently `getPromisesForAgent('measurement')` ignores the agent type and returns the same standing promises for everyone. This makes the `promises_offered` headers decorative — explaining why R2-R4 measured no effect. This rewrite makes them load-bearing by parsing agent frontmatter and combining standing + agent-specific promises.

### 3.2 cxpak (token efficiency)

Token-budgeted context replaces ad-hoc Grep/Read exploration:

- Pre-agent context via `cxpak overview --tokens 30k`
- Symbol tracing via `cxpak trace`
- Diff with blast radius via `cxpak diff`
- MCP server mode for in-session agent access (if `cxpak serve --mcp` is supported in installed version)

### 3.3 Hooks (deterministic enforcement for interactive sessions)

For interactive Claude Code sessions (not the measurement executor path):

- `PostToolUse` on Write/Edit → linter feedback via `additionalContext`
- `Stop` → ObservabilityChecker runs standing promises, blocks on critical failures
- `PreToolUse` on Bash → build system guard

These do NOT affect R7 measurement (executor uses `claude -p` headless mode where hooks do not fire). They improve the interactive experience.

## 4. What Goes

| Component | Files | Reason |
|---|---|---|
| `src/` (entire directory) | 60+ JS files | Abandoned CLI, broken entrypoint, 3 commits total |
| Tests for src/ | ~54 test files | Test the dead code being removed |
| `commands/dev/*` | 12 files | Zero post-creation modifications |
| `commands/sync/*` | 4 files | Creation only |
| `commands/context/*` | 5 files | Creation only |
| `commands/pm/*` | ~30 files | Never used (Jira/epic workflows) |
| `protocols/` | 13 YAML + 2 MD | Zero runtime consumers |
| `quality-gates/` | 6 files | Zero runtime consumers |
| `templates/` | 19 files | Zero runtime consumers |
| `contexts/*.yaml` (6 of 7) | 6 files | Referenced by nothing |
| `experiments/` | all | One-time, never updated |
| Migration reports + loose scripts | ~10 files | Historical artifacts |
| `promise/evidence-builder.js` | already deleted | R5 proved harmful |

**Keep**: `contexts/test-automation/` (used by 8 QA agents + 1 command)

## 5. What Stays — Improved

### 5.1 CLAUDE.md — Slim to <200 Lines

Move from ~450 lines to <200. Structure:

```
# CLAUDE.md
## Project Overview         (10 lines)
## Build & Test             (15 lines)
## Code Standards           (20 lines)
## Architecture             (15 lines)
## Agent Promise Model      (20 lines, including standing promises table)
## Information Sources      (10 lines)
## Philosophy               (15 lines)
## Emergency Procedures     (10 lines)
```

Anything cut moves to `.claude/rules/<topic>.md` with `paths:` frontmatter for conditional loading. Topics that don't need conditional loading get deleted entirely.

### 5.2 Agents — Rewrite All ~95

Rewrite every agent to native Claude Code format. Frontmatter schema:

```yaml
---
name: agent-name
description: |
  When to use, what it does, examples.
model: sonnet | opus | haiku | inherit
tools:
  - Read
  - Grep
  - Glob
disallowedTools:
  - Write
  - Edit
  - Bash
color: blue
promises_offered:
  - id: agent-specific-promise-id
    declaration: "I will <observable behavior>"
    verification: { method: grep, confidence: high, pattern: "..." }
promises_accepted:
  - "I accept the task and context provided"
  - "I accept independent post-output verification"
---
```

**Model tiering** (from wshobson/agents):
- **Opus**: Architecture decisions, security review, complex multi-file refactoring
- **Sonnet** (default): Standard implementation, code review, testing
- **Haiku**: Read-only exploration, search, simple queries

**Tool scoping**: Read-only agents get `disallowedTools: [Write, Edit, NotebookEdit, Bash]`. Implementation agents get full tools. Review agents get read + Bash for running tests.

**Promise headers stay** — they go in frontmatter only (not body) so they're metadata for the observer, not prompt bloat for the model. Critical: this rewrite makes them load-bearing (see §5.4).

**Body slimming**: Remove content that duplicates CLAUDE.md. Keep only agent-specific guidance.

**Rewrite in 6 batches by role**:
1. Core analysis (5): file-analyzer, code-analyzer, test-runner, debugger, error-detective
2. Review (5): code-reviewer, code-review-architect, architect-review, security-auditor, performance-engineer
3. Language specialists (~30): python-pro, typescript-pro, rust-pro, go-pro, java-pro, ...
4. Domain experts (~20): backend-architect, frontend-developer, database-admin, mobile-developer, ...
5. QA (10): qa-*-engineer, qa-automation-architect, qa-test-plan-reviewer, ...
6. Specialized (~25): grizzled-trader, ml-engineer, blockchain-developer, payment-integration, ...

Run tests after each batch.

### 5.3 Commands → Skills

Migrate ~25 active commands to `.claude/skills/<name>/SKILL.md` format. Drop ~60+ unused commands.

**Tier 1 (active, proven)**:
- `code-review-pr`, `code-review-pr-strict`, `code-review-skill`
- `qa-owasp-zap`, `qa-automate-tests`

**Tier 2 (useful workflows)**:
- `code-plan`, `code-commit`, `code-pr-create`
- `code-validate-changes`, `code-validate-implementation`
- `code-security-scan`, `code-test-and-build`, `code-coverage`
- `qa-functional-tests`, `qa-performance-tests`, `qa-security-tests`
- `qa-chaos-tests`, `qa-compliance-tests`, `qa-full-cycle`, `qa-explore-ui`
- `testing-run`, `testing-perf-e2e`

**Tier 3 (narrow but useful)**:
- `code-api-test`, `code-integration-test`, `code-smoke-test`
- `code-perf-optimize`, `code-tech-debt`, `code-deps-update`
- `code-config-validate`

**Removed entirely**:
- All `pm/*`, `dev/*`, `sync/*`, `context/*` (audit: never used)
- `code/help`, `code/rabbit`, `code/explain-changes`, `code/evaluate`
- `code/consistency-docs`, `code/consistency-full`, `code/api-breaking`
- `code/implement-ticket`, `code/hotfix-validate`, `code/load-test`
- `qa/reporting-tests`, `qa/test-plan`, `testing/prime`
- `teams/benchmark`, `teams/synthesize`

### 5.4 Promise Infrastructure — Wire Headers, Otherwise Unchanged

**Keep unchanged**:
- `promise/observability-checker.js` — verification engine
- `promise/trust-manager.js` — EMA trust tracking
- `promise/promise-engine.js` — orchestrator
- `promise/ledger-writer.js` — JSONL persistence
- `promise/reset-trust.js` — HITL utility

**Modify**: `promise/standing-promises.js`

Currently:
```javascript
function getPromisesForAgent(_agentType) {
  return STANDING_PROMISES;  // ignores agentType
}
```

Becomes:
```javascript
function getPromisesForAgent(agentType) {
  const standing = STANDING_PROMISES;
  const agentSpecific = loadAgentPromises(agentType);  // parses agent .md frontmatter
  return [...standing, ...agentSpecific];
}
```

**Add**: `promise/agent-promises-loader.js`

Small module that:
- Reads `agents/<agentType>.md`
- Parses YAML frontmatter
- Returns `promises_offered` array
- Returns `[]` if file missing or no headers

This is the **one small change** that completes Promise Theory's first leg. Headers become load-bearing. Each agent gets verified against its own declared promise set plus standing promises.

### 5.5 Measurement — Add Token Tracking

The executor (`measurement/executor.js`) and metrics collector (`measurement/metrics-collector.js`) need to track tokens.

`claude -p --output-format json` returns a `usage` object with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, plus a top-level `total_cost_usd`.

**Critical structural change in `executor.js`**: The current flow parses JSON and extracts `result` text via `parseAgentOutput()` — discarding `usage` and `total_cost_usd`. The raw output files saved to disk contain the parsed text only, not the original JSON. This means:

- **R6 token data is unrecoverable** — never persisted
- **The executor must change** — extract `usage` and `cost` from the JSON object BEFORE calling `parseAgentOutput`
- **New helper**: `parseAgentResponse(rawOutput)` returns `{ text, usage, cost_usd }` — single parse, two fields out

**Modify**: `measurement/executor.js`
- Replace `parseAgentOutput(rawOutput)` with `parseAgentResponse(rawOutput)` returning `{ text, usage, cost_usd }`
- Pass `usage` and `cost_usd` through to `collector.writeRecord()`
- Update tests for the new helper

**Modify**: `measurement/metrics-collector.js`
- Add `usage` and `cost_usd` fields to written records
- No new methods — token data flows through unchanged

**Modify**: `measurement/comparison-report.js`
- Add token comparison (mean, median, p95 for input/output/total)
- Add efficiency metric: `tokens_per_quality_point = total_tokens / quality_score`
- Add cost comparison

The executor's gate logic stays as-is (proven in R6). The only behavioral change is token capture.

### 5.6 Rules — Slim Down

**Keep, slim**:
- `rules/datetime.md` — already small, keep as-is
- `rules/test-execution.md` — slim to essentials
- `rules/github-repo-protection.md` — extract just the repo protection check

**Delete** (redundant with native features or Claude Code knowledge):
- `rules/error-prevention.md` — overengineered prose
- `rules/build-system-enforcement.md` — replaced by PreToolUse hook
- `rules/standard-patterns.md` — slim to <30 lines or delete
- `rules/agent-coordination.md` — duplicated by native agent teams
- `rules/branch-operations.md` — Claude knows git
- `rules/worktree-operations.md` — Claude knows git
- `rules/frontmatter-operations.md` — Claude knows YAML
- `rules/strip-frontmatter.md` — one sed command, not a rules file
- `rules/use-ast-grep.md` — tool preference, not a rule

Remove promise headers from all remaining rules files.

## 6. What's New

### 6.1 Hooks (`hooks/` directory)

For interactive sessions only. Not measured by R7.

**`hooks/post-edit-lint.js`**
- Receives stdin: `{ tool, input, output }`
- Extracts file path from tool input
- Runs linter (eslint/ruff/etc. based on extension)
- Returns `{ "additionalContext": "Linter found N issues: ..." }` if issues
- Returns `{}` if clean

**`hooks/stop-verify.js`**
- Stop hook receives `{ session_id, transcript_path }` via stdin (NOT the session text directly)
- Reads the transcript JSONL file at `transcript_path`
- Extracts the final assistant turn (last message with `role: "assistant"`)
- Concatenates text content blocks from that turn
- Runs `ObservabilityChecker.verifyAll(STANDING_PROMISES, finalText)`
- Exit code 2 (blocks completion) with feedback if critical promises broken
- Exit code 0 if all pass
- Handles missing transcript path gracefully (some contexts don't have one)
- This is the output gate for interactive sessions

**`hooks/pre-bash-validate.js`**
- Checks if command is build/test
- Validates against documented build system from CLAUDE.md
- Exit code 2 if mismatch

**`.claude/settings.json`** with correct schema (verified against `references/claude-code-hooks-mastery`):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node hooks/post-edit-lint.js" }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node hooks/stop-verify.js" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node hooks/pre-bash-validate.js" }
        ]
      }
    ]
  }
}
```

**Tests**: `tests/unit/hooks/` for each hook implementation. Mock stdin/stdout, verify exit codes and additionalContext payloads.

### 6.2 cxpak MCP Integration

**Verified**: cxpak v1.3.0 supports `cxpak serve --mcp` (confirmed via `cxpak serve --help`). The `cxpak:setup` skill (provided by the cxpak Claude Code plugin) handles MCP server configuration.

**Action**: Run `/cxpak:setup` to register the cxpak MCP server. This creates the appropriate `.mcp.json` entry pointing to `cxpak serve --mcp`.

**Tools exposed by v1.3.0**:
- `cxpak_overview` — structured repo summary within token budget
- `cxpak_trace` — symbol tracing through dependency graph
- `cxpak_diff` — diff with dependency context and blast radius
- `cxpak_auto_context` — 10-step intelligent context selection pipeline
- `cxpak_dead_code`, `cxpak_api_surface`, `cxpak_health` — analysis tools

**Future (v1.4.0, unreleased)**: `cxpak_predict`, `cxpak_drift`, `cxpak_security_surface`. Adopt when released.

**Verification**: After running `/cxpak:setup`, run `/mcp` to confirm the cxpak server is connected. If "Failed to reconnect", debug via the setup skill — the MCP feature is supported, configuration is the issue.

No new code in our repo. cxpak runs as an external process exposing tools via MCP stdio.

## 7. What We DON'T Build

These were considered and rejected:

| Rejected | Why |
|---|---|
| `policy-engine.js` | cxpak + hooks already cover declarative gating; would be dead code on day one |
| `recovery-recipes.js` | Claude Code native checkpointing handles recovery |
| `lane-events.js` | Native hook lifecycle events are already typed |
| `green-contracts.js` | PreCommit hooks can check CI state |
| `reflector` agent | Self-referential risk; could rewrite its own governing instructions |
| `reality-checker` agent | Can be a skill if needed; doesn't need a dedicated agent |

The rewrite is **mostly deletion + rewiring**. No new infrastructure modules without a proven consumer.

## 8. Migration Sequence (Corrected)

The architect found a dependency inversion in the previous draft. Corrected sequence:

### Phase 1 — Delete dead weight + tests
1. `git rm -rf src/`
2. `git rm` all test files importing from src/ (~59 files):
   - All `tests/unit/atlassian/`, `tests/unit/github/`, `tests/unit/jira/`, `tests/unit/sync/`, `tests/unit/intelligence/`, `tests/unit/code/`, `tests/unit/scripts/`
   - All `tests/pm/` (14 files)
   - `tests/integration/contracts/jira-contracts.test.js`
   - `tests/integration/contracts/github-contracts.test.js`
   - `tests/integration/contracts/confluence-contracts.test.js`
3. `git rm -rf protocols/ quality-gates/ templates/ experiments/`
4. `git rm -rf contexts/*.yaml` (keep `contexts/test-automation/`)
5. `git rm -rf commands/pm/ commands/dev/ commands/sync/ commands/context/`
6. `git rm` migration reports and loose scripts at repo root
7. Remove dead command files (per §5.3 removal list)
8. Run `npx jest tests/unit/measurement/ tests/unit/promise/ tests/unit/hooks/ tests/integration/promise/` — verify surviving tests pass
9. Commit: "chore: remove dead weight (60% of repo)"

### Phase 2 — Slim CLAUDE.md
10. Rewrite CLAUDE.md to <200 lines
11. Move salvageable content to focused `rules/<topic>.md` files (or delete)
12. Slim remaining rules files
13. Remove promise headers from rules files
14. Commit: "docs(CLAUDE.md): slim to <200 lines, prune rules"

### Phase 3 — Wire promise headers
15. Add `promise/agent-promises-loader.js` (frontmatter parser)
16. Modify `promise/standing-promises.js`: `getPromisesForAgent` reads frontmatter
17. Add unit tests for loader
18. Update existing tests to cover agent-specific promise loading
19. Run full promise test suite
20. Commit: "feat(promise): wire agent-specific promises from frontmatter"

### Phase 4 — Rewrite agents (6 batched commits)
21. Batch 1: Core analysis (5 agents)
22. Batch 2: Review (5 agents)
23. Batch 3: Language specialists (30+ agents)
24. Batch 4: Domain experts (20+ agents)
25. Batch 5: QA (10 agents)
26. Batch 6: Specialized (25 agents)

Each batch commit: native frontmatter, model tiering, tool scoping, promise headers in frontmatter only, slim body. Run full test suite after each batch.

### Phase 5 — Migrate commands to skills
27. Create `.claude/skills/` structure
28. Migrate Tier 1 skills (5 skills)
29. Migrate Tier 2 skills (~13 skills)
30. Migrate Tier 3 skills (~7 skills)
31. Delete migrated command files
32. Commit per tier

### Phase 6 — Add hooks
33. Implement `hooks/post-edit-lint.js` + tests
34. Implement `hooks/stop-verify.js` + tests
35. Implement `hooks/pre-bash-validate.js` + tests
36. Add `.claude/settings.json` with correct schema (verified against references/)
37. Run hook tests
38. Commit: "feat(hooks): deterministic enforcement for interactive sessions"

### Phase 7 — Add cxpak MCP
39. Run `/cxpak:setup` to register the cxpak MCP server (v1.3.0 already supports `--mcp`)
40. Verify with `/mcp` — cxpak server should be connected
41. If "Failed to reconnect", debug via the setup skill
42. Commit: "feat(mcp): cxpak MCP server registered via cxpak:setup"

### Phase 8 — Add token tracking to measurement
43. Replace `parseAgentOutput` with `parseAgentResponse` returning `{ text, usage, cost_usd }`
44. Update `measurement/executor.js` to capture and pass usage/cost downstream
45. Update `measurement/metrics-collector.js` to write usage/cost fields
46. Update `measurement/comparison-report.js` with token comparison + efficiency metric
47. Add tests for token parsing and comparison
48. Commit: "feat(measurement): track token usage per invocation"

### Phase 8.5 — Establish R6 token baseline (R6t)
49. `node measurement/executor.js --ref promise-theory --runs 30 --model sonnet --promise`
50. Verify token data is in the new metrics.jsonl
51. Save as R6t baseline for R7 comparison
52. Commit: "docs(measurement): R6t — R6 re-run with token tracking baseline"

### Phase 9 — Run R7
53. `node measurement/executor.js --ref promise-theory-v2 --runs 30 --model sonnet --promise`
54. Generate R7 analysis report comparing to R6t (with tokens), R6 (quality only), and R1 (imperative baseline)
55. Commit: "docs(measurement): R7 analysis — quality + token efficiency"

## 9. Measurement Plan — R7

### 9.1 What R7 Measures

**R7 measures the executor path**, not the hooks path. The executor uses `claude -p --no-session-persistence` (headless mode) where:
- Stop hooks do not fire
- Agent dispatching happens via the synthetic `agentId = '${model}-${task.id}'`, not real Claude Code agent names
- MCP servers configured in `.mcp.json` may or may not be loaded depending on the CLI flags

R7 therefore measures:
- Slim CLAUDE.md effect on quality
- Slim CLAUDE.md effect on token usage
- Token tracking infrastructure (the new instrumentation)

R7 does NOT measure:
- Hook enforcement (only fires in interactive sessions)
- Agent-specific promise loading (executor uses synthetic agent IDs, not real `agents/<name>.md` files)
- cxpak MCP integration (interactive session feature)

These are validated separately via:
- Unit tests for each hook
- Manual interactive session validation
- cxpak MCP verified via `/mcp` command after `/cxpak:setup`

**Honest framing**: If R7 shows quality improvement, it can ONLY be attributed to slim CLAUDE.md (less context = better output, per Chroma context rot research). The agent-specific promise wiring is a real improvement to interactive Claude Code sessions but cannot be validated by the executor harness.

### 9.2 Method

Same framework as R1-R6:
- 30 runs × 5 tasks = 150 invocations
- Same task battery (code-plan, degraded-input, determinism-control, multi-agent-coordination, single-agent-codegen)
- Same statistical tests (Wilcoxon signed-rank, Cohen's d)
- Promise mode enabled (`--promise` flag)
- Sonnet model (same as R6)

### 9.3 Success Criteria

**Primary (must hit all)**:

| Metric | R6 | R7 target |
|---|---|---|
| Mean QS | 7.37 | ≥ 7.37 |
| Wilcoxon vs R6 | — | not significantly worse (p > 0.05) |
| Mean total tokens | unknown (establish in R7) | < R6 baseline |
| CLAUDE.md size | ~450 lines | < 200 lines |

**Secondary (track but don't gate)**:

- Score-9 rate: ≥ R6's 32.7%
- Score-4 rate: ≤ R6's 6.7%
- Tokens per quality point: significantly lower than R6
- Test suite: surviving tests pass (no regressions)

### 9.4 Failure Criteria

R7 fails and triggers revert if:
1. Mean QS significantly worse than R6 (Wilcoxon p < 0.05)
2. Mean QS below R1 baseline (6.88)
3. Test suite regressions

R7 needs investigation but doesn't auto-revert if:
1. Tokens equal or higher than R6 (the slimming should help; if it doesn't, find out why)
2. Per-task means show one task regressed significantly while others improved

### 9.5 Token Baseline

**R6 token data is unrecoverable.** The current executor parses JSON and saves only the `result` text — `usage` and `cost_usd` are discarded before disk write.

**Resolution**: After Phase 8 (token tracking added), re-run R6 with the new executor:

```bash
node measurement/executor.js --ref promise-theory --runs 30 --model sonnet --promise
```

This produces R6-with-tokens (call it R6t) — same code, same task battery, now with token data. Use R6t as the baseline for R7's token comparison.

**Cost**: ~30-60 minutes of executor runtime. Same task battery, same model, no spec changes.

This is Phase 8.5 in the migration sequence.

## 10. Reference Repos

Cloned into `references/` (gitignored) for pattern extraction:

| Repo | Pattern Used |
|---|---|
| `everything-claude-code` (142k★) | Cross-harness agent config patterns |
| `wshobson-agents` (33k★) | Model tiering strategy, agent organization |
| `claude-code-hooks-mastery` (3.5k★) | Correct hook schema, Builder-Validator pattern |
| `claude-code-system-prompts` (8.3k★) | Ground truth of Claude Code's actual prompts |
| `oh-my-claudecode` (24.8k★) | Verify/fix loop patterns |
| `claw-code` | Reference for what NOT to build (we don't need lane events, policy engine, etc.) |
| `cxpak` v1.3.0 | MCP integration pattern, token-budgeted context |

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Deleting src/ breaks tests | Phase 1 deletes tests simultaneously |
| Slim CLAUDE.md loses important rules | Conditional rules/ files load on matching paths; R7 measures impact |
| Rewritten agents don't dispatch correctly | Batch by role, full test suite after each batch |
| Hooks don't fire / wrong schema | Schema verified against `references/claude-code-hooks-mastery/.claude/settings.json` |
| cxpak MCP server fails to start | v1.3.0 supports --mcp; debug via /cxpak:setup skill |
| R7 regresses on quality | Wilcoxon test triggers revert; bisect by reverting per-batch |
| R7 doesn't show token reduction | Investigate per-task; may indicate CLAUDE.md was already lean enough or test tasks have fixed minimum |
| Token tracking unreliable | claude CLI JSON output usage object is canonical; parse defensively |
| Promise headers still don't matter | If R7 shows zero effect from wiring, it means the headers themselves were the problem, not just disconnection — revisit |

## 12. Out of Scope

- **No new promise modules** — no policy engine, recovery recipes, lane events, green contracts
- **No new agent types** — no reflector, no reality-checker (can be skills if needed later)
- **No claw-code feature ports** — claw-code is a reference for what NOT to build; their patterns solve problems we don't have
- **No measurement framework changes** beyond token tracking
- **No CLAUDE.md content innovation** — slimming only, content stays focused on what Anthropic recommends keeping

## 13. Open Questions

1. **Are there any agents that should NOT have promise headers?** — The grizzled-trader agent (advice only, no code) might need different verification. Audit during Phase 4 Batch 6.

2. **Does the new agent-promises-loader need caching?** — File reads happen per evaluate() call. For interactive sessions this is per-tool-use; for measurement runs it's per-task. Add a per-process cache if profiling shows this is slow.

3. **R6t timing**: Phase 8.5 takes ~30-60 minutes of runtime. Run sequentially with R7, or in parallel? Sequential is safer (no API rate limit risk); parallel halves wall time. Default: sequential.
