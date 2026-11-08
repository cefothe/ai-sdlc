// Architecture context — the repo-level system map (docs/architecture/overview.md):
// components and the code they own, the contracts that connect them, data
// ownership, cross-cutting mechanisms, deployment and the invariants every
// change must honor.
//
// It is governed and injected the way the product context is:
//   - ENFORCED (architecture gate): canonical sections present + substantive,
//     >=1 component naming the code it lives in, >=1 integration contract edge
//     (A → B), >=1 invariant. While it exists and is invalid, no design doc
//     passes; when valid, every design doc must reference it and name the
//     components it touches (or declare a new one).
//   - COMPONENT DOCS (component-docs.js): every listed component has its own
//     detailed doc (docs/architecture/components/<slug>.md); the root gate
//     fails while one is missing or invalid.
//   - INJECTED: /ai-sdlc:design hands it to the architects; spec-context hands
//     the planner, implementer and reviewers the parts their task touches —
//     the components it reaches, their contracts and data, and every invariant —
//     plus the full docs of those components — so a change lands in the owning
//     component and connects through the declared seams instead of inventing
//     new coupling.

const { existsSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { parsePrd, extractListItems } = require('./prd-gate');
const { makeMatcher, findSection: findDocSection, checkSections, markerTokens, structureReasons } = require('./doc-sections');
const { hasDiagram, missingFromDiagram } = require('./mermaid');
const { evaluateComponentDocs, componentDocPath, readComponentDoc, componentDocBody } = require('./component-docs');

const ARCHITECTURE_PATH = join('docs', 'architecture', 'overview.md');
const DEFAULT_MAX_CHARS = 16000;
const OVERVIEW_SHARE = 0.4; // of the budget when component docs follow the overview slice
const MAX_COMPONENT_DOCS = 3;
const MIN_SECTION_CHARS = 30;
const THIN_SECTION_CHARS = 80;

const REQUIRED_SECTIONS = [
  'System overview',
  'Components',
  'Integration contracts',
  'Data ownership',
  'Cross-cutting concerns',
  'Deployment',
  'Invariants',
  'Key decisions',
];

const SECTION_ALIASES = {
  'System overview': ['system overview', 'overview', 'system context', 'context'],
  Components: ['components', 'modules', 'services', 'building blocks'],
  'Integration contracts': ['integration', 'contracts', 'interfaces', 'connections', 'communication'],
  'Data ownership': ['data ownership', 'data', 'storage', 'persistence'],
  'Cross-cutting concerns': ['cross-cutting', 'crosscutting', 'shared concerns'],
  Deployment: ['deployment', 'runtime', 'topology', 'infrastructure'],
  Invariants: ['invariants', 'architectural rules', 'rules', 'constraints', 'principles'],
  'Key decisions': ['key decisions', 'decisions', 'adrs'],
};

const headingMatchesSection = makeMatcher(SECTION_ALIASES);
const findSection = (sections, name) => findDocSection(sections, name, headingMatchesSection);
const EDGE_RE = /→|->/;

// Components from the Components list: { name, paths[], line }. The name is
// the **bold** text (else the text before the first ":" / "(" / " — "); paths
// are the backticked tokens that look like repo paths.
function extractComponents(markdown) {
  const sec = findSection(parsePrd(markdown).sections, 'Components');
  if (!sec) return [];
  return extractListItems(sec.content).map((line) => {
    const bold = line.match(/\*\*(.+?)\*\*/);
    const name = (bold ? bold[1] : line.split(/:|\(|\s—\s|\s-\s/)[0]).replace(/`/g, '').trim();
    const paths = [...line.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((p) => p.includes('/') || /\.\w+$/.test(p));
    return { name, paths, line };
  }).filter((c) => c.name.length >= 2 && !c.name.startsWith('<'));
}

// True when a section holds only template placeholders: with every <…> and
// `…` span removed, almost no prose is left.
function placeholderOnly(content) {
  const text = String(content || '').replace(/<[^>\n]*>/g, ' ').replace(/`[^`\n]*`/g, ' ');
  return (text.match(/[A-Za-z]/g) || []).length < 15;
}

// Contract edges from the Integration contracts list: { from, to, line } where
// `from`/`to` are the text either side of the arrow (to stops at ':' or ',').
function parseEdges(markdown) {
  const sec = findSection(parsePrd(markdown).sections, 'Integration contracts');
  if (!sec) return [];
  return extractListItems(sec.content).filter((l) => EDGE_RE.test(l)).map((line) => {
    const [left, right] = line.split(EDGE_RE);
    const clean = (t) => t.replace(/\*\*/g, '').replace(/`/g, '').trim();
    return { from: clean(left), to: clean(right.split(/[:,]/)[0]), line };
  });
}

// Every architecture overview in force: the root one plus each monorepo
// project's own (<project>/docs/architecture/overview.md). Project component
// paths are made repo-relative so ownership resolves across both levels.
function loadOverviews(root, projects = []) {
  const out = [];
  const candidates = [{ prefix: '', path: ARCHITECTURE_PATH }, ...projects.map((p) => ({ prefix: p.path, path: join(p.path, ARCHITECTURE_PATH), project: p.name }))];
  for (const c of candidates) {
    const full = resolve(root, c.path);
    if (!existsSync(full)) continue;
    const markdown = readFileSync(full, 'utf8');
    const { sections } = parsePrd(markdown);
    const lines = (name) => extractListItems((findSection(sections, name) || {}).content || '');
    const withPrefix = (p) => (c.prefix ? `${c.prefix}/${p.replace(/^\.\//, '')}` : p);
    out.push({
      path: c.path.split('\\').join('/'),
      project: c.project || null,
      components: extractComponents(markdown).map((comp) => ({
        ...comp,
        paths: comp.paths.map(withPrefix),
        overview: c.path.split('\\').join('/'),
        doc: componentDocPath(c.path, comp),
      })),
      edges: parseEdges(markdown),
      data: lines('Data ownership'),
      invariants: lines('Invariants'),
    });
  }
  return out;
}

// The component owning a repo-relative file: the longest matching path.
function ownerOf(components, file) {
  const norm = (p) => String(p).replace(/^\.\//, '').replace(/\/+$/, '');
  let best = null;
  for (const c of components) {
    for (const cp of c.paths) {
      const n = norm(cp);
      if ((norm(file) === n || norm(file).startsWith(`${n}/`)) && (!best || n.length > best.len)) best = { component: c, len: n.length };
    }
  }
  return best ? best.component : null;
}

function evaluateArchitecture(markdown, { path = ARCHITECTURE_PATH } = {}) {
  const { sections } = parsePrd(markdown);
  const { missingSections, emptySections, substanceIssues, advisory } = checkSections(sections, REQUIRED_SECTIONS, {
    matches: headingMatchesSection, minChars: MIN_SECTION_CHARS, thinChars: THIN_SECTION_CHARS,
  });
  const markers = markerTokens(markdown);
  const components = extractComponents(markdown);

  const compSec = findSection(sections, 'Components');
  if (compSec && compSec.hasContent && !components.some((c) => c.paths.length)) {
    substanceIssues.push({ code: 'no-components', section: 'Components', message: 'Components names no component with the code it lives in — one list item each: **Name** (`path/`): responsibility' });
  }
  const contracts = findSection(sections, 'Integration contracts');
  if (contracts && contracts.hasContent && !extractListItems(contracts.content).some((l) => EDGE_RE.test(l))) {
    substanceIssues.push({ code: 'no-contracts', section: 'Integration contracts', message: 'Integration contracts lists no edge — one list item each: Caller → Callee: mechanism, contract' });
  }
  const invariants = findSection(sections, 'Invariants');
  if (invariants && invariants.hasContent && !extractListItems(invariants.content).length) {
    substanceIssues.push({ code: 'no-invariants', section: 'Invariants', message: 'Invariants lists no rule — one list item per invariant' });
  }
  // Diagrams everyone can read: the component map and at least one key interaction.
  if (!hasDiagram(markdown, 'component')) {
    substanceIssues.push({ code: 'no-component-diagram', section: 'Components', message: 'no component diagram — add a ```mermaid flowchart (or C4Container) of the components and the contracts between them' });
  } else {
    const undrawn = missingFromDiagram(markdown, 'component', components.map((c) => c.name));
    if (undrawn.length) {
      substanceIssues.push({ code: 'diagram-missing-component', section: 'Components', message: `component diagram does not show ${undrawn.join(', ')} — every listed component appears in the diagram` });
    }
  }
  if (!hasDiagram(markdown, 'sequence')) {
    substanceIssues.push({ code: 'no-sequence-diagram', section: 'Integration contracts', message: 'no sequence diagram — add a ```mermaid sequenceDiagram of at least one key interaction across components' });
  }

  const reasons = [...structureReasons({ missingSections, emptySections, markers }), ...substanceIssues.map((i) => i.message)];
  // Greenfield: the untouched init scaffold (every section still a placeholder)
  // means no architecture exists yet — the first design establishes it.
  const scaffold = components.length === 0
    && REQUIRED_SECTIONS.every((name) => { const sec = findSection(sections, name); return !sec || !sec.hasContent || placeholderOnly(sec.content); });
  return { path, valid: reasons.length === 0, scaffold, missingSections, emptySections, markers, substanceIssues, components: components.map((c) => c.name), advisory, reasons };
}

// The repo's architecture evaluation, or null when it has none: the overview
// plus every listed component's doc.
function evaluateArchitectureRoot(root, { path = ARCHITECTURE_PATH } = {}) {
  const full = resolve(root, path);
  if (!existsSync(full)) return null;
  const markdown = readFileSync(full, 'utf8');
  const rel = path.split('\\').join('/');
  const res = evaluateArchitecture(markdown, { path: rel });
  if (res.scaffold) return { ...res, componentDocs: [] };
  const componentDocs = evaluateComponentDocs(root, rel, extractComponents(markdown));
  const failing = componentDocs.filter((d) => !d.valid).map((d) => ({
    code: d.exists ? 'component-doc-invalid' : 'missing-component-doc',
    section: 'Components',
    message: d.exists ? `${d.path}: ${d.reasons.join('; ')}` : `${d.name} has no component doc — write ${d.path} from the component template`,
  }));
  const substanceIssues = [...res.substanceIssues, ...failing];
  const reasons = [...res.reasons, ...failing.map((i) => i.message)];
  return { ...res, valid: reasons.length === 0, substanceIssues, reasons, componentDocs };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(text, name) {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRe(name)}([^A-Za-z0-9]|$)`, 'i').test(text);
}

// Components a task reaches: named in its spec text, or owning one of its paths.
function relevantComponents(components, { texts = [], paths = [] } = {}) {
  const blob = texts.filter(Boolean).join('\n');
  const norm = (p) => String(p).replace(/^\.\//, '').replace(/\/+$/, '');
  return components.filter((c) => mentions(blob, c.name)
    || c.paths.some((cp) => paths.some((p) => norm(p) === norm(cp) || norm(p).startsWith(`${norm(cp)}/`))));
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated — read the rest in the file]` : text;
}

// The architecture block for a task, or null when the repo has no overview.
function formatArchitectureContext(root, { texts = [], paths = [], maxChars = DEFAULT_MAX_CHARS, path = ARCHITECTURE_PATH } = {}) {
  const full = resolve(root, path);
  if (!existsSync(full)) return null;
  const markdown = readFileSync(full, 'utf8');
  const { sections } = parsePrd(markdown);
  const components = extractComponents(markdown);
  if (!components.length) return null; // the untouched scaffold carries no system map yet
  const touched = relevantComponents(components, { texts, paths });
  const names = touched.map((c) => c.name);
  const lines = (name) => extractListItems((findSection(sections, name) || {}).content || '');
  const relevantLines = (name) => (names.length ? lines(name).filter((l) => names.some((n) => mentions(l, n))) : lines(name));
  const rel = path.split('\\').join('/');

  const out = [
    `SYSTEM ARCHITECTURE — ${rel}. Put each change in the component that owns it, connect only through the`,
    'listed contracts, respect data ownership, and honor every invariant. A change that needs a new component,',
    `contract or data owner must add it to ${rel} in the same change — flag it, never wire around the architecture.`,
    '',
    names.length ? 'Components this task touches:' : 'Components (none matched this task by name or path — place the change deliberately):',
    ...(names.length ? touched : components).map((c) => `- ${c.line}`),
  ];
  const contracts = relevantLines('Integration contracts');
  if (contracts.length) out.push('', 'Integration contracts:', ...contracts.map((l) => `- ${l}`));
  const data = relevantLines('Data ownership');
  if (data.length) out.push('', 'Data ownership:', ...data.map((l) => `- ${l}`));
  const invariants = lines('Invariants');
  if (invariants.length) out.push('', 'Invariants (all apply):', ...invariants.map((l) => `- ${l}`));
  const others = components.filter((c) => !names.includes(c.name)).map((c) => c.name);
  if (names.length && others.length) out.push('', `Other components (open ${rel} if your change reaches them): ${others.join(', ')}`);

  // The detailed level: the touched components' own docs, in full where the budget allows.
  const docs = touched.slice(0, MAX_COMPONENT_DOCS)
    .map((c) => ({ c, path: componentDocPath(rel, c), text: readComponentDoc(root, rel, c) }))
    .filter((d) => d.text);
  if (!docs.length) return clip(out.join('\n'), maxChars);
  const slice = clip(out.join('\n'), Math.floor(maxChars * OVERVIEW_SHARE));
  const perDoc = Math.floor((maxChars - slice.length) / docs.length);
  const blocks = docs.map((d) => clip(`COMPONENT DOC — ${d.path}\n${componentDocBody(d.text)}`, perDoc));
  return [slice, ...blocks].join('\n\n');
}

module.exports = {
  evaluateArchitecture, evaluateArchitectureRoot, extractComponents, relevantComponents, formatArchitectureContext,
  parseEdges, loadOverviews, ownerOf, mentions,
  headingMatchesSection, REQUIRED_SECTIONS, ARCHITECTURE_PATH,
};

// CLI:
//   node decision-engine/architecture-context.js --validate
//   node decision-engine/architecture-context.js <task-file.md>   (the block a task's agents receive)
if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--validate')) {
      const res = evaluateArchitectureRoot(process.cwd());
      if (!res) {
        console.log(JSON.stringify({ path: ARCHITECTURE_PATH, exists: false, valid: false, reasons: ['no architecture overview — run /ai-sdlc:architecture'] }, null, 2));
        process.exit(2);
      }
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.valid ? 0 : 2);
    }
    const target = args.find((a) => !a.startsWith('--'));
    if (!target) {
      console.error('usage: architecture-context --validate | <task-file.md>');
      process.exit(64);
    }
    const { loadTaskFile } = require('./backlog-task');
    const task = loadTaskFile(target);
    const fm = task.frontmatter || {};
    console.log(formatArchitectureContext(process.cwd(), { texts: [fm.title, task.body], paths: fm.references || [] }) || `(no ${ARCHITECTURE_PATH})`);
    process.exit(0);
  } catch (err) {
    console.error(`architecture-context failed: ${err.message}`);
    process.exit(1);
  }
}
