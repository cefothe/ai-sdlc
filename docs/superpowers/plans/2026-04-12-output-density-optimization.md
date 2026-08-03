# Output Density Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add output terseness rules to CLAUDE.md and a `filler_ratio` diagnostic metric to the measurement framework.

**Architecture:** Two changes. (1) CLAUDE.md gets an `## Output Rules` section with specific exclusion rules that shape generation-time verbosity. (2) MetricsCollector gets a `computeFillerRatio(text)` method that strips code blocks, counts filler patterns in prose, and returns a ratio. The ratio is logged to metrics.jsonl as a diagnostic — no gate, no standing promise.

**Tech Stack:** Node.js, Jest, existing measurement framework (`measurement/metrics-collector.js`)

**Spec:** `docs/superpowers/specs/2026-04-12-output-density-optimization-design.md`

---

### Task 1: Add `computeFillerRatio()` — Failing Tests

**Files:**
- Test: `tests/unit/measurement/metrics-collector.test.js`

- [ ] **Step 1: Write the failing tests for `computeFillerRatio`**

Add these tests inside the existing `describe('MetricsCollector')` block, after the `writeRecord` describe:

```javascript
describe('computeFillerRatio', () => {
  test('returns 0 for pure code output', () => {
    const output = '```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```';
    expect(collector.computeFillerRatio(output)).toBe(0);
  });

  test('returns 0 for output with no filler prose', () => {
    const output = 'Files changed: src/utils.js\nAdded add() function with error handling.\n```javascript\nfunction add(a, b) {\n  return a + b;\n}\n```';
    expect(collector.computeFillerRatio(output)).toBe(0);
  });

  test('detects preamble filler patterns', () => {
    const output = "Let me check the code for you.\nHere's what I found:\nThe function is broken.\n```javascript\nconst x = 1;\n```";
    const ratio = collector.computeFillerRatio(output);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  test('detects summary filler patterns', () => {
    const output = "Fixed the bug.\n```javascript\nconst x = 1;\n```\nIn summary, the fix applies a null check.\nHope this helps!";
    const ratio = collector.computeFillerRatio(output);
    expect(ratio).toBeGreaterThan(0);
  });

  test('ignores filler patterns inside code blocks', () => {
    const output = '```javascript\n// Let me check the code\nconst summary = "In summary, done";\n```\nThe fix is applied.';
    expect(collector.computeFillerRatio(output)).toBe(0);
  });

  test('skips markdown headers when counting prose', () => {
    const output = '## Changes\nFixed the bug.\n## Summary\nOne file changed.';
    expect(collector.computeFillerRatio(output)).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(collector.computeFillerRatio('')).toBe(0);
  });

  test('returns 0 for code-only output with no prose', () => {
    const output = '```\nline1\nline2\n```';
    expect(collector.computeFillerRatio(output)).toBe(0);
  });

  test('handles multiple filler lines correctly', () => {
    const output = "Let me look into this.\nI'll check the files.\nCertainly, here are the results.\nThe bug is on line 5.";
    const ratio = collector.computeFillerRatio(output);
    expect(ratio).toBe(0.75);
  });

  test('throws for non-string input', () => {
    expect(() => collector.computeFillerRatio(42)).toThrow('text must be a string');
    expect(() => collector.computeFillerRatio(null)).toThrow('text must be a string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/measurement/metrics-collector.test.js --verbose`

Expected: 10 new tests FAIL with `collector.computeFillerRatio is not a function`

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/measurement/metrics-collector.test.js
git commit -m "test(metrics): add failing tests for computeFillerRatio"
```

---

### Task 2: Implement `computeFillerRatio()`

**Files:**
- Modify: `measurement/metrics-collector.js` (add method after `computeQualityScore`)

- [ ] **Step 1: Add the FILLER_PATTERNS constant and method**

Add this constant before the class definition (after the require statements, before `class MetricsCollector`):

```javascript
const FILLER_PATTERNS = [
  /^(Let me|I'll|I'm going to|I will|I can|I've|I would|I should)\b/i,
  /^(Here's|Here are|Here is|As you can see|As mentioned|As noted)\b/i,
  /^(In summary|To summarize|Overall|In conclusion|That covers)\b/i,
  /^(Great|Perfect|Excellent|Certainly|Sure|Of course|Absolutely)\b/i,
  /^(Now,? let's|First,? let's|Next,? let's|Finally,? let's)\b/i,
  /(Hope this helps|Let me know if|Feel free to|Don't hesitate)\b/i,
];
```

Add this method inside the `MetricsCollector` class, after `computeQualityScore`:

```javascript
computeFillerRatio(text) {
  if (typeof text !== 'string') {
    throw new Error('text must be a string');
  }
  if (!text.trim()) return 0;

  const lines = text.split('\n');
  let inCode = false;
  let proseLines = 0;
  let fillerLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode || !trimmed || /^#{1,6}\s/.test(trimmed)) continue;

    proseLines++;
    for (const pattern of FILLER_PATTERNS) {
      if (pattern.test(trimmed)) {
        fillerLines++;
        break;
      }
    }
  }

  return proseLines > 0 ? fillerLines / proseLines : 0;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx jest tests/unit/measurement/metrics-collector.test.js --verbose`

Expected: All tests PASS (existing 8 + new 10 = 18 total)

- [ ] **Step 3: Commit implementation**

```bash
git add measurement/metrics-collector.js
git commit -m "feat(metrics): add computeFillerRatio for output density tracking"
```

---

### Task 3: Integrate `filler_ratio` into `analyzeOutput()`

**Files:**
- Modify: `measurement/metrics-collector.js:12-30` (the `analyzeOutput` method)
- Test: `tests/unit/measurement/metrics-collector.test.js`

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('analyzeOutput')` block:

```javascript
test('includes filler_ratio in analysis', () => {
  const output = "Let me check this.\nThe function works.\n```javascript\nconst x = 1;\n```";
  const result = collector.analyzeOutput(output);
  expect(result).toHaveProperty('filler_ratio');
  expect(typeof result.filler_ratio).toBe('number');
  expect(result.filler_ratio).toBeGreaterThan(0);
});

test('includes prose and filler line counts in analysis', () => {
  const output = "Let me look.\nI'll check.\nBug is on line 5.";
  const result = collector.analyzeOutput(output);
  expect(result).toHaveProperty('prose_line_count');
  expect(result).toHaveProperty('filler_line_count');
  expect(result.prose_line_count).toBe(3);
  expect(result.filler_line_count).toBe(2);
});

test('includes code_line_ratio in analysis', () => {
  const output = "Fixed.\n```javascript\nconst a = 1;\nconst b = 2;\n```";
  const result = collector.analyzeOutput(output);
  expect(result).toHaveProperty('code_line_ratio');
  expect(result.code_line_ratio).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/measurement/metrics-collector.test.js --verbose`

Expected: 3 new tests FAIL (missing properties in analyzeOutput return value)

- [ ] **Step 3: Update `analyzeOutput` to include density metrics**

Replace the return statement in `analyzeOutput` with code that computes the additional metrics. The method already receives `text`. Add before the existing return:

```javascript
// Density metrics
const fillerRatio = this.computeFillerRatio(text);
const textLines = text.split('\n');
let inCodeBlock = false;
let codeLineCount = 0;
for (const line of textLines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('```')) {
    inCodeBlock = !inCodeBlock;
    codeLineCount++;
    continue;
  }
  if (inCodeBlock) codeLineCount++;
}
const totalLines = textLines.filter(l => l.trim()).length;
const proseLineCount = totalLines - codeLineCount
  - textLines.filter(l => /^\s*#{1,6}\s/.test(l)).length;
const fillerLineCount = Math.round(fillerRatio * Math.max(proseLineCount, 0));
```

Then add these fields to the return object:

```javascript
return {
  todo_count: todoCount,
  fixme_count: fixmeCount,
  error_handling_present: hasErrorHandling,
  tests_present: hasTests,
  docs_referenced: docsReferenced,
  filler_ratio: fillerRatio,
  prose_line_count: Math.max(proseLineCount, 0),
  filler_line_count: fillerLineCount,
  code_line_ratio: totalLines > 0 ? codeLineCount / totalLines : 0,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/measurement/metrics-collector.test.js --verbose`

Expected: All 21 tests PASS

- [ ] **Step 5: Run full measurement test suite to verify no regressions**

Run: `npx jest tests/unit/measurement/ --verbose`

Expected: All tests PASS (existing tests may access `analyzeOutput` return values — the new fields are additive, won't break existing destructuring)

- [ ] **Step 6: Commit**

```bash
git add measurement/metrics-collector.js tests/unit/measurement/metrics-collector.test.js
git commit -m "feat(metrics): integrate filler_ratio into analyzeOutput"
```

---

### Task 4: Add Output Rules to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the `## Output Rules` section**

Insert after the `## Code Standards` section (after line 26, before `## Architecture`):

```markdown
## Output Rules

Output tokens compound: every unnecessary token becomes input context on
subsequent turns. These exclusion rules reduce verbosity without constraining
how the agent reasons (avoiding the Format Tax).

- No preambles — don't start with "Let me", "I'll", "I'm going to", "Here's what"
- No trailing summaries — don't recap what was done unless explicitly asked
- No narration between tool calls — execute silently unless interpreting complex results
- Code changes — list files changed and describe what changed, no prose wrapping
- Errors — file:line + message, no extra explanation unless non-obvious
- Status updates — one line
```

- [ ] **Step 2: Verify CLAUDE.md is valid markdown**

Read the file and confirm the new section is properly placed between Code Standards and Architecture.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(claude): add output rules for token density"
```

---

### Task 5: Final Validation

**Files:** None (verification only)

- [ ] **Step 1: Run full unit test suite**

Run: `npx jest tests/unit/ --verbose`

Expected: All tests PASS (179 existing + 13 new = 192 total)

- [ ] **Step 2: Run integration tests**

Run: `npx jest tests/integration/ --verbose`

Expected: All tests PASS

- [ ] **Step 3: Verify the filler_ratio metric works on real data**

Run this one-liner to verify the metric produces sensible output on a real measurement file:

```bash
node -e "
const { MetricsCollector } = require('./measurement/metrics-collector');
const fs = require('fs');
const c = new MetricsCollector('/tmp');
const dir = 'measurement/results/promise-theory-v2-2026-04-11T1241-treatment/raw';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).slice(0, 5);
for (const f of files) {
  const text = fs.readFileSync(dir + '/' + f, 'utf8');
  const analysis = c.analyzeOutput(text);
  console.log(f + ': filler=' + (analysis.filler_ratio * 100).toFixed(1) + '%, prose=' + analysis.prose_line_count + ', code_ratio=' + (analysis.code_line_ratio * 100).toFixed(0) + '%');
}
"
```

Expected: Output showing filler ratios in the 0-10% range, code ratios varying by task type.

- [ ] **Step 4: Commit any fixes, then push**

```bash
git push origin promise-theory-v2
```
