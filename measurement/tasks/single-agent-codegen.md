# Task: Single-Agent Code Generation

## Purpose
Test agent compliance with protocols and output quality in a controlled single-agent scenario.

## Prompt
You are working in a Node.js project. Write a function `parsePromiseHeader(markdownContent)` that:
1. Extracts YAML frontmatter promise declarations from an agent markdown file
2. Returns a structured object with `promises_offered`, `promises_accepted`, and `verification` fields
3. Handles malformed YAML gracefully
4. Includes input validation
5. Write tests alongside the implementation

The function should be in `src/utils/promise-parser.js` with tests in `tests/unit/utils/promise-parser.test.js`.

## Measurement Targets
- Compliance: Does output reference CLAUDE.md/protocols? Does it follow first-time-right?
- Quality: Zero TODOs, error handling present, tests included
- Determinism: Same prompt every run for variance measurement

## Variants (runs 1-10)
Runs 1-10 use the same prompt (this doubles as determinism measurement for this task).
