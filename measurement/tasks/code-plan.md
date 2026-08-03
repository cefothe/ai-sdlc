# Task: Code Plan Multi-Agent Review

## Purpose
Test multi-agent coordination quality via `/code:plan`.

## Prompt
Create an implementation plan for: "Add a promise ledger module that writes JSONL records to ~/.claude/promise-ledger/runs/. It needs: a LedgerWriter class with write(record), readAll(runId), and pruneOlderThan(days) methods. Use the existing FileSystem class from src/core/filesystem.js. Include full test coverage."

## Measurement Targets
- Compliance: Protocol adherence across multiple review agents
- Quality: Plan completeness, actionability, correctness
- Coordination: Do review agents produce non-redundant, coherent feedback?

## Variants
Runs 1-5: Above prompt. Runs 6-10: Substitute "trust manager module" for "promise ledger module" with equivalent complexity.
