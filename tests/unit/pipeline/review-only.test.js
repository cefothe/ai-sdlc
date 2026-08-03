const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { runReview } = require(path.join(ROOT, 'pipeline', 'review-only.js'));
const { loadCapabilityMap } = require(path.join(ROOT, 'pipeline', 'capabilities.js'));
const { formatReviewerContext, evaluatePromiseGate } = require(path.join(ROOT, 'quality-gate', 'promise-gate.js'));

const MAP = loadCapabilityMap(path.join(ROOT, '.ai-sdlc', 'capabilities.yaml'));

function recordingSpawn(verdictFor = () => ({ approved: true, findings: [] })) {
  const calls = [];
  const spawn = async (a) => {
    calls.push(a);
    return verdictFor(a);
  };
  spawn.calls = calls;
  return spawn;
}

describe('runReview (standalone review-team stage)', () => {
  test('resolves the team, dispatches reviewers, aggregates APPROVED', async () => {
    const spawn = recordingSpawn();
    const r = await runReview({ taskId: 'AISDLC-9', diff: 'some diff', capabilityMap: MAP, taskContext: { files: [] }, implementerHarness: 'claude', spawn });
    expect(r.decision).toBe('APPROVED');
    expect(r.blocked).toBe(false);
    expect(r.reviewers.map((x) => x.name)).toEqual(['code-reviewer', 'test-automator', 'security-auditor']);
    expect(r.teamPlan.useTeam).toBe(true);
    expect(r.teamPlan.dispatch).toBe('native-team');
    expect(spawn.calls.every((c) => c.provider.harness === 'codex')).toBe(true);
  });

  test('a major finding yields CHANGES_REQUESTED + blocked', async () => {
    const spawn = recordingSpawn((a) => (a.reviewer === 'security-reviewer' ? { approved: false, findings: [{ severity: 'major', message: 'injection risk', file: 'a.js' }] } : { approved: true, findings: [] }));
    const r = await runReview({ taskId: 'AISDLC-9', diff: 'd', capabilityMap: MAP, taskContext: {}, spawn });
    expect(r.decision).toBe('CHANGES_REQUESTED');
    expect(r.blocked).toBe(true);
    expect(r.findings).toEqual([expect.objectContaining({ severity: 'major', reviewer: 'security-reviewer' })]);
  });

  test('Java-test branch routes the test reviewer to qa-code-reviewer', async () => {
    const spawn = recordingSpawn();
    const r = await runReview({ taskId: 'AISDLC-9', diff: 'd', capabilityMap: MAP, taskContext: { files: ['src/test/java/FooTest.java'] }, spawn });
    expect(r.reviewers.some((x) => x.name === 'qa-code-reviewer')).toBe(true);
  });

  test('promise findings become advisory reviewer context + a gate result', async () => {
    const spawn = recordingSpawn();
    const promiseResults = [{ promise_id: 'error-handling', result: 'broken', evidence: 'missing try/catch' }];
    const r = await runReview({ taskId: 'AISDLC-9', diff: 'd', capabilityMap: MAP, taskContext: {}, spawn, promiseResults, formatReviewerContext, evaluatePromiseGate, qualityGateConfig: { kind: 'QualityGate', spec: { gates: [{ name: 'promise-verification', enforcement: 'advisory', rule: { metric: 'promise.broken_count', operator: '==', threshold: 0 } }] } } });
    // advisory: does not block on its own
    expect(r.promiseGate.blocking).toBe(false);
    // reviewers received the promise context in their prompt
    expect(spawn.calls[0].prompt).toMatch(/missing try\/catch/);
  });

  test('cross-harness misconfig throws (implementer on codex)', async () => {
    await expect(runReview({ taskId: 'A', diff: 'd', capabilityMap: MAP, taskContext: {}, implementerHarness: 'codex', spawn: recordingSpawn() })).rejects.toThrow(/cross-harness/);
  });

  test('requires a capabilityMap and a spawn seam', async () => {
    await expect(runReview({ diff: 'd', spawn: recordingSpawn() })).rejects.toThrow(/capabilityMap/);
    await expect(runReview({ diff: 'd', capabilityMap: MAP })).rejects.toThrow(/spawn seam/);
  });
});
