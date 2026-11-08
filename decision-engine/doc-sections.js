// Shared section checks for the repo-level governed documents (product
// context, architecture overview, bug reports): canonical sections matched by
// prefix aliases, present + non-empty + at least `minChars` long, no
// placeholder marker tokens, and thin-but-passing sections as advisories.

const { MARKER_TOKEN_RE } = require('./dor-gate');

// Prefix matcher over per-section aliases; a section with no aliases matches
// its own lower-cased name.
function makeMatcher(aliases = {}) {
  return function headingMatchesSection(heading, name) {
    const h = String(heading || '').toLowerCase();
    return (aliases[name] || [name.toLowerCase()]).some((a) => h.startsWith(a));
  };
}

function findSection(sections, name, matches) {
  return sections.find((s) => matches(s.heading, name));
}

// Structure + length checks over the required sections.
function checkSections(sections, required, { matches, minChars, thinChars, exempt = new Set() }) {
  const missingSections = [];
  const emptySections = [];
  const substanceIssues = [];
  const advisory = [];
  for (const name of required) {
    const sec = findSection(sections, name, matches);
    if (!sec) { missingSections.push(name); continue; }
    if (!sec.hasContent) { emptySections.push(name); continue; }
    if (exempt.has(name)) continue;
    if (sec.content.length < minChars) {
      substanceIssues.push({ code: 'section-too-short', section: name, message: `"${sec.heading}" has ${sec.content.length} chars (< ${minChars})` });
    } else if (thinChars && sec.content.length < thinChars) {
      advisory.push({ code: 'thin-section', message: `Section "${sec.heading}" is thin (${sec.content.length} chars)` });
    }
  }
  return { missingSections, emptySections, substanceIssues, advisory };
}

// Every distinct placeholder marker token in the document.
function markerTokens(markdown) {
  return [...new Set([...String(markdown).matchAll(new RegExp(MARKER_TOKEN_RE.source, 'g'))].map((m) => m[1]))];
}

function structureReasons({ missingSections, emptySections, markers }) {
  const reasons = [];
  if (missingSections.length) reasons.push(`missing sections: ${missingSections.join(', ')}`);
  if (emptySections.length) reasons.push(`empty sections: ${emptySections.join(', ')}`);
  if (markers.length) reasons.push(`placeholder marker token(s) present: ${markers.join(', ')}`);
  return reasons;
}

// Insert `key: value` into the YAML frontmatter (before its closing ---).
function addFrontmatterLine(markdown, line) {
  const m = markdown.match(/^(---\r?\n[\s\S]*?\r?\n)(---\r?\n?)/);
  if (!m) return `---\n${line}\n---\n${markdown}`;
  return `${m[1]}${line}\n${m[2]}${markdown.slice(m[0].length)}`;
}

// Append lines at the end of a `##` section's body.
function appendToSection(markdown, matches, lines) {
  const all = markdown.split('\n');
  const start = all.findIndex((l) => { const h = l.match(/^#{2,}\s+(.+?)\s*$/); return h && matches(h[1]); });
  if (start === -1) return markdown;
  let end = all.findIndex((l, i) => i > start && /^#{2,}\s+/.test(l));
  if (end === -1) end = all.length;
  while (end > start + 1 && !all[end - 1].trim()) end -= 1;
  all.splice(end, 0, ...lines);
  return all.join('\n');
}

module.exports = { makeMatcher, findSection, checkSections, markerTokens, structureReasons, addFrontmatterLine, appendToSection };
