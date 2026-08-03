# Getting started

A hands-on walkthrough: see the pipeline run, adopt a repo, write a task, and
dispatch it. Everything here is runnable.

## 0. Install

```bash
npm install
node -v          # requires Node 22+
```

## 1. See the whole pipeline in 5 seconds (no claude/git needed)

The demo drives one task through **all of Step 0–13** with fake seams, so you can
see the shape before wiring anything up:

```bash
npm run demo
```

```
=== ai-sdlc pipeline demo ===
admitted        : true
branch          : ai-sdlc/aisdlc-42-feat-idempotent-payment-capture
design panel    : architect-review, backend-architect, security-auditor
  security lens? : true                    ← "payment" label front-loads security
plan provider   : code-plan
implementer     : claude
review team     : code-reviewer, test-automator, security-auditor
  native team?   : true (native-team)      ← 3 reviewers → Native Team
review decision : APPROVED
finalized ->    : AISDLC-42 - feat.md       ← moved to backlog/completed/
PR opened       : https://github.com/org/api/pull/7
cleanup ran     : true
OK              : true
```

Read [`examples/demo.js`](../examples/demo.js) — it's the same `executePipeline`
you'd run for real, just with fake `spawn`/`runner`/`gh` seams.

## 2. Adopt a project (brownfield)

`init` is non-destructive — it never edits your source.

```bash
cd /path/to/your/existing/repo
node /path/to/ai-sdlc/init/init.js .
```

It will:
- scaffold `.ai-sdlc/` config (only files that don't exist yet),
- cxpak-index the code,
- seed `backlog/tasks/` from `TODO`/`FIXME` markers and open GitHub issues
  (as `dispatchable:false` tasks — they must pass DoR triage first),
- **bootstrap ADRs** (next step),
- write `.ai-sdlc/triage-report.json`.

## 3. Review the bootstrapped decision log

Brownfield adoption imports your existing ADRs and reverse-engineers the ones
nobody wrote down:

```bash
node /path/to/ai-sdlc/decision-engine/decisions.js list
```

```
DEC-0001  [answered]  Use PostgreSQL for persistence     ← imported from docs/adr/
DEC-0002  [proposed]  Runtime: Node.js                   ← reverse-engineered (evidence: package.json)
DEC-0003  [proposed]  Web framework: express
DEC-0004  [proposed]  Datastore: PostgreSQL
```

`proposed` decisions are **not** owned yet — the architect panel + you ratify
them. To confirm one, record the choice:

```bash
node decision-engine/decisions.js new \
  --summary "Confirm Node.js runtime" --options confirm:kept,reconsider:migrate
```

## 4. Write a task (the contract)

Create `backlog/tasks/AISDLC-100 - feat-add-logout.md`:

```markdown
---
id: AISDLC-100
title: 'feat: add logout endpoint'
status: To Do
dispatchable: true
labels: [auth]
references:
  - docs/prd/auth.md          # must exist — the DoR gate checks it
---
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 POST /logout invalidates the session and returns 204
- [ ] #2 a logged-out token is rejected on the next request
<!-- AC:END -->
```

## 5. Check Definition-of-Ready

The gate refuses tasks that aren't actually decided:

```bash
node -e "const{loadTaskFile}=require('./decision-engine/backlog-task');\
const{loadDorConfig,evaluateDor}=require('./decision-engine/dor-gate');\
const t=loadTaskFile('backlog/tasks/AISDLC-100 - feat-add-logout.md');\
console.log(JSON.stringify(evaluateDor(t,{projectRoot:process.cwd(),\
config:loadDorConfig('.ai-sdlc/dor-config.yaml')}),null,2))"
```

- If `docs/prd/auth.md` is missing → gate 3 **fails** (`unresolved references`)
  and the task is not admitted. Create the PRD (see
  [`docs/prd/_template.md`](prd/_template.md)) and re-run.
- Gates marked `needs-stage-b` (scope-bounded? done-state describable?) are
  judged by the reviewer — you resolve those before dispatch.

## 6. Dispatch the task

**Interactive** (inside a Claude Code session):

```
/ai-sdlc:execute AISDLC-100
```

Claude runs the deterministic steps and dispatches agents via the Task tool
(Native Teams for the review stage), then opens the PR. You merge.

**Unattended** (CI / cron) — bind the seams to real tools:

```js
const { executePipeline } = require('./pipeline/execute');
const { makeClaudeCodeSeams } = require('./adapters/claude-code-spawner');
const { loadCapabilityMap } = require('./pipeline/capabilities');
const { evaluateDor } = require('./decision-engine/dor-gate');
const { loadTaskFile } = require('./decision-engine/backlog-task');

await executePipeline({
  taskId: 'AISDLC-100',
  task: loadTaskFile('backlog/tasks/AISDLC-100 - feat-add-logout.md'),
  taskFilePath: 'backlog/tasks/AISDLC-100 - feat-add-logout.md',
  completedDir: 'backlog/completed',
  capabilityMap: loadCapabilityMap('.ai-sdlc/capabilities.yaml'),
  taskContext: { labels: ['auth'], files: ['src/auth/logout.js'] },
  evaluateDor,
  ...makeClaudeCodeSeams({ model: 'sonnet' }),
});
```

## 7. Review a branch on its own

To run just the cross-harness review team on the current branch:

```
/ai-sdlc:review main
```

## 8. Keep it healthy

```bash
npm run validate-schemas     # config + schema integrity
npm run convergence-gate     # the 6 architecture invariants
npx jest tests/unit          # unit suite
```

---

Next: [`docs/architecture.md`](architecture.md) for how it all fits together and
how to extend it (add a stage, an agent, a promise, a gate).
