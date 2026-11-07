// PRD gate — makes a PRD a governed artifact, the way the DoR gate governs a
// task. Two tiers, matching the framework's measurement-before-enforcement
// discipline:
//   - ENFORCED (deterministic, objective): every canonical section is present
//     and non-empty, no placeholder marker tokens, Status is `approved` (the
//     human-in-the-loop sign-off), AND the content has substance: >=2
//     acceptance criteria as list items, measurable success metrics, no
//     unresolved open questions, and no near-empty section. A presence-only
//     check let one-line PRDs through, and the implementer then had nothing to
//     build against. A task whose PRD fails these is refused DoR admission
//     (see dor-gate.js gate 8).
//   - ADVISORY (judgment, never blocks): thin-but-passing sections and
//     technical leakage — reported to the operator only.
//
// The canonical section list lives here ONCE and is shared by the template
// (docs/prd/_template.md) and the /ai-sdlc:new command, so structure cannot
// drift: every PRD is identical by construction and verified by the same list.

const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const yaml = require('js-yaml');
const { MARKER_TOKEN_RE } = require('./dor-gate');

// Canonical PRD structure — the single source of truth. Matching is
// case-insensitive and prefix-based against each section's aliases, so
// "## Target user & context" satisfies "Target user" and "## Out of scope"
// satisfies "Non-goals" (but never "Scope" — prefix, not substring). Keep this
// in sync with docs/prd/_template.md.
const REQUIRED_SECTIONS = [
  'Problem',
  'Target user',
  'Success metrics',
  'Scope',
  'Non-goals',
  'User flows',
  'Acceptance criteria',
  'Edge cases',
  'Non-functional requirements',
  'Open questions',
];

const SECTION_ALIASES = {
  'Non-goals': ['non-goals', 'non goals', 'nongoals', 'out of scope'],
  'User flows': ['user flow', 'user journey', 'user stories', 'user story', 'flows', 'journeys'],
  'Edge cases': ['edge case', 'error state', 'error case', 'failure mode', 'error and edge', 'errors & edge', 'errors and edge'],
  'Non-functional requirements': ['non-functional', 'nonfunctional', 'nfr', 'quality attributes'],
};

// Substance thresholds (enforced). A required section shorter than
// MIN_SECTION_CHARS carries no buildable information; below THIN_SECTION_CHARS
// it passes but is flagged. Open questions may legitimately be just "None.".
const MIN_SECTION_CHARS = 30;
const THIN_SECTION_CHARS = 80;
const MIN_ACCEPTANCE_CRITERIA = 2;
const LENGTH_EXEMPT = new Set(['Open questions']);

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const HEADING_RE = /^#{2,}\s+(.+?)\s*$/;

// Technical/implementation tokens that should not drive a PRD (product doc).
// Matched case-insensitively; used only for an advisory "technical-leakage" smell.
const TECH_TOKEN_RE = /\b(postgres(?:ql)?|mysql|mongodb|sqlite|redis|kafka|docker|kubernetes|k8s|react|next\.?js|svelte|angular|vue|node\.?js|typescript|python|golang|graphql|grpc|trpc|terraform|firecrawl|elasticsearch|kotlin|swift)\b/gi;

// A body line that carries no real content: blank, a template placeholder
// (`<...>`), or an HTML comment. Used to decide whether a section is "empty".
function isPlaceholderLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('<!--')) return true;
  if (t.startsWith('<') && t.endsWith('>')) return true;
  return false;
}

// Parse a PRD into { frontmatter, sections: [{ heading, content }] }.
function parsePrd(markdown) {
  let frontmatter = {};
  // Strip a UTF-8 BOM / leading whitespace so a file that starts with one still
  // matches the ^--- frontmatter anchor (otherwise status parses as {} and the
  // gate fails with a confusing "status unset").
  markdown = markdown.replace(/^﻿/, '').replace(/^\s+/, '');
  let body = markdown;
  const fm = markdown.match(FRONTMATTER_RE);
  if (fm) {
    try {
      frontmatter = yaml.load(fm[1]) || {};
    } catch (_) {
      frontmatter = {};
    }
    body = fm[2] || '';
  }

  const sections = [];
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(HEADING_RE);
    if (h) {
      current = { heading: h[1], lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return {
    frontmatter,
    sections: sections.map((s) => ({
      heading: s.heading,
      content: s.lines.join('\n').trim(),
      hasContent: s.lines.some((l) => !isPlaceholderLine(l)),
    })),
  };
}

function aliasesFor(name) {
  return SECTION_ALIASES[name] || [name.toLowerCase()];
}

function headingMatchesSection(heading, name) {
  const h = String(heading || '').toLowerCase();
  return aliasesFor(name).some((a) => h.startsWith(a));
}

function findSection(sections, name) {
  return sections.find((s) => headingMatchesSection(s.heading, name));
}

// Does a success-metrics section state a measurable target? A number, a
// percentage, a comparison or a percentile — "users will be happier" is not.
function looksMeasurable(content) {
  return /[0-9]|%|<|>|\bp\d{2}\b/i.test(content || '');
}

// Markdown list items ("- x", "* x", "1. x", "- [ ] x") in a section body,
// with the bullet/checkbox stripped. Placeholder items (<...>) are skipped.
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/;
function extractListItems(content) {
  const items = [];
  for (const line of String(content || '').split(/\r?\n/)) {
    const m = line.match(LIST_ITEM_RE);
    if (m && !isPlaceholderLine(m[1])) items.push(m[1]);
  }
  return items;
}

// The PRD's acceptance criteria as plain strings — the product contract the
// task's ACs are seeded from and the design's test strategy maps onto.
function extractPrdAcceptanceCriteria(markdown) {
  const sec = findSection(parsePrd(markdown).sections, 'Acceptance criteria');
  return sec ? extractListItems(sec.content) : [];
}

// A success metric cites a baseline when it states the current value it moves
// from: "baseline 12%", "currently 3.1s", "from 40% to 55%", "12% → 17%".
const BASELINE_RE = /\b(baseline|currently|today|from)\b[^\n]*\d|\d[^\n]*(→|->)[^\n]*\d/i;

// An open question is resolved when it is struck through or carries an answer
// marker. "None" (whole section) means nothing is open.
const RESOLVED_RE = /\b(resolved|answered|decided)\b|~~|→|->|=>/i;
function unresolvedQuestions(content) {
  const text = String(content || '').trim();
  if (/^(none|n\/a)\b/i.test(text)) return [];
  return text.split(/\r?\n/).filter((l) => l.includes('?') && !RESOLVED_RE.test(l)).map((l) => l.trim());
}

// Evaluate a PRD's markdown. Pure — the caller supplies the text.
// productContext (optional, from product-context.evaluateProductContext): when
// the repo has a product context doc, it must be valid, the Target user must
// name one of its personas, and the Success metrics must cite a baseline.
function evaluatePrd(markdown, { path = '<prd>', productContext } = {}) {
  const { frontmatter, sections } = parsePrd(markdown);
  const status = (frontmatter.status || '').toString().toLowerCase();

  const missingSections = [];
  const emptySections = [];
  for (const name of REQUIRED_SECTIONS) {
    const sec = findSection(sections, name);
    if (!sec) missingSections.push(name);
    else if (!sec.hasContent) emptySections.push(name);
  }

  // Collect ALL marker tokens (MARKER_TOKEN_RE is non-global; a plain .match
  // would report only the first), deduped, so the operator sees every one to fix.
  const markers = [...new Set([...markdown.matchAll(new RegExp(MARKER_TOKEN_RE.source, 'g'))].map((m) => m[1]))];

  // Substance (enforced): checked only on sections that exist with content —
  // a missing/empty section is already reported above.
  const substanceIssues = [];
  for (const name of REQUIRED_SECTIONS) {
    const sec = findSection(sections, name);
    if (!sec || !sec.hasContent || LENGTH_EXEMPT.has(name)) continue;
    if (sec.content.length < MIN_SECTION_CHARS) {
      substanceIssues.push({ code: 'section-too-short', section: name, message: `"${sec.heading}" has ${sec.content.length} chars (< ${MIN_SECTION_CHARS}) — state it concretely` });
    }
  }
  const acSec = findSection(sections, 'Acceptance criteria');
  const acceptanceCriteria = acSec ? extractListItems(acSec.content) : [];
  if (acSec && acSec.hasContent && acceptanceCriteria.length < MIN_ACCEPTANCE_CRITERIA) {
    substanceIssues.push({ code: 'too-few-acceptance-criteria', section: 'Acceptance criteria', message: `${acceptanceCriteria.length} acceptance criteria as list items (< ${MIN_ACCEPTANCE_CRITERIA}) — list the happy path and at least one error/edge outcome` });
  }
  const metrics = findSection(sections, 'Success metrics');
  if (metrics && metrics.hasContent && !looksMeasurable(metrics.content)) {
    substanceIssues.push({ code: 'metric-not-measurable', section: 'Success metrics', message: 'Success metrics state no number, percentage, threshold or percentile — give each a measurable target' });
  }
  const open = findSection(sections, 'Open questions');
  const openQuestions = open ? unresolvedQuestions(open.content) : [];
  if (openQuestions.length) {
    substanceIssues.push({ code: 'open-questions-unresolved', section: 'Open questions', message: `${openQuestions.length} unresolved open question(s) — answer each (mark it resolved/→ answer) or write "None"` });
  }

  if (productContext) {
    if (!productContext.valid) {
      substanceIssues.push({ code: 'product-context-invalid', section: null, message: `product context ${productContext.path} is incomplete (${productContext.reasons.join('; ')}) — fix it before approving PRDs` });
    }
    const target = findSection(sections, 'Target user');
    const personas = productContext.personas || [];
    if (target && target.hasContent && personas.length && !personas.some((p) => target.content.toLowerCase().includes(p.toLowerCase()))) {
      substanceIssues.push({ code: 'persona-not-named', section: 'Target user', message: `Target user names none of the product personas (${personas.join(', ')}) — use one, or add the new persona to ${productContext.path}` });
    }
    if (metrics && metrics.hasContent && !BASELINE_RE.test(metrics.content)) {
      substanceIssues.push({ code: 'metric-no-baseline', section: 'Success metrics', message: 'Success metrics cite no baseline — state "baseline X → target Y" from the product context Metric baselines' });
    }
  }

  const structureValid = missingSections.length === 0 && emptySections.length === 0 && markers.length === 0;
  const substanceValid = substanceIssues.length === 0;
  const approved = status === 'approved';
  const valid = structureValid && substanceValid && approved;

  // Advisory (non-blocking) quality signals.
  const advisory = [];
  for (const name of REQUIRED_SECTIONS) {
    const sec = findSection(sections, name);
    if (!sec || !sec.hasContent || LENGTH_EXEMPT.has(name)) continue;
    if (sec.content.length >= MIN_SECTION_CHARS && sec.content.length < THIN_SECTION_CHARS) {
      advisory.push({ code: 'thin-section', message: `Section "${sec.heading}" is thin (${sec.content.length} chars)` });
    }
  }
  // Technical-leakage smell: a PRD is product (what/why). Naming a stack, DB, or
  // infra means a design decision leaked in — it belongs in a design-stage ADR.
  // Advisory only: a genuine fixed constraint is fine, but flag it for review.
  const techTokens = markdown.match(TECH_TOKEN_RE);
  if (techTokens) {
    const uniq = Array.from(new Set(techTokens.map((t) => t.toLowerCase())));
    advisory.push({ code: 'technical-leakage', message: `PRD names technical/implementation choices (${uniq.join(', ')}) — these belong in design ADRs, not the PRD. Keep only as a stated constraint if truly fixed.` });
  }

  const reasons = [];
  if (missingSections.length) reasons.push(`missing sections: ${missingSections.join(', ')}`);
  if (emptySections.length) reasons.push(`empty sections: ${emptySections.join(', ')}`);
  if (markers.length) reasons.push(`placeholder marker token(s) present: ${markers.join(', ')}`);
  for (const i of substanceIssues) reasons.push(i.message);
  if (!approved) reasons.push(`status is "${status || 'unset'}" — a human must set status: approved`);

  return { path, status, valid, structureValid, substanceValid, approved, missingSections, emptySections, markers, substanceIssues, acceptanceCriteria, openQuestions, advisory, reasons };
}

// Read + evaluate a PRD file, with the repo's product context when it has one.
// root defaults to the repo containing docs/prd/ (two levels up). Throws only
// on an unreadable PRD.
function evaluatePrdFile(prdPath, { root } = {}) {
  const markdown = readFileSync(prdPath, 'utf8');
  const { evaluateProductContextRoot } = require('./product-context');
  const productContext = evaluateProductContextRoot(root || resolve(dirname(prdPath), '..', '..')) || undefined;
  return evaluatePrd(markdown, { path: prdPath, productContext });
}

module.exports = {
  evaluatePrd, evaluatePrdFile, parsePrd, findSection, headingMatchesSection, extractListItems,
  extractPrdAcceptanceCriteria, isPlaceholderLine, REQUIRED_SECTIONS, SECTION_ALIASES,
};

// CLI: node decision-engine/prd-gate.js docs/prd/<slug>.md
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: prd-gate <path-to-prd.md>');
    process.exit(1);
  }
  try {
    const res = evaluatePrdFile(target, { root: process.cwd() });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.valid ? 0 : 2);
  } catch (err) {
    console.error(`prd-gate failed: ${err.message}`);
    process.exit(1);
  }
}
