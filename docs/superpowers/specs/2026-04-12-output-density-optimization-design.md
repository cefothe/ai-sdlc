# Output Density Optimization — Design Spec

**Created**: 2026-04-12T10:20:16Z
**Status**: Approved
**Branch**: promise-theory-v2

## Problem

Claude Code agents produce verbose output in two modes:

1. **Interactive sessions** — narration between tool calls ("Let me check...", "I see the issue..."), preambles, trailing summaries. This is where 40-70% of output tokens are wasted (per "caveman Claude" reports).

2. **Single-shot outputs** (`claude -p`) — prose wrapping around code. Measured at 11.3% of output on our 5-task battery, with 2.3% of prose being filler.

Current CLAUDE.md says "be concise" — advisory, ~70% compliance. No enforcement, no measurement.

Output tokens cost 5x input tokens on Claude API. Verbose output also compounds: every unnecessary token becomes input context on subsequent turns (3-5x multiplier over a conversation).

## Design Decision

**Templates: Rejected.** Evaluation found:

- Battery outputs already 82.6% code, 2.3% filler — templates optimize an already-lean signal
- Format Tax (arXiv:2603.03616) — strict format constraints degrade reasoning quality during generation
- Task type classification unsolved — no clean way to determine which template applies
- Brittleness — edge cases (config bugs, empty reviews) trigger false-positive gate failures
- Existing agent files already define informal output expectations

**Approved: CLAUDE.md rules + filler_ratio diagnostic metric.**

## Components

### 1. CLAUDE.md Output Rules

Add to the existing CLAUDE.md `## Code Standards` or new `## Output Rules` section. These are **exclusion rules** (what to omit), not style constraints (how to write). Exclusions are safer against Format Tax than structural templates.

Rules:

```
- No preambles: don't start responses with "Let me", "I'll", "I'm going to", "Here's what"
- No trailing summaries: don't recap what was just done unless the user asks
- No narration between tool calls: execute silently unless interpreting complex results
- Code changes: list files changed and describe what changed. No prose wrapping.
- Errors: file:line + message. No extra explanation unless the error is non-obvious.
- Status updates: one line.
```

**Why exclusion rules, not templates**: The Format Tax paper shows format constraints during generation degrade quality. Exclusion rules ("don't do X") leave the model free to reason and structure output naturally. Template rules ("must have sections A, B, C") force cognitive resource allocation to format compliance.

**Expected compliance**: ~70% (same as other CLAUDE.md rules). The remaining 30% is handled by awareness — engineers reading verbose output will know it violates the rules.

**No hook enforcement for these rules**. Mid-conversation verbosity has already consumed the tokens by the time stop-verify runs. Retrying doesn't un-spend them. The lever is generation-time shaping, not post-hoc verification.

### 2. filler_ratio Diagnostic Metric

Add to `measurement/metrics-collector.js`. Computed on every output, logged to metrics.jsonl. Not gated — diagnostic only.

**Implementation**:

```javascript
computeFillerRatio(text) {
  const lines = text.split('\n');
  let inCode = false;
  let proseLines = 0;
  let fillerLines = 0;

  const FILLER_PATTERNS = [
    /^(Let me|I'll|I'm going to|I will|I can|I've|I would|I should)/i,
    /^(Here's|Here are|Here is|As you can see|As mentioned|As noted)/i,
    /^(In summary|To summarize|Overall|In conclusion|That covers)/i,
    /^(Great|Perfect|Excellent|Certainly|Sure|Of course|Absolutely)/i,
    /^(Now,? let's|First,? let's|Next,? let's|Finally,? let's)/i,
    /(Hope this helps|Let me know if|Feel free to|Don't hesitate)/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode || !trimmed || /^#{1,6}\s/.test(trimmed)) continue;
    proseLines++;
    for (const pattern of FILLER_PATTERNS) {
      if (pattern.test(trimmed)) { fillerLines++; break; }
    }
  }

  return proseLines > 0 ? fillerLines / proseLines : 0;
}
```

**Code-aware**: Strips code blocks (``` delimited) before analysis. Only measures prose density. This prevents codegen outputs (93% code) from always passing and review outputs (73% prose) from always failing.

**Tracked fields in metrics.jsonl**:

```json
{
  "filler_ratio": 0.023,
  "prose_line_count": 45,
  "filler_line_count": 1,
  "code_line_ratio": 0.826
}
```

### What This Is NOT

- **Not a standing promise** — no gate, no retry. The 2.3% baseline means a density gate would rarely trigger on the battery, adding overhead without measurable quality improvement.
- **Not a template system** — no per-task-type output schemas. No task classification.
- **Not mid-conversation enforcement** — no PostToolUse hook checking verbosity. R5 proved feedback injection harmful (-12% quality).

## Measurement Plan

### Phase 1: Baseline (no new measurement run needed)

We have 149 records (74 baseline + 75 treatment) from the gate isolation test. Retroactively compute filler_ratio on all raw outputs to establish the baseline distribution.

### Phase 2: CLAUDE.md A/B Test

Run the comparison framework:
```
node measurement/compare.js \
  --baseline promise-theory-v2 \
  --treatment output-density-branch \
  --runs 15 --model sonnet \
  --promise-treatment-only
```

Where `output-density-branch` has the updated CLAUDE.md rules. Measure:
- Quality score (must not decrease — Wilcoxon)
- Token usage (expect decrease from terser output)
- filler_ratio (expect decrease)

### Phase 3: Interactive Session Analysis (future)

Collect real Claude Code session logs. Compute filler_ratio on full transcripts (not just final output). Compare sessions using old vs new CLAUDE.md. This is the primary value target but requires session data collection infrastructure we don't have yet.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CLAUDE.md rules degrade quality (Format Tax) | Low — exclusion rules, not structural constraints | High | A/B test before adopting |
| Filler patterns miss novel filler | Medium — regex is heuristic | Low — diagnostic only, iterate patterns | Review false negatives quarterly |
| Interactive gains unmeasurable on battery | High — battery uses `claude -p` | Medium | Phase 3 addresses this |
| 70% compliance insufficient | Medium | Low — any reduction is net positive | Track compliance, iterate rules |

## Files Changed

| File | Change |
|---|---|
| `CLAUDE.md` | Add output rules section |
| `measurement/metrics-collector.js` | Add `computeFillerRatio()` method, include in output analysis |
| `tests/unit/measurement/metrics-collector.test.js` | Tests for filler ratio computation |

## Research References

- **Format Tax** (arXiv:2603.03616) — format constraints degrade reasoning quality
- **Structure Snowballing** (arXiv:2604.06066) — strict formatting triggers cognitive load failures
- **YapBench** (arXiv:2601.00624) — order-of-magnitude verbosity variance across 76 LLMs
- **WISE** (arXiv:2604.02040) — 5x reasoning token reduction via self-distillation
- **KANT** (arXiv:2508.03340) — 85% latency reduction via knowledge anchors
- **Our R5 experiment** — feedback injection degrades quality by 12%
- **Our R6 gate isolation test** — post-hoc verification +8.4% quality, -15.5% tokens
- **Battery filler analysis** — 2.3% filler ratio on 75 treatment outputs (measured 2026-04-12)
