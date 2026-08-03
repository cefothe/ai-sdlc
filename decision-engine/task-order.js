// Task ordering — derive the deterministic build order from ticket dependencies
// so a feature's tickets are executed in a sequence we FOLLOW, not picked ad-hoc.
//
// Reads every backlog/tasks/*.md, builds the dependency graph from the
// `dependencies:` frontmatter, and topologically sorts it (Kahn's algorithm).
// Ready tasks are ordered by priority (high > medium > low) then id, so the order
// is stable. Reports missing dependencies and cycles rather than silently
// producing a wrong order. `next` is the first not-Done task whose deps are all Done.

const { readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { loadTaskFile } = require('./backlog-task');

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
const TASKS_REL = join('backlog', 'tasks');

function normId(x) {
  const m = String(x).match(/AISDLC-\d+/i);
  return m ? m[0].toUpperCase() : String(x).trim();
}

// Load all backlog tasks into { id, title, priority, status, deps, done }.
function loadBacklog(root) {
  const dir = join(root, TASKS_REL);
  if (!existsSync(dir)) return [];
  const tasks = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    let t;
    try {
      t = loadTaskFile(join(dir, name));
    } catch {
      continue; // malformed task file — skip, not fatal to ordering the rest
    }
    const fm = t.frontmatter || {};
    if (!fm.id) continue;
    // Non-dispatchable tasks (decomposed epics, seeded-but-untriaged) are not
    // build steps — they don't belong in the execution order.
    if (fm.dispatchable === false) continue;
    tasks.push({
      id: normId(fm.id),
      title: fm.title || '',
      priority: (fm.priority || 'medium').toLowerCase(),
      status: fm.status || 'To Do',
      deps: (Array.isArray(fm.dependencies) ? fm.dependencies : []).map(normId),
      done: String(fm.status || '').toLowerCase() === 'done',
    });
  }
  return tasks;
}

// Kahn topological sort. Returns { order, cycle, missing }.
function computeOrder(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const missing = [];
  const indeg = new Map();
  const dependents = new Map(); // dep -> [tasks that depend on it]

  for (const t of tasks) {
    indeg.set(t.id, 0);
    dependents.set(t.id, dependents.get(t.id) || []);
  }
  for (const t of tasks) {
    for (const d of t.deps) {
      if (!byId.has(d)) { missing.push({ task: t.id, dependsOn: d }); continue; }
      indeg.set(t.id, indeg.get(t.id) + 1);
      dependents.get(d).push(t.id);
    }
  }

  const rank = (t) => (PRIORITY_RANK[t.priority] || 2);
  const pickReady = (ready) =>
    ready.sort((a, b) => rank(byId.get(b)) - rank(byId.get(a)) || (a < b ? -1 : a > b ? 1 : 0));

  let ready = pickReady([...indeg.keys()].filter((id) => indeg.get(id) === 0));
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const dep of dependents.get(id)) {
      indeg.set(dep, indeg.get(dep) - 1);
      if (indeg.get(dep) === 0) ready.push(dep);
    }
    ready = pickReady(ready);
  }

  const cycle = order.length < tasks.length ? tasks.filter((t) => !order.includes(t.id)).map((t) => t.id) : [];
  return {
    order: order.map((id) => byId.get(id)),
    cycle,
    missing,
  };
}

// The next actionable task: first in order that is not Done and whose deps are all Done.
function nextTask(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const { order } = computeOrder(tasks);
  for (const t of order) {
    if (t.done) continue;
    if (t.deps.every((d) => byId.get(d) && byId.get(d).done)) return t;
  }
  return null;
}

module.exports = { loadBacklog, computeOrder, nextTask, TASKS_REL };

// CLI: node decision-engine/task-order.js [root] [--next]
if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) || process.cwd();
  const wantNext = args.includes('--next');
  try {
    const tasks = loadBacklog(root);
    if (wantNext) {
      const n = nextTask(tasks);
      console.log(n ? `${n.id}  ${n.title}` : 'no actionable task (all Done or blocked)');
      process.exit(0);
    }
    const { order, cycle, missing } = computeOrder(tasks);
    console.log('Build order (follow top to bottom):');
    order.forEach((t, i) => {
      const mark = t.done ? '[x]' : '[ ]';
      const deps = t.deps.length ? `  (after ${t.deps.join(', ')})` : '';
      console.log(`  ${String(i + 1).padStart(2)}. ${mark} ${t.id} [${t.priority}] ${t.title}${deps}`);
    });
    if (missing.length) console.error(`\nWARN unresolved dependencies: ${missing.map((m) => `${m.task}->${m.dependsOn}`).join(', ')}`);
    if (cycle.length) console.error(`\nERROR dependency cycle among: ${cycle.join(', ')}`);
    process.exit(cycle.length ? 2 : 0);
  } catch (err) {
    console.error(`task-order failed: ${err.message}`);
    process.exit(1);
  }
}
