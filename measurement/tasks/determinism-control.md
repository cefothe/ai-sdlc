# Task: Determinism Control

## Purpose
Identical prompt every run to directly measure output variance.

## Prompt
Write a pure function `computeTrustScore(history)` in `src/promise/trust-score.js` where:
- `history` is an array of `{ observation: number, confidence_weight: number }` objects
- Returns the trust score using exponential moving average with decay_factor 0.85
- Starting trust is 0.5
- Include comprehensive tests in `tests/unit/promise/trust-score.test.js`

Do not use any external dependencies. Pure JavaScript only.

## Measurement Targets
- Determinism: Output similarity across 10 identical runs (Jaccard similarity, diff line count)

## Variants
None. Identical every run. This IS the control.
