// Review lessons — "when a mistake is flagged twice, the correction goes into
// CLAUDE.md" (Anthropic "AI-native SDLC playbook"). Reviewer findings recorded
// in .ai-sdlc/runs.jsonl are grouped by a normalized signature; one that recurs
// across >=2 distinct runs is a lesson the agents have not learned. Human
// ratings (.ai-sdlc/review-ratings.jsonl) split lessons from noise:
//
//   useful/unrated + recurring → a proposed CLAUDE.md line (docs/lessons/proposed.md)
//   rated noise >= 3 times     → tune REVIEW.md (skip or downgrade that pattern)
//
// Promoting a proposal into CLAUDE.md is a human decision — and a CLAUDE.md edit
// fires the agent-instructions HITL checkpoint by design.

const { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { loadRuns } = require('./delivery-metrics');

const RATINGS_FILE = join('.ai-sdlc', 'review-ratings.jsonl');
const PROPOSALS_FILE = join('docs', 'lessons', 'proposed.md');
const MIN_RUNS = 2;
const NOISE_THRESHOLD = 3;

// A stable signature for "the same mistake": lower-case, paths/numbers/quoted
// identifiers removed, first 10 significant words.
function signature(message) {
  return String(message || '').toLowerCase()
    .replace(/`[^`]*`|"[^"]*"|'[^']*'/g, ' ')
    .replace(/\b[\w./-]+\.(js|ts|tsx|jsx|py|java|go|rb|rs|kt|cs|php|md|json|ya?ml)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2).slice(0, 10).join(' ');
}

function loadRatings(root) {
  const file = join(root, RATINGS_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function rate(root, { signature: sig, rating, by, at = new Date().toISOString() }) {
  if (!['useful', 'noise'].includes(rating)) throw new Error('rating must be useful or noise');
  if (!sig) throw new Error('signature required');
  const file = join(root, RATINGS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ signature: sig, rating, by: by || 'unknown', at })}\n`);
}

function analyze(records, ratings = []) {
  const groups = new Map();
  for (const r of records) {
    for (const f of (r.review && r.review.findings) || []) {
      const sig = signature(f.message);
      if (!sig) continue;
      if (!groups.has(sig)) groups.set(sig, { signature: sig, example: f.message, severity: f.severity, runs: new Set(), files: new Set() });
      const g = groups.get(sig);
      g.runs.add(r.runId || r.taskId);
      if (f.file) g.files.add(f.file);
    }
  }
  const noiseCount = (sig) => ratings.filter((x) => x.signature === sig && x.rating === 'noise').length;
  const usefulCount = (sig) => ratings.filter((x) => x.signature === sig && x.rating === 'useful').length;
  const all = [...groups.values()].map((g) => ({ ...g, runs: [...g.runs], files: [...g.files], noise: noiseCount(g.signature), useful: usefulCount(g.signature) }));
  return {
    lessons: all.filter((g) => g.runs.length >= MIN_RUNS && g.noise < NOISE_THRESHOLD).sort((a, b) => b.runs.length - a.runs.length),
    noise: all.filter((g) => g.noise >= NOISE_THRESHOLD),
  };
}

function renderProposals({ lessons, noise }, now = new Date().toISOString()) {
  const lines = [
    '# Proposed lessons', '',
    `> Generated ${now} by measurement/review-lessons.js from recorded reviewer findings. A finding that`,
    '> recurs across runs is a mistake the agents keep making. Promote a lesson by adding its line to',
    '> CLAUDE.md (a HITL-checkpointed change); rate findings with `review-lessons.js rate`.', '',
    '## Recurring findings → CLAUDE.md candidates', '',
  ];
  if (!lessons.length) lines.push('None yet.', '');
  for (const l of lessons) {
    lines.push(`- **${l.severity || 'finding'}**, ${l.runs.length} runs (${l.runs.join(', ')}): ${l.example}`);
    lines.push(`  - Proposed CLAUDE.md line: _"${l.example.replace(/\s+/g, ' ').slice(0, 160)}" — avoid this; reviewers flagged it ${l.runs.length} times._`);
    lines.push(`  - signature: \`${l.signature}\`${l.useful ? ` · rated useful ${l.useful}×` : ''}`);
  }
  lines.push('', '## Rated noise → tune REVIEW.md', '');
  if (!noise.length) lines.push('None.', '');
  for (const n of noise) lines.push(`- ${n.example} (noise ×${n.noise}) — add a skip or downgrade it in REVIEW.md. signature: \`${n.signature}\``);
  return `${lines.join('\n')}\n`;
}

function writeProposals(root, analysis) {
  const file = join(root, PROPOSALS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderProposals(analysis));
  return PROPOSALS_FILE;
}

module.exports = { signature, analyze, rate, loadRatings, renderProposals, writeProposals, RATINGS_FILE, PROPOSALS_FILE };

// CLI:
//   node measurement/review-lessons.js report
//   node measurement/review-lessons.js rate "<signature>" useful|noise [--by name]
if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  const root = process.cwd();
  try {
    if (cmd === 'rate') {
      const i = args.indexOf('--by');
      rate(root, { signature: args[0], rating: args[1], by: i >= 0 ? args[i + 1] : undefined });
      console.log(`rated ${args[1]}: ${args[0]}`);
    } else if (cmd === 'report') {
      const analysis = analyze(loadRuns(root), loadRatings(root));
      console.log(`${analysis.lessons.length} recurring lesson(s), ${analysis.noise.length} noise pattern(s) → ${writeProposals(root, analysis)}`);
    } else {
      console.error('usage: review-lessons report | rate "<signature>" useful|noise [--by name]');
      process.exit(64);
    }
  } catch (err) {
    console.error(`review-lessons failed: ${err.message}`);
    process.exit(1);
  }
}
