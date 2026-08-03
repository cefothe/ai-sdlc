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
