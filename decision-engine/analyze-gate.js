// Analyze gate — cross-artifact consistency audit before implementation.
// Runs once, at the /ai-sdlc:execute seam (after plan, before implement). This
// is the gap the review team cannot cover: review inspects the *code* AFTER it
// is written; analyze checks that the PRD, the task, and the plan agree BEFORE a
// line is written. A BEFORE-action gate (R7-aligned).
//
// Two tiers, matching the DoR/PRD gate pattern:
//   - ENFORCED (deterministic): objective linkage/coverage invariants that must
//     hold — the task links an approved PRD, both PRD and task specify
//     acceptance criteria, and (when a plan is supplied) the plan actually
//     touches the task's declared surfaces.
//   - ADVISORY (agent): the semantic consistency check — does the plan implement
//     every PRD criterion, any contradictions, orphan steps, scope creep vs the
//     PRD non-goals — is the analyze agent's job (orchestrated by the command).

const { parsePrd } = require('./prd-gate');
const { evaluatePrd } = require('./prd-gate');

const AC_ITEM_RE = /^\s*[-*]\s*\[( |x|X)\]\s*/;

function findSection(sections, name) {
  const needle = name.toLowerCase();
  return sections.find((s) => s.heading.toLowerCase().startsWith(needle));
}

function countAcs(prdMarkdown) {
  const { sections } = parsePrd(prdMarkdown);
  const ac = findSection(sections, 'Acceptance criteria');
  if (!ac) return 0;
  return ac.content.split(/\r?\n/).filter((l) => AC_ITEM_RE.test(l)).length;
}

// Evaluate consistency across PRD + task (+ optional plan text). Pure.
//   prdMarkdown : the PRD file contents (or '' if none)
//   task        : parsed task { frontmatter, acceptanceCriteria } (backlog-task shape)
//   planText    : the plan's text, when available at the execute seam ('' skips
//                 the surface-in-plan check)
function evaluateConsistency({ prdMarkdown = '', task = {}, planText = '' } = {}) {
  const fm = task.frontmatter || {};
  const taskAcs = (task.acceptanceCriteria || []).length;
  const checks = [];
  const advisory = [];

  // 1 — task links a PRD via specRef.
  const prdLinked = !!(fm.specRef && fm.specRef.artifactPath);
  checks.push({ name: 'prd-linked', ok: prdLinked, finding: prdLinked ? `linked ${fm.specRef.artifactPath}` : 'task has no specRef → no PRD to check against' });

  // 2 — the linked PRD is structurally valid + approved (reuses the PRD gate).
  let prdAcs = 0;
  if (prdLinked && prdMarkdown) {
    const prd = evaluatePrd(prdMarkdown, { path: fm.specRef.artifactPath });
    checks.push({ name: 'prd-valid', ok: prd.valid, finding: prd.valid ? 'PRD structurally valid + approved' : `PRD not ready: ${prd.reasons.join('; ')}` });
    prdAcs = countAcs(prdMarkdown);
  }

  // 3 — both artifacts specify acceptance criteria.
  checks.push({ name: 'task-has-ac', ok: taskAcs > 0, finding: taskAcs > 0 ? `${taskAcs} task AC(s)` : 'task has no acceptance criteria' });
  if (prdLinked && prdMarkdown) {
    checks.push({ name: 'prd-has-ac', ok: prdAcs > 0, finding: prdAcs > 0 ? `${prdAcs} PRD AC(s)` : 'PRD has no acceptance criteria' });
    // AC coverage is advisory: fewer task ACs than PRD ACs *may* mean an
    // uncovered criterion. Blocking on a count would be a false-precision gate.
    if (taskAcs < prdAcs) {
      advisory.push({ code: 'ac-coverage-gap', message: `task has ${taskAcs} AC(s) but PRD has ${prdAcs} — verify every PRD criterion is covered` });
    }
  }

  // 4 — the plan actually touches the task's declared surfaces (only when a plan
  // is supplied). A plan that ignores the referenced files is a red flag.
  const refs = (fm.references || []).filter((r) => typeof r === 'string' && (r.includes('/') || /\.\w+$/.test(r)));
  if (planText && refs.length) {
    const touched = refs.filter((r) => planText.includes(r) || planText.includes(r.replace(/^.*\//, '')));
    const ok = touched.length > 0;
    checks.push({ name: 'plan-touches-surfaces', ok, finding: ok ? `plan references ${touched.length}/${refs.length} surface(s)` : 'plan does not mention any of the task\'s referenced surfaces' });
  }

  const failed = checks.filter((c) => !c.ok);
  const consistent = failed.length === 0;
  const reasons = failed.map((c) => `${c.name}: ${c.finding}`);

  return { consistent, checks, coverage: { prdAcs, taskAcs, covered: prdAcs === 0 || taskAcs >= prdAcs }, advisory, reasons };
}

module.exports = { evaluateConsistency };

// CLI: node decision-engine/analyze-gate.js <task-file> [plan-file]
if (require.main === module) {
  const taskFile = process.argv[2];
  const planFile = process.argv[3];
  if (!taskFile) {
    console.error('usage: analyze-gate <task-file.md> [plan-file]');
    process.exit(1);
  }
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const { loadTaskFile } = require('./backlog-task');
    const task = loadTaskFile(taskFile);
    const prdPath = task.frontmatter && task.frontmatter.specRef && task.frontmatter.specRef.artifactPath;
    const prdMarkdown = prdPath && fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf8') : '';
    const planText = planFile && fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : '';
    const res = evaluateConsistency({ prdMarkdown, task, planText });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.consistent ? 0 : 2);
  } catch (err) {
    console.error(`analyze-gate failed: ${err.message}`);
    process.exit(1);
  }
}
