// Workspace loader — the multi-repo-one-folder model (ai-sdlc extension).
//
// A "project" is one parent folder containing N git repositories as subfolders,
// governed by a single shared .ai-sdlc/ config and one backlog at the parent.
// The reference framework has no such registry (RFC-0010 makes cross-clone a
// non-goal; it only supports ad-hoc sibling permittedExternalPaths). This
// module is the newly-designed replacement:
//
//   - loadWorkspace(parentDir): parse + validate .ai-sdlc/workspace.yaml
//   - resolveTargetRepo(ws, task): map a task's targetRepo -> repo entry, and
//     compute the per-repo worktreeRoot where its worktree is created
//   - buildDepGraph(ws, tasks): a single dependency graph spanning all repos,
//     with cycle detection and a topological admission order
//
// Path-safety: every repo path and worktreeRoot MUST resolve inside the parent
// folder; traversal outside it is rejected (mirrors the reference's ownership
// verification but applied at the workspace boundary).

const { existsSync, readFileSync } = require('node:fs');
const { join, resolve, relative, isAbsolute } = require('node:path');
const yaml = require('js-yaml');

const WORKSPACE_FILE = join('.ai-sdlc', 'workspace.yaml');

function isInside(parentAbs, childAbs) {
  const rel = relative(parentAbs, childAbs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// Load and validate the workspace resource. Returns a normalized object:
//   { name, parentDir, backlogRoot (abs), configScope, depGraphSpanning,
//     repos: [{ id, path (abs), remote, defaultBranch, worktreeRoot (abs) }] }
// Throws on missing/invalid file, duplicate ids, or path traversal.
function loadWorkspace(parentDir) {
  const parentAbs = resolve(parentDir);
  const file = join(parentAbs, WORKSPACE_FILE);
  if (!existsSync(file)) {
    throw new Error(`no workspace at ${file} — not a multi-repo workspace (single-repo mode)`);
  }
  let doc;
  try {
    doc = yaml.load(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`invalid workspace.yaml: ${err.message}`);
  }
  if (!doc || doc.kind !== 'Workspace') {
    throw new Error('workspace.yaml must declare kind: Workspace');
  }
  const spec = doc.spec || {};
  if (!Array.isArray(spec.repos) || spec.repos.length === 0) {
    throw new Error('workspace.yaml spec.repos must be a non-empty array');
  }

  const seen = new Set();
  const repos = spec.repos.map((r) => {
    if (!r || !r.id || !r.path) throw new Error('each workspace repo needs id + path');
    if (seen.has(r.id)) throw new Error(`duplicate repo id "${r.id}" in workspace`);
    seen.add(r.id);
    const pathAbs = resolve(parentAbs, r.path);
    if (!isInside(parentAbs, pathAbs)) {
      throw new Error(`repo "${r.id}" path escapes the workspace parent: ${r.path}`);
    }
    const worktreeRoot = resolve(parentAbs, r.worktreeRoot || join(r.path, '.worktrees'));
    if (!isInside(parentAbs, worktreeRoot)) {
      throw new Error(`repo "${r.id}" worktreeRoot escapes the workspace parent: ${r.worktreeRoot}`);
    }
    return {
      id: r.id,
      path: pathAbs,
      remote: r.remote,
      defaultBranch: r.defaultBranch || 'main',
      worktreeRoot,
    };
  });

  return {
    name: (doc.metadata && doc.metadata.name) || 'workspace',
    parentDir: parentAbs,
    configScope: spec.configScope || 'shared',
    backlogRoot: resolve(parentAbs, spec.backlogRoot || './backlog'),
    depGraphSpanning: !!(spec.crossRepo && spec.crossRepo.depGraphSpanning),
    repos,
  };
}

function repoById(ws, id) {
  return ws.repos.find((r) => r.id === id);
}

// Resolve which repo + worktree a task targets. In workspace mode targetRepo
// is required; the worktree for the task is created under that repo's
// worktreeRoot (never a cross-clone worktree of another repo).
function resolveTargetRepo(ws, task) {
  const fm = (task && task.frontmatter) || task || {};
  const id = fm.targetRepo;
  if (!id) {
    throw new Error(`task ${fm.id || '(unknown)'} has no targetRepo (required in workspace mode)`);
  }
  const repo = repoById(ws, id);
  if (!repo) {
    throw new Error(`task ${fm.id || '(unknown)'} targets unknown repo "${id}"`);
  }
  const taskId = String(fm.id || 'task').toLowerCase();
  return { repo, worktreePath: join(repo.worktreeRoot, taskId) };
}

// Build a dependency graph spanning all repos. Each node is a task id; edges
// are dependencies[] -> task. Returns { order, edges, crossRepoEdges }.
// Throws on cycles (with the cycle path) and on cross-repo edges when
// depGraphSpanning is disabled.
function buildDepGraph(ws, tasks) {
  const byId = new Map();
  for (const t of tasks) {
    const fm = t.frontmatter || t;
    byId.set(String(fm.id), { id: String(fm.id), repo: fm.targetRepo, deps: (fm.dependencies || []).map(String) });
  }

  const edges = [];
  const crossRepoEdges = [];
  for (const node of byId.values()) {
    for (const dep of node.deps) {
      const upstream = byId.get(dep);
      if (!upstream) continue; // external/unknown dep — not part of this graph
      edges.push([dep, node.id]);
      if (upstream.repo !== node.repo) {
        crossRepoEdges.push([dep, node.id]);
        if (!ws.depGraphSpanning) {
          throw new Error(
            `cross-repo dependency ${dep} (${upstream.repo}) -> ${node.id} (${node.repo}) requires crossRepo.depGraphSpanning: true`,
          );
        }
      }
    }
  }

  // Kahn topological sort with cycle detection.
  const indeg = new Map([...byId.keys()].map((k) => [k, 0]));
  const adj = new Map([...byId.keys()].map((k) => [k, []]));
  for (const [from, to] of edges) {
    adj.get(from).push(to);
    indeg.set(to, indeg.get(to) + 1);
  }
  const queue = [...byId.keys()].filter((k) => indeg.get(k) === 0).sort();
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const m of adj.get(n)) {
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) {
        queue.push(m);
        queue.sort();
      }
    }
  }
  if (order.length !== byId.size) {
    const inCycle = [...byId.keys()].filter((k) => !order.includes(k));
    throw new Error(`dependency cycle detected among: ${inCycle.join(', ')}`);
  }

  return { order, edges, crossRepoEdges };
}

module.exports = { loadWorkspace, resolveTargetRepo, buildDepGraph, repoById, WORKSPACE_FILE };
