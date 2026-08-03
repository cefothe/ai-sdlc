// PRD gate — makes a PRD a governed artifact, the way the DoR gate governs a
// task. Two tiers, matching the framework's measurement-before-enforcement
// discipline:
//   - ENFORCED (deterministic, objective): every canonical section is present
//     and non-empty, no placeholder marker tokens, and Status is `approved`
//     (the human-in-the-loop sign-off). A task whose PRD fails these is refused
//     DoR admission (see dor-gate.js gate 8).
//   - ADVISORY (judgment, never blocks): thin sections, non-measurable success
//     metrics, unresolved open questions — reported to the operator only.
//
// The canonical section list lives here ONCE and is shared by the template
// (docs/prd/_template.md) and the /ai-sdlc:new command, so structure cannot
// drift: every PRD is identical by construction and verified by the same list.

const { readFileSync } = require('node:fs');
const yaml = require('js-yaml');
const { MARKER_TOKEN_RE } = require('./dor-gate');

// Canonical PRD structure — the single source of truth. Matching is
// case-insensitive and prefix-based, so "## Target user & context" satisfies
// "Target user". Keep this in sync with docs/prd/_template.md (the template is
// generated to contain exactly these headings).
const REQUIRED_SECTIONS = [
  'Problem',
  'Target user',
  'Success metrics',
  'Scope',
  'Acceptance criteria',
  'Open questions',
];

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

function findSection(sections, name) {
  const needle = name.toLowerCase();
  return sections.find((s) => s.heading.toLowerCase().startsWith(needle));
}

// Heuristic: does a success-metrics section look measurable? (advisory only)
function looksMeasurable(content) {
  return /[0-9]|%|<|>|\bp\d{2}\b|\+|x\b|latency|rate|count|conversion/i.test(content || '');
}

// Evaluate a PRD's markdown. Pure — the caller supplies the text.
function evaluatePrd(markdown, { path = '<prd>' } = {}) {
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

  const structureValid = missingSections.length === 0 && emptySections.length === 0 && markers.length === 0;
  const approved = status === 'approved';
  const valid = structureValid && approved;

  // Advisory (non-blocking) quality signals.
  const advisory = [];
  const metrics = findSection(sections, 'Success metrics');
  if (metrics && metrics.hasContent && !looksMeasurable(metrics.content)) {
    advisory.push({ code: 'metric-not-measurable', message: 'Success metrics do not look measurable (no number/target/direction)' });
  }
  const open = findSection(sections, 'Open questions');
  if (open && /\?/.test(open.content) && !/\bnone\b|\bresolved\b/i.test(open.content)) {
    advisory.push({ code: 'open-questions-unresolved', message: 'Open questions section still contains unresolved questions' });
  }
  for (const s of sections) {
    if (REQUIRED_SECTIONS.some((r) => s.heading.toLowerCase().startsWith(r.toLowerCase())) && s.hasContent && s.content.length < 40) {
      advisory.push({ code: 'thin-section', message: `Section "${s.heading}" is very thin (${s.content.length} chars)` });
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
  if (!approved) reasons.push(`status is "${status || 'unset'}" — a human must set status: approved`);

  return { path, status, valid, structureValid, approved, missingSections, emptySections, markers, advisory, reasons };
}

// Read + evaluate a PRD file. Throws only on unreadable file.
function evaluatePrdFile(prdPath) {
  const markdown = readFileSync(prdPath, 'utf8');
  return evaluatePrd(markdown, { path: prdPath });
}

module.exports = { evaluatePrd, evaluatePrdFile, parsePrd, REQUIRED_SECTIONS };

// CLI: node decision-engine/prd-gate.js docs/prd/<slug>.md
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: prd-gate <path-to-prd.md>');
    process.exit(1);
  }
  try {
    const res = evaluatePrdFile(target);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.valid ? 0 : 2);
  } catch (err) {
    console.error(`prd-gate failed: ${err.message}`);
    process.exit(1);
  }
}
