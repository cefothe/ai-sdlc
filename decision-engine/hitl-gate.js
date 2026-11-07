// HITL gate — the human-sign-off boundary of the pipeline (Policy Gate slot).
// A branch whose change fires a checkpoint (agent-instruction edits, gate/policy
// edits, destructive commands, migrations, CI, secrets, IaC, …) STOPS before
// push until a human acknowledges each fired checkpoint with a
// `HITL-ACK: <checkpoint> <note>` trailer on a commit in the branch.
//
// Evaluation: the published commitward `gate` container (ADR-0052 envelope,
// inputs inlined, --network none) is the primary path; when it is unavailable
// the identical registry is evaluated in-process and the seam is reported as
// degraded. commitward itself is fail-open; this framework's policy is
// stricter at the pipeline boundary: a gate that cannot evaluate (a rejected or
// uncompilable registry) BLOCKS — "always stop for a human" means an unknown
// answer is not a yes. The pipeline never writes an acknowledgement.

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const DEFAULT_REGISTRY = join(__dirname, 'checkpoints.default.yaml');
const REPO_REGISTRY = join('.ai-sdlc', 'checkpoints.yaml');
const ACK_RE = /^\s*HITL-ACK:\s*([A-Za-z0-9._-]+)/gim;

// Patterns are case-insensitive (commitward's compile_ci). JS has no inline
// flag toggles on Node 22, so a pattern carrying a case-sensitive `(?-i:X)`
// token is compiled case-sensitive as a whole with the group made plain.
function compilePattern(src) {
  if (src.includes('(?-i:')) return new RegExp(src.replace(/\(\?-i:/g, '(?:'), 'm');
  return new RegExp(src, 'im');
}

function readYaml(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function parseRegistry(text, label) {
  if (!text || !text.trim()) return { checkpoints: [] };
  const doc = yaml.load(text);
  if (!doc || typeof doc !== 'object' || (doc.checkpoints !== undefined && !Array.isArray(doc.checkpoints))) {
    throw new Error(`${label}: registry must be a mapping with a checkpoints list`);
  }
  return { checkpoints: doc.checkpoints || [] };
}

// Global (plugin default) checkpoints overridden by repo entries of the same name.
function mergeRegistries(globalDoc, repoDoc) {
  const byName = new Map();
  for (const c of [...globalDoc.checkpoints, ...repoDoc.checkpoints]) {
    if (c && c.name) byName.set(c.name, c);
  }
  return [...byName.values()];
}

function compileCheckpoint(c) {
  return {
    name: c.name,
    summary: c.summary || '',
    paths: (c.paths || []).map(compilePattern),
    content: (c.content || []).map(compilePattern),
    exempt: (c.content_exempt_paths || []).map(compilePattern),
    semantic: c.semantic || null,
  };
}

// The compiled checkpoints in force for a repo: plugin default + repo overrides.
function loadCheckpointsForRoot(root, { defaultRegistryPath = DEFAULT_REGISTRY } = {}) {
  return mergeRegistries(
    parseRegistry(readYaml(defaultRegistryPath), 'global registry'),
    parseRegistry(readYaml(join(root, REPO_REGISTRY)), 'repo registry'),
  ).map(compileCheckpoint);
}

// `git diff --name-status` → changed paths (both sides of a rename/copy).
function parseNameStatus(text) {
  const paths = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [, ...rest] = line.split('\t');
    for (const p of rest) if (p && !paths.includes(p)) paths.push(p);
  }
  return paths;
}

// Unified diff → Map(path → added lines).
function addedLinesByFile(diffText) {
  const out = new Map();
  let current = null;
  for (const line of String(diffText || '').split(/\r?\n/)) {
    const header = line.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (header) {
      current = header[1] === '/dev/null' ? null : header[1];
      if (current && !out.has(current)) out.set(current, []);
      continue;
    }
    if (current && line.startsWith('+') && !line.startsWith('+++')) out.get(current).push(line.slice(1));
  }
  return out;
}

function acknowledgedNames(commitMsg) {
  return new Set([...String(commitMsg || '').matchAll(ACK_RE)].map((m) => m[1].toLowerCase()));
}

// Pure, in-process evaluation over inlined inputs (the commitward `gate`
// request shape). Throws when a registry or pattern will not compile.
function evaluateInProcess({ name_status, diff, commit_msg, global_registry_yaml, repo_registry_yaml, base_repo_registry_yaml }) {
  const globalDoc = parseRegistry(global_registry_yaml, 'global registry');
  const repoDoc = parseRegistry(repo_registry_yaml, 'repo registry');
  const checkpoints = mergeRegistries(globalDoc, repoDoc).map(compileCheckpoint);
  const paths = parseNameStatus(name_status);
  const added = addedLinesByFile(diff);
  const warnings = [];
  if (name_status === undefined) warnings.push('no name_status supplied — no checkpoint could fire');
  if (diff === undefined) warnings.push('no diff supplied — content checkpoints could not fire');

  const fired = [];
  for (const c of checkpoints) {
    let why = null;
    const pathHit = paths.find((p) => c.paths.some((re) => re.test(p)));
    if (pathHit) why = `path ${pathHit}`;
    if (!why && c.content.length) {
      for (const [file, lines] of added) {
        if (c.exempt.some((re) => re.test(file))) continue;
        const hit = lines.find((l) => c.content.some((re) => re.test(l)));
        if (hit !== undefined) { why = `content in ${file}: ${hit.trim().slice(0, 120)}`; break; }
      }
    }
    if (!why && c.semantic === 'checkpoint_removed' && base_repo_registry_yaml !== undefined) {
      const before = new Set(parseRegistry(base_repo_registry_yaml, 'base repo registry').checkpoints.map((x) => x && x.name).filter(Boolean));
      const now = new Set(repoDoc.checkpoints.map((x) => x && x.name).filter(Boolean));
      const removed = [...before].filter((n) => !now.has(n));
      if (removed.length) why = `removed from ${REPO_REGISTRY}: ${removed.join(', ')}`;
    }
    if (why) fired.push({ name: c.name, summary: c.summary, why });
  }

  const acks = acknowledgedNames(commit_msg);
  const unacked = fired.filter((f) => !acks.has(f.name.toLowerCase())).map((f) => f.name);
  const exitClass = fired.length === 0 ? 0 : unacked.length ? 2 : 1;
  return { fired, unacked, exit_class: exitClass, warnings };
}

function git(runner, args, cwd) {
  const out = runner(args, { cwd });
  return out && out.stdout !== undefined ? String(out.stdout) : String(out || '');
}

// The branch's own change vs its merge base, and every commit message in it.
function collectGitInputs({ runner, cwd, base }) {
  const range = `${base}...HEAD`;
  let baseRepoYaml;
  try {
    baseRepoYaml = git(runner, ['show', `${base}:${REPO_REGISTRY.split('\\').join('/')}`], cwd);
  } catch {
    baseRepoYaml = '';
  }
  return {
    name_status: git(runner, ['diff', '--name-status', range], cwd),
    diff: git(runner, ['diff', '--unified=0', range], cwd),
    commit_msg: git(runner, ['log', '--format=%B', `${base}..HEAD`], cwd),
    base_repo_registry_yaml: baseRepoYaml,
  };
}

function verdict(status, extra) {
  return { status, ...extra };
}

// Evaluate the branch at `cwd` (a worktree) against `base`.
// Returns { status: clear|acked|blocked, exitClass, fired[], unacked[], source, degraded[], warnings[], reason? }.
async function evaluateHitlGate({ cwd, base = 'main', runner, invoke, defaultRegistryPath = DEFAULT_REGISTRY }) {
  const degraded = [];
  let inputs;
  try {
    inputs = collectGitInputs({ runner, cwd, base });
  } catch (err) {
    return verdict('blocked', { exitClass: 2, fired: [], unacked: [], source: 'none', degraded, warnings: [], reason: `HITL gate could not read the branch diff: ${err.message}` });
  }
  const request = {
    ...inputs,
    global_registry_yaml: readYaml(defaultRegistryPath),
    repo_registry_yaml: readYaml(join(cwd, REPO_REGISTRY)),
    repo_registry_path: REPO_REGISTRY.split('\\').join('/'),
  };

  if (typeof invoke === 'function') {
    const r = await invoke('commitward', request);
    if (r.status === 'ok') {
      const body = r.body || {};
      const fired = (body.fired || []).map((f) => (typeof f === 'string' ? { name: f, summary: '', why: '' } : { name: f.name, summary: f.summary || '', why: f.why || f.reason || '' }));
      const unacked = body.unacked || [];
      const exitClass = typeof body.exit_class === 'number' ? body.exit_class : unacked.length ? 2 : fired.length ? 1 : 0;
      return verdict(exitClass === 2 ? 'blocked' : exitClass === 1 ? 'acked' : 'clear', { exitClass, fired, unacked, source: 'commitward', degraded, warnings: body.warnings || [] });
    }
    if (r.status === 'rejected') {
      return verdict('blocked', { exitClass: 2, fired: [], unacked: [], source: 'commitward', degraded, warnings: [], reason: `HITL registry rejected by commitward: ${r.reason}` });
    }
    degraded.push({ seam: 'commitward', reason: r.reason });
  }

  try {
    const res = evaluateInProcess(request);
    const status = res.exit_class === 2 ? 'blocked' : res.exit_class === 1 ? 'acked' : 'clear';
    return verdict(status, { exitClass: res.exit_class, fired: res.fired, unacked: res.unacked, source: 'in-process', degraded, warnings: res.warnings });
  } catch (err) {
    return verdict('blocked', { exitClass: 2, fired: [], unacked: [], source: 'in-process', degraded, warnings: [], reason: `HITL gate could not evaluate the registry: ${err.message}` });
  }
}

// Operator-facing instructions for a blocked gate.
function formatBlocked(res) {
  if (res.reason) return [`HITL gate could not evaluate — human review required: ${res.reason}`];
  return [
    `human sign-off required for: ${res.unacked.join(', ')}`,
    ...res.fired.filter((f) => res.unacked.includes(f.name)).map((f) => `  - ${f.name}: ${f.summary}${f.why ? ` (${f.why})` : ''}`),
    'A human reviews the change, then records the sign-off on the branch, e.g.:',
    `  git commit --allow-empty -m "HITL sign-off" ${res.unacked.map((n) => `-m "HITL-ACK: ${n} <reviewer + what was checked>"`).join(' ')}`,
    'and re-runs the task. The pipeline never writes HITL-ACK itself.',
  ];
}

module.exports = {
  evaluateHitlGate, evaluateInProcess, collectGitInputs, compilePattern, compileCheckpoint, loadCheckpointsForRoot, parseNameStatus,
  addedLinesByFile, acknowledgedNames, mergeRegistries, parseRegistry, formatBlocked,
  DEFAULT_REGISTRY, REPO_REGISTRY,
};

// CLI: node decision-engine/hitl-gate.js [--base main] [--inprocess]
// exit 0 clear · 1 fired and all acknowledged · 2 human sign-off required
if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = i >= 0 && args[i + 1] ? args[i + 1] : 'main';
  const { makeGitRunner } = require('../adapters/claude-code-spawner');
  const { makeComponentInvoker } = require('../adapters/component-invoker');
  const invoke = makeComponentInvoker({ mode: args.includes('--inprocess') ? 'inprocess' : undefined });
  evaluateHitlGate({ cwd: process.cwd(), base, runner: makeGitRunner(), invoke })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      if (res.status === 'blocked') console.error(formatBlocked(res).join('\n'));
      process.exit(res.exitClass);
    })
    .catch((err) => {
      console.error(`hitl-gate failed: ${err.message}`);
      process.exit(2);
    });
}
