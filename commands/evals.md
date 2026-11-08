---
description: Agent-configuration evals — re-run real past tasks headless and gate changes to agents, skills, rules, CLAUDE.md and hooks on the pass rate
argument-hint: run | harvest | baseline
allowed-tools: Bash, Read
---

# /ai-sdlc:evals — regression-test what steers the agents

A change to `agents/`, `skills/`, `rules/`, `CLAUDE.md`, hooks or `.claude/` changes every
future run, so it is gated like code: real past tasks (prompt + base commit + checks) in
`.ai-sdlc/evals/*.yaml` are re-run headless in throwaway worktrees, and a pass-rate drop
against `.ai-sdlc/evals/baseline.json` fails the change.

## Steps
1. **Harvest** evals from real pipeline runs (their base commit + RED-oracle accept
   commands become the checks; the task file becomes the prompt):
   `node "${CLAUDE_PLUGIN_ROOT}/measurement/config-evals.js" harvest`
   Every incident fixed via `/ai-sdlc:bug` should leave an eval (its reproduction test).
   Aim for 20–50; fewer is reported as UNDERPOWERED.
2. **Project the cost** first: `node "${CLAUDE_PLUGIN_ROOT}/measurement/config-evals.js" run --dry-run`
3. **Record the baseline** on the current configuration:
   `node "${CLAUDE_PLUGIN_ROOT}/measurement/config-evals.js" run --update-baseline`
4. **Gate** a configuration change: `node "${CLAUDE_PLUGIN_ROOT}/measurement/config-evals.js" run --tolerance 0.05`
   (exit 1 on regression). In CI, copy `${CLAUDE_PLUGIN_ROOT}/templates/github/agent-config-evals.yml`
   to `.github/workflows/` — it runs on config-path PRs and nightly.
5. Retire cases that no longer discriminate (always pass across models) and replace them
   with fresh ones from recent incidents.
