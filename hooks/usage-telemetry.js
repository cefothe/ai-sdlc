#!/usr/bin/env node
// Usage telemetry hook (PostToolUse on Task|Agent|Skill) — which agents and
// skills actually run, so the library can be pruned, merged and improved from
// evidence (Uber collects execution traces per skill to drive its evals and
// author feedback). Observation-only, like every hook here: always prints "{}"
// and exits 0; it never injects anything into the agent's next turn.
// Appends { at, tool, name, session } to promise/logs/usage.jsonl.

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.resolve(__dirname, '..', 'promise', 'logs', 'usage.jsonl');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

// The agent or skill a tool call invoked, or null for anything else.
function invokedName(event) {
  const tool = event && event.tool_name;
  const input = (event && event.tool_input) || {};
  if (tool === 'Task' || tool === 'Agent') return input.subagent_type || input.agent || null;
  if (tool === 'Skill') return input.skill || input.name || input.command || null;
  return null;
}

function record(event, logPath = LOG_PATH) {
  const name = invokedName(event);
  if (!name) return null;
  const entry = { at: new Date().toISOString(), tool: event.tool_name, name: String(name), session: event.session_id || null };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  return entry;
}

module.exports = { invokedName, record, LOG_PATH };

if (require.main === module) {
  try {
    record(JSON.parse(readStdin() || '{}'));
  } catch (_) {
    // telemetry must never affect the session
  }
  process.stdout.write('{}');
  process.exit(0);
}
