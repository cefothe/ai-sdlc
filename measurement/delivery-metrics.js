// Delivery metrics — outcomes, not activity. "60% of our code is AI-assisted"
// measures adoption; DORA data shows throughput can FALL as adoption rises, and
// agents can inflate PR counts by splitting one change into ten. These five
// metrics answer whether the AI SDLC ships faster, ships well, and pays for
// itself (Port "AI SDLC", Anthropic "AI-native SDLC playbook"):
//
//   agentSuccessRate     merged PRs / pipeline runs — verified by outcome
//   costPerSuccess       total agent spend / merged PRs (failed attempts count)
//   reworkRate           merged changes whose files needed a fix/revert commit within 7 days
//   leadTimeDays         median spec (PRD / bug report) first commit → PR merged
//   changeFailureRate    merged changes followed by a revert/hotfix within 14 days
//
// Plus context: churn (files rewritten within 14 days), first-pass review rate,
// throughput. Inputs: .ai-sdlc/runs.jsonl (written by the pipeline), git history
// of the base branch, and each PR's fate (`gh pr view`). Record a baseline BEFORE
// changing the flow, then compare — a metric without a baseline proves nothing.

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { parseRunRecords } = require('./outcome-metrics');
const { EXEMPT_RE } = require('../decision-engine/architecture-conformance');

const RUNS_FILE = join('.ai-sdlc', 'runs.jsonl');
const BASELINE_FILE = join('.ai-sdlc', 'metrics-baseline.json');
const DAY_MS = 86400000;
const FIX_RE = /\b(fix|fixes|fixed|revert|hotfix|bug)\b/i;
const FAILURE_RE = /\b(revert|hotfix|rollback)\b/i;
const HEADLINE = ['agentSuccessRate', 'costPerSuccess', 'reworkRate', 'leadTimeDays', 'changeFailureRate'];
// Direction of "better" for the baseline comparison.
const HIGHER_IS_BETTER = { agentSuccessRate: true, costPerSuccess: false, reworkRate: false, leadTimeDays: false, changeFailureRate: false };

function git(runner, args, cwd) {
  try {
    return String(runner(args, { cwd }).stdout || '');
  } catch {
    return '';
  }
}

// Commits on `base` within (from, to] that touched any of `files`: [{ sha, date, subject }].
function commitsTouching(runner, cwd, { base, files, from, to }) {
  if (!files.length) return [];
  const out = git(runner, ['log', base, `--since=${new Date(from).toISOString()}`, `--until=${new Date(to).toISOString()}`, '--format=%H|%cI|%s', '--', ...files], cwd);
  return out.split('\n').filter(Boolean).map((l) => {
    const [sha, date, ...rest] = l.split('|');
    return { sha, date, subject: rest.join('|') };
  });
}

function firstCommitDate(runner, cwd, path) {
  const out = git(runner, ['log', '--diff-filter=A', '--format=%cI', '--', path], cwd).trim().split('\n').filter(Boolean);
  return out.length ? Date.parse(out[out.length - 1]) : null;
}

function median(nums) {
  const xs = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

const ratio = (n, d) => (d ? n / d : null);
const round = (x, p = 3) => (x === null ? null : Number(x.toFixed(p)));

// Pure-ish: records + seams → metrics. prState(url) → { state: MERGED|CLOSED|OPEN, mergedAt, mergeSha } | null.
function computeMetrics(records, { runner, cwd, base = 'main', prState = () => null, now = Date.now() } = {}) {
  const runs = records.filter((r) => r && r.taskId);
  const merged = [];
  for (const r of runs) {
    const pr = r.prUrl ? prState(r.prUrl) : null;
    if (pr && pr.state === 'MERGED' && pr.mergedAt) merged.push({ r, mergedAt: Date.parse(pr.mergedAt), mergeSha: pr.mergeSha || null });
  }
  const totalCost = runs.reduce((s, r) => s + ((r.cost && r.cost.usd) || 0), 0);

  let rework = 0;
  let failures = 0;
  let churn = 0;
  const leadTimes = [];
  for (const m of merged) {
    const files = ((m.r.implementation && m.r.implementation.filesChanged) || []).filter((f) => !EXEMPT_RE.test(f));
    const later = (days) => commitsTouching(runner, cwd, { base, files, from: m.mergedAt + 1000, to: Math.min(now, m.mergedAt + days * DAY_MS) })
      .filter((c) => c.sha !== m.mergeSha);
    const within14 = later(14);
    const within7 = within14.filter((c) => Date.parse(c.date) <= m.mergedAt + 7 * DAY_MS);
    if (within7.some((c) => FIX_RE.test(c.subject))) rework += 1;
    if (within14.some((c) => FAILURE_RE.test(c.subject))) failures += 1;
    if (within14.length) churn += 1;
    if (m.r.specPath) {
      const start = firstCommitDate(runner, cwd, m.r.specPath);
      if (start) leadTimes.push((m.mergedAt - start) / DAY_MS);
    }
  }
  const reviewed = runs.filter((r) => r.review && typeof r.review.cycles === 'number');
  const span = runs.length ? (now - Math.min(...runs.map((r) => Date.parse(r.timestamp) || now))) / (7 * DAY_MS) : 0;
  return {
    runs: runs.length,
    merged: merged.length,
    agentSuccessRate: round(ratio(merged.length, runs.length)),
    costPerSuccess: round(ratio(totalCost, merged.length), 2),
    reworkRate: round(ratio(rework, merged.length)),
    leadTimeDays: round(median(leadTimes), 1),
    changeFailureRate: round(ratio(failures, merged.length)),
    context: {
      churnRate: round(ratio(churn, merged.length)),
      firstPassReviewRate: round(ratio(reviewed.filter((r) => r.review.cycles === 1).length, reviewed.length)),
      throughputPerWeek: round(span > 0 ? merged.length / span : null, 2),
      totalCostUsd: round(totalCost, 2),
      abortedByStage: runs.filter((r) => r.abortedAt).reduce((acc, r) => ({ ...acc, [r.abortedAt]: (acc[r.abortedAt] || 0) + 1 }), {}),
    },
  };
}

function loadRuns(root) {
  const file = join(root, RUNS_FILE);
  return existsSync(file) ? parseRunRecords(readFileSync(file, 'utf8')).records || [] : [];
}

function compareToBaseline(metrics, baseline) {
  if (!baseline) return null;
  return Object.fromEntries(HEADLINE.map((k) => {
    const now = metrics[k];
    const then = baseline.metrics ? baseline.metrics[k] : baseline[k];
    if (now === null || now === undefined || then === null || then === undefined) return [k, { now, baseline: then, verdict: 'n/a' }];
    const better = HIGHER_IS_BETTER[k] ? now > then : now < then;
    return [k, { now, baseline: then, verdict: now === then ? 'same' : better ? 'better' : 'worse' }];
  }));
}

function formatMetrics(metrics, { owners = {}, comparison = null } = {}) {
  const fmt = (k, v) => (v === null ? 'n/a' : k === 'costPerSuccess' ? `$${v}` : k === 'leadTimeDays' ? `${v} d` : `${(v * 100).toFixed(1)}%`);
  const lines = [`Delivery metrics — ${metrics.runs} run(s), ${metrics.merged} merged`, '', '| Metric | Value | Baseline | Owner |', '|---|---|---|---|'];
  for (const k of HEADLINE) {
    const c = comparison && comparison[k];
    lines.push(`| ${k} | ${fmt(k, metrics[k])} | ${c && c.verdict !== 'n/a' ? `${fmt(k, c.baseline)} (${c.verdict})` : '—'} | ${owners[k] || 'unassigned'} |`);
  }
  const ctx = metrics.context;
  lines.push('', `Context: churn ${fmt('r', ctx.churnRate)} · first-pass review ${fmt('r', ctx.firstPassReviewRate)} · throughput ${ctx.throughputPerWeek ?? 'n/a'}/week · spend $${ctx.totalCostUsd ?? 0}`);
  if (Object.keys(ctx.abortedByStage).length) lines.push(`Aborted runs by stage: ${Object.entries(ctx.abortedByStage).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (!metrics.merged) lines.push('', 'No merged runs yet — the outcome metrics need merged PRs; record the baseline from the pre-change flow first.');
  return lines.join('\n');
}

function writeBaseline(root, metrics, now = new Date().toISOString()) {
  const file = join(root, BASELINE_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ recordedAt: now, metrics }, null, 2)}\n`);
  return file;
}

function readBaseline(root) {
  const file = join(root, BASELINE_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

module.exports = { computeMetrics, loadRuns, compareToBaseline, formatMetrics, writeBaseline, readBaseline, HEADLINE, RUNS_FILE, BASELINE_FILE };

// CLI: node measurement/delivery-metrics.js [--base main] [--baseline] [--json]
if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = i >= 0 && args[i + 1] ? args[i + 1] : 'main';
  const root = process.cwd();
  try {
    const { makeGitRunner, makeGhRunner } = require('../adapters/claude-code-spawner');
    const gh = makeGhRunner();
    const prState = (url) => {
      try {
        const pr = JSON.parse(gh(['pr', 'view', url, '--json', 'state,mergedAt,mergeCommit']).stdout);
        return { state: pr.state, mergedAt: pr.mergedAt, mergeSha: pr.mergeCommit && pr.mergeCommit.oid };
      } catch {
        return null;
      }
    };
    const metrics = computeMetrics(loadRuns(root), { runner: makeGitRunner(), cwd: root, base, prState });
    if (args.includes('--baseline')) console.error(`baseline written: ${writeBaseline(root, metrics)}`);
    const { loadFlowConfig } = require('../pipeline/flow-config');
    const owners = (loadFlowConfig(root).metrics || {}).owners || {};
    const comparison = compareToBaseline(metrics, readBaseline(root));
    console.log(args.includes('--json') ? JSON.stringify({ metrics, comparison }, null, 2) : formatMetrics(metrics, { owners, comparison }));
    process.exit(0);
  } catch (err) {
    console.error(`delivery-metrics failed: ${err.message}`);
    process.exit(1);
  }
}
