// Context lookups — the PULL side of context. The pipeline pushes a budgeted
// slice of the spec and architecture into every prompt; these answer what the
// slice could not predict, on demand, for any agent mid-task (served over MCP
// by mcp/context-server.js):
//
//   architectureLookup   which component owns a path / what a component is:
//                        responsibility, code, contracts, data, invariants,
//                        and the component's own doc (components/<slug>.md)
//   architectureContracts how a component connects (its contract edges)
//   productLookup        personas, glossary terms, capabilities, baselines,
//                        constraints matching a query
//   specLookup           the full spec block (PRD/design or bug report +
//                        architecture slice) for a backlog task
//   decisionLookup       one ADR in full
//
// Every function returns plain text and never throws on a missing document —
// it says what is missing instead.

const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { parsePrd } = require('./prd-gate');
const { loadOverviews, ownerOf, mentions, ARCHITECTURE_PATH } = require('./architecture-context');
const { DEFAULT_CONTEXT_PATH } = require('./product-context');
const { componentDocBody } = require('./component-docs');

const MAX_COMPONENT_DOC_CHARS = 12000;

const TASK_ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
const DEC_ID_RE = /^DEC-\d{4}$/;

function findComponent(overviews, { component, path }) {
  const all = overviews.flatMap((o) => o.components);
  if (component) {
    const exact = all.find((c) => c.name.toLowerCase() === String(component).toLowerCase());
    return exact || all.find((c) => mentions(c.name, component) || mentions(component, c.name)) || null;
  }
  return path ? ownerOf(all, path) : null;
}

function describeComponent(root, overviews, comp) {
  const overview = overviews.find((o) => o.components.includes(comp));
  const rootOverview = overviews.find((o) => !o.project);
  const edges = overviews.flatMap((o) => o.edges).filter((e) => mentions(e.from, comp.name) || mentions(e.to, comp.name));
  const data = overviews.flatMap((o) => o.data).filter((l) => mentions(l, comp.name));
  const invariants = [...new Set([...(overview ? overview.invariants : []), ...(rootOverview && rootOverview !== overview ? rootOverview.invariants : [])])];
  return [
    `Component: ${comp.line}`,
    `Defined in: ${comp.overview}`,
    edges.length ? `Contracts:\n${edges.map((e) => `- ${e.line}`).join('\n')}` : 'Contracts: none declared — any call to or from another component needs a contract added to the overview.',
    data.length ? `Data ownership:\n${data.map((l) => `- ${l}`).join('\n')}` : null,
    invariants.length ? `Invariants that apply:\n${invariants.map((l) => `- ${l}`).join('\n')}` : null,
    componentDoc(root, comp),
  ].filter(Boolean).join('\n\n');
}

// The component's own doc, or a note that it is missing.
function componentDoc(root, comp) {
  const full = join(root, comp.doc);
  if (!existsSync(full)) return `Component doc: none at ${comp.doc} — the architecture gate requires one.`;
  const body = componentDocBody(readFileSync(full, 'utf8'));
  const text = body.length > MAX_COMPONENT_DOC_CHARS ? `${body.slice(0, MAX_COMPONENT_DOC_CHARS)}\n…[truncated — read ${comp.doc}]` : body;
  return `Component doc (${comp.doc}):\n${text}`;
}

function architectureLookup(root, { component, path } = {}, { projects = [] } = {}) {
  const overviews = loadOverviews(root, projects);
  if (!overviews.length) return `No architecture overview at ${ARCHITECTURE_PATH} — run /ai-sdlc:architecture.`;
  if (!component && !path) {
    return ['Components:', ...overviews.flatMap((o) => o.components.map((c) => `- ${c.line}  [${c.overview}]`))].join('\n');
  }
  const comp = findComponent(overviews, { component, path });
  if (!comp) {
    return path
      ? `No component owns ${path} — new code there needs a component added to the architecture overview first. Known components: ${overviews.flatMap((o) => o.components.map((c) => c.name)).join(', ')}`
      : `No component named "${component}". Known components: ${overviews.flatMap((o) => o.components.map((c) => c.name)).join(', ')}`;
  }
  return describeComponent(root, overviews, comp);
}

function architectureContracts(root, { component } = {}, { projects = [] } = {}) {
  const overviews = loadOverviews(root, projects);
  if (!overviews.length) return `No architecture overview at ${ARCHITECTURE_PATH}.`;
  const edges = overviews.flatMap((o) => o.edges).filter((e) => !component || mentions(e.from, component) || mentions(e.to, component));
  if (!edges.length) return component ? `No declared contracts involve "${component}".` : 'No contracts declared.';
  return edges.map((e) => `- ${e.line}`).join('\n');
}

function productLookup(root, { query } = {}) {
  const file = join(root, DEFAULT_CONTEXT_PATH);
  if (!existsSync(file)) return `No product context at ${DEFAULT_CONTEXT_PATH}.`;
  const { sections } = parsePrd(readFileSync(file, 'utf8'));
  if (!query) return ['Product context sections:', ...sections.map((s) => `- ${s.heading}`)].join('\n');
  const q = String(query).toLowerCase();
  const hits = [];
  for (const s of sections) {
    const lines = s.content.split(/\r?\n/).filter((l) => l.trim() && l.toLowerCase().includes(q));
    if (s.heading.toLowerCase().includes(q)) hits.push(`## ${s.heading}\n${s.content}`);
    else if (lines.length) hits.push(`## ${s.heading}\n${lines.join('\n')}`);
  }
  return hits.length ? hits.join('\n\n') : `Nothing in ${DEFAULT_CONTEXT_PATH} matches "${query}".`;
}

function specLookup(root, { task } = {}, { projects = [] } = {}) {
  if (!task || !TASK_ID_RE.test(String(task))) return 'Give a backlog task id, e.g. AISDLC-0001.';
  const dir = join(root, 'backlog', 'tasks');
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f === `${task}.md` || f.startsWith(`${task} `)) : null;
  if (!file) return `No task ${task} in backlog/tasks.`;
  const { loadTaskFile } = require('./backlog-task');
  const { buildSpecForTask } = require('./spec-context');
  return buildSpecForTask(root, loadTaskFile(join(dir, file)), { projects }).text || `${task} links no spec.`;
}

function decisionLookup(root, { id } = {}) {
  if (!id || !DEC_ID_RE.test(String(id))) return 'Give a decision id, e.g. DEC-0001.';
  const { loadDecision, adrSectionText } = require('./decisions');
  let d;
  try {
    d = loadDecision(root, id);
  } catch {
    return `No decision ${id}.`;
  }
  const s = d.spec || {};
  const st = d.status || {};
  return [
    `${id} [${st.lifecycle || 'proposed'}${(d.metadata || {}).scope ? `/${d.metadata.scope}` : ''}]: ${s.summary}${st.answeredOptionId ? ` (chosen: ${st.answeredOptionId})` : ''}`,
    ...['context', 'rationale', 'consequences'].map((k) => { const t = adrSectionText(d, k); return t ? `${k[0].toUpperCase()}${k.slice(1)}: ${t}` : null; }),
    (s.options || []).length ? `Options:\n${s.options.map((o) => `- ${o.id}: ${o.description}`).join('\n')}` : null,
  ].filter(Boolean).join('\n\n');
}

module.exports = { architectureLookup, architectureContracts, productLookup, specLookup, decisionLookup };
