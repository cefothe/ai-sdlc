// Backlog task scaffolder — creates a DoR-shaped task file so operators never
// hand-author `backlog/tasks/<ID> - <slug>.md` by copying an example (wrong ids,
// malformed AC/description markers, DoR failures discovered only at execute time).
//
// Mirrors the decisions.js CLI shape: a clock-free builder (real time injected by
// the CLI/caller) + nextTaskId() id allocation + a `require.main` entry point.
// Frontmatter matches init.js renderSeedTask exactly, except new tasks default to
// `dispatchable: true` (an operator authoring a feature intends to dispatch it).

const { existsSync, readdirSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const TASKS_REL = join('backlog', 'tasks');
const ID_PREFIX = 'AISDLC';
const ID_RE = /\bAISDLC-(\d+)\b/;

function tasksDir(root) {
  return join(root, TASKS_REL);
}

// Lowercase kebab slug, bounded — same rule as init.js so filenames are stable.
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'task';
}

// Next AISDLC-<n> id by scanning existing task filenames (max + 1).
function nextTaskId(root) {
  const dir = tasksDir(root);
  let max = 0;
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const m = name.match(ID_RE);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  // Zero-pad to 4 digits (parallel to DEC-NNNN) so ids sort lexicographically
  // and a task-id prefix glob (backlog/tasks/AISDLC-0001*) can't match AISDLC-0010.
  return `${ID_PREFIX}-${String(max + 1).padStart(4, '0')}`;
}

// Build the task markdown. Pure + clock-free: `createdDate` is supplied by the
// caller. Throws on missing title so a malformed task can never be written.
function buildTaskMarkdown({
  id,
  title,
  createdDate,
  description = '',
  acceptanceCriteria = [],
  labels = [],
  references = [],
  priority = 'medium',
  dispatchable = true,
  prd = '',
  featureId = '',
  specSource = 'prd',
  successMetrics = [],
  dependencies = [],
}) {
  if (!id || !ID_RE.test(id)) throw new Error('task id must match AISDLC-NNN');
  if (!title || typeof title !== 'string' || !title.trim()) throw new Error('task requires a non-empty title');
  if (typeof createdDate !== 'string' || !createdDate) throw new Error('task requires a createdDate (caller supplies real time)');

  const acItems = acceptanceCriteria.length
    ? acceptanceCriteria.map((text, i) => `- [ ] #${i + 1} ${text}`)
    : ['- [ ] #1 (define acceptance criteria — required for DoR)'];

  // The PRD is linked via specRef (the framework's contract): DoR gate 3
  // resolves specRef.artifactPath, so a task pointing at a missing PRD is
  // refused admission — the link can't rot. featureId defaults to the PRD slug.
  const fid = featureId || (prd ? slugify(prd.replace(/^.*\//, '').replace(/\.md$/i, '')) : '');
  const specRefLines = prd
    ? ['specRef:', `  source: ${specSource}`, `  featureId: ${fid}`, `  artifactPath: ${JSON.stringify(prd)}`]
    : [];

  const lines = [
    '---',
    `id: ${id}`,
    `title: ${JSON.stringify(title)}`,
    'status: To Do',
    'assignee: []',
    `created_date: ${JSON.stringify(createdDate)}`,
    `priority: ${priority}`,
    ...(labels.length ? ['labels:', ...labels.map((l) => `  - ${l}`)] : ['labels: []']),
    `dispatchable: ${dispatchable}`,
    // Explicit, machine-readable build order: task-order.js topologically sorts
    // the backlog by this field so the sequence is derived, not chosen ad-hoc.
    ...(dependencies.length ? ['dependencies:', ...dependencies.map((d) => `  - ${d}`)] : ['dependencies: []']),
    ...(references.length ? ['references:', ...references.map((r) => `  - ${r}`)] : ['references: []']),
    ...specRefLines,
    '---',
    '',
    '## Description',
    '',
    '<!-- SECTION:DESCRIPTION:BEGIN -->',
    description || '(describe the feature: bounded scope, what changes and why, no open questions)',
    '<!-- SECTION:DESCRIPTION:END -->',
    '',
    ...(successMetrics.length
      ? ['## Success Metrics', '', ...successMetrics.map((m) => `- ${m}`), '']
      : []),
    '## Acceptance Criteria',
    '',
    '<!-- AC:BEGIN -->',
    ...acItems,
    '<!-- AC:END -->',
    '',
  ];
  return lines.join('\n');
}

// Allocate an id (unless given), render, and write the task file.
// Returns { id, path, created }. Never overwrites an existing file.
function createTask(root, opts = {}) {
  const dir = tasksDir(root);
  mkdirSync(dir, { recursive: true });
  const id = opts.id || nextTaskId(root);
  const slug = slugify(opts.title || '');
  const path = join(dir, `${id} - ${slug}.md`);
  if (existsSync(path)) throw new Error(`task file already exists: ${path}`);
  const markdown = buildTaskMarkdown({ ...opts, id });
  writeFileSync(path, markdown, 'utf8');
  return { id, path, created: true };
}

module.exports = { createTask, buildTaskMarkdown, nextTaskId, slugify, tasksDir, TASKS_REL };

// CLI: node decision-engine/backlog-task-new.js "title" [--labels a,b] [--refs x,y]
//      [--ac "crit 1" --ac "crit 2"] [--priority high] [--desc "..."] [--root .]
// Real time is injected here; the library stays clock-free for deterministic tests.
if (require.main === module) {
  const argv = process.argv.slice(2);
  const positional = [];
  const flags = { ac: [], metric: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      // Every flag here takes a value; a trailing flag with no value would
      // otherwise push `undefined` (corrupting the task) or crash a later split.
      if (i + 1 >= argv.length) {
        console.error(`missing value for flag ${a}`);
        process.exit(1);
      }
      if (a === '--ac') { flags.ac.push(argv[++i]); continue; }
      if (a === '--metric') { flags.metric.push(argv[++i]); continue; }
      flags[a.slice(2)] = argv[++i];
      continue;
    }
    positional.push(a);
  }

  const title = flags.title || positional.join(' ');
  if (!title) {
    console.error('usage: backlog-task-new "feature title" [--labels a,b] [--refs path1,path2] [--ac "criterion" ...] [--metric "outcome" ...] [--prd docs/prd/<slug>.md] [--feature-id <slug>] [--priority high] [--desc "..."]');
    process.exit(1);
  }

  const split = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const createdDate = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const root = flags.root || process.cwd();

  try {
    const res = createTask(root, {
      title,
      createdDate,
      description: flags.desc || '',
      acceptanceCriteria: flags.ac,
      labels: split(flags.labels),
      references: split(flags.refs),
      priority: flags.priority || 'medium',
      prd: flags.prd || '',
      featureId: flags['feature-id'] || '',
      successMetrics: flags.metric,
      dependencies: split(flags.deps),
    });
    console.log(`Created ${res.id}: ${res.path}`);
    const refCount = split(flags.refs).length;
    if (refCount < 3) console.log(`Note: ${refCount} reference(s) — the DoR gate wants >=3. Add more before /ai-sdlc:execute ${res.id}.`);
    if (flags.ac.length === 0) console.log('Note: no acceptance criteria given — edit the AC block before dispatch (DoR requires them).');
    process.exit(0);
  } catch (err) {
    console.error(`backlog-task-new failed: ${err.message}`);
    process.exit(1);
  }
}
