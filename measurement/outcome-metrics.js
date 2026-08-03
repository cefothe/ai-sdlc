// Outcome metrics — Level-1 evaluation of the *whole* pipeline (not per-artifact
// quality). Turns "is the AI SDLC actually working?" into numbers by reading a
// stream of run-records (one per task through /ai-sdlc:execute) and computing the
// four production metrics the field considers decisive
// (https://labs.adaline.ai/p/evaluate-coding-agents-production):
//
//   completionRate       — strict: merged clean, tests pass, ZERO human corrections
//   regressionRate       — of completed runs, fraction that introduced a regression
//   avgReviewLoops       — mean informed-retry cycles before merge-ready
//   avgBlastRadius        — mean files touched outside the task's declared surfaces
//
// Plus leadTime and per-gate block counts. The run-record shape is validated by
// spec/schemas/run-record.schema.json; this module also validates defensively so
// a malformed row degrades to a counted "invalid" rather than crashing the run.

const { readFileSync, existsSync, appendFileSync, mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

// Minimal structural validation — the fields the metrics actually depend on.
// Returns { valid, errors }.
function validateRunRecord(rec) {
  const errors = [];
  if (!rec || typeof rec !== 'object') return { valid: false, errors: ['not an object'] };
  if (!rec.taskId) errors.push('missing taskId');
  if (!rec.outcome || typeof rec.outcome !== 'object') errors.push('missing outcome');
  if (rec.tests && rec.tests.after && typeof rec.tests.after.failed !== 'number') errors.push('tests.after.failed must be a number');
  return { valid: errors.length === 0, errors };
}

// Strict completion (Adaline definition): a diff that builds, passes the suite,
// and needs NO human correction before merge. A partially-working diff a human
// had to edit is NOT a completion — loose definitions overstate reliability by
// 20–30pp.
function isStrictCompletion(rec) {
  const o = rec.outcome || {};
  const testsAfter = (rec.tests && rec.tests.after) || {};
  const testsGreen = (testsAfter.failed || 0) === 0 && (o.buildPassed !== false);
  return Boolean(o.mergedClean) && testsGreen && (o.humanCorrections || 0) === 0;
}

// Parse a JSONL run-record stream into records + a parse report.
function parseRunRecords(jsonl) {
  const records = [];
  const invalid = [];
  for (const line of String(jsonl).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (err) {
      invalid.push({ line, error: `unparseable JSON: ${err.message}` });
      continue;
    }
    const v = validateRunRecord(rec);
    if (v.valid) records.push(rec);
    else invalid.push({ line, error: v.errors.join('; ') });
  }
  return { records, invalid };
}

function mean(nums) {
  const xs = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// Compute the scorecard from an array of validated run-records.
function scorecard(records) {
  const n = records.length;
  const completed = records.filter(isStrictCompletion);
  const regressions = completed.filter((r) => (r.outcome || {}).regressionIntroduced === true);

  const gateBlocks = { dor: 0, prd: 0, clarify: 0, analyze: 0 };
  for (const r of records) {
    const g = r.gates || {};
    if (g.dor && g.dor.admitted === false) gateBlocks.dor++;
    if (g.prd && g.prd.valid === false) gateBlocks.prd++;
    if (g.clarify && g.clarify.clear === false) gateBlocks.clarify++;
    if (g.analyze && g.analyze.consistent === false) gateBlocks.analyze++;
  }

  return {
    runs: n,
    // Level-1 outcome metrics.
    completionRate: n ? completed.length / n : null,
    regressionRate: completed.length ? regressions.length / completed.length : null,
    avgReviewLoops: mean(records.map((r) => (r.review || {}).cycles)),
    avgBlastRadius: mean(records.map((r) => (r.outcome || {}).blastRadiusFiles)),
    avgLeadTimeMs: mean(records.map((r) => r.leadTimeMs)),
    // Supporting counts.
    completed: completed.length,
    regressions: regressions.length,
    gateBlocks,
  };
}

// Convenience: evaluate a JSONL file path -> { scorecard, invalid }.
function evaluateRunFile(runsPath) {
  if (!existsSync(runsPath)) throw new Error(`run-record file not found: ${runsPath}`);
  const { records, invalid } = parseRunRecords(readFileSync(runsPath, 'utf8'));
  return { scorecard: scorecard(records), invalid, counted: records.length };
}

// Append a run-record to a JSONL sink (used by the pipeline/commands). Validates
// before writing so the metrics stream stays clean.
function recordRun(sinkPath, rec) {
  const v = validateRunRecord(rec);
  if (!v.valid) throw new Error(`invalid run-record: ${v.errors.join('; ')}`);
  mkdirSync(dirname(sinkPath), { recursive: true });
  appendFileSync(sinkPath, JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

module.exports = {
  validateRunRecord,
  isStrictCompletion,
  parseRunRecords,
  scorecard,
  evaluateRunFile,
  recordRun,
};

// CLI: node measurement/outcome-metrics.js <runs.jsonl>
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: outcome-metrics <runs.jsonl>');
    process.exit(1);
  }
  try {
    const { scorecard: sc, invalid, counted } = evaluateRunFile(target);
    console.log(JSON.stringify({ scorecard: sc, counted, invalid: invalid.length }, null, 2));
    if (invalid.length) console.error(`warning: skipped ${invalid.length} invalid run-record(s)`);
    process.exit(0);
  } catch (err) {
    console.error(`outcome-metrics failed: ${err.message}`);
    process.exit(1);
  }
}
