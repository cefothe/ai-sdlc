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
   instead of re-deriving or contradicting it. Render the **relevant** decisions —
   task-referenced, foundational (not from a single feature's design), the task's own
   feature, and lexically related ones; unrelated project ADRs are listed by id only
   (injecting all ~100 project ADRs into every prompt cost ~10k tokens per dispatch):
   ```bash
   node -e "const R=process.env.CLAUDE_PLUGIN_ROOT;const{loadTaskFile}=require(R+'/decision-engine/backlog-task');const{partitionDecisionsForTask}=require(R+'/decision-engine/decisions');const{formatDecisionsContext}=require(R+'/pipeline/steps');const t=loadTaskFile(process.argv[1]);console.log(formatDecisionsContext(partitionDecisionsForTask(process.cwd(),t))||'(no ADRs)')" "backlog/tasks/$1"*.md
   ```
   Pass these into the plan and implementer prompts as "Architectural decisions
   (ADRs) — CONSTRAINTS: honor them, cite the DEC id where you implement one, and if
   one blocks the task, STOP and flag it rather than silently diverging." Advisory
   input (the d=1.82 pre-action lever), never a gate.

3c. **Load the specification (PRD + design doc).** The approved PRD (what/why) and
   design doc (how) are the contract this task builds against — DoR gates 8/9 proved
   they exist and are ratified; now their **content** must reach the planner, the
   implementer and the reviewers. Render them as a token-budgeted block (priority:
   ACs, scope, non-goals, flows, edge cases → data model, interfaces, data flow, test
   strategy; anything over budget is listed by name to open):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/decision-engine/spec-context.js" "$(ls backlog/tasks/$1*.md | head -1)"
   ```
   The block also carries the **system architecture slice** (from
   `docs/architecture/overview.md`): the components this task reaches, their contracts
   and data ownership, and every invariant — the implementer changes code in the owning
   component and connects through the declared contracts; reviewers flag any new
   cross-component coupling or invariant breach as **major**.
   Every agent also has the **ai-sdlc-context MCP tools** for what the slice did not
   predict: `architecture_lookup` (who owns a path, a component's contracts and
   invariants), `architecture_contracts`, `product_lookup`, `spec_lookup`,
   `decision_lookup`. Tell implementers and reviewers to use them before touching
   code outside their slice or calling another component — never guess ownership.
   Pass this block **verbatim** into the plan (step 4), every implementer / parallel
   worker (step 5) and every reviewer (step 6). If the feature has an **approved
   design doc, it is the design** — do not run a design panel to re-derive it; the
   plan implements it. If the block says no design doc exists, implement from the PRD
   + ADRs and say so in the report.

3d. **Pace — how much ceremony this change earns.** Ceremony follows blast radius,
   not habit (`.ai-sdlc/pace.yaml`, else the plugin default): paths classify fast /
   normal / slow, anything unclassified stays normal, anything a HITL checkpoint claims
   is **slow**, and a low/critical implementer trust tier raises the verdict one layer
   (trust never lowers it). Before code exists, evaluate the task's referenced paths:
   ```bash
   node -e "const R=process.env.CLAUDE_PLUGIN_ROOT;const{loadTaskFile}=require(R+'/decision-engine/backlog-task');const{evaluatePaceForRoot}=require(R+'/decision-engine/pace');const t=loadTaskFile(process.argv[1]);const f=[...(t.frontmatter.references||[])].filter(r=>typeof r==='string'&&!/^https?:/.test(r));console.log(JSON.stringify(evaluatePaceForRoot(process.cwd(),{files:f}),null,2))" "$(ls backlog/tasks/$1*.md | head -1)"
   ```
   `ceremony.designPanel: false` (fast) → no design panel. Re-run on the real diff after
   implementation (`node "${CLAUDE_PLUGIN_ROOT}/decision-engine/pace.js" --base main`):
   `ceremony.maxReviewers` caps the review team (0 = full team) and `draftPr: true`
   (slow) opens the PR as a draft.

4. **Plan (MANDATORY when a `plan` provider is set).** Read
   `.ai-sdlc/capabilities.yaml`. If `spec.stages.plan.provider` is present, you
   **must** invoke that provider now — e.g. run the `/code-plan` skill — and carry
   its freshly produced artifact into the implementer's context in step 5.
   - A pre-existing *plan* doc in the repo is **not** a substitute — you must run the
     configured `plan` provider for *this* task, not reuse an old artifact. The
     approved **design doc** is different: it is the plan provider's *input*. Give the
     provider the spec block (3c) and the ADRs (3b) and require that every PRD
     acceptance criterion maps to plan steps and the design's data model /
     interfaces / data flow are implemented as written.
   - Do **not** fold planning into an inline "equivalent." If the provider cannot
     be invoked, **stop** and report why rather than proceeding to implement.
   - Only when `spec.stages.plan.provider` is absent/null may you skip this step.
   - **Execution manifest (when `.ai-sdlc/flow.yaml` → `manifest.enabled`, the default).**
     Require the plan to embed one fenced ```json block `{"execution-manifest": [...]}`
     (slicr contract): each `local: true` entry is ONE region (one function body /
     contiguous edit, or one new file with `kind: "create"`) with an `accept` shell
     command that exits 0 only when that node is correctly done — a targeted test whose
     assertions come from the PRD acceptance criteria. Validate it:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/pipeline/manifest.js" <plan-file>
     ```
     `refused` (exit 1) → fix the plan; never fall back past a refusal. `none` → the
     single/parallel implementer path below.
   - **Commit the plan** as `docs/plans/$1.md` (plan text + manifest table) on the branch
     before implementing. When implementation departs from it, update the plan in the
     same commit — reviewers get "plan drift" (changed files the plan never names).
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
   **Monorepo:** cxpak keeps ONE index at the repo root; scope it to the subproject(s)
   the task touches instead of indexing per subproject —
   `cxpak overview --tokens 3k --workspace <subproject-path> .` for each touched
   subproject (split the budget, max 3). Cross-subproject wiring comes from the root
   `docs/architecture/overview.md`; each subproject may have its own
   `<subproject>/docs/architecture/overview.md` (both are in the spec block).
   Subprojects come from `.ai-sdlc/flow.yaml` `monorepo.projects`, else the workspace
   manifests (package.json workspaces, pnpm-workspace.yaml, go.work, Cargo, lerna).
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

5a. **Manifest path — RED oracle first (when step 4 produced manifest nodes).**
   1. **Test author.** Dispatch one agent to write the tests (and compiling stubs) that
      make every node's `accept` RED, derived from the PRD acceptance criteria, and
      commit them as the setup commit. It implements nothing. Record its `testFiles`.
   2. **RED check.** Run every node's `accept` (via cordon when `sandbox.mode: cordon`).
      One already GREEN cannot discriminate — mark it `already_satisfied` and report it.
   3. **Nodes, in order.** For each node, dispatch the implementer with ONLY that node's
      `change`, `files` and `accept` (+ the spec block, ADRs, test files). After it
      commits, YOU verify: the diff touches only `node.files`, never the test files, no
      dependency manifests under `forbid: new_deps` — then run the `accept`. GREEN →
      next node. Otherwise roll back to the node's start commit and retry with the exact
      failure (`nodeRetries`, default 2). A node that never goes GREEN **halts**: report
      it and take it over yourself, then continue.
   4. Implement the manifest's `local: false` entries with the normal implementer.
   The unattended pipeline does exactly this (`pipeline/node-executor.js`).

5. **Implement — parallel when the plan decomposes.** If there is no manifest and the plan (step 4) yields
   **≥2 file-disjoint work streams**, implement them **in parallel via Native Teams**;
   otherwise dispatch a single implementer. Every implementer — parallel or single —
   gets the **spec block** (step 3c), the **ADR constraints** (step 3b), the plan, and
   **structured context** (4c).

   **Parallel path (preferred for a decomposable task):**
   - `TeamCreate { name: ai-sdlc-implement-$1 }`; `parallel-worker` owns the isolation
     + merge discipline.
   - `Task` one `implement` agent per stream (routed by language), each told the
     **exact file set it owns**. Streams MUST be file-disjoint — **file-level isolation
     inside the single Pattern-C worktree** `.worktrees/$1/`; never worktree-per-stream,
     never overlapping files.
   - Give each worker a **targeted** context slice, not just the global overview:
     `cxpak_graph` op `blast_radius`/`trace` on its owned files (degrade to the step-4c
     overview if cxpak is absent), plus its stream's plan section, the spec block (3c)
     and the ADR constraints.
   - Collect each stream's `{ filesChanged, verifications, summary }` from its JSONL
     inbox; `TeamDelete`. A stream that touched a file it did not own is a conflict —
     **stop and reconcile**, don't merge over it.
   - **Integrate serially:** wire the shared seams the streams left open, then run the
     build + full test suite **once over the integrated tree** — a green per-stream
     worker does not prove the whole compiles or that the seams line up.

   **Single path:** dispatch one `implement` agent with the same inputs (task contract +
   spec block + plan + ADRs + cxpak context).

   Each implementer commits its work and returns `{ commitSha, filesChanged,
   verifications, summary }`.

5b. **Architecture conformance (deterministic, on the real diff).**
   ```bash
   (cd .worktrees/$1 && node "${CLAUDE_PLUGIN_ROOT}/decision-engine/architecture-conformance.js" --base main)
   ```
   Findings — files no component owns, imports that cross components without a declared
   contract, dependency-manifest changes — go to the **reviewers** (not back to the
   implementer) as major findings, and any major finding makes the change `slow` (draft
   PR, full team). The fix is either to move the code / go through an existing contract,
   or to update `docs/architecture/overview.md` in the same change.

6. **Review (Native Teams).** Read the team plan in
   `steps.capabilities.review.teamPlan`. When `useTeam` is true (3+ reviewers):
   - `TeamCreate { name: teamPlan.teamName }`
   - `Task` each teammate into the team — one per `teammates[]` entry, using its
     `agentType` (e.g. `code-reviewer`, `qa-code-reviewer`, `code-review-architect`)
     and running on a **different harness than the implementer**.
   - Each reviewer gets the real diff **and the spec block (3c)**, and reviews the diff
     against it: any PRD acceptance criterion not implemented, any divergence from the
     design's data model / interfaces / data flow, or scope creep into Non-goals is a
     **major** finding.
   - Each reviewer writes its verdict to its JSONL inbox; collect all of them.
   - Aggregate: APPROVED only if all approve and there are no critical/major
     findings.
   - `TeamDelete` the team.

   **Codex-harness reviewers** (`harness: codex`) do not run through the Task tool —
   dispatch each one through the bridge so it genuinely runs on Codex, **all in
   parallel** (one `Bash` call per reviewer with `run_in_background: true`, sent in a
   single message; wait for all completions — never one after another):
   ```bash
   printf '%s' "$REVIEW_PROMPT" | node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-dispatch.mjs" \
     --type reviewer --role <role> --name <name> --cwd .worktrees/$1 \
     --reasoning-effort <provider.reasoningEffort or high>
   ```
   Use the provider's `reasoningEffort` from capabilities.yaml (secondary lenses at
   `medium` finish much faster); default `high` when unset.

   When `useTeam` is false (1–2 reviewers), just dispatch parallel `Task` calls.
   Either way, feed each reviewer the diff plus the advisory promise-verification
   findings as read-only context. If CHANGES_REQUESTED, re-dispatch the
   implementer **with the reviewer feedback** (informed retry) up to the cap.

   The **design panel** (step 4) dispatches the same way — its own team plan is
   in `steps.capabilities.design.teamPlan`.

6b. **Validate (Definition-of-Done gate — HARD ENFORCED).** Before finalizing, run
   the DoD gate from the worktree against the base branch:
   ```bash
   (cd .worktrees/$1 && node "${CLAUDE_PLUGIN_ROOT}/decision-engine/dod-gate.js" \
     --config .ai-sdlc/dod-config.yaml --base main)
   ```
   It runs **every** check declared in dod-config (build, test, and any extra named
   check) **concurrently**, skips a check whose `paths:` scope no changed file
   touches, exports `AI_SDLC_BASE` / `AI_SDLC_CHANGED_FILES` so a project command can
   build/test only what changed, and scans changed files for incomplete-work markers.
   A `type: github-checks` check delegates to CI: (opt-in) pushes the branch, opens a
   **draft** PR, and waits for the PR's checks — run it with `run_in_background: true`
   and wait for completion rather than blocking the session. **If it exits non-zero (BLOCKED), STOP** — do NOT flip
   status to Done, do NOT open the PR. Route the failures back to the implementer as an
   informed retry and re-run until the gate passes. There is no override in enforce
   mode: a task with a red build or failing tests is not Done. (Objective gate — blocks
   the pipeline, not the author; consistent with R5, which only bars feeding *subjective*
   assessment to the author.)

6c. **HITL sign-off gate — ALWAYS stops for a human.** Before finalizing or pushing:
   ```bash
   (cd .worktrees/$1 && node "${CLAUDE_PLUGIN_ROOT}/decision-engine/hitl-gate.js" --base main)
   ```
   Exit 0 → nothing high-stakes fired. Exit 1 → fired checkpoints are already signed
   off. **Exit 2 → stop.** Show the human, with `AskUserQuestion`, each fired checkpoint
   (name, summary, why it fired) and the relevant diff. Only on their explicit approval,
   record it in their words:
   `git commit --allow-empty -m "HITL sign-off" -m "HITL-ACK: <checkpoint> <who + what they checked>"`
   and re-run the gate. Never infer approval, never write `HITL-ACK` without that
   answer, and never weaken `.ai-sdlc/checkpoints.yaml` to get past it (removing a
   checkpoint itself fires `checkpoint-removed`). If the human declines, stop.

6d. **Record the shipped capability.** For a feature task, append it to
   `docs/product/context.md` → Current capabilities (`- <title> — docs/prd/<slug>.md
   (shipped in <task>)`) and commit it on the branch so it rides this PR. The unattended
   pipeline does this automatically (`recordShippedCapability`).

7. **Finalize.** Verify the acceptance criteria, flip status → `Done`, move the
   task file to `backlog/completed/`, sign the attestation, and remove the
   sentinel.

8. **PR (human in the loop).** Push the branch and open the PR (`gh pr create`, with
   `--draft` when the post-implementation pace is slow). The PR body is the
   **validation table** (`pipeline/validation-report.js`): every gate passed or skipped,
   each acceptance criterion with its evidence, review counts, conformance, pace, cost and
   degraded seams — so the human reviewer reads evidence, not a one-liner. If
   the DoD `github-checks` gate already opened a **draft** PR for this branch, don't
   create a second one — `gh pr ready` it and add the reviewer (`gh pr edit --add-reviewer`).
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
