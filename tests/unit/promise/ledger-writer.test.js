const { LedgerWriter } = require('../../../promise/ledger-writer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('LedgerWriter', () => {
  let writer;
  let ledgerDir;

  beforeEach(async () => {
    ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ledger-'));
    writer = new LedgerWriter(ledgerDir);
  });

  afterEach(async () => {
    await fs.rm(ledgerDir, { recursive: true, force: true });
  });

  describe('writeRunRecord', () => {
    test('writes JSONL record to runs directory', async () => {
      const record = {
        run_id: 'test-run-1',
        agent_id: 'code-analyzer',
        task_id: 'task-1',
        promises_declared: [{ promise_id: 'p1', direction: '+b', declaration: 'test' }],
        verification_results: [{ promise_id: 'p1', result: 'kept', confidence: 'high' }],
        trust_score_before: 0.5,
        trust_score_after: 0.575,
      };
      await writer.writeRunRecord(record);
      const content = await fs.readFile(
        path.join(ledgerDir, 'runs', 'test-run-1.jsonl'), 'utf8'
      );
      const parsed = JSON.parse(content.trim());
      expect(parsed.agent_id).toBe('code-analyzer');
      expect(parsed.timestamp).toBeDefined();
    });

    test('appends multiple records to same run file', async () => {
      await writer.writeRunRecord({ run_id: 'r1', agent_id: 'a1', task_id: 't1' });
      await writer.writeRunRecord({ run_id: 'r1', agent_id: 'a2', task_id: 't2' });
      const content = await fs.readFile(
        path.join(ledgerDir, 'runs', 'r1.jsonl'), 'utf8'
      );
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });
  });

  describe('writeAgentTrust', () => {
    test('appends trust entry to agent history file', async () => {
      await writer.writeAgentTrust('code-analyzer', 0.5, 0.575, 'r1');
      const content = await fs.readFile(
        path.join(ledgerDir, 'agents', 'code-analyzer.jsonl'), 'utf8'
      );
      const parsed = JSON.parse(content.trim());
      expect(parsed.trust_before).toBe(0.5);
      expect(parsed.trust_after).toBe(0.575);
    });
  });

  describe('readTrustScores', () => {
    test('returns empty object when no scores exist', async () => {
      const scores = await writer.readTrustScores();
      expect(scores).toEqual({});
    });

    test('returns latest trust score per agent', async () => {
      await writer.writeAgentTrust('agent-a', 0.5, 0.6, 'r1');
      await writer.writeAgentTrust('agent-a', 0.6, 0.7, 'r2');
      await writer.writeAgentTrust('agent-b', 0.5, 0.4, 'r1');
      const scores = await writer.readTrustScores();
      expect(scores['agent-a']).toBe(0.7);
      expect(scores['agent-b']).toBe(0.4);
    });
  });

  describe('agentId / runId path sanitization (ryordanov audit #10)', () => {
    // Pre-fix: writeRunRecord and writeAgentTrust used raw agentId / run_id
    // in path.join, so a crafted value like '../../etc/passwd' would write
    // outside the ledger directory. Post-fix: non-[A-Za-z0-9._-] chars are
    // replaced with '_'. The JSONL payload keeps the original ID for
    // post-hoc analysis.

    test('writeAgentTrust with traversal-style agentId stays inside agents/', async () => {
      const malicious = '../../escape/attempt';
      await writer.writeAgentTrust(malicious, 0.5, 0.6, 'r1');

      const agentsDir = path.join(ledgerDir, 'agents');
      const entries = await fs.readdir(agentsDir);
      expect(entries).toHaveLength(1);
      // No slashes survived sanitization → the file lives flat under agents/.
      expect(entries[0]).not.toMatch(/[\/\\]/);
      expect(entries[0]).toMatch(/\.jsonl$/);

      // Verify no file escaped to the ledger root.
      const ledgerEntries = await fs.readdir(ledgerDir);
      expect(ledgerEntries.sort()).toEqual(['agents'].sort());

      // Payload preserves the original agentId for analysis.
      const payload = JSON.parse((await fs.readFile(path.join(agentsDir, entries[0]), 'utf8')).trim());
      expect(payload.agent_id).toBe(malicious);
    });

    test('writeRunRecord with traversal-style run_id stays inside runs/', async () => {
      const malicious = '../../etc/passwd';
      await writer.writeRunRecord({ run_id: malicious, agent_id: 'a', task_id: 't' });

      const runsDir = path.join(ledgerDir, 'runs');
      const entries = await fs.readdir(runsDir);
      expect(entries).toHaveLength(1);
      expect(entries[0]).not.toMatch(/[\/\\]/);
      expect(entries[0]).toMatch(/\.jsonl$/);

      const payload = JSON.parse((await fs.readFile(path.join(runsDir, entries[0]), 'utf8')).trim());
      expect(payload.run_id).toBe(malicious);
    });

    test('legitimate agentId with allowed chars passes through unchanged', async () => {
      await writer.writeAgentTrust('sonnet-mt-cross-module-auth-refactor', 0.5, 0.6, 'r1');
      const entries = await fs.readdir(path.join(ledgerDir, 'agents'));
      expect(entries).toContain('sonnet-mt-cross-module-auth-refactor.jsonl');
    });

    test('readTrustScores keys by original agentId regardless of sanitized filename', async () => {
      const malicious = '../bad/id';
      await writer.writeAgentTrust(malicious, 0.5, 0.6, 'r1');
      const scores = await writer.readTrustScores();
      expect(scores[malicious]).toBe(0.6);
    });
  });

  describe('readTrustScores recovers both scores when two raw agentIds collide on sanitized filename (ryordanov NEW-5)', () => {
    // Filenames are sanitized via safeId() but payload agent_id is raw.
    // Two distinct unsanitized agentIds that sanitize to the same filename
    // (e.g. 'foo bar' and 'foo/bar' both → 'foo_bar.jsonl') will both write
    // into the same file. Pre-fix, readTrustScores walked the file but
    // kept only the last entry, so the earlier writer's score was lost
    // from the returned map (still recoverable from JSONL via post-hoc
    // analysis, but invisible to in-memory consumers).
    //
    // Today's production agentIds are slug-safe (`${model}-mt-${scenario}`)
    // so collisions don't happen, but the asymmetric keying is a latent bug.

    test('walks all entries per file and emits a score per distinct payload agent_id', async () => {
      // Both 'foo bar' and 'foo/bar' sanitize to 'foo_bar.jsonl' because
      // both space and slash are replaced with '_' by safeId.
      const agentA = 'foo bar';
      const agentB = 'foo/bar';
      await writer.writeAgentTrust(agentA, 0.5, 0.65, 'r1');
      await writer.writeAgentTrust(agentB, 0.5, 0.72, 'r2');

      // Sanity: both writes went into the same file.
      const agentsDir = path.join(ledgerDir, 'agents');
      const entries = await fs.readdir(agentsDir);
      expect(entries).toHaveLength(1);

      // Post-fix: both scores recovered, each keyed by the raw payload agent_id.
      const scores = await writer.readTrustScores();
      expect(scores[agentA]).toBe(0.65);
      expect(scores[agentB]).toBe(0.72);
    });

    test('single-agent file behavior unchanged — regression guard for legacy path', async () => {
      // For slug-safe IDs (the only IDs production uses today), each file
      // holds entries from exactly one agent. The walk-all change must
      // return identical output to the old "last entry wins" behavior on
      // single-agent files — i.e. the final trust_after seen.
      await writer.writeAgentTrust('sonnet-mt-auth-refactor', 0.5, 0.6, 'r1');
      await writer.writeAgentTrust('sonnet-mt-auth-refactor', 0.6, 0.72, 'r2');
      await writer.writeAgentTrust('sonnet-mt-auth-refactor', 0.72, 0.81, 'r3');
      const scores = await writer.readTrustScores();
      expect(scores['sonnet-mt-auth-refactor']).toBe(0.81);
    });
  });
});
