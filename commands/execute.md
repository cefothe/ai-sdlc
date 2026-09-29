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
   `node -e "const R=process.env.CLAUDE_PLUGIN_ROOT;const{loadTaskFile}=require(R+'/decision-engine/backlog-task');const{loadDorConfig,evaluateDor}=require(R+'/decision-engine/dor-gate');const t=loadTaskFile(process.argv[1]);console.log(JSON.stringify(evaluateDor(t,{projectRoot:process.cwd(),config:loadDorConfig('.ai-sdlc/dor-config.yaml')})))" "backlog/tasks/$1"*.md`
   - The gate scripts live in the installed plugin (`${CLAUDE_PLUGIN_ROOT}`); the
     task file, `.ai-sdlc/` config, and `backlog/` stay project-relative. This gate
     is deterministic — run it, do not substitute a manual equivalent.
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

3b. **Load the architectural decisions (ADRs).** The design-time decisions are
   CONSTRAINTS on this build, not just an admission gate — carry them into the plan
   (step 4) and the implementer (step 5) so the code honors the recorded architecture
   instead of re-deriving or contradicting it. Read the project-scope decisions plus
   any the task references:
   ```bash
   node -e "const R=process.env.CLAUDE_PLUGIN_ROOT;const{loadTaskFile}=require(R+'/decision-engine/backlog-task');const{selectDecisionsForTask}=require(R+'/decision-engine/decisions');const t=loadTaskFile(process.argv[1]);for(const d of selectDecisionsForTask(process.cwd(),t)){const s=d.status||{};console.log(\`\${d.metadata.id} [\${s.lifecycle}/\${d.metadata.scope}] \${d.spec.summary}\${s.answeredOptionId?' (chosen: '+s.answeredOptionId+')':''}\`)}" "backlog/tasks/$1"*.md
   ```
   Pass these into the plan and implementer prompts as "Architectural decisions
   (ADRs) — CONSTRAINTS: honor them, cite the DEC id where you implement one, and if
   one blocks the task, STOP and flag it rather than silently diverging." Advisory
   input (the d=1.82 pre-action lever), never a gate.

4. **Plan (MANDATORY when a `plan` provider is set).** Read
   `.ai-sdlc/capabilities.yaml`. If `spec.stages.plan.provider` is present, you
   **must** invoke that provider now — e.g. run the `/code-plan` skill — and carry
   its freshly produced artifact into the implementer's context in step 5.
   - A pre-existing design/plan doc in the repo is **not** a substitute — you must
     run the configured `plan` provider for *this* task, not reuse an old artifact.
   - Do **not** fold planning into an inline "equivalent." If the provider cannot
     be invoked, **stop** and report why rather than proceeding to implement.
   - Only when `spec.stages.plan.provider` is absent/null may you skip this step.
   - **The plan must also emit a file-disjoint work breakdown** — the streams step 5
     parallelizes over: each stream owns a set of files/modules and names the
     integration seams it leaves for others. Streams must **not** share files (that's
     what makes parallel implementation conflict-free). A task too small or too coupled
     to split cleanly yields a single stream — that's fine.

4b. **Analyze (before implement).** Cross-artifact consistency audit — catch a
   plan that contradicts or under-covers the PRD *before* any code is written.
   Write the plan text to a temp file and run the deterministic gate:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/analyze-gate.js" "backlog/tasks/$1"*.md /tmp/$1-plan.md
   ```
   This is a **hard checkpoint** — run the script, do not substitute a manual
   equivalent. If it exits non-zero (`consistent: false`), **stop** and report the failing
   linkage/coverage checks — the artifacts disagree; fix the plan or the task/PRD
   before implementing. Then do the advisory pass: dispatch the `analyze` provider
   from `.ai-sdlc/capabilities.yaml` (`code-analyzer`) via the **Task tool** to
   check semantically — does the plan implement every PRD acceptance criterion?
   any contradictions, orphan steps, or scope creep vs the PRD non-goals? Surface
   its findings; act on `ac-coverage-gap` advisories before proceeding.

4c. **Acquire structured context (cxpak) — REQUIRED before implementing.** Get a
   **token-budgeted** structural pack and feed it into the implementer's prompt —
   the measured **d=1.82** pre-action lever (R7/R8), the whole reason the framework
   decides *before* dispatch. Do **not** let the implementer explore blind. Run the
   budget-honoring **CLI**:
   ```bash
   cxpak overview --tokens 6k
   ```
   It returns a few-KB summary (architecture, module map, conventions). Carry that
   output into the implementer's prompt in step 5 as its **structured context**.
   - **Do NOT use the `cxpak_context` MCP tool (op `context`/`briefing`) for this
     pack.** In cxpak 3.x that op **ignores the token budget** and returns the entire
     repo index (hundreds of KB–MBs) — it overflows the tool-result cap and yields
     nothing usable (verified: `maxTokens:6000` → ~420 KB). The CLI `overview` honors
     `--tokens`; the MCP `cxpak_context` op does not. (The other MCP ops —
     `cxpak_graph`, `cxpak_insight`, `cxpak_review` — are fine for targeted lookups.)
   - If `cxpak` isn't on PATH, **say so explicitly** and proceed with the task +
     plan only — degraded, not blocked.

5. **Implement — parallel when the plan decomposes.** If the plan (step 4) yields
   **≥2 file-disjoint work streams**, implement them **in parallel via Native Teams**;
   otherwise dispatch a single implementer. Every implementer — parallel or single —
   gets the **ADR constraints** (step 3b), the plan, and **structured context** (4c).

   **Parallel path (preferred for a decomposable task):**
   - `TeamCreate { name: ai-sdlc-implement-$1 }`; `parallel-worker` owns the isolation
     + merge discipline.
   - `Task` one `implement` agent per stream (routed by language), each told the
     **exact file set it owns**. Streams MUST be file-disjoint — **file-level isolation
     inside the single Pattern-C worktree** `.worktrees/$1/`; never worktree-per-stream,
     never overlapping files.
   - Give each worker a **targeted** context slice, not just the global overview:
     `cxpak_graph` op `blast_radius`/`trace` on its owned files (degrade to the step-4c
     overview if cxpak is absent), plus its stream's plan section and the ADR constraints.
   - Collect each stream's `{ filesChanged, verifications, summary }` from its JSONL
     inbox; `TeamDelete`. A stream that touched a file it did not own is a conflict —
     **stop and reconcile**, don't merge over it.
   - **Integrate serially:** wire the shared seams the streams left open, then run the
     build + full test suite **once over the integrated tree** — a green per-stream
     worker does not prove the whole compiles or that the seams line up.

   **Single path:** dispatch one `implement` agent with the same inputs (task contract +
   plan + ADRs + cxpak context).

   Each implementer commits its work and returns `{ commitSha, filesChanged,
   verifications, summary }`.

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
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/dod-gate.js" --config .ai-sdlc/dod-config.yaml \
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
