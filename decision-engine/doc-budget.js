// Token-budgeted rendering of markdown documents into prompt context. Shared by
// spec-context (PRD + design doc -> plan/implementer/reviewers) and
// product-context (product context + related PRDs -> discovery panel).
//
// A document is loaded into sections ranked by a per-document priority list.
// allocate() admits sections across ALL documents in rank order until the
// budget is spent, so the most important parts of every document survive a
// tight budget. A section that only partly fits is truncated with an explicit
// marker; sections that do not fit are reported by heading so the agent can
// open the file.

const { readFileSync } = require('node:fs');
const { relative, resolve } = require('node:path');
const { parsePrd } = require('./prd-gate');

// Below this many remaining chars a partial section is not worth truncating in.
const MIN_PARTIAL_CHARS = 400;

function priorityOf(heading, order, matches) {
  const i = order.findIndex((name) => matches(heading, name));
  return i === -1 ? order.length : i;
}

// Load a markdown doc as { path (root-relative), status, frontmatter, sections }.
// Each section carries its document position (idx) and budget rank (priority).
function loadDoc(path, root, order, matches) {
  const { frontmatter, sections } = parsePrd(readFileSync(path, 'utf8'));
  return {
    path: relative(resolve(root), path),
    status: String(frontmatter.status || '').toLowerCase(),
    frontmatter,
    sections: sections
      .filter((s) => s.hasContent)
      .map((s, idx) => ({ heading: s.heading, content: s.content, idx, priority: priorityOf(s.heading, order, matches) })),
  };
}

// docs: [{ key, doc }] in tie-break order (earlier wins an equal rank).
// Returns { admitted: Map<key, section[]>, dropped: Map<key, heading[]> }.
function allocate(docs, maxChars) {
  const queue = [];
  docs.forEach((d, order) => { for (const s of d.doc.sections) queue.push({ ...s, key: d.key, order }); });
  queue.sort((a, b) => a.priority - b.priority || a.order - b.order || a.idx - b.idx);
  let remaining = maxChars;
  const admitted = new Map(docs.map((d) => [d.key, []]));
  const dropped = new Map(docs.map((d) => [d.key, []]));
  for (const s of queue) {
    const cost = s.heading.length + s.content.length + 8;
    if (cost <= remaining) {
      admitted.get(s.key).push(s);
      remaining -= cost;
    } else if (remaining > MIN_PARTIAL_CHARS) {
      const keep = remaining - s.heading.length - 80;
      admitted.get(s.key).push({ ...s, content: `${s.content.slice(0, keep)}\n…[truncated — read the rest in the file]` });
      remaining = 0;
    } else {
      dropped.get(s.key).push(s.heading);
    }
  }
  return { admitted, dropped };
}

// Render one doc's admitted sections in document order, plus the omitted list.
function renderDoc(title, doc, sections, dropped) {
  const lines = [`### ${title} — ${doc.path} (status: ${doc.status || 'unset'})`];
  for (const s of [...sections].sort((a, b) => a.idx - b.idx)) lines.push('', `#### ${s.heading}`, s.content);
  if (dropped.length) lines.push('', `(omitted for budget — open ${doc.path} for: ${dropped.join(', ')})`);
  return lines.join('\n');
}

module.exports = { loadDoc, allocate, renderDoc, priorityOf, MIN_PARTIAL_CHARS };
