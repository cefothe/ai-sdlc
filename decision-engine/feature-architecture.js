// Feature architecture — one doc per PRD (docs/architecture/features/<feature>.md),
// the cross-service level between the system map and the design doc. The overview
// says what every component is; a component doc says how one component works
// inside; a feature architecture says how ONE feature / user journey runs across
// every component it touches — participants, end-to-end interactions with the
// failure path, the contracts used, data ownership and the quality bar. It stays
// high-level; the design doc (docs/design/<feature>.md) holds the detail
// (DDL, signatures, module internals, per-AC tests) and is written against it.
//
//   ENFORCED: canonical sections; frontmatter `components:` lists every
//   component the journey touches, each one named in the overview; the
//   Components diagram shows every listed component; the Interactions
//   sequenceDiagram has each as a participant and states a failure path; every
//   Contracts edge is an overview Integration contract, and every overview
//   component an edge reaches is listed in `components:`.
//   ADVISORY: draft status, a listed component no contract reaches, design-level
//   detail (DDL) that belongs in the design doc.
//   GATED BY: the architecture root gate (every feature doc present is valid)
//   and the design gate (a design needs its feature's doc, and changes only the
//   components that doc lists).

const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { dirname, join, resolve, relative } = require('node:path');
const { parsePrd, extractListItems } = require('./prd-gate');
const { makeMatcher, findSection: findDocSection, checkSections, markerTokens, structureReasons } = require('./doc-sections');
const { hasDiagram, missingFromDiagram } = require('./mermaid');

const FEATURES_DIR = 'features';
const TEMPLATE_PATH = join(__dirname, '..', 'docs', 'architecture', 'features', '_template.md');
const MIN_SECTION_CHARS = 30;
const THIN_SECTION_CHARS = 80;
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9_.-]*$/i;
const EDGE_RE = /→|->/;
const FAILURE_RE = /\b(fail\w*|error\w*|retr(?:y|ies|ied)|timeouts?|fallback|rollback|compensat\w*|dead.?letter|backoff|abort\w*|unavailable|degrad\w*)/i;
const DETAIL_RE = /\bcreate\s+(table|index|type|view)\b|```sql/i;

const REQUIRED_SECTIONS = [
  'Journey',
  'Components',
  'Interactions',
  'Contracts',
  'Data ownership',
  'Quality attributes',
  'Decisions',
];

const SECTION_ALIASES = {
  Journey: ['journey', 'user journey', 'feature overview', 'overview', 'summary', 'scope'],
  Components: ['components', 'services', 'participants'],
  Interactions: ['interactions', 'end-to-end flow', 'flow', 'sequence', 'key flow'],
  Contracts: ['contracts', 'integration', 'interfaces'],
  'Data ownership': ['data ownership', 'data'],
  'Quality attributes': ['quality attributes', 'quality', 'non-functional', 'nfr'],
  Decisions: ['decisions', 'key decisions', 'adrs'],
};

const headingMatchesSection = makeMatcher(SECTION_ALIASES);
const findSection = (sections, name) => findDocSection(sections, name, headingMatchesSection);

const squash = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// One endpoint names another when either squashed form contains the other.
const sameEndpoint = (a, b) => { const x = squash(a); const y = squash(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

function isSafeFeature(feature) {
  return typeof feature === 'string' && SAFE_SLUG_RE.test(feature) && !feature.includes('..');
}

// Repo-relative path of a feature's architecture doc, next to the overview.
function featureArchitecturePath(overviewPath, feature) {
  return join(dirname(overviewPath), FEATURES_DIR, `${feature}.md`).split('\\').join('/');
}

// The frontmatter `components:` list (a YAML list, or a comma-separated string).
function declaredComponents(frontmatter) {
  const raw = (frontmatter || {}).components;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return [...new Set(list.map((c) => String(c).replace(/[*`]/g, '').trim()).filter((c) => c && !c.startsWith('<')))];
}

// Contract edges from a Contracts section: { from, to, line }.
function parseContractEdges(content) {
  return extractListItems(content || '').filter((l) => EDGE_RE.test(l)).map((line) => {
    const [left, right] = line.split(EDGE_RE);
    const clean = (t) => t.replace(/\*\*/g, '').replace(/`/g, '').trim();
    return { from: clean(left), to: clean(right.split(/[:,]/)[0]), line };
  });
}

// Pure. overview: { components: [name], edges: [{ from, to }] } of the overview(s)
// in force; omitted → the overview cross-checks are skipped.
function evaluateFeatureArchitecture(markdown, { path = '<feature-architecture>', feature = '', overview } = {}) {
  const { frontmatter, sections } = parsePrd(markdown);
  const status = String(frontmatter.status || '').toLowerCase();
  const { missingSections, emptySections, substanceIssues, advisory } = checkSections(sections, REQUIRED_SECTIONS, {
    matches: headingMatchesSection, minChars: MIN_SECTION_CHARS, thinChars: THIN_SECTION_CHARS, exempt: new Set(['Decisions']),
  });
  const markers = markerTokens(markdown);
  const components = declaredComponents(frontmatter);

  if (!components.length) {
    substanceIssues.push({ code: 'no-components-declared', section: null, message: 'frontmatter components: lists no component — name every component this feature touches, as in the architecture overview' });
  }
  const known = overview ? new Map(overview.components.map((c) => [c.toLowerCase(), c])) : null;
  if (known) {
    const unknown = components.filter((c) => !known.has(c.toLowerCase()));
    if (unknown.length) {
      substanceIssues.push({ code: 'unknown-component', section: null, message: `components ${unknown.join(', ')} are not in the architecture overview — use the overview's names, or add the new component (with its component doc) to the overview in the same change` });
    }
  }

  const compSec = findSection(sections, 'Components');
  if (compSec && compSec.hasContent) {
    if (!hasDiagram(compSec.content, 'component')) {
      substanceIssues.push({ code: 'no-component-diagram', section: 'Components', message: 'Components has no component diagram — add a ```mermaid flowchart of every component this feature touches and the contracts between them' });
    } else {
      const undrawn = missingFromDiagram(compSec.content, 'component', components);
      if (undrawn.length) substanceIssues.push({ code: 'diagram-missing-component', section: 'Components', message: `component diagram does not show ${undrawn.join(', ')} — every listed component appears in it` });
    }
  }

  const flowSec = findSection(sections, 'Interactions');
  if (flowSec && flowSec.hasContent) {
    if (!hasDiagram(flowSec.content, 'sequence')) {
      substanceIssues.push({ code: 'no-sequence-diagram', section: 'Interactions', message: 'Interactions has no sequence diagram — add a ```mermaid sequenceDiagram of the journey across the components, including its failure path' });
    } else {
      const absent = missingFromDiagram(flowSec.content, 'sequence', components);
      if (absent.length) substanceIssues.push({ code: 'sequence-missing-component', section: 'Interactions', message: `sequence diagram has no participant for ${absent.join(', ')} — the journey shows every listed component` });
    }
    if (!FAILURE_RE.test(flowSec.content)) {
      substanceIssues.push({ code: 'no-failure-path', section: 'Interactions', message: 'Interactions describes no failure path — state what happens when a component times out, errors or is down' });
    }
  }

  const contractSec = findSection(sections, 'Contracts');
  const edges = contractSec ? parseContractEdges(contractSec.content) : [];
  if (contractSec && contractSec.hasContent && components.length > 1 && !edges.length) {
    substanceIssues.push({ code: 'no-contracts', section: 'Contracts', message: 'Contracts lists no edge — one list item each: Caller → Callee: mechanism, contract' });
  }
  if (overview) {
    const undeclared = edges.filter((e) => !overview.edges.some((o) => sameEndpoint(o.from, e.from) && sameEndpoint(o.to, e.to)));
    if (undeclared.length) {
      substanceIssues.push({ code: 'contract-not-in-overview', section: 'Contracts', message: `contracts ${undeclared.map((e) => `${e.from} → ${e.to}`).join(', ')} are not Integration contracts in the architecture overview — use a declared contract, or add the new one to the overview in the same change` });
    }
    const listed = new Set(components.map(squash));
    const reached = [...new Set(edges.flatMap((e) => [e.from, e.to]))]
      .map((end) => overview.components.find((c) => squash(c) === squash(end)))
      .filter((c) => c && !listed.has(squash(c)));
    if (reached.length) {
      substanceIssues.push({ code: 'contract-component-undeclared', section: 'Contracts', message: `contracts reach ${reached.join(', ')}, which components: does not list — list every component the journey touches` });
    }
  }
  if (components.length > 1 && edges.length) {
    const isolated = components.filter((c) => !edges.some((e) => sameEndpoint(e.from, c) || sameEndpoint(e.to, c)));
    if (isolated.length) advisory.push({ code: 'isolated-component', message: `no contract in this journey reaches ${isolated.join(', ')} — show how it takes part, or drop it from components:` });
  }
  if (DETAIL_RE.test(markdown)) {
    advisory.push({ code: 'too-detailed', message: 'schema DDL belongs in the design doc — keep the feature architecture at the component level' });
  }
  if (status !== 'approved') advisory.push({ code: 'not-approved', message: `feature architecture status is "${status || 'unset'}" — a human should review + set status: approved` });

  const reasons = [...structureReasons({ missingSections, emptySections, markers }), ...substanceIssues.map((i) => i.message)];
  return { path, feature, status, components, edges, valid: reasons.length === 0, missingSections, emptySections, markers, substanceIssues, advisory, reasons };
}

// Every feature architecture doc beside an overview, evaluated against it:
// [{ feature, path, exists: true, valid, components, reasons, ... }].
function evaluateFeatureArchitectures(root, overviewPath, overview) {
  const dir = resolve(root, dirname(overviewPath), FEATURES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f.toLowerCase() !== 'readme.md')
    .sort()
    .map((f) => {
      const feature = f.replace(/\.md$/, '');
      const path = featureArchitecturePath(overviewPath, feature);
      return { ...evaluateFeatureArchitecture(readFileSync(join(dir, f), 'utf8'), { path, feature, overview }), exists: true };
    });
}

// A feature's doc text, or null when it has none (or the slug is unsafe).
function readFeatureArchitecture(root, overviewPath, feature) {
  if (!isSafeFeature(feature)) return null;
  const full = resolve(root, featureArchitecturePath(overviewPath, feature));
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

// Component → the features whose journey touches it (the reverse index).
function featuresByComponent(evaluations) {
  const index = new Map();
  for (const e of evaluations) {
    for (const c of e.components) {
      const key = c.toLowerCase();
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ feature: e.feature, path: e.path, status: e.status });
    }
  }
  return index;
}

// The feature × component matrix as a markdown table.
function formatFeatureMatrix(evaluations, componentNames) {
  if (!evaluations.length) return 'No feature architecture docs.';
  const head = `| Feature | ${componentNames.join(' | ')} |`;
  const rule = `|---|${componentNames.map(() => '---').join('|')}|`;
  const rows = evaluations.map((e) => {
    const touched = new Set(e.components.map((c) => c.toLowerCase()));
    return `| [${e.feature}](${e.path}) | ${componentNames.map((c) => (touched.has(c.toLowerCase()) ? '●' : '')).join(' | ')} |`;
  });
  return [head, rule, ...rows].join('\n');
}

// A new feature doc from the template, with the frontmatter filled in; every
// section stays a placeholder (= empty) until written from evidence.
function scaffoldFeatureArchitecture(template, { feature, relatedPrd = '', components = [] }) {
  return template
    .replace(/^feature: ''.*$/m, `feature: ${feature}`)
    .replace(/^relatedPrd: ''.*$/m, `relatedPrd: ${relatedPrd}`)
    .replace(/^components: \[\].*$/m, `components: [${components.map((c) => JSON.stringify(c)).join(', ')}]`)
    .replace('# Feature architecture: <Feature Name>', `# Feature architecture: ${feature}`);
}

// The doc body without frontmatter, for injection.
function featureArchitectureBody(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

module.exports = {
  evaluateFeatureArchitecture, evaluateFeatureArchitectures, featureArchitecturePath, readFeatureArchitecture,
  declaredComponents, parseContractEdges, featuresByComponent, formatFeatureMatrix, scaffoldFeatureArchitecture,
  featureArchitectureBody, isSafeFeature, headingMatchesSection, REQUIRED_SECTIONS, SECTION_ALIASES, FEATURES_DIR, TEMPLATE_PATH,
};

// CLI:
//   node decision-engine/feature-architecture.js <docs/architecture/features/<feature>.md>   gate one doc against the overview
//   node decision-engine/feature-architecture.js --matrix                                   feature × component matrix
if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    const { loadOverviews, ARCHITECTURE_PATH } = require('./architecture-context');
    const root = process.cwd();
    const overviews = loadOverviews(root);
    const overview = overviews.length
      ? { components: overviews.flatMap((o) => o.components.map((c) => c.name)), edges: overviews.flatMap((o) => o.edges) }
      : undefined;
    if (args.includes('--matrix')) {
      console.log(formatFeatureMatrix(evaluateFeatureArchitectures(root, ARCHITECTURE_PATH, overview), overview ? overview.components : []));
      process.exit(0);
    }
    const target = args.find((a) => !a.startsWith('--'));
    if (!target) {
      console.error('usage: feature-architecture <docs/architecture/features/<feature>.md> | --matrix');
      process.exit(64);
    }
    const path = relative(root, resolve(target)).split('\\').join('/');
    const res = evaluateFeatureArchitecture(readFileSync(target, 'utf8'), { path, feature: path.replace(/^.*\//, '').replace(/\.md$/, ''), overview });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.valid ? 0 : 2);
  } catch (err) {
    console.error(`feature-architecture failed: ${err.message}`);
    process.exit(1);
  }
}
