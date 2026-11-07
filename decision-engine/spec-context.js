// Spec context — the approved PRD (what/why) and design doc (how) rendered as
// implementation context for a task. The DoR gate already proves these exist
// and are ratified (gates 3/8/9); this module is what makes their CONTENT reach
// the planner, the implementer and the reviewers instead of only gating
// admission. Without it the implementer saw a task title + ACs and re-derived
// the design the operator had just approved.
//
// Token-budgeted: sections are admitted in priority order (the buildable
// contract first — ACs, scope, schema, interfaces, data flow) until maxChars;
// a section that only partly fits is truncated with an explicit marker, and
// sections that do not fit are listed by name so the agent can open the file.

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { headingMatchesSection: prdHeadingMatches } = require('./prd-gate');
const { loadDoc, allocate, renderDoc } = require('./doc-budget');
const { headingMatchesSection: designHeadingMatches, resolveInside } = require('./design-gate');
const { headingMatchesSection: bugHeadingMatches } = require('./bug-gate');
const { formatArchitectureContext, ARCHITECTURE_PATH } = require('./architecture-context');
const { projectsForPaths } = require('./monorepo');

const DEFAULT_MAX_CHARS = 24000;
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9_.-]*$/i;

// Lower index = admitted first under the budget. Unlisted sections rank last.
const PRD_PRIORITY = [
  'Acceptance criteria', 'Scope', 'Non-goals', 'User flows', 'Edge cases',
  'Non-functional requirements', 'Problem', 'Target user', 'Success metrics', 'Open questions',
];
// A bug fix is driven by the reproduction, then by what "correct" means.
const BUG_PRIORITY = [
  'Reproduction', 'Expected behavior', 'Actual behavior', 'Steps to reproduce',
  'Suspected cause', 'Environment', 'Impact', 'Summary',
];
const BUG_DIR_RE = /^(\.\/)?docs\/bugs\//;
const DESIGN_PRIORITY = [
  'Data model', 'Interfaces', 'Data flow', 'Architecture', 'Test strategy',
  'Risks', 'Decisions', 'Context',
];

function existingInside(root, rel) {
  if (typeof rel !== 'string' || !rel) return null;
  const full = resolveInside(root, rel);
  return full && existsSync(full) ? full : null;
}

function designFor(root, featureId, designDir) {
  if (!featureId || !SAFE_SLUG_RE.test(featureId) || featureId.includes('..')) return null;
  return existingInside(root, join(designDir, `${featureId}.md`));
}

const slugOf = (p) => String(p || '').replace(/^.*\//, '').replace(/\.md$/i, '');

// Locate the task's spec. A feature task links its PRD (specRef.artifactPath)
// and has a design doc at <designDir>/<featureId>.md. A bug task links its bug
// report instead; the feature it regresses (the report's relatedPrd) supplies
// the PRD + design as context. Paths that escape the root are ignored.
function resolveSpecPaths(root, task, { designDir = join('docs', 'design') } = {}) {
  const fm = (task && task.frontmatter) || {};
  const ref = fm.specRef || {};
  const artifact = existingInside(root, ref.artifactPath);
  const isBug = ref.source === 'bug' || BUG_DIR_RE.test(String(ref.artifactPath || ''));
  if (isBug) {
    let relatedPrd = null;
    if (artifact) {
      const { frontmatter } = require('./prd-gate').parsePrd(readFileSync(artifact, 'utf8'));
      relatedPrd = existingInside(root, frontmatter.relatedPrd);
    }
    const featureId = relatedPrd ? slugOf(relatedPrd) : '';
    return { bugPath: artifact, prdPath: relatedPrd, designPath: designFor(root, featureId, designDir), featureId };
  }
  const featureId = String(ref.featureId || fm.feature || slugOf(ref.artifactPath) || '');
  return { bugPath: null, prdPath: artifact, designPath: designFor(root, featureId, designDir), featureId };
}

// Load the task's spec documents. Returns { bug, prd, design, featureId } where
// each doc is { path, status, sections } or null when absent.
function loadSpecForTask(root, task, opts = {}) {
  const { bugPath, prdPath, designPath, featureId } = resolveSpecPaths(root, task, opts);
  return {
    featureId,
    bug: bugPath ? loadDoc(bugPath, root, BUG_PRIORITY, bugHeadingMatches) : null,
    prd: prdPath ? loadDoc(prdPath, root, PRD_PRIORITY, prdHeadingMatches) : null,
    design: designPath ? loadDoc(designPath, root, DESIGN_PRIORITY, designHeadingMatches) : null,
  };
}

// Render the spec as a prompt block, or null when the task links no spec.
function formatSpecContext(spec, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  if (!spec || (!spec.bug && !spec.prd && !spec.design)) return null;
  const docs = [];
  if (spec.bug) docs.push({ key: 'bug', doc: spec.bug });
  if (spec.prd) docs.push({ key: 'prd', doc: spec.prd });
  if (spec.design) docs.push({ key: 'design', doc: spec.design });
  const { admitted, dropped } = allocate(docs, maxChars);
  if (spec.bug) {
    const out = [
      'BUG FIX — the confirmed bug report is the contract. Fix the root cause, not the symptom.',
      '- The Reproduction is the oracle: its test must FAIL before the fix and PASS after it.',
      '- Make the smallest change that restores the Expected behavior; no unrelated refactors or features.',
      '- The related PRD/design (if shown) define correct behavior — the fix must not contradict them.',
      '',
      renderDoc('Bug report', spec.bug, admitted.get('bug'), dropped.get('bug')),
    ];
    if (spec.prd) out.push('', renderDoc('Related PRD', spec.prd, admitted.get('prd'), dropped.get('prd')));
    if (spec.design) out.push('', renderDoc('Related design', spec.design, admitted.get('design'), dropped.get('design')));
    return out.join('\n');
  }
  const out = [
    'SPECIFICATION — the approved contract for this task. Build against it, not around it.',
    '- The PRD is the WHAT/WHY: every acceptance criterion must be met; stay inside Scope; honor Non-goals.',
    '- The design doc is the HOW: use its data model, interfaces and data flow as written.',
    '- If the codebase or a constraint forces a divergence from either, STOP and flag it — do not silently redesign.',
  ];
  if (spec.prd) out.push('', renderDoc('PRD', spec.prd, admitted.get('prd'), dropped.get('prd')));
  if (spec.design) out.push('', renderDoc('Design', spec.design, admitted.get('design'), dropped.get('design')));
  if (!spec.design) out.push('', '(no design doc found for this feature — implement from the PRD and ADRs)');
  return out.join('\n');
}

// The spec for a task, ready for the pipeline: the rendered prompt block plus
// whether an approved design doc exists (the executor then uses it instead of
// improvising a fresh design panel).
// The architecture slice rides along: the components the task reaches (named in
// its spec or owning its referenced paths), their contracts and data, and every
// invariant — present even for a task with no PRD, when the repo has an overview.
function buildSpecForTask(root, task, opts = {}) {
  const spec = loadSpecForTask(root, task, opts);
  const fm = (task && task.frontmatter) || {};
  const docText = [spec.bug, spec.prd, spec.design].filter(Boolean).flatMap((d) => d.sections.map((x) => x.content));
  const texts = [fm.title, task && task.body, ...docText];
  const paths = [...(fm.references || []), ...(fm.refs || [])];
  const architecture = formatArchitectureContext(root, { texts, paths });
  // Monorepo: each touched subproject's own overview, with paths made project-relative.
  const projectSlices = projectsForPaths(opts.projects || [], paths).map((p) => formatArchitectureContext(root, {
    texts, path: join(p.path, ARCHITECTURE_PATH),
    paths: paths.filter((x) => x.startsWith(`${p.path}/`)).map((x) => x.slice(p.path.length + 1)),
  })).filter(Boolean);
  const text = [formatSpecContext(spec, opts), architecture, ...projectSlices].filter(Boolean).join('\n\n') || null;
  return {
    text,
    architectureInjected: !!architecture || projectSlices.length > 0,
    kind: spec.bug ? 'bug' : 'feature',
    bugPath: spec.bug ? spec.bug.path : null,
    prdPath: spec.prd ? spec.prd.path : null,
    designPath: spec.design ? spec.design.path : null,
    designApproved: !!(spec.design && spec.design.status === 'approved'),
  };
}

module.exports = { loadSpecForTask, formatSpecContext, buildSpecForTask, resolveSpecPaths, DEFAULT_MAX_CHARS };

// CLI: node decision-engine/spec-context.js "backlog/tasks/<ID> - <slug>.md" [--max-chars N]
if (require.main === module) {
  const target = process.argv[2];
  const i = process.argv.indexOf('--max-chars');
  const maxChars = i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : DEFAULT_MAX_CHARS;
  if (!target || !Number.isFinite(maxChars) || maxChars <= 0) {
    console.error('usage: spec-context <task-file.md> [--max-chars N]');
    process.exit(1);
  }
  try {
    const { loadTaskFile } = require('./backlog-task');
    const text = formatSpecContext(loadSpecForTask(process.cwd(), loadTaskFile(target)), { maxChars });
    console.log(text || '(task links no PRD/design — no spec context)');
    process.exit(0);
  } catch (err) {
    console.error(`spec-context failed: ${err.message}`);
    process.exit(1);
  }
}
