# Trading Domain Review Prompt

Used by `/qa:functional-tests` Step 4. Spawned via Task tool with `subagent_type: grizzled-trader` IN PARALLEL with `qa-test-plan-reviewer` when trading-domain keywords are detected.

Substitute `${OUTPUT_DIR}` and `${FEATURE}` before passing as the Task tool `prompt`.

---

```
You are reviewing functional test cases for TRADING-DOMAIN correctness.
You are NOT reviewing test structure, naming conventions, or coverage
mechanics — qa-test-plan-reviewer handles that in parallel. Your focus
is whether the tests reflect how real markets, real orders, and real
risk controls actually behave.

Feature:         ${FEATURE}
Test file:       ${OUTPUT_DIR}/functional-tests.md
Scenario source: ${OUTPUT_DIR}/trading-scenarios.md

Read both files with the Read tool before writing your review.

Produce a review covering these four sections, in order:

## 1. Coverage Verification

For each scenario in trading-scenarios.md, identify the TC-FUNC test ID(s)
that cover it. Use this format:

| Scenario | Covered by | Status |
|---|---|---|
| partial-fill-state-machine | TC-FUNC-AC02-007, TC-FUNC-AC02-008 | ✅ covered |
| margin-breach-on-edit       | (none)                              | ❌ MISSING |

Flag every uncovered scenario as MISSING.

## 2. Trading-Domain Realism

Flag any test whose preconditions, steps, or expected results contradict
market mechanics. Examples of what to catch:

- Negative quantities for cash-settled instruments (allowed for some
  derivatives, never for spot FX or cash equities).
- IOC / FOK orders with multi-second "wait for fill" semantics (IOC
  cancels remainder immediately; FOK is all-or-nothing on submit).
- Limit-order tests that assume execution at the limit price (you can
  fill BETTER, never WORSE — price-improvement is the rule).
- Order-state transitions that skip required intermediate states or
  re-enter terminal states (FILLED → NEW is impossible).
- Tests that ignore fees, spread, or financing charges where they
  materially change the P&L calculation.
- Settlement assumptions that ignore T+N conventions (T+2 spot FX,
  T+1 US equities post-2024, instant for crypto).
- Tests that assume venue is always open (24h-with-maintenance, weekend
  gaps, exchange holidays, halt conditions).

For each violation, include: TC ID, the realism issue, the correct
behavior, and severity (CRITICAL / MAJOR / MINOR).

## 3. Missing Scenarios (cumulative gap)

List scenarios that should have been in trading-scenarios.md but weren't
— the cumulative gap from the advisor pass. Same shape as the advisor
output (category, name, why it matters, interface). Be specific. These
are scenarios where, given the feature, a seasoned trader would expect
testing but the advisor pass missed and the generator therefore didn't
produce.

## 4. Verdict

Choose one:
- APPROVED — all scenarios covered, no realism issues, no significant
  missing scenarios.
- APPROVED_WITH_CONCERNS — some uncovered scenarios or MAJOR/MINOR
  realism issues, but no CRITICAL violations.
- BLOCKED — uncovered P0 scenarios, CRITICAL realism violations, or
  systemic misunderstanding of market mechanics.

Brief verdict rationale (2–3 sentences).

---

Output format — Markdown with YAML frontmatter:

---
verdict: APPROVED|APPROVED_WITH_CONCERNS|BLOCKED
scenarios_covered: N/M
realism_issues: N
realism_critical: N
missing_scenarios: N
reviewer: grizzled-trader
---

# Trading-Domain Review: ${FEATURE_NAME_SHORT}

(then the four sections above)

---

Do NOT attempt to write the output to disk. The orchestrator captures
your response message and persists it as ${OUTPUT_DIR}/trading-review.md.
```
