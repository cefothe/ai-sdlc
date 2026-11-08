---
description: Monthly review tuning — recurring reviewer findings become proposed CLAUDE.md lessons, noisy patterns tune REVIEW.md
argument-hint: (none)
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

# /ai-sdlc:lessons — learn from what reviewers keep flagging

"When a mistake is flagged twice, the correction goes into CLAUDE.md." Reviewer findings
are recorded per run in `.ai-sdlc/runs.jsonl`; this groups them by a normalized signature.

## Steps
1. `node "${CLAUDE_PLUGIN_ROOT}/measurement/review-lessons.js" report` → `docs/lessons/proposed.md`.
2. Walk the operator through the recurring findings with `AskUserQuestion`; record each
   verdict: `node "${CLAUDE_PLUGIN_ROOT}/measurement/review-lessons.js" rate "<signature>" useful|noise --by <name>`.
3. **Useful** → add a one-line rule to `CLAUDE.md` (or the relevant agent/skill rule —
   `rules/context-protocol.md` then `node scripts/sync-context-protocol.js`). CLAUDE.md is a
   HITL checkpoint, so the change stops for the operator's sign-off by design.
4. **Noise** (rated noise 3×) → tune `REVIEW.md`: add a `skip` pattern or downgrade the pass.
5. Then re-run the agent-config evals (`/ai-sdlc:evals`) — a lesson must not lower the pass rate.
