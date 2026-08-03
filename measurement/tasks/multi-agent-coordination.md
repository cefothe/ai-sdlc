# Task: Multi-Agent Parallel Coordination

## Purpose
Test 3+ agents working in parallel on related files.

## Prompt
Implement these three modules in parallel:
1. Agent A (backend-architect): Design the data model for promise ledger records in `src/promise/models/ledger-record.js`
2. Agent B (javascript-pro): Implement the JSONL serialization layer in `src/promise/serializer.js` that uses the model from Agent A
3. Agent C (test-automator): Write integration tests in `tests/integration/promise/ledger-integration.test.js` covering both modules

All three agents should work simultaneously. Agent B depends on Agent A's output. Agent C depends on both.

## Measurement Targets
- Coordination: Conflict rate, time to completion, merge failures
- Resilience: Does dependent agent handle missing upstream output gracefully?

## Variants
Runs 1-10: Same prompt (coordination variance is the measurement).
