---
description: Run just the cross-harness review-team stage on the current branch (no implement, no PR)
argument-hint: [base-branch]   defaults to main
allowed-tools: Bash, Read, Task
---

# /ai-sdlc:review — standalone review team on the current branch

Review the diff of the current branch against `${1:-main}` using the reviewer
team from `.ai-sdlc/capabilities.yaml`. No worktree, no implementation, no PR —
just the review stage, dispatched as a Native Team.

## Steps

1. **Capture the diff and task context.**
   - `git diff ${1:-main}...HEAD` for the diff.
   - Derive `taskContext` from the changed files: `files` (for Java-test / label
     routing), `languages`, and any labels you can infer.

2. **Resolve the team + plan.** Run:
   ```bash
   node -e "const{loadCapabilityMap}=require('./pipeline/capabilities');const{buildTeamPlan}=require('./pipeline/team-plan');const{resolveReviewTeam}=require('./pipeline/capabilities');const m=loadCapabilityMap('.ai-sdlc/capabilities.yaml');const t=resolveReviewTeam(m,{files:process.argv.slice(1)},{implementerHarness:'claude'});console.log(JSON.stringify(buildTeamPlan({taskId:'branch',stage:'review',providers:t.providers,team:t.team})))" $(git diff --name-only ${1:-main}...HEAD)
   ```
   This prints the team plan (teammates + whether to use a Native Team).

3. **Dispatch the reviewers.**
   - If `useTeam` is true: `TeamCreate { name: teamPlan.teamName }`, then `Task`
     each teammate (its `agentType`, on a harness ≠ the implementer's), collect
     each verdict from its JSONL inbox, then `TeamDelete`.
   - Else: parallel `Task` calls.
   - Give each reviewer the diff + (if available) the advisory promise findings
     as read-only context.

4. **Aggregate + report.** APPROVED only if all reviewers approve and there are
   no critical/major findings. Print the decision, per-reviewer findings, and —
   if a hard-mandatory promise gate failed — that the merge is blocked.

## Programmatic equivalent
```js
const { runReview } = require('./pipeline/review-only');
const { loadCapabilityMap } = require('./pipeline/capabilities');
const { makeClaudeSpawner } = require('./adapters/claude-code-spawner');
const r = await runReview({
  taskId: 'branch', diff, capabilityMap: loadCapabilityMap('.ai-sdlc/capabilities.yaml'),
  taskContext: { files, languages, labels }, spawn: makeClaudeSpawner({ model: 'sonnet' }),
});
// r.decision, r.findings, r.teamPlan, r.blocked
```
