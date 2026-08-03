# Closed-Loop Promise Enforcement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing observation layer (PromiseEngine, TrustManager, LedgerWriter, ObservabilityChecker) into the executor's dispatch loop so that trust gates agent invocations, excludes agents below threshold, replaces them with stronger models + evidence, and provides HITL trust restoration.

**Architecture:** The executor already invokes `claude -p` per task/run. We insert a trust check before each invocation and a promise evaluation after. When trust drops below 0.2 (critical), the agent is excluded and replaced with a stronger model (sonnet→opus). The replacement agent receives evidence of prior failures from the ledger. If opus also reaches critical, execution continues with a `trust_exhausted` annotation. Trust restoration is HITL-only via a CLI script.

**Tech Stack:** Node.js, existing promise/* modules, measurement/* modules, Jest for tests.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `promise/standing-promises.js` | Create | Define the 6 standing promises with verification configs |
| `promise/evidence-builder.js` | Create | Extract failure history from ledger for evidence injection |
| `promise/promise-engine.js` | Modify | Add `shouldExclude()`, update `evaluate()` to set `rebinding_triggered` |
| `measurement/executor.js` | Modify | Add trust-gated dispatch loop with exclusion/replacement |
| `promise/reset-trust.js` | Create | HITL CLI for trust restoration (probation 0.3, clean slate 0.5) |
| `tests/unit/promise/standing-promises.test.js` | Create | Tests for standing promise definitions |
| `tests/unit/promise/evidence-builder.test.js` | Create | Tests for evidence extraction |
| `tests/unit/promise/promise-engine.test.js` | Modify | Add tests for shouldExclude, rebinding_triggered |
| `tests/unit/measurement/executor.test.js` | Modify | Add tests for trust-gated dispatch |
| `tests/unit/promise/reset-trust.test.js` | Create | Tests for trust restoration |

---

## Chunk 1: Standing Promises & Evidence Builder

### Task 1: Standing Promises Definition

**Files:**
- Create: `promise/standing-promises.js`
- Test: `tests/unit/promise/standing-promises.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/promise/standing-promises.test.js
const { STANDING_PROMISES, getPromisesForAgent } = require('../../../promise/standing-promises');

describe('standing-promises', () => {
  describe('STANDING_PROMISES', () => {
    test('defines exactly 6 standing promises', () => {
      expect(STANDING_PROMISES).toHaveLength(6);
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

    test('includes complete-output promise with grep method', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'complete-output');
      expect(p).toBeDefined();
      expect(p.verification.method).toBe('grep');
      expect(p.verification.pattern).toMatch(/TODO|FIXME/);
      expect(p.verification.confidence).toBe('high');
    });

    test('includes tests-with-code promise with file_check method', () => {
      const p = STANDING_PROMISES.find(p => p.id === 'tests-with-code');
      expect(p).toBeDefined();
      expect(p.verification.method).toBe('file_check');
      expect(p.verification.confidence).toBe('high');
    });
  });

  describe('getPromisesForAgent', () => {
    test('returns all standing promises for unknown agent type', () => {
      const promises = getPromisesForAgent('unknown');
      expect(promises).toHaveLength(6);
    });

    test('returns all standing promises for any agent type', () => {
      const promises = getPromisesForAgent('analysis');
      expect(promises).toEqual(STANDING_PROMISES);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/promise/standing-promises.test.js --verbose`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

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
    verification: { method: 'grep', pattern: 'NotImplemented|not yet implemented|placeholder', confidence: 'high' },
  },
  {
    id: 'error-handling',
    declaration: 'I will include error handling for all failure paths',
    verification: { method: 'output_structure', check: 'try/catch or error handling present', confidence: 'medium' },
  },
  {
    id: 'tests-with-code',
    declaration: 'I will include tests alongside implementation',
    verification: { method: 'file_check', check: 'test file exists', confidence: 'high' },
  },
  {
    id: 'no-dead-code',
    declaration: 'I will not leave commented-out code',
    verification: { method: 'grep', pattern: '^\\/\\/.*\\n\\/\\/.*\\n\\/\\/', confidence: 'high' },
  },
  {
    id: 'resource-cleanup',
    declaration: 'I will close/clean up all resources',
    verification: { method: 'output_contains', check: 'close', confidence: 'medium' },
  },
];

function getPromisesForAgent(_agentType) {
  return STANDING_PROMISES;
}

module.exports = { STANDING_PROMISES, getPromisesForAgent };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/promise/standing-promises.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add promise/standing-promises.js tests/unit/promise/standing-promises.test.js
git commit -m "feat(promise): add standing promises definition with verification configs"
```

---

### Task 2: Evidence Builder

**Files:**
- Create: `promise/evidence-builder.js`
- Test: `tests/unit/promise/evidence-builder.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/promise/evidence-builder.test.js
const { EvidenceBuilder } = require('../../../promise/evidence-builder');
const { LedgerWriter } = require('../../../promise/ledger-writer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('EvidenceBuilder', () => {
  let ledgerDir;
  let ledger;
  let builder;

  beforeEach(async () => {
    ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'evidence-'));
    ledger = new LedgerWriter(ledgerDir);
    builder = new EvidenceBuilder(ledgerDir);
  });

  afterEach(async () => {
    await fs.rm(ledgerDir, { recursive: true, force: true });
  });

  test('returns empty evidence for agent with no history', async () => {
    const evidence = await builder.buildEvidence('unknown-agent', 'task-1');
    expect(evidence.failure_count).toBe(0);
    expect(evidence.broken_promises).toEqual([]);
    expect(evidence.summary).toContain('no prior history');
  });

  test('extracts broken promises from ledger records', async () => {
    await ledger.writeRunRecord({
      run_id: 'r1', agent_id: 'a1', task_id: 't1',
      verification_results: [
        { promise_id: 'complete-output', result: 'broken', evidence: 'Found TODO' },
        { promise_id: 'tests-with-code', result: 'kept', evidence: 'Tests found' },
      ],
      trust_score_before: 0.5, trust_score_after: 0.4,
      rebinding_triggered: false,
    });
    const evidence = await builder.buildEvidence('a1', 't1');
    expect(evidence.failure_count).toBe(1);
    expect(evidence.broken_promises).toContain('complete-output');
  });

  test('builds human-readable summary', async () => {
    await ledger.writeRunRecord({
      run_id: 'r1', agent_id: 'a1', task_id: 't1',
      verification_results: [
        { promise_id: 'complete-output', result: 'broken', evidence: 'Found TODO' },
      ],
      trust_score_before: 0.5, trust_score_after: 0.4,
      rebinding_triggered: false,
    });
    await ledger.writeRunRecord({
      run_id: 'r2', agent_id: 'a1', task_id: 't1',
      verification_results: [
        { promise_id: 'complete-output', result: 'broken', evidence: 'Found FIXME' },
      ],
      trust_score_before: 0.4, trust_score_after: 0.3,
      rebinding_triggered: false,
    });
    const evidence = await builder.buildEvidence('a1', 't1');
    expect(evidence.failure_count).toBe(2);
    expect(evidence.summary).toContain('complete-output');
    expect(evidence.summary).toContain('2');
  });

  test('formats evidence as prompt injection string', async () => {
    await ledger.writeRunRecord({
      run_id: 'r1', agent_id: 'a1', task_id: 't1',
      verification_results: [
        { promise_id: 'complete-output', result: 'broken', evidence: 'Found TODO' },
      ],
      trust_score_before: 0.5, trust_score_after: 0.4,
      rebinding_triggered: false,
    });
    const text = await builder.formatForPrompt('a1', 't1');
    expect(text).toContain('--- PRIOR FAILURE EVIDENCE ---');
    expect(text).toContain('complete-output');
    expect(text).toContain('--- END EVIDENCE ---');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/promise/evidence-builder.test.js --verbose`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write minimal implementation**

```javascript
// promise/evidence-builder.js
const fs = require('fs').promises;
const path = require('path');

class EvidenceBuilder {
  constructor(ledgerDir) {
    if (!ledgerDir) throw new Error('ledgerDir is required');
    this.ledgerDir = ledgerDir;
  }

  async buildEvidence(agentId, taskId) {
    const records = await this._readAgentRecords(agentId, taskId);

    if (records.length === 0) {
      return {
        failure_count: 0,
        broken_promises: [],
        trust_trajectory: [],
        summary: `Agent ${agentId} has no prior history for task ${taskId}.`,
      };
    }

    const brokenMap = {};
    const trustTrajectory = [];

    for (const record of records) {
      trustTrajectory.push({
        run_id: record.run_id,
        trust_before: record.trust_score_before,
        trust_after: record.trust_score_after,
      });

      for (const vr of record.verification_results || []) {
        if (vr.result === 'broken') {
          brokenMap[vr.promise_id] = (brokenMap[vr.promise_id] || 0) + 1;
        }
      }
    }

    const brokenPromises = Object.keys(brokenMap);
    const failureCount = records.filter(r =>
      (r.verification_results || []).some(vr => vr.result === 'broken')
    ).length;

    const brokenDetail = Object.entries(brokenMap)
      .map(([id, count]) => `${id} (${count}x)`)
      .join(', ');

    return {
      failure_count: failureCount,
      broken_promises: brokenPromises,
      trust_trajectory: trustTrajectory,
      summary: `Agent ${agentId} failed ${failureCount} of ${records.length} runs on task ${taskId}. Broken promises: ${brokenDetail}.`,
    };
  }

  async formatForPrompt(agentId, taskId) {
    const evidence = await this.buildEvidence(agentId, taskId);
    if (evidence.failure_count === 0) return '';

    return [
      '--- PRIOR FAILURE EVIDENCE ---',
      `A previous agent was excluded from this task after ${evidence.failure_count} failures.`,
      `Broken promises: ${evidence.broken_promises.join(', ')}`,
      `Trust trajectory: ${evidence.trust_trajectory.map(t => t.trust_after.toFixed(2)).join(' → ')}`,
      '',
      'You are the replacement. Pay specific attention to the promises that were broken.',
      '--- END EVIDENCE ---',
    ].join('\n');
  }

  async _readAgentRecords(agentId, taskId) {
    const runsDir = path.join(this.ledgerDir, 'runs');
    const records = [];
    try {
      const files = await fs.readdir(runsDir);
      for (const file of files.filter(f => f.endsWith('.jsonl'))) {
        const content = await fs.readFile(path.join(runsDir, file), 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const record = JSON.parse(line);
          if (record.agent_id === agentId && record.task_id === taskId) {
            records.push(record);
          }
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return records;
  }
}

module.exports = { EvidenceBuilder };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/promise/evidence-builder.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add promise/evidence-builder.js tests/unit/promise/evidence-builder.test.js
git commit -m "feat(promise): add evidence builder for failure history injection"
```

---

## Chunk 2: PromiseEngine Exclusion Logic

### Task 3: Add shouldExclude and rebinding to PromiseEngine

**Files:**
- Modify: `promise/promise-engine.js`
- Modify: `tests/unit/promise/promise-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests to the existing `tests/unit/promise/promise-engine.test.js`:

```javascript
describe('shouldExclude', () => {
  test('returns false for agent above critical threshold', async () => {
    expect(await engine.shouldExclude('unknown-agent')).toBe(false);
  });

  test('returns true for agent at critical trust', async () => {
    engine._trustCache['bad-agent'] = 0.15;
    expect(await engine.shouldExclude('bad-agent')).toBe(true);
  });

  test('returns false for agent at exactly 0.2', async () => {
    engine._trustCache['edge-agent'] = 0.2;
    expect(await engine.shouldExclude('edge-agent')).toBe(false);
  });
});

describe('evaluate with rebinding', () => {
  test('sets rebinding_triggered when trust drops to critical', async () => {
    engine._trustCache['failing-agent'] = 0.22;
    const promises = [
      { id: 'p1', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
    ];
    const result = await engine.evaluate({
      runId: 'r1', agentId: 'failing-agent', taskId: 't1',
      promises, output: '// TODO: fix',
    });
    expect(result.trust_score_after).toBeLessThan(0.2);
    expect(result.rebinding_triggered).toBe(true);
  });

  test('does not set rebinding_triggered when trust stays above critical', async () => {
    const promises = [
      { id: 'p1', verification: { method: 'grep', confidence: 'high', pattern: 'TODO' } },
    ];
    const result = await engine.evaluate({
      runId: 'r1', agentId: 'good-agent', taskId: 't1',
      promises, output: 'clean code',
    });
    expect(result.rebinding_triggered).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npx jest tests/unit/promise/promise-engine.test.js --verbose`
Expected: FAIL — shouldExclude not a function, rebinding_triggered always false

- [ ] **Step 3: Modify promise-engine.js**

Add `shouldExclude()` method and update `evaluate()`:

In `promise/promise-engine.js`, add after `getTrustTier()`:

```javascript
async shouldExclude(agentId) {
  const trust = await this.getAgentTrust(agentId);
  return this.trustManager.getTrustTier(trust) === 'critical';
}
```

In `evaluate()`, replace the hardcoded `rebinding_triggered: false` with:

```javascript
const rebindingTriggered = this.trustManager.getTrustTier(trustAfter) === 'critical'
  && this.trustManager.getTrustTier(trustBefore) !== 'critical';
```

And use `rebinding_triggered: rebindingTriggered` in the record.

- [ ] **Step 4: Run test to verify they pass**

Run: `npx jest tests/unit/promise/promise-engine.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add promise/promise-engine.js tests/unit/promise/promise-engine.test.js
git commit -m "feat(promise): add shouldExclude and dynamic rebinding detection"
```

---

## Chunk 3: Trust-Gated Executor

### Task 4: Wire PromiseEngine into Executor

This is the core task. The executor's inner loop changes from:

```
for each run:
  for each task:
    invoke(sonnet) → score → record
```

to:

```
for each run:
  for each task:
    check trust(agent, task)
    if excluded:
      swap model to opus
      build evidence from ledger
      inject evidence into prompt
    invoke(model) → score → record
    evaluate promises → update trust
    if trust crossed critical:
      mark rebinding for next invocation
```

**Files:**
- Modify: `measurement/executor.js`
- Modify: `tests/unit/measurement/executor.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/measurement/executor.test.js`:

```javascript
describe('trust-gated dispatch', () => {
  test('constructor accepts promiseEngine option', () => {
    const ex = new Executor({ ref: 'main', repoRoot, promiseEnabled: true });
    expect(ex.promiseEnabled).toBe(true);
  });

  test('constructor defaults promiseEnabled to false', () => {
    const ex = new Executor({ ref: 'main', repoRoot });
    expect(ex.promiseEnabled).toBe(false);
  });

  test('getModelForAgent returns default model when not excluded', () => {
    const ex = new Executor({ ref: 'main', repoRoot, model: 'sonnet' });
    expect(ex.getModelForAgent(0.5)).toBe('sonnet');
  });

  test('getModelForAgent returns escalation model for critical trust', () => {
    const ex = new Executor({ ref: 'main', repoRoot, model: 'sonnet' });
    expect(ex.getModelForAgent(0.15)).toBe('opus');
  });

  test('getModelForAgent returns default model with trust_exhausted for already-escalated', () => {
    const ex = new Executor({ ref: 'main', repoRoot, model: 'opus' });
    const result = ex.getModelForAgent(0.15);
    expect(result).toBe('opus');
  });
});
```

- [ ] **Step 2: Run test to verify they fail**

Run: `npx jest tests/unit/measurement/executor.test.js --verbose`
Expected: FAIL — promiseEnabled not defined, getModelForAgent not a function

- [ ] **Step 3: Modify executor.js**

Changes to `measurement/executor.js`:

**Constructor** — add `promiseEnabled`, `escalationModel`, `ledgerDir`:

```javascript
constructor({ ref, repoRoot, runs = 3, outputDir = null, model = 'sonnet', promiseEnabled = false, ledgerDir = null }) {
  if (!ref) throw new Error('ref is required');
  if (!repoRoot) throw new Error('repoRoot is required');

  this.ref = ref;
  this.repoRoot = path.resolve(repoRoot);
  this.runs = runs;
  this.outputDir = outputDir;
  this.model = model;
  this.promiseEnabled = promiseEnabled;
  this.escalationModel = 'opus';
  this.refRunner = new RefRunner({ ref, repoRoot, runs });

  if (promiseEnabled) {
    const { PromiseEngine } = require('../promise/promise-engine');
    const { EvidenceBuilder } = require('../promise/evidence-builder');
    const { getPromisesForAgent } = require('../promise/standing-promises');
    const resolvedLedgerDir = ledgerDir || path.join(repoRoot, '.promise-ledger');
    this.promiseEngine = new PromiseEngine({ ledgerDir: resolvedLedgerDir });
    this.evidenceBuilder = new EvidenceBuilder(resolvedLedgerDir);
    this.getPromises = getPromisesForAgent;
  }
}
```

**Add method** `getModelForAgent(trustScore)`:

```javascript
getModelForAgent(trustScore) {
  // TrustManager.getTrustTier is a pure function of the score — no state needed
  const { TrustManager } = require('../promise/trust-manager');
  const tier = new TrustManager().getTrustTier(trustScore);
  if (tier === 'critical' && this.model !== 'opus') {
    return this.escalationModel;
  }
  return this.model;
}
```

Note: When `promiseEnabled` is true, this could also delegate to `this.promiseEngine.trustManager` to avoid re-instantiation. Either approach works since `getTrustTier` is stateless.

**In `execute()`**, after scoring and before the brief pause, add promise evaluation:

```javascript
// After: const qualityScore = collector.computeQualityScore(analysis);

let promiseRecord = null;
if (this.promiseEnabled) {
  // Use activeModel (not this.model) so the replacement agent gets its own trust track
  const agentId = `${activeModel}-${task.id}`;
  const promises = this.getPromises('measurement');
  promiseRecord = await this.promiseEngine.evaluate({
    runId: `run-${run}`,
    agentId,
    taskId: task.id,
    promises,
    output,
    context: { elapsed_ms: durationMs },
  });
}
```

**Before invocation**, add trust check:

```javascript
// Before: const prompt = this.buildPrompt(task, claudeMd);
let activeModel = this.model;
let evidenceText = '';
let trustExhausted = false;

if (this.promiseEnabled) {
  const agentId = `${this.model}-${task.id}`;
  const excluded = await this.promiseEngine.shouldExclude(agentId);
  if (excluded) {
    activeModel = this.getModelForAgent(await this.promiseEngine.getAgentTrust(agentId));
    if (activeModel === this.model) {
      trustExhausted = true;
    }
    evidenceText = await this.evidenceBuilder.formatForPrompt(agentId, task.id);
    console.log(`${label} — agent excluded (trust critical), escalating to ${activeModel}${trustExhausted ? ' [TRUST EXHAUSTED]' : ''}`);
  }
}
```

**Modify `buildPrompt`** to accept optional evidence:

```javascript
buildPrompt(task, claudeMdContent, evidence = '') {
  const parts = [
    '--- CONTEXT (from project CLAUDE.md) ---',
    claudeMdContent,
    '--- END CONTEXT ---',
    '',
  ];
  if (evidence) {
    parts.push(evidence, '');
  }
  parts.push(
    '--- TASK ---',
    task.prompt,
    '--- END TASK ---',
    '',
    'Produce the complete implementation. Output the full file contents with paths.',
  );
  return parts.join('\n');
}
```

**Update `invokeAgent` to accept a model parameter:**

```javascript
async invokeAgent(prompt, workDir, model) {
  const useModel = model || this.model;
  return new Promise((resolve, reject) => {
    const child = exec(
      `claude -p --model ${useModel} --output-format json --dangerously-skip-permissions --no-session-persistence`,
      // ... rest unchanged
    );
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
```

**Update the invocation call site** to pass `activeModel`:

```javascript
const prompt = this.buildPrompt(task, claudeMd, evidenceText);
rawOutput = await this.invokeAgent(prompt, worktreePath, activeModel);
```

**Add promise fields to the metrics record:**

```javascript
await collector.writeRecord({
  run,
  task_id: task.id,
  ref: this.ref,
  resolved_sha: resolvedSha,
  status: 'complete',
  duration_ms: durationMs,
  output_length: output.length,
  quality_score: qualityScore,
  ...analysis,
  // Promise fields (null when promise not enabled)
  trust_before: promiseRecord ? promiseRecord.trust_score_before : null,
  trust_after: promiseRecord ? promiseRecord.trust_score_after : null,
  rebinding_triggered: promiseRecord ? promiseRecord.rebinding_triggered : false,
  model_used: activeModel,
  trust_exhausted: trustExhausted,
});
```

- [ ] **Step 4: Run test to verify they pass**

Run: `npx jest tests/unit/measurement/executor.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Run all tests to verify nothing broke**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add measurement/executor.js tests/unit/measurement/executor.test.js
git commit -m "feat(measurement): wire trust-gated dispatch into executor with exclusion and escalation"
```

---

### Task 5: Update executor CLI for --promise flag

**Files:**
- Modify: `measurement/executor.js` (CLI section only)

- [ ] **Step 1: Add --promise and --ledger-dir CLI flags**

In the `main()` function of `measurement/executor.js`, add parsing for `--promise` and `--ledger-dir`:

```javascript
const promiseEnabled = args.includes('--promise');
const ledgerIdx = args.indexOf('--ledger-dir');
const ledgerDir = ledgerIdx !== -1 ? args[ledgerIdx + 1] : null;
```

Pass them to the Executor constructor:

```javascript
const executor = new Executor({ ref, repoRoot, runs, outputDir, model, promiseEnabled, ledgerDir });
```

Update the help text to include:

```
  --promise           Enable promise-theory trust-gated dispatch
  --ledger-dir <dir>  Directory for promise ledger              [default: .promise-ledger]
```

- [ ] **Step 2: Verify the help text is correct**

Run: `node measurement/executor.js --help`
Expected: Shows --promise and --ledger-dir flags

- [ ] **Step 3: Commit**

```bash
git add measurement/executor.js
git commit -m "feat(measurement): add --promise CLI flag for trust-gated execution"
```

---

## Chunk 4: Trust Reset CLI

### Task 6: Trust Reset Script

**Files:**
- Create: `promise/reset-trust.js`
- Test: `tests/unit/promise/reset-trust.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/promise/reset-trust.test.js
const { resetTrust, RESET_MODES } = require('../../../promise/reset-trust');
const { LedgerWriter } = require('../../../promise/ledger-writer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('reset-trust', () => {
  let ledgerDir;
  let ledger;

  beforeEach(async () => {
    ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reset-'));
    ledger = new LedgerWriter(ledgerDir);
    await ledger.writeAgentTrust('a1', 0.3, 0.15, 'r5');
  });

  afterEach(async () => {
    await fs.rm(ledgerDir, { recursive: true, force: true });
  });

  test('RESET_MODES defines probation and clean_slate', () => {
    expect(RESET_MODES.probation).toBe(0.3);
    expect(RESET_MODES.clean_slate).toBe(0.5);
  });

  test('resets agent trust to probation level', async () => {
    await resetTrust(ledgerDir, 'a1', 'probation');
    const scores = await ledger.readTrustScores();
    expect(scores['a1']).toBe(0.3);
  });

  test('resets agent trust to clean slate level', async () => {
    await resetTrust(ledgerDir, 'a1', 'clean_slate');
    const scores = await ledger.readTrustScores();
    expect(scores['a1']).toBe(0.5);
  });

  test('throws on unknown reset mode', async () => {
    await expect(resetTrust(ledgerDir, 'a1', 'invalid')).rejects.toThrow('Unknown reset mode');
  });

  test('throws on missing agent', async () => {
    await expect(resetTrust(ledgerDir, '', 'probation')).rejects.toThrow('agentId is required');
  });

  test('writes reset event to agent trust log', async () => {
    await resetTrust(ledgerDir, 'a1', 'probation');
    const content = await fs.readFile(path.join(ledgerDir, 'agents', 'a1.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.run_id).toContain('reset');
    expect(last.trust_after).toBe(0.3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/promise/reset-trust.test.js --verbose`
Expected: FAIL — cannot find module

- [ ] **Step 3: Write implementation**

```javascript
// promise/reset-trust.js
const { LedgerWriter } = require('./ledger-writer');

const RESET_MODES = {
  probation: 0.3,
  clean_slate: 0.5,
};

async function resetTrust(ledgerDir, agentId, mode) {
  if (!agentId) throw new Error('agentId is required');
  if (!RESET_MODES[mode]) throw new Error(`Unknown reset mode: ${mode}. Valid: ${Object.keys(RESET_MODES).join(', ')}`);

  const newTrust = RESET_MODES[mode];
  const ledger = new LedgerWriter(ledgerDir);
  const scores = await ledger.readTrustScores();
  const currentTrust = scores[agentId] || 0;

  await ledger.writeAgentTrust(agentId, currentTrust, newTrust, `reset-${mode}-${Date.now()}`);

  return { agentId, mode, previous_trust: currentTrust, new_trust: newTrust };
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length < 2) {
    console.log(`Usage: node promise/reset-trust.js <agent-id> <mode> [--ledger-dir <dir>]

Modes:
  probation    Reset to 0.3 (low trust, must prove itself)
  clean_slate  Reset to 0.5 (default starting trust)

Examples:
  node promise/reset-trust.js sonnet-code-plan probation
  node promise/reset-trust.js sonnet-code-plan clean_slate --ledger-dir .promise-ledger`);
    process.exit(0);
  }

  const agentId = args[0];
  const mode = args[1];
  const ledgerIdx = args.indexOf('--ledger-dir');
  const ledgerDir = ledgerIdx !== -1 ? args[ledgerIdx + 1] : '.promise-ledger';

  const result = await resetTrust(ledgerDir, agentId, mode);
  console.log(`Trust reset: ${result.agentId} ${result.previous_trust.toFixed(2)} → ${result.new_trust.toFixed(2)} (${result.mode})`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}

module.exports = { resetTrust, RESET_MODES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/promise/reset-trust.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add promise/reset-trust.js tests/unit/promise/reset-trust.test.js
git commit -m "feat(promise): add HITL trust reset CLI with probation and clean_slate modes"
```

---

## Chunk 5: Gitignore & Integration Verification

### Task 7: Add .promise-ledger to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .promise-ledger entry**

Add `.promise-ledger/` to `.gitignore` (the ledger is local runtime state, not version-controlled).

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .promise-ledger to gitignore"
```

---

### Task 8: Full Integration Test — Run All Tests

- [ ] **Step 1: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests pass (existing 86 + new ~25 = ~111 total)

- [ ] **Step 2: Verify promise-enabled executor works end-to-end (dry run)**

Run: `node measurement/executor.js --help`
Expected: Shows --promise flag in help text

- [ ] **Step 3: Verify trust reset CLI**

Run: `node promise/reset-trust.js --help`
Expected: Shows usage information

---

## Summary

| Task | What | Files | Est. Lines Changed |
|---|---|---|---|
| 1 | Standing promises definition | `promise/standing-promises.js` + test | ~80 |
| 2 | Evidence builder | `promise/evidence-builder.js` + test | ~160 |
| 3 | PromiseEngine exclusion + rebinding | `promise/promise-engine.js` + test | ~30 |
| 4 | Trust-gated executor dispatch | `measurement/executor.js` + test | ~80 |
| 5 | CLI --promise flag | `measurement/executor.js` CLI section | ~15 |
| 6 | Trust reset CLI | `promise/reset-trust.js` + test | ~100 |
| 7 | Gitignore update | `.gitignore` | ~1 |
| 8 | Integration verification | — | ~0 |

**Total new files:** 4 (standing-promises.js, evidence-builder.js, reset-trust.js, + 3 test files)
**Total modified files:** 3 (promise-engine.js, executor.js, .gitignore)
**Dependencies:** None new — all existing Node.js + existing promise/* modules
