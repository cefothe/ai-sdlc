const fs = require('fs').promises;
const path = require('path');

// Match anything that is NOT [A-Za-z0-9._-]. Replaced with '_'. Prevents
// path traversal via agentId values like '../../etc/passwd' or values
// containing slashes from escaping the agents/runs subdir.
const UNSAFE_ID_CHARS = /[^A-Za-z0-9._-]/g;
function safeId(id) {
  if (id == null) return '_';
  return String(id).replace(UNSAFE_ID_CHARS, '_').slice(0, 200) || '_';
}

class LedgerWriter {
  constructor(ledgerDir) {
    if (!ledgerDir) throw new Error('ledgerDir is required');
    this.ledgerDir = ledgerDir;
  }

  async writeRunRecord(record) {
    const runsDir = path.join(this.ledgerDir, 'runs');
    await fs.mkdir(runsDir, { recursive: true });
    const enriched = { ...record, timestamp: new Date().toISOString() };
    // safeId on the FILENAME path component only — the JSONL payload keeps
    // the original run_id so post-hoc analysis is unaffected by sanitization.
    const filePath = path.join(runsDir, `${safeId(record.run_id)}.jsonl`);
    await fs.appendFile(filePath, JSON.stringify(enriched) + '\n', 'utf8');
  }

  async writeAgentTrust(agentId, trustBefore, trustAfter, runId) {
    const agentsDir = path.join(this.ledgerDir, 'agents');
    await fs.mkdir(agentsDir, { recursive: true });
    const entry = {
      agent_id: agentId,
      trust_before: trustBefore,
      trust_after: trustAfter,
      run_id: runId,
      timestamp: new Date().toISOString(),
    };
    // safeId guards against path traversal via crafted agentId. Payload keeps
    // the raw agentId so legitimate values are still recoverable.
    const filePath = path.join(agentsDir, `${safeId(agentId)}.jsonl`);
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8');
  }

  async readTrustScores() {
    const agentsDir = path.join(this.ledgerDir, 'agents');
    const scores = {};
    try {
      const files = await fs.readdir(agentsDir);
      for (const file of files.filter(f => f.endsWith('.jsonl'))) {
        const filePath = path.join(agentsDir, file);
        const handle = await fs.open(filePath, 'r');
        try {
          // Pre-fix, this read only the LAST entry per file and used its
          // raw agent_id as the score key. Filenames are sanitized via
          // safeId() but agent_id in the payload is raw — so two distinct
          // unsanitized agentIds that sanitize to the same filename would
          // both write entries into the same file, but readTrustScores
          // returned only the score of whichever agentId appeared on the
          // last line. The other agent's score history was silently lost
          // from the returned map (still recoverable from JSONL).
          //
          // Walk every entry and key the per-file Map by payload agent_id
          // — same single-file behavior on slug-safe IDs (Map has one key,
          // final value = last trust_after seen), but recovers both scores
          // on the collision case.
          //
          // Caught by ryordanov-tradu re-verification of HEAD `2905120`
          // (NEW-5). Not triggerable with current `${model}-mt-${scenario}`
          // IDs but the asymmetry shouldn't exist.
          const stream = handle.createReadStream({ encoding: 'utf8' });
          let remainder = '';
          const perAgent = new Map();
          for await (const chunk of stream) {
            remainder += chunk;
            const parts = remainder.split('\n');
            remainder = parts.pop();
            for (const part of parts) {
              if (part.trim()) {
                const entry = JSON.parse(part);
                perAgent.set(entry.agent_id, entry.trust_after);
              }
            }
          }
          if (remainder.trim()) {
            const entry = JSON.parse(remainder);
            perAgent.set(entry.agent_id, entry.trust_after);
          }
          for (const [agentId, trust] of perAgent) {
            scores[agentId] = trust;
          }
        } finally {
          await handle.close();
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return scores;
  }
}

module.exports = { LedgerWriter };
