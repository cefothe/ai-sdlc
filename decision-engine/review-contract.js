// Review contract — REVIEW.md at the repo root tells every reviewer what to
// check and what to ignore (Anthropic "AI-native SDLC playbook", Deploy stage):
// the review passes, what counts as Important vs a nit, paths to skip, and a
// cap on nits so findings stay worth reading. The contract is rendered into
// every reviewer prompt and applied deterministically to their findings:
// findings on skipped paths are dropped and minor/suggestion findings are
// capped at maxNits (critical/major are never capped).
//
//   ---
//   maxNits: 5
//   skip: ["^src/gen/", "\\.lock$"]
//   ---
//   ## Passes ...

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const REVIEW_FILE = 'REVIEW.md';
const DEFAULT_MAX_NITS = 5;
const NIT_SEVERITIES = new Set(['minor', 'suggestion']);
const SEVERITY_ORDER = ['critical', 'major', 'minor', 'suggestion'];

function loadReviewContract(root) {
  const file = join(root, REVIEW_FILE);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let fm = {};
  if (m) {
    try { fm = yaml.load(m[1]) || {}; } catch (err) { throw new Error(`${REVIEW_FILE} frontmatter is not valid YAML: ${err.message}`); }
  }
  return {
    path: REVIEW_FILE,
    maxNits: Number.isInteger(fm.maxNits) && fm.maxNits >= 0 ? fm.maxNits : DEFAULT_MAX_NITS,
    skip: (fm.skip || []).map((p) => new RegExp(p, 'i')),
    body: (m ? m[2] : text).trim(),
  };
}

function formatReviewContract(contract) {
  if (!contract) return null;
  return [
    `REVIEW CONTRACT (${contract.path}) — review exactly these passes; findings on skipped paths are discarded; at most ${contract.maxNits} minor/suggestion findings are kept, so report the ones that matter:`,
    contract.body,
  ].join('\n');
}

// Apply the contract to reviewer verdicts (pure). Returns new verdicts.
function applyReviewContract(verdicts, contract) {
  if (!contract) return verdicts;
  let nitsLeft = contract.maxNits;
  return (verdicts || []).map((v) => {
    const kept = (v.findings || [])
      .filter((f) => !(f.file && contract.skip.some((re) => re.test(f.file))))
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
      .filter((f) => {
        if (!NIT_SEVERITIES.has(f.severity)) return true;
        if (nitsLeft <= 0) return false;
        nitsLeft -= 1;
        return true;
      });
    return { ...v, findings: kept };
  });
}

module.exports = { loadReviewContract, formatReviewContract, applyReviewContract, REVIEW_FILE, DEFAULT_MAX_NITS };
