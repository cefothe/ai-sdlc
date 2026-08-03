# CLAUDE.md

## Overview

AI SDLC framework on Claude Code: Promise Theory verification, cxpak context, deterministic hooks, specialized agents.

## Build & Test

| Command | Scope |
|---|---|
| `npx jest tests/unit/promise/ tests/unit/measurement/ tests/integration/` | Full suite |
| `npx jest <path>` | Single file |
| Always use `test-runner` subagent | All test execution |

## Code Standards

| Rule ID | Constraint |
|---|---|
| complete-output | Zero TODO/FIXME/HACK markers |
| no-placeholders | No stub implementations |
| error-handling | All failure paths: try/catch or .catch() |
| tests-with-code | Tests written alongside implementation |
| no-dead-code | No commented-out blocks (3+ consecutive //) |
| resource-cleanup | .close(), finally, cleanup in all paths |
| implementation-depth | Substantial code, not prose |
| output-completeness | >500 chars output |
| test-assertion-deserialize | Java test files (unit `*Test.java` / IT `*IT.java` / **SIT `*SIT.java`** / `src/test/`, `src/sit/`, `tests/`): `response.as(Dto.class)` / `asList(Dto.class)` for assertions — no `response.body()`, `JsonNode`, `JsonPath`, `JSONObject`, `WebSocketResponse.getField` in assertion context. Carve-outs (Allure/logger attachments, `response.raw().headers()`, 204/304 status-only): resolved by `qa-code-reviewer` reviewer dispatch, not by this regex. From PR #32 integration; scope extended to unit + IT + SIT + e2e per tradu-georgi-ivanov 2026-06-08 review. |

## Output Rules

Token compounding: every unnecessary output token becomes input context on next turn.

| Rule | Detail |
|---|---|
| no-preambles | Never start with "Let me", "I'll", "Here's what" |
| no-summaries | No trailing recaps unless asked |
| no-narration | Execute silently between tool calls |
| code-changes | List files + describe changes, no prose wrapping |
| errors | file:line + message only |
| status | One line |

## Context Acquisition (REQUIRED)

Before implementing any change, call `cxpak_auto_context` with a one-line task description. This provides token-budgeted structural context (architecture, conventions, relevant files, blast radius). Do not skip this step — R7 proved d=1.82 quality improvement from structured input context vs working blind.

If `cxpak_auto_context` is unavailable, fall back to `cxpak_overview` + `cxpak_trace` for the relevant symbol/module.

## Architecture

Three pillars:

| Pillar | Location | Function |
|---|---|---|
| Promise Theory | `promise/` | Observer verifies post-output as telemetry; trust via EMA; on broken findings, `findings-interpreter.js` dispatches a reviewer subagent (R16) that emits structured `{action, feedback}` JSON — informed retry, not clean-prompt resampling. R15 (n=30) measured clean-prompt retry at d=-1.37 quality regression; R16 architecture replaces it. R5 still rules out raw feedback injection. |
| cxpak MCP | external | Token-budgeted context: overview, trace, diff, auto_context — **must be called before implementation** |
| Hooks | `hooks/` | PostToolUse lint, Stop verify, PreToolUse build hygiene (100% **observation** coverage; non-blocking by design — R5 proved feedback injection harmful) |

Measurement framework (`measurement/`) validates changes via Wilcoxon signed-rank on 5-task battery.

## Agent Promise Model

Agents declare promises voluntarily. Observer assesses independently. Agent never sees assessment.

Standing promises: see `promise/registry.yaml` (19 promises, version 2.3 — 18 base + `test-assertion-deserialize` from PR #32 integration).

When the framework detects broken findings on a turn that touched Java test files — unit (`src/test/**/*.java`, `*Test.java`, `*Tests.java`), integration (`*IT.java`), system integration (`src/sit/**/*.java`, `*SIT.java`), or under `tests/` — `findings-interpreter.js` routes the reviewer dispatch to the `qa-code-reviewer` agent (rather than the generic `review-deterministic-findings` skill). That agent owns the carve-out logic for Allure diagnostics, `logger.*` calls, header checks via `response.raw().headers()`, and 204/304 statusCode-only assertions — single source of truth for test-code conventions.

## Agent Dispatch

| Scale | Method |
|---|---|
| 1-2 agents | Task tool, parallel calls in one message |
| 3+ agents | Native Teams (TeamCreate → Task → JSONL → TeamDelete) |

Proactive subagents: `file-analyzer` (>1000 lines), `code-analyzer` (multi-file), `test-runner` (all tests).

## Info Sources

Priority: CLAUDE.md → README.md → docs/ → package files. If insufficient: ask user.

## Philosophy

Skeptical, concise, no flattery. No partial implementations, simplifications, code duplication, dead code, cheater tests, over-engineering, mixed concerns, resource leaks.

## Git

Clean commit messages. No Claude footer. No co-authored-by.

## Emergency

| Situation | Action |
|---|---|
| Context overflow (90%+) | Spawn fresh agent with summary |
| Build/test failure | Stop, check docs, fix, verify |
| Uncertain approach | Check docs, then ask user |
