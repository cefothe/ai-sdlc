// Monorepo projects — the subprojects a task reaches, so context is scoped to
// them: cxpak runs one index at the repo root and each task asks it for the
// touched subprojects only (`--workspace <path>`), and each subproject may keep
// its own architecture overview (<project>/docs/architecture/overview.md)
// beneath the root one, which maps the subprojects and the contracts between them.
//
// Projects come from .ai-sdlc/flow.yaml `monorepo.projects` when declared, else
// are detected from the workspace manifests (package.json workspaces,
// pnpm-workspace.yaml, go.work, Cargo [workspace] members, lerna.json).

const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { join, basename } = require('node:path');
const yaml = require('js-yaml');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Workspace globs → directories. Supports literal dirs and a trailing `*`/`**`
// segment (one level); negations are ignored.
function expandPattern(root, pattern) {
  const clean = String(pattern).replace(/^\.\//, '').replace(/\/+$/, '');
  if (!clean || clean.startsWith('!') || clean.includes('..')) return [];
  if (!/[*?]/.test(clean)) return isDir(join(root, clean)) ? [clean] : [];
  const parent = clean.replace(/\/\*\*?$/, '');
  if (/[*?]/.test(parent)) return [];
  const base = join(root, parent);
  if (!isDir(base)) return [];
  return readdirSync(base).filter((d) => !d.startsWith('.') && isDir(join(base, d))).map((d) => `${parent}/${d}`);
}

function manifestPatterns(root) {
  const patterns = [];
  const pkg = readJson(join(root, 'package.json'));
  if (pkg && pkg.workspaces) patterns.push(...(Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || []));
  const pnpm = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpm)) {
    try { patterns.push(...((yaml.load(readFileSync(pnpm, 'utf8')) || {}).packages || [])); } catch { /* unreadable manifest contributes nothing */ }
  }
  const lerna = readJson(join(root, 'lerna.json'));
  if (lerna && Array.isArray(lerna.packages)) patterns.push(...lerna.packages);
  const gowork = join(root, 'go.work');
  if (existsSync(gowork)) {
    const text = readFileSync(gowork, 'utf8');
    const block = text.match(/use\s*\(([\s\S]*?)\)/);
    const lines = block ? block[1].split(/\r?\n/) : (text.match(/^use\s+\S+/gm) || []).map((l) => l.replace(/^use\s+/, ''));
    patterns.push(...lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('//')));
  }
  const cargo = join(root, 'Cargo.toml');
  if (existsSync(cargo)) {
    const m = readFileSync(cargo, 'utf8').match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/);
    if (m) patterns.push(...[...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  }
  return patterns;
}

// [{ name, path }] — declared projects win; otherwise detected (when allowed).
function detectProjects(root, { declared = [], autoDetect = true } = {}) {
  const entries = declared.length
    ? declared.map((d) => (typeof d === 'string' ? { path: d } : d))
    : autoDetect ? manifestPatterns(root).flatMap((p) => expandPattern(root, p)).map((path) => ({ path })) : [];
  const seen = new Map();
  for (const e of entries) {
    const path = String(e.path || '').replace(/^\.\//, '').replace(/\/+$/, '');
    if (!path || path.includes('..') || !isDir(join(root, path)) || seen.has(path)) continue;
    const pkg = readJson(join(root, path, 'package.json'));
    seen.set(path, { name: e.name || (pkg && pkg.name) || basename(path), path });
  }
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// The projects owning any of `paths` (repo-relative), deepest match first.
function projectsForPaths(projects, paths = []) {
  const norm = (p) => String(p).replace(/^\.\//, '');
  return projects
    .filter((p) => paths.some((x) => norm(x) === p.path || norm(x).startsWith(`${p.path}/`)))
    .sort((a, b) => b.path.length - a.path.length);
}

module.exports = { detectProjects, projectsForPaths, expandPattern };
