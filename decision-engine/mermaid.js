// Mermaid diagram checks — architecture and design docs must carry diagrams
// everyone can read (GitHub renders ```mermaid natively), not only prose.
// Structural, deterministic checks: a fenced ```mermaid block whose first line
// declares a diagram type of the required kind and whose body has real edges —
// an empty or header-only fence does not count.
//
//   component  flowchart | graph | C4Context | C4Container | C4Component | architecture-beta | block-beta
//   sequence   sequenceDiagram
//   er         erDiagram

// A fence opens and closes at the start of a line (indent allowed); an inline
// ```mermaid mention in prose is not a diagram.
const FENCE_RE = /^[ \t]*```mermaid[^\n]*\n([\s\S]*?)^[ \t]*```/gm;

const KINDS = {
  component: /^(flowchart|graph|C4Context|C4Container|C4Component|architecture-beta|block-beta)\b/,
  sequence: /^sequenceDiagram\b/,
  er: /^erDiagram\b/,
};

// What a diagram of each kind must contain to say anything.
const EDGES = {
  component: /-->|---|-\.->|==>|--[^-\n]+-->|Rel\(|\(\w+\)\s*--/,
  sequence: /-{1,2}>>|-{1,2}x|-{1,2}\)|->/,
  // crow's foot: left end |o || }o }|, right end o| || o{ |{; -- identifying, .. not
  er: /[|}][|o](--|\.\.)[|o][|{]|\w+\s*\{[\s\S]*?\}/,
};

function extractMermaid(markdown) {
  return [...String(markdown || '').matchAll(FENCE_RE)].map((m) => {
    const body = m[1];
    const header = (body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('%%')) || '');
    const kind = Object.keys(KINDS).find((k) => KINDS[k].test(header)) || null;
    return { kind, header, body };
  });
}

// True when the text holds at least one diagram of `kind` with real edges.
function hasDiagram(markdown, kind) {
  return extractMermaid(markdown).some((d) => d.kind === kind && EDGES[kind].test(d.body));
}

// The text with every mermaid fence removed — a diagram draws what the prose,
// DDL or tables state; it never stands in for them.
function stripMermaid(markdown) {
  return String(markdown || '').replace(FENCE_RE, '');
}

const squash = (t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');

// The names that appear in no diagram of `kind` — matched case-, space- and
// punctuation-insensitively, so `VenueAdapter[Venue adapter]` covers "Venue adapter".
function missingFromDiagram(markdown, kind, names) {
  const bodies = squash(extractMermaid(markdown).filter((d) => d.kind === kind).map((d) => d.body).join('\n'));
  return names.filter((n) => squash(n) && !bodies.includes(squash(n)));
}

module.exports = { extractMermaid, hasDiagram, missingFromDiagram, stripMermaid, KINDS };

// CLI: list the diagrams in a doc; with --require, exit 1 unless each listed
// kind is present with real edges.
//   node decision-engine/mermaid.js <file.md> [--require component,sequence,er]
if (require.main === module) {
  const { readFileSync } = require('node:fs');
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const reqIdx = args.indexOf('--require');
  const required = reqIdx >= 0 ? String(args[reqIdx + 1] || '').split(',').filter(Boolean) : [];
  const unknown = required.filter((k) => !KINDS[k]);
  if (!file || unknown.length) {
    console.error(`usage: mermaid.js <file.md> [--require ${Object.keys(KINDS).join(',')}]${unknown.length ? ` — unknown kind: ${unknown.join(', ')}` : ''}`);
    process.exit(2);
  }
  let markdown;
  try {
    markdown = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`cannot read ${file}: ${err.message}`);
    process.exit(2);
  }
  for (const d of extractMermaid(markdown)) {
    const ok = d.kind && EDGES[d.kind].test(d.body);
    console.log(`${ok ? 'ok     ' : 'no-edge'} ${d.kind || 'other'}: ${d.header}`);
  }
  const missing = required.filter((k) => !hasDiagram(markdown, k));
  if (missing.length) {
    console.error(`missing diagram: ${missing.join(', ')}`);
    process.exit(1);
  }
}
