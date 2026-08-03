// Promise verification as a QualityGate signal (Phase 5 of the convergence).
//
// This is how the kept strength — promise/observability-checker.js — plugs
// into the reference's declarative QualityGate model WITHOUT reintroducing the
// harm our own research measured:
//   - R5 (d=-0.64): feeding broken-promise summaries back to the author degrades quality
//   - R15 (d=-1.37): clean-prompt retry on gate failure degrades quality
// So this module NEVER re-invokes the implementer. It only:
//   1. scores promise verdicts into a QualityGate outcome (advisory by default;
//      only a hard-mandatory gate is blocking, and blocking gates block the
//      PIPELINE/merge — a human/CI boundary — not the author's turn), and
//   2. formats findings as READ-ONLY context for the 3 independent reviewers.
//
// Input `results` is the array returned by ObservabilityChecker.verifyAll():
// each entry has { promise_id, result: 'kept'|'broken'|'partial'|'skipped',
// confidence, evidence }.

const { existsSync, readFileSync } = require('node:fs');
const yaml = require('js-yaml');

const ENFORCEMENT_LEVELS = ['advisory', 'soft-mandatory', 'hard-mandatory'];

function loadQualityGate(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const doc = yaml.load(readFileSync(path, 'utf8'));
    if (!doc || doc.kind !== 'QualityGate') return null;
    return doc;
  } catch (err) {
    throw new Error(`invalid quality-gate.yaml: ${err.message}`);
  }
}

function brokenCount(results) {
  return (results || []).filter((r) => r && r.result === 'broken').length;
}

function compare(value, operator, threshold) {
  switch (operator) {
    case '==': return value === threshold;
    case '!=': return value !== threshold;
    case '>': return value > threshold;
    case '<': return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    default: return false;
  }
}

// Evaluate the promise-verification gate against verification results.
// Returns { name, enforcement, metric, metricValue, passed, blocking, brokenPromises }.
// `blocking` is true only for a hard-mandatory gate that did not pass — and it
// gates the pipeline/merge, never the author's turn.
function evaluatePromiseGate(results, opts = {}) {
  const { config } = opts;
  const gate = config && config.spec && Array.isArray(config.spec.gates)
    ? config.spec.gates.find((g) => g.name === 'promise-verification')
    : null;
  const enforcement = (gate && gate.enforcement) || 'advisory';
  if (!ENFORCEMENT_LEVELS.includes(enforcement)) {
    throw new Error(`unknown enforcement level "${enforcement}"`);
  }
  const rule = (gate && gate.rule) || { metric: 'promise.broken_count', operator: '==', threshold: 0 };

  const metricValue = rule.metric === 'promise.broken_count' ? brokenCount(results) : NaN;
  const passed = compare(metricValue, rule.operator, rule.threshold);
  const brokenPromises = (results || []).filter((r) => r && r.result === 'broken').map((r) => r.promise_id);

  return {
    name: 'promise-verification',
    enforcement,
    metric: rule.metric,
    metricValue,
    passed,
    // Only a hard-mandatory failure blocks — and it blocks the pipeline/merge,
    // a human/CI boundary. Advisory + soft-mandatory report only.
    blocking: enforcement === 'hard-mandatory' && !passed,
    brokenPromises,
  };
}

// Format broken/partial findings as READ-ONLY reviewer context. This string is
// handed to the independent reviewer subagents (Step 7 review prompts) to
// inform THEIR verdict — it is never injected back into the author's context.
function formatReviewerContext(results) {
  const flagged = (results || []).filter((r) => r && (r.result === 'broken' || r.result === 'partial'));
  if (flagged.length === 0) {
    return 'Promise verification: all standing/structural/behavioral promises kept. No findings for reviewers to weigh.';
  }
  const lines = [
    'Promise verification findings (advisory context for your independent review —',
    'these are deterministic observations, not a verdict; weigh them yourself):',
    '',
  ];
  for (const r of flagged) {
    lines.push(`- [${r.result.toUpperCase()}] ${r.promise_id}${r.confidence ? ` (confidence: ${r.confidence})` : ''}: ${r.evidence || 'no evidence string'}`);
  }
  return lines.join('\n');
}

module.exports = { loadQualityGate, evaluatePromiseGate, formatReviewerContext, brokenCount, ENFORCEMENT_LEVELS };
