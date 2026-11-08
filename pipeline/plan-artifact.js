// Plan artifact — the approved plan is committed with the change, not lost in a
// prompt: docs/plans/<task-id>.md holds the plan text and its execution
// manifest, so reviewers, the validation table and later audits see what was
// intended. planDrift then compares the real diff with it: a changed source
// file the plan never names is drift — the plan should have been updated with
// the code (or the change went beyond it).

const { mkdirSync, writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { EXEMPT_RE } = require('../decision-engine/architecture-conformance');

const PLANS_DIR = join('docs', 'plans');
const SAFE_ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

function planPath(taskId) {
  if (!SAFE_ID_RE.test(String(taskId))) throw new Error(`unsafe task id for a plan path: ${taskId}`);
  return join(PLANS_DIR, `${taskId}.md`).split('\\').join('/');
}

function renderPlan({ task, planText, manifest, provider }) {
  const fm = (task && task.frontmatter) || {};
  const lines = [
    '---', `task: ${fm.id}`, `title: ${JSON.stringify(fm.title || '')}`, `planner: ${provider || 'unknown'}`, '---', '',
    `# Plan: ${fm.title || fm.id}`, '',
    '> Committed by the execute pipeline. When the implementation departs from this plan, update it in the same change.', '',
    '## Plan', '', String(planText || '').trim(), '',
  ];
  if (manifest && manifest.status === 'ok') {
    lines.push('## Execution manifest', '', '| Node | Files | Accept | Executed |', '|---|---|---|---|');
    for (const n of manifest.nodes) lines.push(`| ${n.id} | ${n.files.map((f) => `\`${f}\``).join(', ')} | \`${n.accept.replace(/\|/g, '\\|')}\` | node (RED oracle) |`);
    for (const e of manifest.inline) lines.push(`| ${e.id} | ${e.files.map((f) => `\`${f}\``).join(', ')} | \`${String(e.accept).replace(/\|/g, '\\|')}\` | inline |`);
    lines.push('');
  }
  return lines.join('\n');
}

// Write the plan into the worktree; returns the repo-relative path.
function writePlanArtifact({ cwd, task, planText, manifest, provider }) {
  const rel = planPath((task.frontmatter || {}).id);
  const full = join(cwd, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, renderPlan({ task, planText, manifest, provider }));
  return rel;
}

// Changed source files the plan does not mention (by path or by manifest file).
function planDrift({ files = [], planText = '', manifest = null }) {
  const named = new Set();
  if (manifest && manifest.status === 'ok') for (const e of [...manifest.nodes, ...manifest.inline]) e.files.forEach((f) => named.add(f));
  const text = String(planText || '');
  return files.filter((f) => !EXEMPT_RE.test(f) && !named.has(f) && !text.includes(f));
}

module.exports = { writePlanArtifact, renderPlan, planDrift, planPath, PLANS_DIR };
