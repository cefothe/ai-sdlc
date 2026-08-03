---
description: Run one admitted backlog task through the Step 0–13 pipeline (DoR → worktree → implement → cross-harness review → PR)
argument-hint: <task-id>   e.g. AISDLC-42
allowed-tools: Bash, Read, Edit, Task
---

# /ai-sdlc:execute — run a backlog task through the pipeline

You are the **orchestrator** for task `$1`. Drive the Step 0–13 pipeline,
delegating the deterministic steps to the Node CLI and the agent steps to the
Task tool, using the providers declared in `.ai-sdlc/capabilities.yaml`.

## Rules (non-negotiable)
- **Pattern C:** the parent tree stays on `main`, read-only. All code work
  happens in `.worktrees/$1/`. Never edit files in the parent tree.
- **You never merge.** Open the PR; a human merges.
- **Cross-harness review:** reviewers must run on a different harness than the
  implementer. If capabilities.yaml puts a reviewer on the implementer's
  harness, stop and report — do not proceed.

## Steps

1. **Admit (DoR).** Run:
   `node -e "const{loadTaskFile}=require('./decision-engine/backlog-task');const{loadDorConfig,evaluateDor}=require('./decision-engine/dor-gate');const t=loadTaskFile(process.argv[1]);console.log(JSON.stringify(evaluateDor(t,{projectRoot:process.cwd(),config:loadDorConfig('.ai-sdlc/dor-config.yaml')})))" "backlog/tasks/$1"*.md`
   - If `admitted:false`, print the reasons and **stop** — the task isn't ready;
     the operator must resolve the open questions first (that's the whole point).
   - For gates marked `needs-stage-b`, judge them yourself (scope-bounded?
     done-state describable?) and only continue if they pass.

2. **Resolve capabilities.** Read `.ai-sdlc/capabilities.yaml`. Determine the
   `implement` agent (route by the task's language), the `plan` skill, and the
   `review` team (route Java-test tasks → `qa-code-reviewer`).

3. **Worktree (Pattern C).** Confirm the parent tree is on `main` and clean,
   then `git worktree add -b ai-sdlc/$1-<slug> .worktrees/$1 main`. Write the
   `.active-task` sentinel.

4. **Plan (optional).** If a `plan` provider is set, invoke it — e.g. run the
   `/code-plan` skill — and carry its output into the implementer's context.

4b. **Analyze (before implement).** Cross-artifact consistency audit — catch a
   plan that contradicts or under-covers the PRD *before* any code is written.
   Write the plan text to a temp file and run the deterministic gate:
   ```bash
   node decision-engine/analyze-gate.js "backlog/tasks/$1"*.md /tmp/$1-plan.md
   ```
   If it exits non-zero (`consistent: false`), **stop** and report the failing
   linkage/coverage checks — the artifacts disagree; fix the plan or the task/PRD
   before implementing. Then do the advisory pass: dispatch the `analyze` provider
   from `.ai-sdlc/capabilities.yaml` (`code-analyzer`) via the **Task tool** to
   check semantically — does the plan implement every PRD acceptance criterion?
   any contradictions, orphan steps, or scope creep vs the PRD non-goals? Surface
   its findings; act on `ac-coverage-gap` advisories before proceeding.

5. **Implement.** Dispatch the `implement` agent via the **Task tool** (e.g.
   `java-pro`) with the task contract + plan + cxpak context. It must commit and
   return `{ commitSha, filesChanged, verifications, summary }`.

6. **Review (Native Teams).** Read the team plan in
   `steps.capabilities.review.teamPlan`. When `useTeam` is true (3+ reviewers):
   - `TeamCreate { name: teamPlan.teamName }`
   - `Task` each teammate into the team — one per `teammates[]` entry, using its
     `agentType` (e.g. `code-reviewer`, `qa-code-reviewer`, `code-review-architect`)
     and running on a **different harness than the implementer**.
   - Each reviewer writes its verdict to its JSONL inbox; collect all of them.
   - Aggregate: APPROVED only if all approve and there are no critical/major
     findings.
   - `TeamDelete` the team.

   When `useTeam` is false (1–2 reviewers), just dispatch parallel `Task` calls.
   Either way, feed each reviewer the diff plus the advisory promise-verification
   findings as read-only context. If CHANGES_REQUESTED, re-dispatch the
   implementer **with the reviewer feedback** (informed retry) up to the cap.

   The **design panel** (step 4) dispatches the same way — its own team plan is
   in `steps.capabilities.design.teamPlan`.

6b. **Validate (Definition-of-Done gate — HARD ENFORCED).** Before finalizing, run
   the DoD gate over the branch's changed files:
   ```bash
   node decision-engine/dod-gate.js --config .ai-sdlc/dod-config.yaml \
     $(git diff --name-only ${1:+main}...HEAD | sed 's/^/--file /')
   ```
   It runs the project's **build** and **full test suite** (each must pass) and scans
   for incomplete-work markers. **If it exits non-zero (BLOCKED), STOP** — do NOT flip
   status to Done, do NOT open the PR. Route the failures back to the implementer as an
   informed retry and re-run until the gate passes. There is no override in enforce
   mode: a task with a red build or failing tests is not Done. (Objective gate — blocks
   the pipeline, not the author; consistent with R5, which only bars feeding *subjective*
   assessment to the author.)

7. **Finalize.** Verify the acceptance criteria, flip status → `Done`, move the
   task file to `backlog/completed/`, sign the attestation, and remove the
   sentinel.

8. **PR (human in the loop).** Push the branch and open the PR (`gh pr create`).
   You never merge. Always put a human on the PR:
   - request a reviewer — `gh pr create --reviewer <handle>` (or the `CODEOWNERS`
     owner is auto-requested on protected repos), and
   - if the repo has no branch protection yet, note it in the PR body and point
     the operator at `docs/operations/pr-human-in-the-loop.md`.
   Report the URL. For cross-repo changes, open a sibling PR per affected repo.
   The merge itself is a human decision, enforced by branch protection + required
   review — the pipeline stops at "PR opened, review requested".

## Unattended alternative
For CI / cron / the autonomous orchestrator, skip this interactive flow and run
the pipeline programmatically with the Claude Code seams:

```js
const { executePipeline } = require('./pipeline/execute');
const { makeClaudeCodeSeams } = require('./adapters/claude-code-spawner');
const { loadCapabilityMap } = require('./pipeline/capabilities');
const { evaluateDor } = require('./decision-engine/dor-gate');
// ...load the task, then:
await executePipeline({ taskId, task, capabilityMap: loadCapabilityMap('.ai-sdlc/capabilities.yaml'),
  evaluateDor, ...makeClaudeCodeSeams({ model: 'sonnet' }) });
```
