// Agent-configuration evals — the regression suite for the things that steer
// the agents: agents/, skills/, rules/, CLAUDE.md, hooks. A change there is a
// change to every future run, so it is gated like code (Anthropic "AI-native
// SDLC playbook", Test stage): 20–50 real past tasks, each a prompt + base
// commit + deterministic checks, re-run headless; a drop in pass rate against
// the recorded baseline blocks the configuration change.
//
//   .ai-sdlc/evals/<id>.yaml   { id, prompt, base, agent?, checks: [cmd, ...], timeoutSec?, maxTurns? }
//   .ai-sdlc/evals/baseline.json  { passRate, tasks, recordedAt }
//
// Tasks are harvested from real runs (`harvest`): a pipeline run that recorded
// its base commit and RED-oracle accept commands becomes an eval — the accepts
// are the checks, the task file is the prompt. Every incident fixed through
// /ai-sdlc:bug adds one the same way. Fewer than 20 tasks is UNDERPOWERED: the
// gate still runs, but says it could not have told a small drop from noise.

const { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const EVALS_DIR = join('.ai-sdlc', 'evals');
const BASELINE = 'baseline.json';
const MIN_POWERED_TASKS = 20;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function loadEvalTasks(root) {
  const dir = join(root, EVALS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => {
    const t = yaml.load(readFileSync(join(dir, f), 'utf8')) || {};
    if (!t.id || !SAFE_ID_RE.test(String(t.id))) throw new Error(`${f}: eval needs a path-safe id`);
    if (!t.prompt || !t.base || !Array.isArray(t.checks) || !t.checks.length) throw new Error(`${f}: eval needs prompt, base and >=1 check`);
    return { timeoutSec: 600, maxTurns: 40, agent: null, ...t };
  });
}

function defaultRun(cmd, args, opts) {
  return spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });
}

// One eval in a throwaway worktree at its base commit: run the agent headless,
// then every check; the worktree is removed whatever happens.
function runEvalTask(task, { root, pluginRoot = join(__dirname, '..'), run = defaultRun }) {
  const dir = mkdtempSync(join(tmpdir(), `eval-${task.id}-`));
  const wt = join(dir, 'wt');
  try {
    const add = run('git', ['worktree', 'add', '--detach', wt, task.base], { cwd: root });
    if (add.status !== 0) return { id: task.id, passed: false, error: `worktree at ${task.base} failed: ${String(add.stderr || '').trim()}`, costUsd: 0, checks: [] };
    const args = ['-p', task.prompt, '--output-format', 'json', '--plugin-dir', pluginRoot, '--max-turns', String(task.maxTurns),
      '--allowedTools', 'Read,Edit,Write,Grep,Glob,Bash'];
    if (task.agent) args.push('--agent', task.agent);
    const agent = run('claude', args, { cwd: wt, timeout: task.timeoutSec * 1000 });
    let costUsd = 0;
    try { costUsd = Number(JSON.parse(agent.stdout).total_cost_usd) || 0; } catch { costUsd = 0; }
    if (agent.error) return { id: task.id, passed: false, error: `agent run failed: ${agent.error.message}`, costUsd, checks: [] };
    const checks = task.checks.map((cmd) => {
      const r = run('sh', ['-c', cmd], { cwd: wt, timeout: 300000 });
      return { cmd, exit: r.status, output: `${r.stdout || ''}${r.stderr || ''}`.slice(-500) };
    });
    return { id: task.id, passed: checks.every((c) => c.exit === 0), costUsd, checks };
  } finally {
    run('git', ['worktree', 'remove', '--force', wt], { cwd: root });
    rmSync(dir, { recursive: true, force: true });
  }
}

function readBaseline(root) {
  const file = join(root, EVALS_DIR, BASELINE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// Run the suite and gate against the baseline. tolerance: allowed pass-rate drop.
function runEvals({ root, tasks, runTask = runEvalTask, tolerance = 0, only = null }) {
  const selected = only ? tasks.filter((t) => t.id === only) : tasks;
  const results = selected.map((t) => runTask(t, { root }));
  const passRate = results.length ? results.filter((r) => r.passed).length / results.length : null;
  const baseline = readBaseline(root);
  const underpowered = results.length < MIN_POWERED_TASKS;
  let verdict = 'no-baseline';
  if (baseline && passRate !== null) verdict = passRate + 1e-9 >= baseline.passRate - tolerance ? 'pass' : 'regression';
  return {
    passRate, tasks: results.length, verdict, underpowered,
    baseline: baseline ? baseline.passRate : null,
    costUsd: Number(results.reduce((s, r) => s + (r.costUsd || 0), 0).toFixed(4)),
    results,
  };
}

function writeBaseline(root, report, now = new Date().toISOString()) {
  const dir = join(root, EVALS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, BASELINE), `${JSON.stringify({ passRate: report.passRate, tasks: report.tasks, recordedAt: now }, null, 2)}\n`);
}

function findTaskFile(root, taskId) {
  for (const sub of ['tasks', 'completed']) {
    const dir = join(root, 'backlog', sub);
    if (!existsSync(dir)) continue;
    const f = readdirSync(dir).find((x) => x === `${taskId}.md` || x.startsWith(`${taskId} `));
    if (f) return join(dir, f);
  }
  return null;
}

// Turn recorded runs (base commit + RED-oracle accepts) into eval tasks.
// Never overwrites an existing eval. Returns the ids written.
function harvest(root, records) {
  const { parseTask } = require('../decision-engine/backlog-task');
  const { taskDescription } = require('../pipeline/steps');
  const dir = join(root, EVALS_DIR);
  const written = [];
  for (const r of records) {
    if (!r.ok || !r.implementation || !r.implementation.baseSha || !(r.accepts || []).length || !SAFE_ID_RE.test(String(r.taskId))) continue;
    const file = join(dir, `${r.taskId}.yaml`);
    if (existsSync(file)) continue;
    const taskFile = findTaskFile(root, r.taskId);
    if (!taskFile) continue;
    const task = parseTask(readFileSync(taskFile, 'utf8'));
    const fm = task.frontmatter || {};
    const prompt = [`Implement ${fm.id}: ${fm.title}`, taskDescription(task), 'Acceptance criteria:', ...(task.acceptanceCriteria || []).map((a) => `- ${a.text}`)].filter(Boolean).join('\n');
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, yaml.dump({ id: r.taskId, source: `run ${r.runId}`, base: r.implementation.baseSha, prompt, checks: r.accepts.map((a) => a.accept) }, { lineWidth: 120 }));
    written.push(r.taskId);
  }
  return written;
}

function formatReport(rep) {
  const lines = [
    `Agent-config evals: ${rep.tasks} task(s), pass rate ${rep.passRate === null ? 'n/a' : `${(rep.passRate * 100).toFixed(1)}%`}` +
      `${rep.baseline !== null ? ` (baseline ${(rep.baseline * 100).toFixed(1)}%)` : ''} — ${rep.verdict.toUpperCase()}, $${rep.costUsd}`,
  ];
  if (rep.underpowered) lines.push(`UNDERPOWERED: fewer than ${MIN_POWERED_TASKS} tasks — a small drop cannot be told from noise; harvest more (node measurement/config-evals.js harvest).`);
  for (const r of rep.results) lines.push(`- ${r.passed ? 'PASS' : 'FAIL'} ${r.id}${r.error ? ` — ${r.error}` : ''}${r.checks.filter((c) => c.exit !== 0).map((c) => `\n    ✗ ${c.cmd} (exit ${c.exit})`).join('')}`);
  return lines.join('\n');
}

module.exports = { loadEvalTasks, runEvalTask, runEvals, harvest, writeBaseline, readBaseline, formatReport, EVALS_DIR, MIN_POWERED_TASKS };

// CLI:
//   node measurement/config-evals.js run [--dry-run] [--only <id>] [--tolerance 0.05] [--update-baseline]
//   node measurement/config-evals.js harvest
// run exits 1 on a regression against the baseline.
if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined; };
  const root = process.cwd();
  try {
    if (cmd === 'harvest') {
      const { loadRuns } = require('./delivery-metrics');
      const ids = harvest(root, loadRuns(root));
      console.log(ids.length ? `harvested ${ids.length} eval(s): ${ids.join(', ')}` : 'nothing to harvest (needs ok runs with recorded accepts and a task file)');
      process.exit(0);
    }
    if (cmd !== 'run') {
      console.error('usage: config-evals run [--dry-run] [--only <id>] [--tolerance N] [--update-baseline] | harvest');
      process.exit(64);
    }
    const tasks = loadEvalTasks(root);
    if (args.includes('--dry-run')) {
      console.log(`${tasks.length} eval task(s) → ${tasks.length} headless agent run(s) + ${tasks.reduce((s, t) => s + t.checks.length, 0)} check(s)${tasks.length < MIN_POWERED_TASKS ? ' (UNDERPOWERED)' : ''}`);
      process.exit(0);
    }
    const rep = runEvals({ root, tasks, tolerance: Number(flag('tolerance') || 0), only: flag('only') || null });
    if (args.includes('--update-baseline')) writeBaseline(root, rep);
    console.log(formatReport(rep));
    process.exit(rep.verdict === 'regression' ? 1 : 0);
  } catch (err) {
    console.error(`config-evals failed: ${err.message}`);
    process.exit(1);
  }
}
