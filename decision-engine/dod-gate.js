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

const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

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

// Default command runner — spawnSync. Injected in tests so no real build/tests run.
function defaultRunCommand(command, projectRoot) {
  const { spawnSync } = require('node:child_process');
  const res = spawnSync(command, { shell: true, cwd: projectRoot, encoding: 'utf8' });
  return { code: res.status == null ? 1 : res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

// Evaluate the Definition of Done.
//   projectRoot   working dir for the commands
//   config        DodConfig (loadDodConfig)
//   runCommand    (command, projectRoot) => { code, stdout, stderr }  (injectable)
//   changedFiles  optional string[] of paths to scan for markers (+ readFile via `read`)
//   read          (path) => string   (injectable file reader, default fs)
function evaluateDod({ projectRoot = process.cwd(), config = DEFAULT_CONFIG, runCommand = defaultRunCommand, changedFiles = [], read } = {}) {
  const spec = config.spec || DEFAULT_CONFIG.spec;
  const mode = spec.enforcementMode || 'enforce';
  const readFile = read || ((p) => readFileSync(join(projectRoot, p), 'utf8'));
  const checks = [];

  const runCmdCheck = (name, cfg) => {
    if (!cfg || cfg.command == null) return;
    const r = runCommand(cfg.command, projectRoot);
    const passed = r.code === 0;
    checks.push({
      name,
      enforced: cfg.enforced !== false,
      passed,
      finding: passed ? `\`${cfg.command}\` passed` : `\`${cfg.command}\` failed (exit ${r.code})`,
      output: passed ? undefined : (r.stderr || r.stdout || '').split('\n').slice(-8).join('\n'),
    });
  };

  runCmdCheck('build', spec.checks.build);
  runCmdCheck('test', spec.checks.test);

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

module.exports = { evaluateDod, loadDodConfig, DEFAULT_CONFIG, MARKER_RE };

// CLI: node decision-engine/dod-gate.js [--config path] [--file a.ts --file b.ts]
if (require.main === module) {
  const argv = process.argv.slice(2);
  const files = [];
  let cfgPath = '.ai-sdlc/dod-config.yaml';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') cfgPath = argv[++i];
    else if (argv[i] === '--file') files.push(argv[++i]);
  }
  try {
    const res = evaluateDod({ config: loadDodConfig(cfgPath), changedFiles: files });
    for (const c of res.checks) console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.name}  ${c.finding}`);
    for (const a of res.advisory || []) console.log(`ADVISORY  ${a.code}  ${a.message}`);
    if (res.blocked) {
      console.error(`\nDoD BLOCKED — not Done. Fix and re-run:\n  - ${res.reasons.join('\n  - ')}`);
      process.exit(2);
    }
    console.log('\nDoD passed — task may be marked Done.');
    process.exit(0);
  } catch (err) {
    console.error(`dod-gate failed: ${err.message}`);
    process.exit(1);
  }
}
