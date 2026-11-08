// Pace — how much ceremony a change earns, from what it touches (pace layers),
// floored by the HITL checkpoints, and raised (never lowered) by low implementer
// trust. Deterministic and advisory to the operator; the pipeline applies the
// resulting ceremony (design panel on/off, review-team cap, draft PR).
//
// Three inputs combine:
//   - pace layers (.ai-sdlc/pace.yaml, else the plugin default): path → fast|normal|slow
//   - HITL floor: a path a checkpoint claims is slow, whatever the layers say
//   - trust: a low/critical trust tier raises the verdict one layer

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');
const { compilePattern, loadCheckpointsForRoot } = require('./hitl-gate');

const RANKS = ['fast', 'normal', 'slow'];
const DEFAULT_PACE = join(__dirname, 'pace.default.yaml');
const REPO_PACE = join('.ai-sdlc', 'pace.yaml');
const RAISING_TIERS = new Set(['low', 'critical']);

// Parse + compile a pace registry. Throws when `normal` or `slow` is missing —
// a registry with no ceremony text for a rank the classifier can still reach is
// a broken registry, not a lenient one.
function compilePace(text) {
  const doc = yaml.load(text) || {};
  const layers = doc.layers || {};
  for (const required of ['normal', 'slow']) {
    if (!layers[required]) throw new Error(`pace registry must declare the "${required}" layer`);
  }
  const out = {};
  for (const rank of RANKS) {
    if (!layers[rank]) continue;
    out[rank] = {
      ceremony: { designPanel: true, maxReviewers: 0, draftPr: false, ...(layers[rank].ceremony || {}) },
      paths: (layers[rank].paths || []).map(compilePattern),
    };
  }
  return out;
}

function loadPace(root) {
  const repo = join(root, REPO_PACE);
  const path = existsSync(repo) ? repo : DEFAULT_PACE;
  return { path, layers: compilePace(readFileSync(path, 'utf8')) };
}

function maxRank(a, b) {
  return RANKS.indexOf(a) >= RANKS.indexOf(b) ? a : b;
}

// Pure. files: repo-relative paths; addedLines: Map(path → added lines), optional.
function evaluatePace({ files = [], addedLines = new Map(), layers, checkpoints = [], trustTier = null }) {
  const perPath = [];
  const unclassified = [];
  const hitlFloor = [];
  let verdict = files.length ? 'fast' : 'normal';
  for (const file of files) {
    let rank = null;
    const by = [];
    for (const r of RANKS) {
      if (layers[r] && layers[r].paths.some((re) => re.test(file))) { rank = rank ? maxRank(rank, r) : r; by.push(r); }
    }
    if (!rank) { rank = 'normal'; unclassified.push(file); }
    const lines = addedLines.get(file) || [];
    const claimedBy = checkpoints.filter((c) => c.paths.some((re) => re.test(file))
      || (!c.exempt.some((re) => re.test(file)) && lines.some((l) => c.content.some((re) => re.test(l))))).map((c) => c.name);
    if (claimedBy.length) { rank = 'slow'; hitlFloor.push({ path: file, checkpoints: claimedBy }); }
    perPath.push({ path: file, rank, layers: by, checkpoints: claimedBy });
    verdict = maxRank(verdict, rank);
  }
  let trustRaised = false;
  if (trustTier && RAISING_TIERS.has(trustTier) && verdict !== 'slow') {
    verdict = RANKS[RANKS.indexOf(verdict) + 1];
    trustRaised = true;
  }
  const layer = layers[verdict] || layers.normal;
  return { verdict, ceremony: { ...layer.ceremony }, perPath, unclassified, hitlFloor, trustTier, trustRaised };
}

// Load the repo's pace + checkpoints and evaluate a change set.
function evaluatePaceForRoot(root, { files, addedLines, trustTier } = {}) {
  const { path, layers } = loadPace(root);
  return { registry: path, ...evaluatePace({ files, addedLines, layers, checkpoints: loadCheckpointsForRoot(root), trustTier }) };
}

module.exports = { evaluatePace, evaluatePaceForRoot, compilePace, loadPace, RANKS, DEFAULT_PACE, REPO_PACE };

// CLI: node decision-engine/pace.js [--base main] [--trust low]
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined; };
  try {
    const { execFileSync } = require('node:child_process');
    const { parseNameStatus, addedLinesByFile } = require('./hitl-gate');
    const base = flag('base') || 'main';
    const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const files = parseNameStatus(git(['diff', '--name-status', `${base}...HEAD`]));
    const addedLines = addedLinesByFile(git(['diff', '--unified=0', `${base}...HEAD`]));
    console.log(JSON.stringify(evaluatePaceForRoot(process.cwd(), { files, addedLines, trustTier: flag('trust') || null }), null, 2));
    process.exit(0);
  } catch (err) {
    console.error(`pace failed: ${err.message}`);
    process.exit(64);
  }
}
