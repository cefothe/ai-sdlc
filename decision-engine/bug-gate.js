// Bug gate — governs the bug report artifact (docs/bugs/<bug-id>.md), the
// entry point of the bug flow (/ai-sdlc:bug). A bug fix does not go through a
// PRD and a design doc; it goes through a triaged, reproducible report whose
// Reproduction section becomes the RED oracle of the fix.
//
//   - ENFORCED: canonical sections present + substantive, numbered reproduction
//     steps, a severity from the allowed set, a Reproduction that names a
//     runnable command, no placeholder markers. Dispatch additionally needs
//     status: confirmed (a human ratified the triage) — DoR gate 10.
//   - ADVISORY: thin sections, an unknown suspected cause.

const { readFileSync } = require('node:fs');
const { parsePrd } = require('./prd-gate');
const { makeMatcher, findSection: findDocSection, checkSections, markerTokens, structureReasons } = require('./doc-sections');

const REQUIRED_SECTIONS = [
  'Summary',
  'Environment',
  'Steps to reproduce',
  'Expected behavior',
  'Actual behavior',
  'Impact',
  'Reproduction',
  'Suspected cause',
];

const SECTION_ALIASES = {
  'Steps to reproduce': ['steps to reproduce', 'repro steps', 'steps'],
  'Expected behavior': ['expected'],
  'Actual behavior': ['actual', 'observed'],
  Impact: ['impact', 'severity'],
  Reproduction: ['reproduction', 'failing test', 'repro test'],
  'Suspected cause': ['suspected cause', 'root cause', 'cause', 'analysis'],
};

const SEVERITIES = ['critical', 'major', 'minor', 'trivial'];
const MIN_SECTION_CHARS = 20;
const THIN_SECTION_CHARS = 60;
// A runnable command: inline code or a fenced block.
const COMMAND_RE = /`[^`\n]{3,}`|```[\s\S]+?```/;
const NUMBERED_STEP_RE = /^\s*\d+[.)]\s+\S/m;

const headingMatchesSection = makeMatcher(SECTION_ALIASES);
const findSection = (sections, name) => findDocSection(sections, name, headingMatchesSection);

function evaluateBug(markdown, { path = '<bug>' } = {}) {
  const { frontmatter, sections } = parsePrd(markdown);
  const status = String(frontmatter.status || '').toLowerCase();
  const severity = String(frontmatter.severity || '').toLowerCase();

  const { missingSections, emptySections, substanceIssues, advisory } = checkSections(sections, REQUIRED_SECTIONS, {
    matches: headingMatchesSection, minChars: MIN_SECTION_CHARS, thinChars: THIN_SECTION_CHARS,
  });
  const markers = markerTokens(markdown);

  const steps = findSection(sections, 'Steps to reproduce');
  if (steps && steps.hasContent && !NUMBERED_STEP_RE.test(steps.content)) {
    substanceIssues.push({ code: 'steps-not-numbered', section: 'Steps to reproduce', message: 'Steps to reproduce must be a numbered list (1. 2. 3.)' });
  }
  const repro = findSection(sections, 'Reproduction');
  if (repro && repro.hasContent && !COMMAND_RE.test(repro.content)) {
    substanceIssues.push({ code: 'no-repro-command', section: 'Reproduction', message: 'Reproduction names no runnable command — give the failing test and the exact `command` that runs it' });
  }
  if (!SEVERITIES.includes(severity)) {
    substanceIssues.push({ code: 'severity-invalid', section: null, message: `frontmatter severity "${severity || 'unset'}" must be one of ${SEVERITIES.join('/')}` });
  }

  const cause = findSection(sections, 'Suspected cause');
  if (cause && /^unknown\b/i.test(cause.content)) advisory.push({ code: 'cause-unknown', message: 'Suspected cause is unknown — the implementer must investigate before fixing' });

  const structureValid = !missingSections.length && !emptySections.length && !markers.length;
  const substanceValid = !substanceIssues.length;
  const confirmed = status === 'confirmed';
  const reasons = [...structureReasons({ missingSections, emptySections, markers }), ...substanceIssues.map((i) => i.message)];
  if (!confirmed) reasons.push(`status is "${status || 'unset'}" — a human must confirm the triage (status: confirmed)`);

  return {
    path, status, severity, valid: structureValid && substanceValid && confirmed, structureValid, substanceValid, confirmed,
    missingSections, emptySections, markers, substanceIssues, advisory, reasons,
  };
}

function evaluateBugFile(bugPath) {
  return evaluateBug(readFileSync(bugPath, 'utf8'), { path: bugPath });
}

// The task acceptance criteria a bug report implies: the reproduction goes
// GREEN, the expected behavior holds, nothing else regresses.
function bugAcceptanceCriteria(markdown) {
  const { sections } = parsePrd(markdown);
  const repro = findSection(sections, 'Reproduction');
  const expected = findSection(sections, 'Expected behavior');
  const cmd = repro && (repro.content.match(/`([^`\n]{3,})`/) || [])[1];
  const firstLine = (s) => (s ? s.content.split(/\r?\n/).find((l) => l.trim()) || '' : '').trim();
  return [
    cmd ? `The reproduction test passes: \`${cmd}\` (it fails before the fix)` : 'The reproduction test from the bug report passes (it fails before the fix)',
    expected ? `Expected behavior holds: ${firstLine(expected)}` : null,
    'No regression: the full test suite passes',
  ].filter(Boolean);
}

module.exports = { evaluateBug, evaluateBugFile, bugAcceptanceCriteria, headingMatchesSection, REQUIRED_SECTIONS, SEVERITIES };

// CLI: node decision-engine/bug-gate.js docs/bugs/<bug-id>.md
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: bug-gate <path-to-bug.md>');
    process.exit(1);
  }
  try {
    const res = evaluateBugFile(target);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.valid ? 0 : 2);
  } catch (err) {
    console.error(`bug-gate failed: ${err.message}`);
    process.exit(1);
  }
}
