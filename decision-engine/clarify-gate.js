// Clarify gate — surfaces ambiguity in a PRD before a human approves it.
// Runs once, at the /ai-sdlc:new seam (after the discovery panel drafts the PRD,
// before approval). This is a BEFORE-action gate, aligned with R7 (structured
// context up front, d=1.82) — not a post-hoc feedback loop (R5/R15 harmful).
//
// Two tiers, matching the DoR/PRD gate pattern:
//   - ENFORCED (deterministic): the PRD's "Open questions" section must be
//     resolved. Any line still phrased as a question blocks approval-readiness.
//   - ADVISORY (deterministic + agent): ambiguity tokens (TBD, and/or, etc.) are
//     reported; the semantic surfacing of *unwritten* ambiguity is the clarify
//     agent's job (orchestrated by the command), reported to the operator.

const { parsePrd } = require('./prd-gate');

// Ambiguity tokens that hint at an unresolved decision. Advisory only — too
// noisy to hard-block on (e.g. "etc."), but worth flagging for the human.
const AMBIGUITY_RE = /\b(TBD|to be (?:decided|determined)|and\/or|as needed|somehow|unclear|possibly|maybe)\b|\?\?\?/i;

function findSection(sections, name) {
  const needle = name.toLowerCase();
  return sections.find((s) => s.heading.toLowerCase().startsWith(needle));
}

// A line counts as an unresolved question if it contains a '?' and the section
// isn't explicitly cleared. "None." / "N/A" / "resolved" clear the section.
function extractUnresolved(content) {
  const t = (content || '').trim();
  if (!t) return [];
  if (/^\s*(none|n\/a|nothing|resolved)\b/i.test(t)) return [];
  return t
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l.includes('?'));
}

// Evaluate PRD clarity. Pure — caller supplies the markdown.
function evaluateClarity(markdown, { path = '<prd>' } = {}) {
  const { sections } = parsePrd(markdown);
  const open = findSection(sections, 'Open questions');
  const unresolvedQuestions = open ? extractUnresolved(open.content) : [];

  const ambiguityFlags = [];
  markdown.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(AMBIGUITY_RE);
    if (m) ambiguityFlags.push({ line: i + 1, token: m[0], text: line.trim() });
  });

  const clear = unresolvedQuestions.length === 0;
  const reasons = [];
  if (!clear) reasons.push(`${unresolvedQuestions.length} unresolved open question(s) — resolve before approval`);

  const advisory = ambiguityFlags.map((f) => ({ code: 'ambiguity-token', message: `ambiguity token "${f.token}" on line ${f.line}` }));

  return { path, clear, unresolvedQuestions, ambiguityFlags, advisory, reasons };
}

function evaluateClarityFile(prdPath) {
  const markdown = require('node:fs').readFileSync(prdPath, 'utf8');
  return evaluateClarity(markdown, { path: prdPath });
}

module.exports = { evaluateClarity, evaluateClarityFile };

// CLI: node decision-engine/clarify-gate.js docs/prd/<slug>.md
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: clarify-gate <path-to-prd.md>');
    process.exit(1);
  }
  try {
    const res = evaluateClarityFile(target);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.clear ? 0 : 2);
  } catch (err) {
    console.error(`clarify-gate failed: ${err.message}`);
    process.exit(1);
  }
}
