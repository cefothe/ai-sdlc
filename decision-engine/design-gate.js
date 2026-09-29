// Design gate — governs the design-doc artifact (docs/design/<feature>.md), the
// missing link between the PRD (what/why) and the atomic ADRs (individual
// decisions). The design doc is where the DETAILED technical design lives — the
// full schema DDL, module boundaries, data flow — so it never gets compressed
// into a one-line ADR and lost.
//
// Two tiers, matching the PRD gate:
//   - ENFORCED (deterministic): every canonical section is present + non-empty,
//     no placeholder marker tokens, AND the design links at least one ADR
//     (DEC-NNNN) — a design with no recorded decisions is undocumented reasoning.
//   - ADVISORY: thin sections and draft status are reported, never blocking.

const { readFileSync } = require('node:fs');
const { parsePrd } = require('./prd-gate'); // generic frontmatter + section parser
const { MARKER_TOKEN_RE } = require('./dor-gate');

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

function evaluateDesign(markdown, { path = '<design>' } = {}) {
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

  const structureValid = missingSections.length === 0 && emptySections.length === 0 && markers.length === 0;
  const hasAdrLinks = adrLinks.length > 0;
  const valid = structureValid && hasAdrLinks;

  const advisory = [];
  if (status !== 'approved') advisory.push({ code: 'not-approved', message: `design status is "${status || 'unset'}" — a human should review + set status: approved` });
  for (const s of sections) {
    if (REQUIRED_SECTIONS.some((r) => headingMatchesSection(s.heading, r)) && s.hasContent && s.content.length < 40) {
      advisory.push({ code: 'thin-section', message: `Section "${s.heading}" is very thin (${s.content.length} chars)` });
    }
  }

  const reasons = [];
  if (missingSections.length) reasons.push(`missing sections: ${missingSections.join(', ')}`);
  if (emptySections.length) reasons.push(`empty sections: ${emptySections.join(', ')}`);
  if (markers.length) reasons.push(`placeholder marker token(s) present: ${markers.join(', ')}`);
  if (!hasAdrLinks) reasons.push('design links no ADRs (DEC-NNNN) — record the atomic decisions and link them');

  return { path, status, valid, structureValid, hasAdrLinks, adrLinks, missingSections, emptySections, markers, advisory, reasons };
}

function evaluateDesignFile(designPath) {
  return evaluateDesign(readFileSync(designPath, 'utf8'), { path: designPath });
}

module.exports = { evaluateDesign, evaluateDesignFile, REQUIRED_SECTIONS, SECTION_ALIASES, headingMatchesSection };

// CLI: node decision-engine/design-gate.js docs/design/<slug>.md
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: design-gate <path-to-design.md>');
    process.exit(1);
  }
  try {
    const res = evaluateDesignFile(target);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.valid ? 0 : 2);
  } catch (err) {
    console.error(`design-gate failed: ${err.message}`);
    process.exit(1);
  }
}
