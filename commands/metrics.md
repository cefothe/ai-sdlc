---
description: Delivery metrics — outcomes, not activity: agent success rate, cost per successful task, rework rate, lead time, change failure rate (with baseline)
argument-hint: [baseline]   record the current numbers as the baseline
allowed-tools: Bash, Read
---

# /ai-sdlc:metrics — is the AI SDLC actually paying off?

Adoption numbers ("60% of code is AI-assisted") prove nothing — DORA data shows
throughput can fall as adoption rises, and agents can inflate PR counts. These five
metrics come from `.ai-sdlc/runs.jsonl` (one record per pipeline run, with cost),
the base branch's git history and each PR's fate:

| Metric | Meaning |
|---|---|
| agentSuccessRate | merged PRs / runs — verified by outcome, not by how output looks |
| costPerSuccess | total agent spend / merged PRs (failed attempts count) |
| reworkRate | merged changes whose files needed a fix/revert within 7 days |
| leadTimeDays | median spec (PRD / bug report) first commit → merged |
| changeFailureRate | merged changes followed by a revert/hotfix within 14 days |

Plus context: churn (files rewritten within 14 days — catches micro-PR inflation),
first-pass review rate, throughput, aborted runs by stage.

## Steps
1. Before changing the flow, record a baseline:
   `node "${CLAUDE_PLUGIN_ROOT}/measurement/delivery-metrics.js" --baseline`
2. Report (compares with the baseline):
   `node "${CLAUDE_PLUGIN_ROOT}/measurement/delivery-metrics.js"`
3. Every metric needs an owner who acts when it goes red — set them in
   `.ai-sdlc/flow.yaml` → `metrics.owners`. Five owned metrics, not twenty-five.
4. Per-run spend caps live in `flow.yaml` → `budget` (`maxCostUsd`, `maxCalls`).
