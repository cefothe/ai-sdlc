# Runbook: Native Teams for the review stage

How the review-team stage maps onto Claude Code Native Teams, and how to run it
standalone with `/ai-sdlc:review`.

## When a team is used

`buildTeamPlan` (`pipeline/team-plan.js`) decides:

| Reviewers resolved | Dispatch | Mechanism |
|---|---|---|
| 1–2 | `parallel-task` | plain parallel `Task` calls |
| 3+ (or `team: true`) | `native-team` | `TeamCreate → Task → JSONL → TeamDelete` |

The default review team is 3 (code + test + security), so the normal path is a
Native Team. Structural changes add an architect-review lens (4); Java-test
tasks swap the test reviewer for `qa-code-reviewer`.

Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (already in `settings.json`).

## The interactive flow (inside a session)

1. `TeamCreate { name: teamPlan.teamName }` — e.g. `ai-sdlc-review-aisdlc-42`.
2. `Task` each teammate into the team, one per `teamPlan.teammates[]`:
   - use its `agentType` (`code-reviewer`, `qa-code-reviewer`, `security-auditor`,
     `code-review-architect`);
   - run it on a harness **different from the implementer** (the plan's harness
     field is `codex` while the implementer is `claude`);
   - prompt = the diff + the advisory promise-verification findings (read-only).
3. Each teammate writes its verdict to its JSONL inbox; collect all of them.
4. Aggregate: **APPROVED** only if every reviewer approves and there are no
   critical/major findings; otherwise **CHANGES_REQUESTED**.
5. `TeamDelete` the team.

Inside `/ai-sdlc:execute`, a CHANGES_REQUESTED result re-dispatches the
implementer with the feedback (informed retry). Standalone (`/ai-sdlc:review`)
it just reports.

## Unattended flow (CI / cron)

No Native Teams — independent reviewers share nothing, so
`adapters/claude-code-spawner.js` runs parallel `claude -p` processes. Same
`runReview()` code path, different `spawn` seam.

## Why teams and not just parallel Task calls

The reviewers are deliberately independent (cross-harness). A team gives one
coordinated lifecycle (create → collect JSONL → delete) and file-level
isolation, instead of tracking N loose Task calls — while preserving the
independence that makes the attestation trustworthy.

## Cross-harness safety

`resolveReviewTeam` throws if any reviewer shares the implementer's harness, so a
bad `capabilities.yaml` fails *before* any team is created (and the
convergence gate catches it in CI).
