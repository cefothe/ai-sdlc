// Maintain loop — the stage after merge. Two kinds of work, both bounded:
//
// 1. Control bands (.ai-sdlc/bands.yaml): each metric's series is fetched by a
//    deterministic source command and classified by decision-engine/control-bands.
//    The level, never a model, decides the response tier:
//      level 1 → log only
//      level 2 → an agent DIAGNOSES read-only and writes a draft bug report
//                (docs/bugs/, status: draft) — a human confirms the triage
//      level 3 → same, plus the tier's pre-approved action: a runbook command
//                declared in bands.yaml (e.g. rollback), or a draft fix task;
//                nothing reaches main except through the PR + review + HITL gates
// 2. Maintenance jobs (.ai-sdlc/maintenance.yaml): scheduled skills (feature-flag
//    cleanup, dependency/CVE upgrades) that create backlog tasks, capped by the
//    number of their tasks still open, on their declared weekdays only — managed
//    loops, not unbounded ones. Landed vs rejected outcomes are recorded as
//    labelled feedback for the job.
//
// Everything is appended to .ai-sdlc/maintain.log.jsonl.

const { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { evaluateBand } = require('../decision-engine/control-bands');

const BANDS_FILE = join('.ai-sdlc', 'bands.yaml');
const JOBS_FILE = join('.ai-sdlc', 'maintenance.yaml');
const LOG_FILE = join('.ai-sdlc', 'maintain.log.jsonl');
const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function loadYaml(root, rel) {
  const file = join(root, rel);
  return existsSync(file) ? yaml.load(readFileSync(file, 'utf8')) || {} : null;
}

function log(root, entry) {
  const file = join(root, LOG_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

// A source command prints a JSON array of numbers (or [{ value }]) on stdout.
function defaultFetchSeries(metric, { root, run = spawnSync } = {}) {
  const res = run('sh', ['-c', metric.source.command], { cwd: root, encoding: 'utf8', timeout: 120000 });
  if (res.status !== 0) throw new Error(`source for ${metric.name} exited ${res.status}: ${String(res.stderr || '').trim().slice(0, 200)}`);
  const data = JSON.parse(res.stdout);
  if (!Array.isArray(data)) throw new Error(`source for ${metric.name} did not print a JSON array`);
  return data.map((x) => (typeof x === 'object' && x !== null ? Number(x.value) : Number(x)));
}

function diagnosisPrompt(metric, band) {
  return [
    `Control-band breach on metric "${metric.name}" (${metric.description || 'no description'}): level ${band.level}, latest ${band.latest} vs baseline mean ${band.mean} (sd ${band.sd}, z ${band.z}). Rules fired: ${band.rules.join('; ')}.`,
    'Diagnose READ-ONLY: find the most likely cause (recent changes, the code involved, the component that owns it per docs/architecture/overview.md). Do not change anything.',
    'Return JSON: { summary, environment, steps: [..], expected, actual, impact, reproduction, suspectedCause, severity: critical|major|minor|trivial } — every field grounded in evidence you read; write "Unknown" where you could not establish it.',
  ].join('\n');
}

function slugDate(now) {
  return new Date(now).toISOString().slice(0, 10);
}

// The draft bug report a diagnosis becomes (status: draft — a human confirms).
function renderDraftBug(metric, band, d, now) {
  const severity = ['critical', 'major', 'minor', 'trivial'].includes(String(d.severity)) ? d.severity : band.level >= 3 ? 'major' : 'minor';
  const steps = Array.isArray(d.steps) && d.steps.length ? d.steps : [`Observe ${metric.name} via \`${metric.source.command}\``, 'Compare with the 30-point baseline'];
  return [
    // Interpolated values are JSON-quoted: rule text contains ': ', which would break the YAML.
    '---', 'status: draft', `bugId: ${JSON.stringify(`${metric.name}-${slugDate(now)}`)}`, `severity: ${severity}`,
    `source: ${JSON.stringify(`control band ${metric.name} level ${band.level} (${band.rules.join('; ')})`)}`, '---', '',
    `# Bug: ${metric.name} breached its control band`, '',
    '## Summary', d.summary || `${metric.name} moved outside its control band (level ${band.level}).`, '',
    '## Environment', d.environment || 'Unknown', '',
    '## Steps to reproduce', ...steps.map((x, i) => `${i + 1}. ${x}`), '',
    '## Expected behavior', d.expected || `${metric.name} within its baseline band (mean ${band.mean}, sd ${band.sd}).`, '',
    '## Actual behavior', d.actual || `Latest ${band.latest} (z ${band.z}); ${band.rules.join('; ')}.`, '',
    '## Impact', d.impact || 'Unknown', '',
    '## Reproduction', d.reproduction || `Run \`${metric.source.command}\` and evaluate it against the band.`, '',
    '## Suspected cause', d.suspectedCause || 'Unknown', '',
  ].join('\n');
}

async function runBands({ root, now = Date.now(), fetchSeries = defaultFetchSeries, spawn, runRunbook }) {
  const cfg = loadYaml(root, BANDS_FILE);
  if (!cfg) return { status: 'skipped', reason: `no ${BANDS_FILE}`, metrics: [] };
  const runbooks = cfg.runbooks || {};
  const out = [];
  for (const metric of cfg.metrics || []) {
    if (!metric.name || !SAFE_NAME_RE.test(metric.name) || !metric.source || !metric.source.command) {
      out.push({ name: metric.name || '?', error: 'metric needs a safe name and source.command' });
      continue;
    }
    let band;
    try {
      band = evaluateBand(fetchSeries(metric, { root }), metric.baseline || {});
    } catch (err) {
      out.push({ name: metric.name, error: err.message });
      log(root, { at: new Date(now).toISOString(), kind: 'band', metric: metric.name, error: err.message });
      continue;
    }
    const entry = { name: metric.name, level: band.level, rules: band.rules, latest: band.latest, actions: [] };
    if (band.level >= 2 && typeof spawn === 'function') {
      const d = await spawn({ type: 'diagnose', provider: { type: 'agent', name: metric.diagnoseAgent || 'debugger' }, tools: READ_ONLY_TOOLS, prompt: diagnosisPrompt(metric, band), cwd: root });
      const rel = join('docs', 'bugs', `${metric.name}-${slugDate(now)}.md`);
      if (!existsSync(join(root, rel))) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), renderDraftBug(metric, band, d || {}, now));
        entry.actions.push({ kind: 'draft-bug-report', path: rel.split('\\').join('/') });
      }
    }
    if (band.level >= 3) {
      const action = (metric.tiers && metric.tiers['3']) || (metric.tiers && metric.tiers[3]) || null;
      const runbook = action && typeof action.propose === 'string' && action.propose.startsWith('runbook:') ? action.propose.slice('runbook:'.length) : null;
      if (runbook) {
        if (!runbooks[runbook]) entry.actions.push({ kind: 'runbook', name: runbook, error: 'not declared in bands.yaml runbooks (only pre-approved runbooks run)' });
        else if (typeof runRunbook === 'function') entry.actions.push({ kind: 'runbook', name: runbook, ...runRunbook(runbooks[runbook], { root }) });
      }
    }
    log(root, { at: new Date(now).toISOString(), kind: 'band', metric: metric.name, level: band.level, rules: band.rules, latest: band.latest, actions: entry.actions });
    out.push(entry);
  }
  return { status: 'ran', metrics: out };
}

function defaultRunRunbook(command, { root, run = spawnSync } = {}) {
  const res = run('sh', ['-c', command], { cwd: root, encoding: 'utf8', timeout: 600000 });
  return { exit: res.status, output: `${res.stdout || ''}${res.stderr || ''}`.slice(-1000) };
}

function openTasksWithLabel(root, label) {
  const dir = join(root, 'backlog', 'tasks');
  if (!existsSync(dir)) return 0;
  const { parseTask } = require('../decision-engine/backlog-task');
  return readdirSync(dir).filter((f) => f.endsWith('.md')).filter((f) => {
    try {
      const fm = parseTask(readFileSync(join(dir, f), 'utf8')).frontmatter;
      return String(fm.status || '').toLowerCase() !== 'done' && (fm.labels || []).includes(label);
    } catch {
      return false;
    }
  }).length;
}

// Scheduled maintenance jobs → backlog tasks, within their cadence and cap.
async function runJobs({ root, now = Date.now(), spawn, createTask }) {
  const cfg = loadYaml(root, JOBS_FILE);
  if (!cfg) return { status: 'skipped', reason: `no ${JOBS_FILE}`, jobs: [] };
  const today = WEEKDAYS[new Date(now).getUTCDay()];
  const out = [];
  for (const job of cfg.jobs || []) {
    if (!job.name || !SAFE_NAME_RE.test(job.name)) { out.push({ name: job.name || '?', error: 'job needs a safe name' }); continue; }
    const days = (job.days || WEEKDAYS).map((d) => String(d).slice(0, 3).toLowerCase());
    if (!days.includes(today)) { out.push({ name: job.name, skipped: `not scheduled on ${today}` }); continue; }
    const label = `maintenance:${job.name}`;
    const open = openTasksWithLabel(root, label);
    const cap = Number(job.maxOpen || 3);
    if (open >= cap) { out.push({ name: job.name, skipped: `${open} open task(s) ≥ cap ${cap}` }); continue; }
    const found = await spawn({
      type: 'maintenance', provider: job.skill ? { type: 'skill', name: job.skill } : { type: 'agent', name: job.agent || 'code-analyzer' }, tools: READ_ONLY_TOOLS, cwd: root,
      prompt: `${job.prompt}\nReturn JSON: { items: [{ title, description, files: [..], acceptance: [..] }] } — at most ${cap - open} item(s), each small and independently mergeable. Read-only: do not change files.`,
    });
    const items = ((found && found.items) || []).slice(0, cap - open);
    const created = items.map((it) => createTask(root, {
      title: `${job.name}: ${it.title}`, description: it.description || '', references: it.files || [],
      acceptanceCriteria: it.acceptance || [], labels: ['maintenance', label], dispatchable: job.autoDispatch === true,
      createdDate: new Date(now).toISOString().replace('T', ' ').slice(0, 16),
    }).id);
    log(root, { at: new Date(now).toISOString(), kind: 'job', job: job.name, created });
    out.push({ name: job.name, created });
  }
  return { status: 'ran', jobs: out };
}

// Labelled feedback: for each maintenance PR, landed (merged) or rejected (closed).
function recordJobFeedback(root, prs, now = Date.now()) {
  const counts = {};
  for (const pr of prs) {
    const label = (pr.labels || []).find((l) => String(l).startsWith('maintenance:'));
    if (!label || !['MERGED', 'CLOSED'].includes(pr.state)) continue;
    const job = label.slice('maintenance:'.length);
    counts[job] = counts[job] || { landed: 0, rejected: 0 };
    counts[job][pr.state === 'MERGED' ? 'landed' : 'rejected'] += 1;
  }
  for (const [job, c] of Object.entries(counts)) log(root, { at: new Date(now).toISOString(), kind: 'job-feedback', job, ...c });
  return counts;
}

module.exports = { runBands, runJobs, recordJobFeedback, renderDraftBug, defaultFetchSeries, defaultRunRunbook, BANDS_FILE, JOBS_FILE, LOG_FILE };

// CLI: node pipeline/maintain.js [bands|jobs|all]   (default all)
if (require.main === module) {
  const mode = process.argv[2] || 'all';
  const root = process.cwd();
  (async () => {
    const { makeClaudeCodeSeams } = require('../adapters/claude-code-spawner');
    const { createTask } = require('../decision-engine/backlog-task-new');
    const { spawn } = makeClaudeCodeSeams({ workDir: root });
    const report = {};
    if (mode === 'bands' || mode === 'all') report.bands = await runBands({ root, spawn, runRunbook: defaultRunRunbook });
    if (mode === 'jobs' || mode === 'all') report.jobs = await runJobs({ root, spawn, createTask });
    console.log(JSON.stringify(report, null, 2));
  })().catch((err) => {
    console.error(`maintain failed: ${err.message}`);
    process.exit(1);
  });
}
