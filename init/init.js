// ai-sdlc init — scaffolds .ai-sdlc/ config + backlog into a repository.
//
// Unlike the reference init (which errors when .ai-sdlc/ already exists —
// greenfield-biased), this supports BROWNFIELD adoption of an existing
// codebase:
//   - detect an existing repo (has a .git dir and source files)
//   - non-destructively scaffold: write each config/backlog file only when
//     absent (never overwrite operator edits or existing source)
//   - seed the backlog from existing signals: source TODO/FIXME markers and
//     (optionally) open GitHub issues, as dispatchable:false tasks that must
//     be DoR-triaged before dispatch
//   - emit a triage report; NEVER modify source code
//
// External commands (git, gh, cxpak) are injected so the whole flow is
// unit-testable without a real repo or network.

const { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } = require('node:fs');
const { join, relative, extname } = require('node:path');

const CONFIG_STUBS = require('./config-stubs');
const { bootstrapAdrs } = require('../decision-engine/adr-bootstrap');

const SOURCE_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.java', '.py', '.go', '.rb', '.php', '.c', '.cpp', '.cs', '.rs', '.kt', '.swift', '.scala', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.worktrees', 'vendor', 'coverage', '.ai-sdlc']);
const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b[:\s-]*(.*)/;

// Detect whether `dir` is an existing (brownfield) project.
function detectBrownfield(dir, { hasGit } = {}) {
  const git = hasGit !== undefined ? hasGit : existsSync(join(dir, '.git'));
  const hasSource = walkSource(dir, () => true, { limit: 1 }).length > 0;
  return { brownfield: git || hasSource, hasGit: git, hasSource };
}

// Walk source files under dir (bounded, ignoring vendored/build dirs).
function walkSource(dir, visit, { limit = Infinity } = {}) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < limit) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) stack.push(full);
      } else if (SOURCE_EXTS.has(extname(e.name))) {
        const r = visit(full);
        if (r) out.push(typeof r === 'boolean' ? full : r);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

// Non-destructively write config + backlog scaffolding. Returns { created, skipped }.
function scaffold(dir, { workspace = false } = {}) {
  const created = [];
  const skipped = [];
  const ensureDir = (p) => { if (!existsSync(p)) mkdirSync(p, { recursive: true }); };
  const writeIfAbsent = (rel, content) => {
    const p = join(dir, rel);
    if (existsSync(p)) { skipped.push(rel); return; }
    ensureDir(join(p, '..'));
    writeFileSync(p, content);
    created.push(rel);
  };

  ensureDir(join(dir, '.ai-sdlc'));
  ensureDir(join(dir, 'backlog', 'tasks'));

  for (const [rel, content] of Object.entries(CONFIG_STUBS.baseline())) {
    writeIfAbsent(rel, content);
  }
  writeIfAbsent(join('backlog', 'config.yml'), CONFIG_STUBS.backlogConfig());
  if (workspace) writeIfAbsent(join('.ai-sdlc', 'workspace.yaml'), CONFIG_STUBS.workspaceStub());

  return { created, skipped };
}

// Scan source for TODO/FIXME markers -> seed candidates.
function scanMarkers(dir) {
  const findings = [];
  walkSource(dir, (file) => {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      return false;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(MARKER_RE);
      if (m) findings.push({ file: relative(dir, file), line: i + 1, marker: m[1], text: (m[2] || '').trim() });
    }
    return false;
  });
  return findings;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'task';
}

// Render a backlog task markdown (dispatchable:false until DoR-triaged).
function renderSeedTask(id, title, createdDate, body, references) {
  const fm = [
    '---',
    `id: ${id}`,
    `title: ${JSON.stringify(title)}`,
    'status: To Do',
    'assignee: []',
    `created_date: ${JSON.stringify(createdDate)}`,
    'labels:',
    '  - seeded',
    'dispatchable: false',
    "dispatchableReason: 'auto-seeded during brownfield init; needs DoR triage before dispatch'",
    ...(references && references.length ? ['references:', ...references.map((r) => `  - ${r}`)] : []),
    '---',
    '',
    '## Description',
    '',
    '<!-- SECTION:DESCRIPTION:BEGIN -->',
    body,
    '<!-- SECTION:DESCRIPTION:END -->',
    '',
    '## Acceptance Criteria',
    '',
    '<!-- AC:BEGIN -->',
    '- [ ] #1 (define during DoR triage)',
    '<!-- AC:END -->',
    '',
  ];
  return fm.join('\n');
}

// Seed backlog tasks from markers + optional gh issues. Injectable:
//   ghIssues: [{ number, title, body, url }] (pass [] to skip GitHub)
//   createdDate: ISO-ish stamp (caller supplies real time; no Date.now here)
// Returns { tasks: [{ id, path, title, source }] }.
function seedBacklog(dir, { markers = [], ghIssues = [], createdDate = '', idPrefix = 'AISDLC', startId = 1 } = {}) {
  const tasksDir = join(dir, 'backlog', 'tasks');
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
  const tasks = [];
  let n = startId;

  // One task per GitHub issue.
  for (const issue of ghIssues) {
    const id = `${idPrefix}-${n++}`;
    const title = `${issue.title}`;
    const path = join(tasksDir, `${id} - ${slugify(issue.title)}.md`);
    if (!existsSync(path)) {
      writeFileSync(path, renderSeedTask(id, title, createdDate, issue.body || `Imported from GitHub issue #${issue.number}.`, issue.url ? [issue.url] : []));
    }
    tasks.push({ id, path, title, source: `gh#${issue.number}` });
  }

  // Group markers by file into one task per file (avoid backlog spam).
  const byFile = new Map();
  for (const m of markers) {
    if (!byFile.has(m.file)) byFile.set(m.file, []);
    byFile.get(m.file).push(m);
  }
  for (const [file, list] of byFile) {
    const id = `${idPrefix}-${n++}`;
    const title = `chore: resolve ${list.length} ${list.length === 1 ? 'marker' : 'markers'} in ${file}`;
    const body = ['Markers found during brownfield init:', '', ...list.map((m) => `- \`${m.file}:${m.line}\` **${m.marker}** ${m.text}`)].join('\n');
    const path = join(tasksDir, `${id} - ${slugify('markers-' + file)}.md`);
    if (!existsSync(path)) writeFileSync(path, renderSeedTask(id, title, createdDate, body, [file]));
    tasks.push({ id, path, title, source: `markers:${file}` });
  }

  return { tasks };
}

// Full brownfield init. Returns a triage report object (also written to disk).
// deps: { hasGit?, ghIssues?, cxpakIndex?: (dir)=>any, createdDate }
function init(dir, opts = {}) {
  const { workspace = false, ghIssues = [], cxpakIndex, createdDate = '', hasGit, bootstrapADRs = true } = opts;
  const detection = detectBrownfield(dir, { hasGit });
  const scaffoldResult = scaffold(dir, { workspace });
  const markers = scanMarkers(dir);

  // ADR bootstrap: import existing ADRs + reverse-engineer proposed ones from
  // the code. Non-fatal — a repo with neither still initializes cleanly.
  let adr = { imported: [], proposed: [] };
  if (bootstrapADRs) {
    try {
      adr = bootstrapAdrs(dir, { created: createdDate });
    } catch (err) {
      adr = { imported: [], proposed: [], error: err.message };
    }
  }

  // cxpak indexing is the proven pre-action context lever (d=1.82). Optional /
  // injectable so init works without cxpak installed.
  let cxpak = { indexed: false, reason: 'cxpak not provided' };
  if (typeof cxpakIndex === 'function') {
    try {
      cxpak = { indexed: true, result: cxpakIndex(dir) };
    } catch (err) {
      cxpak = { indexed: false, reason: `cxpak index failed: ${err.message}` };
    }
  }

  const seeded = seedBacklog(dir, { markers, ghIssues, createdDate });

  const report = {
    mode: detection.brownfield ? 'brownfield' : 'greenfield',
    detection,
    scaffold: scaffoldResult,
    cxpak,
    markersFound: markers.length,
    seededTasks: seeded.tasks.length,
    tasks: seeded.tasks.map((t) => ({ id: t.id, title: t.title, source: t.source })),
    adr: { imported: adr.imported.length, proposed: adr.proposed.length, proposedDecisions: adr.proposed, importedDecisions: adr.imported },
    note: 'Seeded tasks are dispatchable:false — run DoR triage before dispatch. Proposed ADRs are lifecycle:proposed — ratify via architect review. No source files were modified.',
  };
  try {
    writeFileSync(join(dir, '.ai-sdlc', 'triage-report.json'), JSON.stringify(report, null, 2));
  } catch (err) {
    report.reportWriteError = err.message;
  }
  return report;
}

module.exports = { init, detectBrownfield, scaffold, scanMarkers, seedBacklog, walkSource, slugify };

// CLI: `node init/init.js [dir] [--workspace]`. cxpak + gh are opt-in via
// flags to keep the default run hermetic. Real timestamp supplied here (the
// library stays clock-free so it's deterministic under test).
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetDir = args.find((a) => !a.startsWith('--')) || process.cwd();
  const workspace = args.includes('--workspace');
  const createdDate = new Date().toISOString().replace('T', ' ').slice(0, 16);
  try {
    const report = init(targetDir, { workspace, createdDate });
    console.log(`ai-sdlc init (${report.mode}): created ${report.scaffold.created.length} file(s), skipped ${report.scaffold.skipped.length}, seeded ${report.seededTasks} task(s) from ${report.markersFound} marker(s).`);
    console.log(`Triage report: ${targetDir}/.ai-sdlc/triage-report.json — seeded tasks are dispatchable:false pending DoR triage. No source modified.`);
    process.exit(0);
  } catch (err) {
    console.error(`ai-sdlc init failed: ${err.message}`);
    process.exit(1);
  }
}
