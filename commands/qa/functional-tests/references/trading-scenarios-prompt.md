# Trading Scenario Advisor Prompt

Used by `/qa:functional-tests` Step 1.7. Spawned via Task tool with `subagent_type: grizzled-trader` when trading-domain keywords are detected in the user story.

Substitute `${FEATURE}` with the user story text before passing as the Task tool `prompt`.

---

```
You are advising a QA team that is about to write functional test cases
for the feature below. Your job is NOT to write tests — your job is to
list trading-domain scenarios and edge cases the QA team must cover.

Feature:
${FEATURE}

For each scenario, provide:
1. Category — one of:
     order-lifecycle | market-microstructure | risk-limits |
     operational-edges | regulatory-settlement | fail-safe
2. Scenario name (≤6 words, kebab-case slug)
3. Why it matters — the non-obvious failure mode. What breaks in
   production if this isn't tested? Cite a real-world precedent if one
   comes to mind (Knight Capital, flash crash, settlement-fail cascade,
   etc.). One or two sentences.
4. Likely interface(s) — any of: UI | REST | FIX | WebSocket | Integration

Focus on scenarios that 40 years of trading experience tells you WILL
bite. Prioritize non-obvious edges over textbook happy/error paths —
the QA team will cover the obvious cases anyway. Aim for 6–15 scenarios
across at least 3 categories. Quality over quantity.

Output format — Markdown only, with YAML frontmatter:

---
total_scenarios: N
categories: [order-lifecycle, ...]
---

# Trading-Domain Scenarios

## order-lifecycle

### partial-fill-state-machine
**Why it matters**: An order can transition NEW → PARTIALLY_FILLED →
FILLED → SETTLED — or NEW → PARTIALLY_FILLED → CANCELLED with residual
quantity. Tests often check only the terminal state and miss intermediate
inconsistencies (e.g., cumulative filled quantity > order quantity due
to race conditions on execution reports).
**Interface**: FIX, WebSocket, Integration

### (next scenario...)

## market-microstructure

(scenarios...)

(... continue for each category that applies)

---

Do NOT attempt to write the output to disk. The orchestrator captures
your response message and persists it. Just emit the Markdown.
```
