# Architecture

How `ai-sdlc` is put together, the patterns that make it testable, and how to
extend it. Read [`../VISION`-style intent in the README](../README.md#the-big-picture)
first; this doc is the engineering view.

## 1. Two planes

| Plane | What | Where |
|---|---|---|
| **Control plane** | The gates, pipeline, resolvers, attestation. Plain Node, fully unit-tested, deterministic. | `decision-engine/`, `pipeline/`, `quality-gate/`, `attestation/`, `workspace/`, `measurement/` |
| **Execution plane** | The agents, skills, Native Teams, tools that actually write/review code. | Claude Code |
| **Wiring** | Config-as-data mapping stages → providers, gates → thresholds, decisions → records. | `.ai-sdlc/*.yaml` |

The control plane never calls a model directly. It calls **seams**.

## 2. The seam pattern (why everything is testable)

Every side effect enters through an injected function, so the entire pipeline
runs in tests with no `claude`, `git`, or network:

| Seam | Signature | Real binding | Test binding |
|---|---|---|---|
| `spawn` | `async ({type, provider, prompt}) → payload` | `claude -p` (`adapters/claude-code-spawner`) or Task tool | fake returning canned JSON |
| `runner` | `(args,{cwd}) → {stdout}` | `git` | fake recording calls |
| `gh` | `(args) → {stdout}` | `gh` | fake returning a PR URL |
| `evaluateDor` | `(task, opts) → verdict` | `decision-engine/dor-gate` | the real one (pure) |
| `spawn` (design/plan/review) | same seam, different `type` | same | same |

`adapters/claude-code-spawner.js` provides `makeClaudeCodeSeams({exec, model})`
which returns `{spawn, runner, gh}` bound to real CLIs; `exec` itself is
injectable, so even the adapter is tested without spawning `claude`.

## 3. Data flow of one task

```
backlog/tasks/<ID>.md
   │  parseTask (decision-engine/backlog-task)
   ▼
evaluateDor (decision-engine/dor-gate) ──► admitted? ──no──► abort + reasons
   │ yes
   ▼
resolve stages (pipeline/capabilities) from .ai-sdlc/capabilities.yaml
   │   design panel · plan · implementer · review team (+ cross-harness check)
   ▼
buildTeamPlan (pipeline/team-plan) ──► native-team | parallel-task
   │
   ▼
executePipeline (pipeline/execute) drives Step 0–13 via the seams:
   design → plan → implement → promise-verify (advisory) → review → aggregate
        └─ CHANGES_REQUESTED → informed retry (fresh dev + feedback)
   → finalize → sign attestation (attestation/) → push + PR → cleanup
```

`pipeline/review-only.js` reuses the review half (`resolveReviewTeam` →
`buildReviewPrompts` → `aggregateVerdicts`) so `/ai-sdlc:review` is byte-identical
to the review inside `/ai-sdlc:execute`.

## 4. Module map

| Module | Responsibility | Key exports |
|---|---|---|
| `decision-engine/backlog-task.js` | parse task frontmatter + ACs | `parseTask`, `loadTaskFile` |
| `decision-engine/dor-gate.js` | 7-gate Definition-of-Ready | `evaluateDor`, `loadDorConfig` |
| `decision-engine/decisions.js` | ADR store (Decision records) | `newDecision`, `writeDecision`, `listDecisions` |
| `decision-engine/adr-import.js` | import existing ADRs | `importAdrs`, `parseAdr` |
| `decision-engine/adr-detect.js` | reverse-engineer ADRs from code | `detectTechDecisions`, `proposeArchitectureAdrs` |
| `pipeline/capabilities.js` | resolve stage → provider(s) | `resolvePlanStage`, `resolveImplementer`, `resolveDesignPanel`, `resolveReviewTeam` |
| `pipeline/team-plan.js` | Native-Teams vs parallel-task | `buildTeamPlan` |
| `pipeline/steps.js` | the pure Step primitives | `computeBranchName`, `setupWorktree`, `aggregateVerdicts`, … |
| `pipeline/execute.js` | orchestrate Step 0–13 | `executePipeline` |
| `pipeline/review-only.js` | standalone review stage | `runReview` |
| `quality-gate/promise-gate.js` | promise verdicts as advisory gate | `evaluatePromiseGate`, `formatReviewerContext` |
| `attestation/attestation.js` | ed25519 + Merkle v6, cross-harness verify | `signEnvelope`, `verifyEnvelope` |
| `workspace/loader.js` | multi-repo + cross-repo dep graph | `loadWorkspace`, `resolveTargetRepo`, `buildDepGraph` |
| `init/init.js` | brownfield onboarding | `init`, `scaffold`, `seedBacklog` |
| `adapters/claude-code-spawner.js` | bind seams to claude/git/gh | `makeClaudeCodeSeams` |
| `measurement/convergence-gate.js` | CI invariant guardrail | `runChecks` |
| `spec/validate-schemas.js` | schema + instance validation | `run`, `lintSchemas` |

Kept from the prior framework: `promise/` (verification), `hooks/`
(non-blocking lint/verify), `contexts/` (tech guides), `measurement/mt-executor.js`
(statistical A/B).

## 5. Declarative resources

All under `spec/schemas/` (JSON Schema draft 2020-12), instances in `.ai-sdlc/`:

| Kind | Purpose |
|---|---|
| `DorConfig` | DoR mode (enforce/warn), staleness, auto-pass rules |
| `CapabilityMap` | stage → provider bindings + routing |
| `QualityGate` | metric gates, `advisory → soft-mandatory → hard-mandatory` |
| `AutonomyPolicy` | permission tiers + guardrails |
| `AgentRole` | per-agent constraints (allowedLanguages, blockedPaths, requireTests) |
| `AdapterBinding` | tech choices (github/jira/…) |
| `Workspace` | multi-repo, one-folder registry |
| `Decision` | ADR record |
| `attestation-envelope-v6` | signed review proof |

`npm run validate-schemas` lints them and validates the shipped instances.

## 6. Extension points

**Add a stage or swap a provider** — edit `.ai-sdlc/capabilities.yaml`:
```yaml
implement:
  routing:
    - when: { languages: [rust] }
      provider: { type: agent, name: rust-pro, harness: claude }
```

**Add an architect/reviewer lens** — add to `design.routing` or `review.routing`
with a `when` condition (labels / languages / javaTestFiles). Reviewers must be
on a harness ≠ the implementer's (checked at resolve time and re-checked in the
attestation).

**Add a promise** — extend `promise/registry.yaml`; it flows into
`promise-gate` as an advisory signal automatically.

**Promote a gate** — change `enforcement` in `.ai-sdlc/quality-gate.yaml` from
`advisory` → `soft-mandatory` → `hard-mandatory`, but only after
`node measurement/mt-executor.js --promise` shows no quality regression.

**Add a resource kind** — drop a `*.schema.json` in `spec/schemas/`, register it
in `spec/validate-schemas.js` `KIND_TO_SCHEMA`.

Every extension is caught by two cheap gates: `npm run validate-schemas`
(structure) and `npm run convergence-gate` (the 6 invariants).

## 7. Design rationale (the non-obvious choices)

- **Decide before dispatch, not after.** The DoR gate is the whole leverage
  move. The framework's own R15 result (d=−1.37) killed the post-hoc retry gate;
  R16 informed retry (fresh dev + reviewer feedback) is the *only* correction
  loop, and it never touches the author mid-turn.
- **Promise verification is advisory, never blocking on the author.** It informs
  reviewers and (optionally) a merge-boundary gate. R5 (d=−0.64) is why.
- **Enforcement lives at boundaries, not in the turn.** Blocking a PR/merge is
  safe; blocking an agent's turn is not. Hard-mandatory gates and attestation
  gate the *pipeline*, not the author.
- **Reviewer independence is mechanical.** Cross-harness (`claude` implements,
  `codex` reviews) is enforced cryptographically, not by prompt.
- **Config-as-data over code.** Who fulfills a stage, how strict a gate is, which
  repos form a project — all YAML. The control-plane code rarely changes.

## 8. Testing model

- Unit tests cover every control-plane module with fake seams (`tests/unit/`).
- `examples/demo.js` is an executable integration of the full pipeline.
- `measurement/convergence-gate.js` is the CI invariant check.
- `measurement/mt-executor.js` is the statistical quality A/B (needs models +
  git; the only part not runnable purely offline).
