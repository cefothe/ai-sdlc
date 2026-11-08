// Design gate — governs the design-doc artifact (docs/design/<feature>.md), the
// missing link between the PRD (what/why) and the atomic ADRs (individual
// decisions). The design doc is where the DETAILED technical design lives — the
// full schema DDL, module boundaries, data flow — so it never gets compressed
// into a one-line ADR and lost.
//
// Two tiers, matching the PRD gate:
//   - ENFORCED (deterministic): every canonical section is present + non-empty,
//     no placeholder marker tokens, the design links at least one ADR
//     (DEC-NNNN) — a design with no recorded decisions is undocumented reasoning
//     — AND each section carries buildable substance: a concrete schema, concrete
//     interface signatures, failure paths in the data flow, a test strategy that
//     maps every PRD acceptance criterion (AC1..ACn), and linked ADRs that record
//     context/rationale/consequences/alternatives. The design doc is handed to
//     the implementer verbatim, so "a sessions table" is not a data model.
//   - ADVISORY: thin-but-passing sections and draft status, never blocking.

const { readFileSync, existsSync } = require('node:fs');
const { join, isAbsolute, dirname, resolve, sep } = require('node:path');
const { parsePrd, extractPrdAcceptanceCriteria, isPlaceholderLine } = require('./prd-gate'); // generic frontmatter + section parser
const { MARKER_TOKEN_RE } = require('./dor-gate');
const { hasDiagram, stripMermaid } = require('./mermaid');

// Canonical design-doc structure — single source of truth, shared with the
// template (docs/design/_template.md).
const REQUIRED_SECTIONS = [
  'Context',
  'Architecture',
  'Data model',
  'Interfaces',
  'Data flow',
  'Decisions',
  'Risks',
  'Test strategy',
];

// A required section is matched by INTENT, not exact heading text: each canonical
// section accepts common synonyms, and a heading satisfies it when it CONTAINS any
// alias (not just a prefix match). This is what lets "## Overview" satisfy Context
// and "## Datastore & physical schema" satisfy Data model — the gate checks that
// the substance is present, and does not force cosmetic rename-to-pass. Keep aliases
// specific enough not to cross-match a different section.
const SECTION_ALIASES = {
  'Context': ['context', 'overview', 'background', 'summary', 'problem'],
  'Architecture': ['architecture', 'system design', 'high-level design', 'solution design', 'components', 'approach'],
  'Data model': ['data model', 'datastore', 'data store', 'schema', 'persistence', 'storage'],
  'Interfaces': ['interface', 'api', 'contract', 'endpoint'],
  'Data flow': ['data flow', 'dataflow', 'sequence', 'pipeline', 'ingestion'],
  'Decisions': ['decision', 'adr', 'trade-off', 'tradeoff'],
  'Risks': ['risk', 'spike', 'open question', 'unknown'],
  'Test strategy': ['test strategy', 'testing', 'test plan', 'tests', 'validation', 'qa'],
};

const ADR_REF_RE = /\bDEC-\d{4}\b/g;

const MIN_SECTION_CHARS = 30;
const THIN_SECTION_CHARS = 120;
// Decisions is a list of DEC links — its substance lives in the ADRs themselves.
const LENGTH_EXEMPT = new Set(['Decisions']);

// Per-section substance rules: the deterministic evidence that a section is a
// concrete design and not a sentence about one.
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/m;
const SUBSTANCE_RULES = {
  'Data model': {
    test: (c) => /```/.test(c) || /\bcreate\s+(table|index|type|view)\b/i.test(c) || TABLE_ROW_RE.test(c)
      || /\b(n\/a|not applicable|no persist\w*|stateless)\b/i.test(c),
    message: 'Data model has no concrete schema — give DDL, a schema code block or a field table (or state "N/A — no persisted state" with why)',
  },
  Interfaces: {
    test: (c) => /```/.test(c) || TABLE_ROW_RE.test(c) || /\b(GET|POST|PUT|PATCH|DELETE)\s+\//.test(c)
      || /\b[a-zA-Z_][\w.]*\s*\([^)]*\)/.test(c) || /(^|\s)--[a-z][\w-]*/m.test(c) || /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(c),
    message: 'Interfaces names no concrete surface — give endpoint paths, function signatures, CLI flags, env vars or a contract table',
  },
  'Data flow': {
    test: (c) => /\b(fail\w*|error\w*|retr(?:y|ies|ied)|timeouts?|fallback|rollback|dead.?letter|backoff|abort\w*|idempoten\w*)/i.test(c),
    message: 'Data flow describes no failure path — state what happens on error/timeout/retry',
  },
};

// Diagrams the design must carry, per section (rendered by GitHub from ```mermaid).
const DIAGRAM_RULES = {
  Architecture: { kind: 'component', message: 'Architecture has no component diagram — add a ```mermaid flowchart of the components this design changes and how they connect' },
  'Data flow': { kind: 'sequence', message: 'Data flow has no sequence diagram — add a ```mermaid sequenceDiagram of the main flow, including its failure/retry path' },
  'Data model': {
    kind: 'er',
    exempt: (c) => /\b(n\/a|not applicable|no persist\w*|stateless)\b/i.test(c),
    message: 'Data model has no ER diagram — add a ```mermaid erDiagram of the entities and their relationships',
  },
};

// Accepts "AC1", "AC-1", "AC #1", "AC 1".
function referencesAc(content, n) {
  return new RegExp(`\\bAC[\\s#-]*${n}\\b`, 'i').test(content);
}

function aliasesFor(name) {
  return SECTION_ALIASES[name] || [name.toLowerCase()];
}

function headingMatchesSection(heading, name) {
  const h = String(heading || '').toLowerCase();
  return aliasesFor(name).some((a) => h.includes(a));
}

function findSection(sections, name) {
  return sections.find((s) => headingMatchesSection(s.heading, name));
}

// Pure. Optional cross-artifact inputs (supplied by evaluateDesignFile):
//   prdAcceptanceCriteria — the PRD's ACs; the test strategy must map each one.
//   decisions — { 'DEC-0001': decision | null } for every linked id; each must
//     exist and pass evaluateAdrQuality.
//   architecture — the repo's architecture-overview evaluation; when present it
//     must be valid, the design must reference it, and the design must name the
//     components it touches (or declare a new component). Every declared
//     `New component: <name>` must be listed in the overview and have its own
//     component doc (docs/architecture/components/<slug>.md) — the design
//     creates the feature's architecture doc, not only a line in the overview.
// Omitted inputs skip their check (the pure gate stays usable on a lone doc).
// The names declared with `New component: <name>` (bold/backticks stripped).
function declaredNewComponents(markdown) {
  return [...new Set([...String(markdown).matchAll(/\bnew component:\s*([^\n.,;()]+)/gi)]
    .map((m) => m[1].replace(/[*`_]/g, '').trim())
    .filter((n) => n && !n.startsWith('<')))];
}

function evaluateDesign(markdown, { path = '<design>', prdAcceptanceCriteria, decisions, architecture } = {}) {
  const { frontmatter, sections } = parsePrd(markdown);
  const status = (frontmatter.status || '').toString().toLowerCase();

  const missingSections = [];
  const emptySections = [];
  for (const name of REQUIRED_SECTIONS) {
    const sec = findSection(sections, name);
    if (!sec) missingSections.push(name);
    else if (!sec.hasContent) emptySections.push(name);
  }

  // Collect ALL marker tokens (MARKER_TOKEN_RE is non-global), deduped.
  const markers = [...new Set([...markdown.matchAll(new RegExp(MARKER_TOKEN_RE.source, 'g'))].map((m) => m[1]))];

  // The Decisions section (or frontmatter.relatedAdrs) must link ≥1 ADR.
  const adrLinks = Array.from(new Set((markdown.match(ADR_REF_RE) || [])
    .concat(Array.isArray(frontmatter.relatedAdrs) ? frontmatter.relatedAdrs : [])));

  const substanceIssues = [];
  for (const name of REQUIRED_SECTIONS) {
    const sec = findSection(sections, name);
    if (!sec || !sec.hasContent) continue;
    if (!LENGTH_EXEMPT.has(name) && sec.content.length < MIN_SECTION_CHARS) {
      substanceIssues.push({ code: 'section-too-short', section: name, message: `"${sec.heading}" has ${sec.content.length} chars (< ${MIN_SECTION_CHARS})` });
    }
    const rule = SUBSTANCE_RULES[name];
    if (rule && !rule.test(stripMermaid(sec.content))) substanceIssues.push({ code: 'section-not-concrete', section: name, message: rule.message });
    const diagram = DIAGRAM_RULES[name];
    if (diagram && !(diagram.exempt && diagram.exempt(sec.content)) && !hasDiagram(sec.content, diagram.kind)) {
      substanceIssues.push({ code: 'missing-diagram', section: name, message: diagram.message });
    }
  }

  const testSec = findSection(sections, 'Test strategy');
  const unmappedAcs = [];
  if (testSec && testSec.hasContent && Array.isArray(prdAcceptanceCriteria)) {
    // Placeholder lines (e.g. a migration skeleton "<AC3 — …>") map nothing.
    const mapped = testSec.content.split(/\r?\n/).filter((l) => !isPlaceholderLine(l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))).join('\n');
    prdAcceptanceCriteria.forEach((ac, i) => { if (!referencesAc(mapped, i + 1)) unmappedAcs.push(`AC${i + 1}`); });
    if (unmappedAcs.length) {
      substanceIssues.push({ code: 'acs-not-mapped', section: 'Test strategy', message: `Test strategy does not map PRD acceptance criteria ${unmappedAcs.join(', ')} — name each (AC1..AC${prdAcceptanceCriteria.length}) with the test layer that proves it` });
    }
  }

  const adrIssues = [];
  if (decisions) {
    const { evaluateAdrQuality } = require('./decisions');
    for (const id of adrLinks) {
      const d = decisions[id];
      if (!d) adrIssues.push(`${id}: linked but not recorded in .ai-sdlc/_decisions/`);
      else adrIssues.push(...evaluateAdrQuality(d).issues);
    }
    if (adrIssues.length) substanceIssues.push({ code: 'adr-incomplete', section: 'Decisions', message: `linked ADRs are incomplete: ${adrIssues.join('; ')}` });
  }

  let greenfield = null;
  if (architecture && architecture.scaffold) {
    // Greenfield: no architecture exists yet — this design establishes it.
    greenfield = { code: 'architecture-greenfield', message: `${architecture.path} is still the empty scaffold — write it from this design (components, contracts, data ownership, invariants) in the same change` };
  } else if (architecture) {
    if (!architecture.valid) {
      substanceIssues.push({ code: 'architecture-invalid', section: null, message: `architecture overview ${architecture.path} is incomplete (${architecture.reasons.join('; ')}) — fix it before designs can pass` });
    }
    const referenced = frontmatter.architecture || markdown.includes(architecture.path);
    if (!referenced) {
      substanceIssues.push({ code: 'architecture-not-referenced', section: null, message: `design does not reference the architecture overview — set frontmatter architecture: ${architecture.path}` });
    }
    const named = (architecture.components || []).filter((c) => new RegExp(`(^|[^A-Za-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i').test(markdown));
    if (architecture.components && architecture.components.length && !named.length && !/\bnew component\b/i.test(markdown)) {
      substanceIssues.push({ code: 'no-component-named', section: 'Architecture', message: `design names none of the architecture's components (${architecture.components.join(', ')}) — say which it changes and how they connect, or declare "New component: <name>" and add it to ${architecture.path}` });
    }
    const listed = new Map((architecture.components || []).map((c) => [c.toLowerCase(), c]));
    const docs = new Map((architecture.componentDocs || []).map((d) => [d.name.toLowerCase(), d]));
    for (const name of declaredNewComponents(markdown)) {
      if (!listed.has(name.toLowerCase())) {
        substanceIssues.push({ code: 'new-component-not-in-overview', section: 'Architecture', message: `New component "${name}" is not listed in ${architecture.path} — add it (code paths, responsibility, contracts) in the same change` });
        continue;
      }
      const doc = docs.get(name.toLowerCase());
      if (doc && !doc.valid) {
        substanceIssues.push({ code: 'new-component-doc', section: 'Architecture', message: doc.exists ? `New component "${name}": its doc ${doc.path} is incomplete (${doc.reasons.join('; ')})` : `New component "${name}" has no component doc — write ${doc.path} from docs/architecture/components/_template.md in the same change` });
      }
    }
  }

  const structureValid = missingSections.length === 0 && emptySections.length === 0 && markers.length === 0;
  const hasAdrLinks = adrLinks.length > 0;
  const substanceValid = substanceIssues.length === 0;
  const valid = structureValid && hasAdrLinks && substanceValid;

  const advisory = greenfield ? [greenfield] : [];
  if (status !== 'approved') advisory.push({ code: 'not-approved', message: `design status is "${status || 'unset'}" — a human should review + set status: approved` });
  for (const name of REQUIRED_SECTIONS) {
    const sec = findSection(sections, name);
    if (!sec || !sec.hasContent || LENGTH_EXEMPT.has(name)) continue;
    if (sec.content.length >= MIN_SECTION_CHARS && sec.content.length < THIN_SECTION_CHARS) {
      advisory.push({ code: 'thin-section', message: `Section "${sec.heading}" is thin (${sec.content.length} chars)` });
    }
  }

  const reasons = [];
  if (missingSections.length) reasons.push(`missing sections: ${missingSections.join(', ')}`);
  if (emptySections.length) reasons.push(`empty sections: ${emptySections.join(', ')}`);
  if (markers.length) reasons.push(`placeholder marker token(s) present: ${markers.join(', ')}`);
  if (!hasAdrLinks) reasons.push('design links no ADRs (DEC-NNNN) — record the atomic decisions and link them');
  for (const i of substanceIssues) reasons.push(i.message);

  return { path, status, valid, structureValid, substanceValid, hasAdrLinks, adrLinks, missingSections, emptySections, markers, substanceIssues, unmappedAcs, adrIssues, advisory, reasons };
}

// Resolve a repo-relative path and refuse anything that escapes the root.
function resolveInside(root, rel) {
  const base = resolve(root);
  const full = isAbsolute(rel) ? resolve(rel) : resolve(base, rel);
  return full === base || full.startsWith(base + sep) ? full : null;
}

// The PRD this design implements: the explicit prdPath, else frontmatter
// relatedPrd, else docs/prd/<feature>.md beside it.
function resolvePrdPath(root, frontmatter, prdPath) {
  const candidates = [prdPath, frontmatter.relatedPrd];
  const feature = frontmatter.feature || frontmatter.featureId;
  if (feature) candidates.push(join('docs', 'prd', `${feature}.md`));
  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    const full = resolveInside(root, c);
    if (full && existsSync(full)) return full;
  }
  return null;
}

// Evaluate a design doc with its cross-artifact checks: the PRD's ACs (mapped
// by the test strategy) and the linked ADRs from <root>/.ai-sdlc/_decisions.
// root defaults to the repo containing docs/design/ (two levels up).
function evaluateDesignFile(designPath, { root, prdPath } = {}) {
  const markdown = readFileSync(designPath, 'utf8');
  const projectRoot = root || resolve(dirname(designPath), '..', '..');
  const { frontmatter } = parsePrd(markdown);
  const prdFull = resolvePrdPath(projectRoot, frontmatter, prdPath);
  const prdAcceptanceCriteria = prdFull ? extractPrdAcceptanceCriteria(readFileSync(prdFull, 'utf8')) : undefined;

  const { loadDecision } = require('./decisions');
  const decisions = {};
  const linked = new Set([...(markdown.match(ADR_REF_RE) || []), ...(Array.isArray(frontmatter.relatedAdrs) ? frontmatter.relatedAdrs : [])]);
  for (const id of linked) {
    try {
      decisions[id] = loadDecision(projectRoot, id);
    } catch {
      decisions[id] = null;
    }
  }
  const { evaluateArchitectureRoot } = require('./architecture-context');
  const architecture = evaluateArchitectureRoot(projectRoot) || undefined;
  return evaluateDesign(markdown, { path: designPath, prdAcceptanceCriteria, decisions, architecture });
}

module.exports = { evaluateDesign, evaluateDesignFile, declaredNewComponents, findSection, resolveInside, REQUIRED_SECTIONS, SECTION_ALIASES, SUBSTANCE_RULES, headingMatchesSection };

// CLI: node decision-engine/design-gate.js docs/design/<slug>.md
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: design-gate <path-to-design.md>');
    process.exit(1);
  }
  try {
    const res = evaluateDesignFile(target, { root: process.cwd() });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.valid ? 0 : 2);
  } catch (err) {
    console.error(`design-gate failed: ${err.message}`);
    process.exit(1);
  }
}
