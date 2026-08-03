# Promise Verification v2 + Transparent Framing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 broken standing promises, add 2 new ones, tune trust dynamics, and add transparent promise framing to CLAUDE.md so agents know they are being evaluated.

**Architecture:** The standing promises in `promise/standing-promises.js` define what is verified. The `ObservabilityChecker` in `promise/observability-checker.js` implements verification methods. The `TrustManager` in `promise/trust-manager.js` controls EMA parameters. The `CLAUDE.md` is what agents read at invocation time. All four layers are updated independently with tests at each step.

**Tech Stack:** Node.js, Jest, regex, JSONL ledger

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `promise/observability-checker.js` | Modify | Add `grep_absent` method, fix `_outputStructure` handler, add `_outputLength` method, add `_consecutiveComments` method |
| `promise/standing-promises.js` | Modify | Fix all 6 existing promises, add 2 new promises |
| `promise/trust-manager.js` | Modify | Change default `decayFactor` from 0.85 to 0.70 (α goes from 0.15 to 0.30) |
| `CLAUDE.md` | Modify | Update standing promises table, add Promise Verification section |
| `tests/unit/promise/observability-checker.test.js` | Modify | Add tests for new/fixed methods |
| `tests/unit/promise/standing-promises.test.js` | Modify | Update count from 6 to 8, add verification effectiveness tests |
| `tests/unit/promise/trust-manager.test.js` | Modify | Update tests for new decay factor |

---

## Chunk 1: Fix ObservabilityChecker

### Task 1: Add `grep_absent` verification method

The existing `grep` method returns `broken` when a pattern IS found (good for detecting TODOs). We need the inverse: return `broken` when a pattern is NOT found (for detecting that error handling IS present). Rather than overloading `grep` with a flag, add a dedicated `grep_absent` method.

**Files:**
- Modify: `promise/observability-checker.js:2-13`
- Test: `tests/unit/promise/observability-checker.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/promise/observability-checker.test.js` after the existing `grep` describe block (after line 23):

```javascript
  describe('grep_absent', () => {
    test('returns kept when pattern IS found in output', () => {
      const output = 'try {\n  doStuff();\n} catch (err) {\n  handle(err);\n}';
      const result = checker.verify('grep_absent', { pattern: 'try\\s*\\{|catch\\s*\\(' }, output);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('match');
    });

    test('returns broken when pattern is NOT found in output', () => {
      const output = 'function add(a, b) { return a + b; }';
      const result = checker.verify('grep_absent', { pattern: 'try\\s*\\{|catch\\s*\\(' }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('not found');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: 2 FAIL — `grep_absent` falls through to `default` case, returns `partial` not `kept`/`broken`

- [ ] **Step 3: Implement `grep_absent` in ObservabilityChecker**

In `promise/observability-checker.js`, add to the switch statement (after line 4):

```javascript
      case 'grep_absent': return this._grepAbsent(params, output);
```

Add the method after `_grep` (after line 39):

```javascript
  _grepAbsent(params, output) {
    const pattern = new RegExp(params.pattern, 'gi');
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      return {
        result: 'kept',
        evidence: `Required pattern found: ${matches.slice(0, 3).join(', ')}`,
      };
    }
    return { result: 'broken', evidence: 'Required pattern not found in output' };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add promise/observability-checker.js tests/unit/promise/observability-checker.test.js
git commit -m "feat(promise): add grep_absent verification method for required-pattern checks"
```

---

### Task 2: Add `consecutive_comments` verification method

The existing `no-dead-code` promise uses a broken regex. Replace with a method that splits output on newlines and counts consecutive `//` comment lines. 3+ consecutive = broken.

**Files:**
- Modify: `promise/observability-checker.js`
- Test: `tests/unit/promise/observability-checker.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/promise/observability-checker.test.js`:

```javascript
  describe('consecutive_comments', () => {
    test('returns kept when no consecutive comment blocks exist', () => {
      const output = '// single comment\nconst x = 1;\n// another single\nconst y = 2;';
      const result = checker.verify('consecutive_comments', { min_lines: 3 }, output);
      expect(result.result).toBe('kept');
    });

    test('returns broken when 3+ consecutive comment lines found', () => {
      const output = 'const x = 1;\n// old code\n// was here\n// and here\nconst y = 2;';
      const result = checker.verify('consecutive_comments', { min_lines: 3 }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('3');
    });

    test('returns kept when consecutive comments are below threshold', () => {
      const output = '// comment one\n// comment two\nconst x = 1;';
      const result = checker.verify('consecutive_comments', { min_lines: 3 }, output);
      expect(result.result).toBe('kept');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: 3 FAIL — unknown method returns `partial`

- [ ] **Step 3: Implement `_consecutiveComments`**

In `promise/observability-checker.js`, add to the switch statement:

```javascript
      case 'consecutive_comments': return this._consecutiveComments(params, output);
```

Add the method:

```javascript
  _consecutiveComments(params, output) {
    const minLines = params.min_lines || 3;
    const lines = output.split('\n');
    let consecutive = 0;
    let maxConsecutive = 0;

    for (const line of lines) {
      if (/^\s*\/\//.test(line.trim())) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 0;
      }
    }

    if (maxConsecutive >= minLines) {
      return {
        result: 'broken',
        evidence: `Found ${maxConsecutive} consecutive comment lines (threshold: ${minLines})`,
      };
    }
    return { result: 'kept', evidence: `Max consecutive comments: ${maxConsecutive} (threshold: ${minLines})` };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add promise/observability-checker.js tests/unit/promise/observability-checker.test.js
git commit -m "feat(promise): add consecutive_comments verification for dead code detection"
```

---

### Task 3: Add `output_length` verification method

New method to check that agent output exceeds a minimum character count. Short outputs (< 500 chars) almost always indicate failure.

**Files:**
- Modify: `promise/observability-checker.js`
- Test: `tests/unit/promise/observability-checker.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
  describe('output_length', () => {
    test('returns kept when output exceeds threshold', () => {
      const output = 'x'.repeat(600);
      const result = checker.verify('output_length', { min_chars: 500 }, output);
      expect(result.result).toBe('kept');
      expect(result.evidence).toContain('600');
    });

    test('returns broken when output is below threshold', () => {
      const output = 'short';
      const result = checker.verify('output_length', { min_chars: 500 }, output);
      expect(result.result).toBe('broken');
      expect(result.evidence).toContain('5');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: 2 FAIL

- [ ] **Step 3: Implement `_outputLength`**

Add to the switch statement:

```javascript
      case 'output_length': return this._outputLength(params, output);
```

Add the method:

```javascript
  _outputLength(params, output) {
    const minChars = params.min_chars || 500;
    const length = output.length;
    if (length >= minChars) {
      return { result: 'kept', evidence: `Output length ${length} chars (min: ${minChars})` };
    }
    return { result: 'broken', evidence: `Output length ${length} chars below minimum ${minChars}` };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/observability-checker.test.js --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add promise/observability-checker.js tests/unit/promise/observability-checker.test.js
git commit -m "feat(promise): add output_length verification for minimum output size"
```

---

## Chunk 2: Fix Standing Promises + Add New Ones

### Task 4: Rewrite standing promises definitions

Replace all 6 broken/weak promise definitions and add 2 new ones. This is the core change.

**Files:**
- Modify: `promise/standing-promises.js`
- Test: `tests/unit/promise/standing-promises.test.js`

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `tests/unit/promise/standing-promises.test.js`:

```javascript
const { STANDING_PROMISES, getPromisesForAgent } = require('../../../promise/standing-promises');
const { ObservabilityChecker } = require('../../../promise/observability-checker');

describe('standing-promises', () => {
  describe('STANDING_PROMISES', () => {
    test('defines exactly 8 standing promises', () => {
      expect(STANDING_PROMISES).toHaveLength(8);
    });

    test('each promise has id, declaration, and verification with method and confidence', () => {
      for (const p of STANDING_PROMISES) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('declaration');
        expect(p).toHaveProperty('verification');
        expect(p.verification).toHaveProperty('method');
        expect(p.verification).toHaveProperty('confidence');
      }
    });

    test('includes all 8 expected promise IDs', () => {
      const ids = STANDING_PROMISES.map(p => p.id);
      expect(ids).toContain('complete-output');
      expect(ids).toContain('no-placeholders');
      expect(ids).toContain('error-handling');
      expect(ids).toContain('tests-with-code');
      expect(ids).toContain('no-dead-code');
      expect(ids).toContain('resource-cleanup');
      expect(ids).toContain('implementation-depth');
      expect(ids).toContain('output-completeness');
    });
  });

  describe('verification effectiveness', () => {
    let checker;

    beforeEach(() => {
      checker = new ObservabilityChecker();
    });

    test('error-handling detects try/catch as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'error-handling');
      const output = 'function save(data) {\n  try {\n    db.write(data);\n  } catch (err) {\n    log(err);\n  }\n}';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('error-handling detects missing error handling as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'error-handling');
      const output = 'function add(a, b) { return a + b; }';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('no-dead-code detects consecutive comments as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'no-dead-code');
      const output = 'const x = 1;\n// old line\n// old line\n// old line\nconst y = 2;';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('no-dead-code accepts clean code as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'no-dead-code');
      const output = '// single comment\nconst x = 1;\n// another\nconst y = 2;';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('resource-cleanup detects .close() as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'resource-cleanup');
      const output = 'const conn = db.connect();\ntry { use(conn); } finally { conn.close(); }';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('resource-cleanup detects missing cleanup as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'resource-cleanup');
      const output = 'function add(a, b) { return a + b; }';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('implementation-depth detects function definitions as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'implementation-depth');
      const output = 'function processOrder(order) {\n  validate(order);\n  return save(order);\n}';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });

    test('implementation-depth detects prose-only output as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'implementation-depth');
      const output = 'Here is a description of what the system should do. It processes orders.';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('output-completeness detects short output as broken', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'output-completeness');
      const output = 'Done.';
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('broken');
    });

    test('output-completeness accepts substantial output as kept', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'output-completeness');
      const output = 'x'.repeat(600);
      const result = checker.verify(p.verification.method, p.verification, output);
      expect(result.result).toBe('kept');
    });
  });

  describe('getPromisesForAgent', () => {
    test('returns all standing promises for any agent type', () => {
      const promises = getPromisesForAgent('unknown');
      expect(promises).toHaveLength(8);
      expect(promises).toEqual(STANDING_PROMISES);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/promise/standing-promises.test.js --verbose`
Expected: FAIL — count is 6 not 8, missing IDs, verification effectiveness tests fail

- [ ] **Step 3: Rewrite `promise/standing-promises.js`**

Replace the entire content:

```javascript
// promise/standing-promises.js
const STANDING_PROMISES = [
  {
    id: 'complete-output',
    declaration: 'I will produce output with zero TODO/FIXME markers',
    verification: { method: 'grep', pattern: 'TODO|FIXME|HACK', confidence: 'high' },
  },
  {
    id: 'no-placeholders',
    declaration: 'I will not include placeholder implementations',
    verification: {
      method: 'grep',
      pattern: 'NotImplemented|not yet implemented|placeholder|\\/\\/\\s*stub|\\/\\/\\s*temp',
      confidence: 'high',
    },
  },
  {
    id: 'error-handling',
    declaration: 'I will include error handling for all failure paths',
    verification: {
      method: 'grep_absent',
      pattern: 'try\\s*\\{|\\.catch\\s*\\(|catch\\s*\\(|throw\\s+new|\\.on\\s*\\(\\s*[\'"]error',
      confidence: 'high',
    },
  },
  {
    id: 'tests-with-code',
    declaration: 'I will include tests alongside implementation',
    verification: { method: 'file_check', check: 'test file exists', confidence: 'medium' },
  },
  {
    id: 'no-dead-code',
    declaration: 'I will not leave commented-out code blocks',
    verification: { method: 'consecutive_comments', min_lines: 3, confidence: 'high' },
  },
  {
    id: 'resource-cleanup',
    declaration: 'I will close/clean up all resources',
    verification: {
      method: 'grep_absent',
      pattern: '\\.close\\s*\\(|\\.destroy\\s*\\(|\\.end\\s*\\(|\\.disconnect\\s*\\(|\\.release\\s*\\(|finally\\s*\\{',
      confidence: 'medium',
    },
  },
  {
    id: 'implementation-depth',
    declaration: 'I will produce actual code, not just prose or plans',
    verification: {
      method: 'grep_absent',
      pattern: 'function\\s+\\w+|class\\s+\\w+|const\\s+\\w+\\s*=|module\\.exports|def\\s+\\w+|export\\s+(default|function|class)',
      confidence: 'high',
    },
  },
  {
    id: 'output-completeness',
    declaration: 'I will produce substantial, complete output',
    verification: { method: 'output_length', min_chars: 500, confidence: 'medium' },
  },
];

function getPromisesForAgent(_agentType) {
  return STANDING_PROMISES;
}

module.exports = { STANDING_PROMISES, getPromisesForAgent };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/standing-promises.test.js --verbose`
Expected: ALL PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add promise/standing-promises.js tests/unit/promise/standing-promises.test.js
git commit -m "feat(promise): fix 3 broken promises, expand patterns, add implementation-depth and output-completeness"
```

---

## Chunk 3: Tune Trust Dynamics

### Task 5: Change EMA decay factor from 0.85 to 0.70

The current α=0.15 (decayFactor=0.85) takes ~6 consecutive failures to reach critical trust. Research recommends α=0.30 (decayFactor=0.70) for dynamic environments — ~3 failures to reach critical.

**Files:**
- Modify: `promise/trust-manager.js:5`
- Modify: `tests/unit/promise/trust-manager.test.js`

- [ ] **Step 1: Update the TrustManager default**

In `promise/trust-manager.js`, change line 5:

```javascript
  constructor({ decayFactor = 0.70 } = {}) {
```

- [ ] **Step 2: Update test setup to use new default**

In `tests/unit/promise/trust-manager.test.js`, change line 7:

```javascript
    manager = new TrustManager();
```

(Remove the explicit `{ decayFactor: 0.85 }` so it uses the new default.)

- [ ] **Step 3: Update test expectations**

Replace the `updateTrust` describe block in `tests/unit/promise/trust-manager.test.js`:

```javascript
  describe('updateTrust', () => {
    test('starts at 0.5 and increases with kept promises', () => {
      const results = [{ result: 'kept', confidence: 'high' }];
      const newTrust = manager.updateTrust(0.5, results);
      // 0.70 * 0.5 + 0.30 * 1.0 = 0.35 + 0.30 = 0.65
      expect(newTrust).toBeCloseTo(0.65, 3);
    });

    test('decreases with broken promises', () => {
      const results = [{ result: 'broken', confidence: 'high' }];
      const newTrust = manager.updateTrust(0.5, results);
      // 0.70 * 0.5 + 0.30 * 0.0 = 0.35
      expect(newTrust).toBeCloseTo(0.35, 3);
    });

    test('reaches high-trust tier after 5 perfect runs', () => {
      let trust = 0.5;
      for (let i = 0; i < 5; i++) {
        trust = manager.updateTrust(trust, [{ result: 'kept', confidence: 'high' }]);
      }
      expect(trust).toBeGreaterThan(0.8);
    });

    test('reaches critical-trust tier after 5 failing runs', () => {
      let trust = 0.5;
      for (let i = 0; i < 5; i++) {
        trust = manager.updateTrust(trust, [{ result: 'broken', confidence: 'high' }]);
      }
      expect(trust).toBeLessThan(0.2);
    });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/promise/trust-manager.test.js --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add promise/trust-manager.js tests/unit/promise/trust-manager.test.js
git commit -m "feat(promise): increase EMA responsiveness (α 0.15→0.30, decay 0.85→0.70)"
```

---

## Chunk 4: Transparent Promise Framing in CLAUDE.md

### Task 6: Update CLAUDE.md standing promises table and add verification section

This changes what the agent reads at invocation time. Two modifications: (1) update the table to reflect the 8 promises, (2) add a Promise Verification section that makes the agent aware of the evaluation.

**Files:**
- Modify: `CLAUDE.md:311-324`

- [ ] **Step 1: Replace the standing promises table**

In `CLAUDE.md`, replace lines 311-324 (from `## Standing Promises — Completion` through `**Consequence model:**` line) with:

```markdown
## Standing Promises — Completion

Every agent offers these promises by default. Fulfillment is independently verified after every invocation.

| Promise ID | Declaration (+b) | Verification | Confidence |
|---|---|---|---|
| complete-output | I will produce output with zero TODO/FIXME markers | grep: absence of TODO\|FIXME\|HACK | high |
| no-placeholders | I will not include placeholder implementations | grep: absence of placeholder patterns | high |
| error-handling | I will include error handling for all failure paths | grep_absent: try/catch or throw present | high |
| tests-with-code | I will include tests alongside implementation | file_check: test file reference exists | medium |
| no-dead-code | I will not leave commented-out code blocks | consecutive_comments: <3 consecutive // lines | high |
| resource-cleanup | I will close/clean up all resources | grep_absent: .close()/.destroy()/finally present | medium |
| implementation-depth | I will produce actual code, not just prose | grep_absent: function/class/const definitions | high |
| output-completeness | I will produce substantial, complete output | output_length: ≥500 characters | medium |

**Consequence model:** Trust adjusts per promise via EMA (α=0.30). Repeated failures trigger model escalation.

## Promise Verification

Your output is independently verified against the standing promises above after every invocation. Each promise is checked using automated, objective methods — grep patterns, structural checks, output analysis. Results:

- **Kept**: trust increases. You continue with current capabilities.
- **Broken**: trust decreases. Repeated failures trigger model escalation.
- **Partial**: weak signal, minimal trust impact.

Before declaring your work complete, verify against each standing promise:
1. No TODO/FIXME/HACK markers in output
2. No placeholder implementations (NotImplemented, stub, temp)
3. Error handling present for failure paths (try/catch, throw, .catch())
4. Tests included alongside implementation
5. No commented-out code blocks (3+ consecutive // lines)
6. Resources properly closed/cleaned up (.close(), finally {})
7. Actual code produced — function/class/const definitions, not just prose
8. Substantial output — not a terse dismissal

This is not a checklist to mention — it is a checklist to satisfy.
```

- [ ] **Step 2: Verify CLAUDE.md is valid markdown**

Run: `head -1 CLAUDE.md && grep -c '## ' CLAUDE.md`
Expected: First line is `# CLAUDE.md`, section count is consistent with prior version +1.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(promise): add transparent promise framing — agents see evaluation criteria and consequences"
```

---

## Chunk 5: Integration Verification + Run Full Test Suite

### Task 7: Run all promise tests to verify integration

All 4 changes (observability checker, standing promises, trust manager, CLAUDE.md) must work together.

**Files:**
- No changes — verification only

- [ ] **Step 1: Run the full promise test suite**

Run: `npx jest tests/unit/promise/ --verbose`
Expected: ALL PASS — all promise tests including the new verification effectiveness tests

- [ ] **Step 2: Run the measurement executor tests**

Run: `npx jest tests/unit/measurement/ --verbose`
Expected: ALL PASS — executor tests still work with the updated promise definitions

- [ ] **Step 3: Run the full CI test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: ALL PASS — no regressions

- [ ] **Step 4: Verify the pipeline integration test**

Run: `npx jest tests/integration/promise/pipeline.test.js --verbose`
Expected: PASS — the evaluate → trust cycle works with 8 promises

---

### Task 8: Run 30-run measurement

Execute the measurement with the updated system against the existing main baseline.

**Files:**
- No source changes — measurement execution only

- [ ] **Step 1: Run the measurement**

```bash
node measurement/executor.js \
  --ref promise-theory \
  --runs 30 \
  --promise \
  --ledger-dir .promise-ledger/promise-theory-v2 \
  --model sonnet
```

Expected: 150 invocations (30 runs × 5 tasks), results written to `measurement/results/promise-theory-<timestamp>/`

- [ ] **Step 2: Run analysis comparing against main baseline**

Use the existing main baseline at `measurement/results/main-20260314T213014/` (75 invocations, 15 runs). For the comparison, use runs 1-15 of the new data to pair against main runs 1-15, then report the full 30-run statistics separately.

- [ ] **Step 3: Write updated analysis report**

Update `measurement/analysis-report.md` with R4 results alongside R1-R3.

- [ ] **Step 4: Commit results and analysis**

```bash
git add measurement/analysis-report.md
git commit -m "docs(measurement): add R4 results — promise verification v2 with transparent framing"
```
