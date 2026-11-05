// Definition-of-Done (DoD) gate — the hard-enforced EXIT validation of the
// pipeline, the counterpart to the DoR (entry) gate. Before a task can be marked
// Done / a PR opened, the project's build and full test suite MUST pass, and the
// changed code must carry no incomplete-work markers.
//
// Why this is hard-enforced when the promise gate is only advisory (R5): the
// promise gate feeds a SUBJECTIVE assessment back toward the author (which R5/R15
// showed degrades quality). The DoD gate is OBJECTIVE — the build compiles or it
// doesn't, tests pass or they don't — and it blocks the PIPELINE, not the author.
// Objective pass/fail is safe to enforce from day one.
//
// Speed. The gate is on the critical path of every task (and re-runs on every
// informed retry), so it must not replay a whole monorepo matrix serially:
//   - every runnable check under spec.checks runs CONCURRENTLY
//     (spec.concurrency caps it; default: all at once)
//   - a check with `paths: [glob…]` is SKIPPED when no changed file matches it
//     (unknown changed set -> it runs; never silently skipped)
//   - commands receive AI_SDLC_BASE + AI_SDLC_CHANGED_FILES so a project can
//     build/test only the affected packages
//   - `type: github-checks` delegates to CI instead of rebuilding locally
//     (ci-checks.js: opt-in push + draft PR, then wait for the PR's checks)
//   - `timeoutMinutes` bounds a command; the whole process group is killed
//
//   checks:
//     build:  { command: "make validate-affected", enforced: true }
//     smoke:  { command: "make smoke", paths: [deploy/, migrations/], timeoutMinutes: 30 }
//     ci:     { type: github-checks, push: true, draftPr: true, timeoutMinutes: 60 }
//     markers: { enforced: true }

const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');
const { filterByGlobs } = require('./path-glob');
const { waitForGithubChecks } = require('./ci-checks');

const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b/;

const DEFAULT_CONFIG = {
  apiVersion: 'ai-sdlc.io/v1alpha1',
  kind: 'DodConfig',
  metadata: { name: 'default' },
  spec: {
    enforcementMode: 'enforce',
    checks: {
      build: { command: 'npx tsc --noEmit', enforced: true },
      test: { command: 'npm test', enforced: true },
      markers: { enforced: true },
    },
  },
};

function loadDodConfig(path) {
  if (!path || !existsSync(path)) return DEFAULT_CONFIG;
  const raw = yaml.load(readFileSync(path, 'utf8')) || {};
  const spec = raw.spec || {};
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    spec: {
      ...DEFAULT_CONFIG.spec,
      ...spec,
      checks: { ...DEFAULT_CONFIG.spec.checks, ...(spec.checks || {}) },
    },
  };
}

// Check names with dedicated semantics; every OTHER key under spec.checks that
// carries a `command` (or `type: github-checks`) is a runnable check — so a
// project can declare `catalog-integration`, `smoke`, … alongside build/test and
// the gate actually runs them (it used to silently ignore anything but build/test).
const RESERVED_CHECKS = new Set(['markers', 'outcomes']);

// Default command runner — non-blocking `sh -c` so independent checks overlap.
// Never rejects: a failed/timed-out command resolves to a non-zero code.
async function defaultRunCommand(command, projectRoot, { env, timeoutMs } = {}) {
  const { asyncExec } = require('../adapters/async-exec');
  try {
    const stdout = await asyncExec('sh', ['-c', command], {
      cwd: projectRoot, env: { ...process.env, ...(env || {}) }, timeout: timeoutMs || 0, killTree: true, maxBuffer: 256 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: typeof err.code === 'number' ? err.code : 1, stdout: err.stdout || '', stderr: err.stderr || err.message };
  }
}

// Default process runner for the github-checks check (git/gh, argv form).
async function defaultProc(cmd, args, { cwd } = {}) {
  const { asyncExec } = require('../adapters/async-exec');
  try {
    return { code: 0, stdout: await asyncExec(cmd, args, { cwd }), stderr: '' };
  } catch (err) {
    return { code: typeof err.code === 'number' ? err.code : 1, stdout: err.stdout || '', stderr: err.stderr || err.message };
  }
}

// Run async thunks with at most `limit` in flight; results keep input order.
async function runPool(thunks, limit) {
  const results = new Array(thunks.length);
  let next = 0;
  const width = Math.max(1, Math.min(limit || thunks.length, thunks.length));
  async function lane() {
    while (next < thunks.length) {
      const i = next++;
      results[i] = await thunks[i]();
    }
  }
  await Promise.all(Array.from({ length: width }, lane));
  return results;
}

function runnableChecks(checks) {
  return Object.entries(checks || {}).filter(([name, cfg]) =>
    !RESERVED_CHECKS.has(name) && cfg && (cfg.command != null || cfg.type === 'github-checks'));
}

// Evaluate the Definition of Done.
//   projectRoot   working dir for the commands
//   config        DodConfig (loadDodConfig)
//   runCommand    (command, projectRoot, { env, timeoutMs }) => { code, stdout, stderr } | Promise  (injectable)
//   proc          (cmd, args, { cwd }) => Promise<{ code, stdout, stderr }>  (github-checks; injectable)
//   changedFiles  string[] of changed paths: scanned for markers, matched against a
//                 check's `paths:` scope, and exported to commands. Empty = unknown,
//                 in which case every check runs (fail-safe, never silently skips).
//   base          diff base ref, exported to commands as AI_SDLC_BASE
//   read          (path) => string   (injectable file reader, default fs)
//   sleep / now   injectable clock for github-checks polling
async function evaluateDod({
  projectRoot = process.cwd(), config = DEFAULT_CONFIG, runCommand = defaultRunCommand, proc = defaultProc,
  changedFiles = [], base, read, sleep, now,
} = {}) {
  const spec = config.spec || DEFAULT_CONFIG.spec;
  const mode = spec.enforcementMode || 'enforce';
  const readFile = read || ((p) => readFileSync(join(projectRoot, p), 'utf8'));
  const scoped = Array.isArray(changedFiles) && changedFiles.length > 0;
  const env = {
    ...(base ? { AI_SDLC_BASE: base } : {}),
    ...(scoped ? { AI_SDLC_CHANGED_FILES: changedFiles.join('\n') } : {}),
  };

  const runOne = async (name, cfg) => {
    const enforced = cfg.enforced !== false;
    if (scoped && Array.isArray(cfg.paths) && cfg.paths.length) {
      const hit = filterByGlobs(changedFiles, cfg.paths);
      if (hit.length === 0) {
        return { name, enforced, passed: true, skipped: true, finding: `skipped — no changed file under ${cfg.paths.join(', ')}` };
      }
    }
    const timeoutMs = cfg.timeoutMinutes ? cfg.timeoutMinutes * 60 * 1000 : undefined;
    const t0 = Date.now();
    if (cfg.type === 'github-checks') {
      const r = await waitForGithubChecks({
        proc, cwd: projectRoot, push: cfg.push === true, draftPr: cfg.draftPr === true, baseBranch: cfg.baseBranch || 'main',
        ...(timeoutMs ? { timeoutMs } : {}),
        ...(cfg.intervalSeconds ? { intervalMs: cfg.intervalSeconds * 1000 } : {}),
        ...(cfg.appearTimeoutSeconds ? { appearTimeoutMs: cfg.appearTimeoutSeconds * 1000 } : {}),
        ...(sleep ? { sleep } : {}), ...(now ? { now } : {}),
      });
      return { name, enforced, passed: r.passed, finding: r.finding, output: r.passed ? undefined : r.output, durationMs: Date.now() - t0 };
    }
    const r = await runCommand(cfg.command, projectRoot, { env, timeoutMs });
    const passed = r.code === 0;
    return {
      name,
      enforced,
      passed,
      finding: passed ? `\`${cfg.command}\` passed` : `\`${cfg.command}\` failed (exit ${r.code})`,
      output: passed ? undefined : (r.stderr || r.stdout || '').split('\n').slice(-8).join('\n'),
      durationMs: Date.now() - t0,
    };
  };

  // Independent checks run concurrently (spec.concurrency caps it; default all).
  const entries = runnableChecks(spec.checks);
  const checks = await runPool(entries.map(([name, cfg]) => () => runOne(name, cfg)), spec.concurrency);

  // Markers — no TODO/FIXME/HACK/XXX in the changed files.
  const markersCfg = spec.checks.markers;
  if (markersCfg && markersCfg.enforced !== false) {
    const hits = [];
    for (const f of changedFiles) {
      let content;
      try { content = readFile(f); } catch { continue; }
      const m = content.match(MARKER_RE);
      if (m) hits.push(`${f}: ${m[1]}`);
    }
    checks.push({
      name: 'markers',
      enforced: true,
      passed: hits.length === 0,
      finding: hits.length === 0 ? 'no incomplete-work markers in changed files' : `incomplete-work markers: ${hits.join('; ')}`,
    });
  }

  // Advisory tier: surface the Level-1 outcome metrics (completion / regression /
  // review-loops / blast-radius) from accumulated run-records. NEVER blocks — it is
  // trend telemetry so a passing-but-degrading pipeline is visible at the exit gate.
  const outcomesCfg = spec.checks.outcomes;
  const advisory = [];
  if (outcomesCfg && outcomesCfg.runRecords) {
    try {
      const { evaluateRunFile } = require('./../measurement/outcome-metrics');
      const recPath = join(projectRoot, outcomesCfg.runRecords);
      if (existsSync(recPath)) {
        const { scorecard } = evaluateRunFile(recPath);
        const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);
        advisory.push({
          code: 'outcome-metrics',
          message: `runs=${scorecard.runs} · completion=${pct(scorecard.completionRate)} · regression=${pct(scorecard.regressionRate)} · avg review-loops=${scorecard.avgReviewLoops ?? 'n/a'} · avg blast-radius=${scorecard.avgBlastRadius ?? 'n/a'}`,
          scorecard,
        });
      }
    } catch (err) {
      advisory.push({ code: 'outcome-metrics-error', message: `could not compute outcome metrics: ${err.message}` });
    }
  }

  const failedEnforced = checks.filter((c) => c.enforced && !c.passed);
  // In enforce mode, ANY failed enforced check blocks Done. In warn mode, never blocks.
  const passed = mode === 'enforce' ? failedEnforced.length === 0 : true;
  const reasons = failedEnforced.map((c) => `${c.name}: ${c.finding}`);

  return { passed, mode, checks, advisory, reasons, blocked: mode === 'enforce' && failedEnforced.length > 0 };
}

// Changed files on this branch relative to `base` (merge-base diff, i.e. what a
// PR against base would contain). Throws if git fails — the CLI reports it.
function changedFilesSince(base, cwd = process.cwd()) {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`], { cwd, encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

module.exports = { evaluateDod, loadDodConfig, changedFilesSince, runPool, DEFAULT_CONFIG, MARKER_RE, RESERVED_CHECKS };

// CLI: node decision-engine/dod-gate.js [--config path] [--base ref] [--file a.ts --file b.ts]
//   --base ref   derive the changed files from `git diff ref...HEAD` (used when no
//                --file is given) and export AI_SDLC_BASE to every check command.
if (require.main === module) {
  const argv = process.argv.slice(2);
  const files = [];
  let cfgPath = '.ai-sdlc/dod-config.yaml';
  let base;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') cfgPath = argv[++i];
    else if (argv[i] === '--file') files.push(argv[++i]);
    else if (argv[i] === '--base') base = argv[++i];
  }
  (async () => {
    const changedFiles = files.length || !base ? files : changedFilesSince(base);
    const res = await evaluateDod({ config: loadDodConfig(cfgPath), changedFiles, base });
    for (const c of res.checks) {
      const status = c.skipped ? 'SKIP' : c.passed ? 'PASS' : 'FAIL';
      const took = c.durationMs != null ? ` (${Math.round(c.durationMs / 1000)}s)` : '';
      console.log(`${status}  ${c.name}  ${c.finding}${took}`);
      if (!c.passed && c.output) console.log(c.output.split('\n').map((l) => `      ${l}`).join('\n'));
    }
    for (const a of res.advisory || []) console.log(`ADVISORY  ${a.code}  ${a.message}`);
    if (res.blocked) {
      console.error(`\nDoD BLOCKED — not Done. Fix and re-run:\n  - ${res.reasons.join('\n  - ')}`);
      process.exit(2);
    }
    console.log('\nDoD passed — task may be marked Done.');
    process.exit(0);
  })().catch((err) => {
    console.error(`dod-gate failed: ${err.message}`);
    process.exit(1);
  });
}
