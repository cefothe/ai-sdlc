// Component docs — one file per component of the architecture overview
// (docs/architecture/components/<slug>.md), the detailed level under the
// system map. The overview says WHAT the components are and how they connect;
// a component doc says how ONE component works inside: its interfaces in
// full, what it depends on, the data it owns, its internal structure, its key
// flows (with failure paths), its failure modes, decisions and tests.
//
//   ENFORCED: every component listed in an overview has its doc; each doc has
//   the canonical sections, names the code paths the overview gives it, has a
//   concrete Interfaces section, an internal-structure diagram (flowchart /
//   classDiagram) and a sequenceDiagram of a key flow.
//   INJECTED: spec-context hands a task the full docs of the components it
//   touches; architecture_lookup returns a component's doc.
//
// The doc is found by the overview list item's markdown link
// (`[…](components/orders.md)`), else at components/<slug-of-name>.md next to
// the overview.

const { existsSync, readFileSync } = require('node:fs');
const { dirname, join, resolve, relative, sep } = require('node:path');
const { parsePrd } = require('./prd-gate');
const { makeMatcher, findSection: findDocSection, checkSections, markerTokens, structureReasons } = require('./doc-sections');
const { hasDiagram, stripMermaid } = require('./mermaid');
const { SUBSTANCE_RULES } = require('./design-gate');

const COMPONENTS_DIR = 'components';
const TEMPLATE_PATH = join(__dirname, '..', 'docs', 'architecture', 'components', '_template.md');
const MIN_SECTION_CHARS = 30;
const THIN_SECTION_CHARS = 80;

const REQUIRED_SECTIONS = [
  'Responsibility',
  'Code',
  'Interfaces',
  'Dependencies',
  'Data',
  'Internal structure',
  'Key flows',
  'Failure modes',
  'Decisions',
  'Testing',
];

const SECTION_ALIASES = {
  Responsibility: ['responsibility', 'purpose', 'overview', 'summary'],
  Code: ['code', 'location', 'source', 'paths'],
  Interfaces: ['interfaces', 'interface', 'api', 'exposes', 'public surface'],
  Dependencies: ['dependencies', 'depends on', 'consumes', 'collaborators'],
  Data: ['data', 'state', 'storage', 'persistence'],
  'Internal structure': ['internal structure', 'internals', 'structure', 'design'],
  'Key flows': ['key flows', 'flows', 'sequences', 'behaviour', 'behavior'],
  'Failure modes': ['failure modes', 'failures', 'errors', 'error handling', 'resilience'],
  Decisions: ['decisions', 'adrs', 'invariants'],
  Testing: ['testing', 'tests', 'test strategy'],
};

const headingMatchesSection = makeMatcher(SECTION_ALIASES);
const findSection = (sections, name) => findDocSection(sections, name, headingMatchesSection);

function componentSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Repo-relative path of a component's doc: the list item's link to a
// components/… markdown file, else components/<slug>.md beside the overview.
function componentDocPath(overviewPath, component) {
  const base = dirname(overviewPath);
  const dir = join(base, COMPONENTS_DIR);
  const fallback = join(dir, `${componentSlug(component.name)}.md`);
  const link = String(component.line || '').match(/\]\(([^)\s]*components\/[^)\s]+\.md)\)/);
  const linked = link ? join(base, link[1]) : null;
  // A link may only point inside the components directory (no ../ escapes).
  const rel = linked && linked.startsWith(`${dir}${sep}`) ? linked : fallback;
  return rel.split('\\').join('/');
}

function evaluateComponentDoc(markdown, { name = '', paths = [], path = '' } = {}) {
  const { sections } = parsePrd(markdown);
  const { missingSections, emptySections, substanceIssues, advisory } = checkSections(sections, REQUIRED_SECTIONS, {
    matches: headingMatchesSection, minChars: MIN_SECTION_CHARS, thinChars: THIN_SECTION_CHARS,
  });
  const markers = markerTokens(markdown);

  const code = findSection(sections, 'Code');
  if (code && code.hasContent) {
    const norm = (p) => String(p).replace(/^\.\//, '').replace(/\/+$/, '');
    const named = [...code.content.matchAll(/`([^`\s]+)`/g)].map((m) => norm(m[1]));
    const missing = paths.filter((p) => !named.includes(norm(p)));
    if (missing.length) substanceIssues.push({ code: 'code-paths-mismatch', section: 'Code', message: `Code does not name ${missing.map((p) => `\`${p}\``).join(', ')} — the paths the overview gives ${name || 'this component'}` });
  }
  const iface = findSection(sections, 'Interfaces');
  if (iface && iface.hasContent && !SUBSTANCE_RULES.Interfaces.test(stripMermaid(iface.content))) {
    substanceIssues.push({ code: 'section-not-concrete', section: 'Interfaces', message: SUBSTANCE_RULES.Interfaces.message });
  }
  const structure = findSection(sections, 'Internal structure');
  if (structure && structure.hasContent && !hasDiagram(structure.content, 'component')) {
    substanceIssues.push({ code: 'missing-diagram', section: 'Internal structure', message: 'Internal structure has no diagram — add a ```mermaid flowchart or classDiagram of the parts inside the component' });
  }
  const flows = findSection(sections, 'Key flows');
  if (flows && flows.hasContent && !hasDiagram(flows.content, 'sequence')) {
    substanceIssues.push({ code: 'missing-diagram', section: 'Key flows', message: 'Key flows has no sequence diagram — add a ```mermaid sequenceDiagram of the main flow, including its failure path' });
  }

  const reasons = [...structureReasons({ missingSections, emptySections, markers }), ...substanceIssues.map((i) => i.message)];
  return { name, path, valid: reasons.length === 0, missingSections, emptySections, markers, substanceIssues, advisory, reasons };
}

// Every listed component's doc, evaluated: { name, path, paths, exists, valid, reasons }.
function evaluateComponentDocs(root, overviewPath, components) {
  return components.map((c) => {
    const path = componentDocPath(overviewPath, c);
    const full = resolve(root, path);
    if (!existsSync(full)) return { name: c.name, path, paths: c.paths, exists: false, valid: false, reasons: [`no component doc at ${path}`] };
    return { ...evaluateComponentDoc(readFileSync(full, 'utf8'), { name: c.name, paths: c.paths, path }), paths: c.paths, exists: true };
  });
}

// A component's doc text, or null when it has none.
function readComponentDoc(root, overviewPath, component) {
  const full = resolve(root, componentDocPath(overviewPath, component));
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

// A new component doc from the template, with the name and the overview's
// code paths filled in; every other section stays a placeholder (= empty).
function scaffoldComponentDoc(template, { name, paths = [] }) {
  const codeLines = paths.length ? paths.map((p) => `- \`${p}\` — <what lives here>`).join('\n') : '- `path/to/component/` — <what lives here>';
  return template
    .replace(/^component: ''.*$/m, `component: ${JSON.stringify(name)}`)
    .replace('# Component: <Component name>', `# Component: ${name}`)
    .replace('- `path/to/component/` — <what lives here>', codeLines);
}

// The doc body without frontmatter, for injection.
function componentDocBody(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

module.exports = {
  evaluateComponentDoc, evaluateComponentDocs, componentDocPath, componentSlug, readComponentDoc, componentDocBody, scaffoldComponentDoc,
  REQUIRED_SECTIONS, SECTION_ALIASES, headingMatchesSection, COMPONENTS_DIR, TEMPLATE_PATH,
};

// CLI: node decision-engine/component-docs.js <component-doc.md>  — gate one doc.
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: component-docs <docs/architecture/components/<slug>.md>');
    process.exit(64);
  }
  try {
    const res = evaluateComponentDoc(readFileSync(target, 'utf8'), { path: relative(process.cwd(), resolve(target)).split('\\').join('/') });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.valid ? 0 : 2);
  } catch (err) {
    console.error(`component-docs failed: ${err.message}`);
    process.exit(1);
  }
}
