#!/usr/bin/env node
// Stop hook — verifies standing promises against final assistant turn
// Receives { session_id, transcript_path } via stdin
// Reads transcript JSONL, extracts final assistant turn, runs ObservabilityChecker.
//
// Always exits 0 (observation-only, never injects feedback per R5: feeding
// verification results back to the agent's next turn was shown to degrade
// quality, n=30 paired Wilcoxon p<0.05, Cohen's d=−0.64).
//
// All outcomes (kept + broken) are logged to promise/logs/stop-verify.jsonl;
// gate violations also append to promise/logs/gate-results.jsonl. Hook errors
// log to promise/logs/hook-errors.jsonl. The receiver (user, CI, orchestrator)
// reads the logs independently — nothing is communicated to the agent.

const fs = require('fs');
const path = require('path');
const { ObservabilityChecker } = require('../promise/observability-checker');
const { buildTrace, buildFingerprint } = require('../promise/trace-builder');
const { availablePromises, loadRegistry } = require('../promise/registry-loader');

const { execFileSync } = require('child_process');
const { loadBaseline } = require('../promise/baseline-comparator');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function extractFinalAssistantText(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) return null;
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const lines = content.trim().split('\n');

  let lastAssistant = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (_) {
      continue;
    }
    const isAssistant =
      entry.type === 'assistant' ||
      entry.message?.role === 'assistant';
    if (isAssistant) lastAssistant = entry;
  }

  if (!lastAssistant) return null;

  const msgContent = lastAssistant.message?.content;
  if (!msgContent) return null;

  if (typeof msgContent === 'string') return msgContent;

  if (Array.isArray(msgContent)) {
    return msgContent
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text)
      .join('\n');
  }

  return null;
}

async function main() {
  const stdin = readStdin();
  if (!stdin.trim()) {
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch (_) {
    process.exit(0);
  }

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) {
    process.exit(0);
  }

  const text = extractFinalAssistantText(transcriptPath);
  if (!text) {
    process.exit(0);
  }

  // Build trace from full transcript
  let trace = [];
  try {
    if (fs.existsSync(transcriptPath)) {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      const messages = content.trim().split('\n')
        .filter(l => l.trim())
        .map(l => { try { return JSON.parse(l); } catch (_) { return null; } })
        .filter(Boolean);
      trace = buildTrace(messages);
    }
  } catch (_) {
    // Trace building failure is non-fatal
  }

  // Load registry
  let registry;
  try {
    registry = loadRegistry();
  } catch (_) {
    registry = { version: 'unknown', promises: new Map() };
  }

  let cxpakAvailable = false;
  try {
    execFileSync('cxpak', ['--version'], { timeout: 5000, stdio: 'pipe' });
    cxpakAvailable = true;
  } catch (_) {
    cxpakAvailable = false;
  }

  // Build fingerprint
  const fingerprint = buildFingerprint({
    model: 'unknown',
    claudeMdHash: 'unknown',
    rulesLoaded: [],
    promisesActive: registry.promises.size,
    registryVersion: registry.version,
    cxpakAvailable,
  });

  // Write trace file
  const sessionId = payload.session_id || 'unknown';
  if (trace.length > 0) {
    const tracesDir = path.join(__dirname, '..', 'promise', 'logs', 'traces');
    try {
      fs.mkdirSync(tracesDir, { recursive: true });
      const traceContent = [fingerprint, ...trace].map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(path.join(tracesDir, `${sessionId}.trace.jsonl`), traceContent);
    } catch (_) {
      // Best-effort trace writing
    }
  }

  // Get modified files and diff content for verification context
  let modifiedFiles = [];
  let diffContent = null;
  try {
    const gitOutput = execFileSync('git', ['diff', '--name-only', 'HEAD'], { timeout: 5000, encoding: 'utf8' });
    modifiedFiles = gitOutput.trim().split('\n').filter(Boolean);
  } catch (_) {
    // If git diff fails, structural checks will skip (empty files list)
  }
  try {
    diffContent = execFileSync('git', ['diff', 'HEAD'], { timeout: 10000, encoding: 'utf8' });
    if (diffContent && !diffContent.trim()) diffContent = null;
  } catch (_) {
    // diff content unavailable — standing promises stay on output
  }

  // Use registry-based promises — include structural when cxpak available
  const env = { cxpak: cxpakAvailable, trace: trace.length > 0 };
  const promises = availablePromises(env);

  const workDir = process.cwd();
  const checker = new ObservabilityChecker();
  const results = await checker.verifyAll(promises, text, {
    trace,
    files: modifiedFiles,
    diff: diffContent,
    cxpak: cxpakAvailable,
    workDir,
  });

  // All broken for telemetry; high-confidence broken for gate
  const broken = results.filter(r => r.result === 'broken');
  const highConfBroken = broken.filter(r => r.confidence === 'high');

  const logDir = path.join(__dirname, '..', 'promise', 'logs');

  // Load baseline from SessionStart hook
  let baselineLoaded = false;
  try {
    const baseline = await loadBaseline(logDir, sessionId);
    if (baseline) {
      baselineLoaded = true;
    }
  } catch (_) {
    // Baseline loading failure is non-fatal
  }
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      registry_version: registry.version,
      cxpak_available: cxpakAvailable,
      baseline_loaded: baselineLoaded,
      promises_checked: results.length,
      total: results.length,
      broken: broken.map(r => ({ id: r.promise_id, confidence: r.confidence, evidence: r.evidence })),
      kept: results.filter(r => r.result === 'kept').map(r => r.promise_id),
    }) + '\n';
    fs.appendFileSync(path.join(logDir, 'stop-verify.jsonl'), logEntry, 'utf8');
  } catch (_) {
    // Best-effort logging — never block the agent
  }

  // Gate result for orchestrator — written to logs, never fed back to agent
  if (highConfBroken.length > 0) {
    try {
      const gateEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        gate: 'failed',
        violations: highConfBroken.map(r => ({ id: r.promise_id, confidence: r.confidence, evidence: r.evidence })),
      }) + '\n';
      fs.appendFileSync(path.join(logDir, 'gate-results.jsonl'), gateEntry, 'utf8');
    } catch (_) {
      // Best-effort
    }
  }

  process.exit(0);
}

main().catch(err => {
  // Log hook errors to a file rather than stderr — Stop-hook stderr is the
  // same feedback channel the rest of this file is rewritten to avoid.
  // Best-effort: if logging itself fails, exit silently. Always exit 0 so
  // the agent's session is not affected.
  try {
    const errLogDir = path.join(__dirname, '..', 'promise', 'logs');
    fs.mkdirSync(errLogDir, { recursive: true });
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'hook_error',
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
    }) + '\n';
    fs.appendFileSync(path.join(errLogDir, 'hook-errors.jsonl'), entry, 'utf8');
  } catch (_) {
    // Best-effort
  }
  process.exit(0);
});
