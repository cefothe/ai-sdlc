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
