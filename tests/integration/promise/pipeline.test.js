const { PromiseEngine } = require('../../../promise/promise-engine');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('Promise Pipeline Integration', () => {
  let tmpDir, engine;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-'));
    engine = new PromiseEngine({ ledgerDir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('full pipeline: declare → verify → record → trust update', async () => {
    const agentOutput = `function add(a, b) {
  if (typeof a !== 'number') throw new Error('a must be number');
  return a + b;
}`;
    const promises = [
      { id: 'complete-output', verification: { method: 'grep', confidence: 'high', pattern: 'TODO|FIXME' } },
    ];

    const result = await engine.evaluate({
      agentId: 'test-agent',
      runId: 'integration-run-1',
      taskId: 'integration-task-1',
      output: agentOutput,
      promises,
    });

    // Verify verification ran correctly
    expect(result.verification_results).toHaveLength(1);
    expect(result.verification_results[0].promise_id).toBe('complete-output');
    expect(result.verification_results[0].result).toBe('kept');

    // Verify ledger was written
    const ledgerFiles = await fs.readdir(path.join(tmpDir, 'runs'));
    expect(ledgerFiles.length).toBeGreaterThan(0);

    // Verify trust was updated
    const trust = await engine.getAgentTrust('test-agent');
    expect(trust).toBeGreaterThan(0.5);
  });
});
