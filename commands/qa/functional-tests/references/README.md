# Prompt templates for `/qa:functional-tests`

Templates consumed by the orchestrator at `~/.claude/commands/qa/functional-tests.md`.

| Template | Used by | When |
|---|---|---|
| `trading-scenarios-prompt.md` | `grizzled-trader` (advisor pass) | Step 1.7 — only when trading domain detected. Produces `${OUTPUT_DIR}/trading-scenarios.md`. |
| `trading-review-prompt.md` | `grizzled-trader` (parallel reviewer) | Step 4 — only when trading domain detected. Produces `${OUTPUT_DIR}/trading-review.md`. |

The orchestrator reads the template, substitutes `${FEATURE}` / `${OUTPUT_DIR}` placeholders, and inlines the result into the Task tool's `prompt` parameter. `grizzled-trader` itself stays Read-only — the orchestrator captures the Task result message and writes it to disk.

Mirrors the pattern in `~/.claude/commands/qa/automate-functional-tests/references/`.
