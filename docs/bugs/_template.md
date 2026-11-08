---
status: draft            # draft | confirmed — a human confirms the triage (DoR gate 10 blocks draft)
bugId: ''                # kebab slug; the task's specRef.featureId
severity: ''             # critical | major | minor | trivial
source: ''               # where it was reported: issue URL, incident id, support ticket, test run
relatedPrd: ''           # docs/prd/<slug>.md of the feature this regresses, if any
relatedAdrs: []          # DEC-NNNN the fix must honor, if any
---

# Bug: <one-line symptom>

> Canonical structure — every `##` section is REQUIRED and enforced by
> `bug-gate.js`. This report is handed verbatim to the planner, the test author,
> the implementer and the reviewers. The Reproduction section is the RED oracle:
> the test author turns it into a failing test before any fix is written.

## Summary
<What is broken, for whom, and since when. One or two sentences.>

## Environment
<Version / commit, environment (prod/staging/local), platform, configuration, data conditions.>

## Steps to reproduce
1. <first step>
2. <second step>

## Expected behavior
<What should happen — cite the PRD acceptance criterion or contract it violates, if one exists.>

## Actual behavior
<What happens instead: error text, wrong value, log excerpt, screenshot reference.>

## Impact
<Who/how many are affected, data or money at risk, workaround available or not. Justifies the severity.>

## Reproduction
<The failing test that proves the bug: test file path, the assertion, and the exact command that runs it, e.g. `npx jest tests/unit/orders/cancel.test.js -t "rejects double cancel"`. RED before the fix, GREEN after.>

## Suspected cause
<Where the defect likely lives (files/functions) and why — or "Unknown" with what was ruled out. The implementer fixes the root cause, not the symptom.>
