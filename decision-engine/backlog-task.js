// Backlog task parser — reads the frontmatter + body of a task markdown file
// (backlog/tasks/<ID> - <slug>.md). Mirrors the reference frontmatter contract
// (id/title/status/dispatchable/blocked/references/dependencies/priority/
// targetRepo) and extracts acceptance criteria from either an AC-marker block
// (<!-- AC:BEGIN --> ... <!-- AC:END -->) or an "## Acceptance Criteria" section.

const { readFileSync } = require('node:fs');
const yaml = require('js-yaml');

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const AC_BLOCK_RE = /<!--\s*AC:BEGIN\s*-->([\s\S]*?)<!--\s*AC:END\s*-->/i;
const AC_HEADING_RE = /^##+\s*Acceptance Criteria\s*$/im;
const AC_ITEM_RE = /^\s*-\s*\[( |x|X)\]\s*(.+?)\s*$/;

// Extract the checkbox AC items from a chunk of markdown.
function parseAcItems(chunk) {
  const items = [];
  for (const line of chunk.split(/\r?\n/)) {
    const m = line.match(AC_ITEM_RE);
    if (m) items.push({ checked: m[1].toLowerCase() === 'x', text: m[2].trim() });
  }
  return items;
}

// Pull the AC section out of the body, preferring the marker block.
function extractAcceptanceCriteria(body) {
  const block = body.match(AC_BLOCK_RE);
  if (block) return parseAcItems(block[1]);
  const heading = body.match(AC_HEADING_RE);
  if (heading) {
    // Take everything from the heading to the next heading (or EOF).
    const rest = body.slice(heading.index + heading[0].length);
    const nextHeading = rest.search(/^##+\s+/m);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    return parseAcItems(section);
  }
  return [];
}

// Parse raw markdown into a structured task. Throws on malformed frontmatter.
function parseTask(markdown) {
  // Strip a leading BOM / whitespace so the ^--- frontmatter anchor still matches.
  const m = markdown.replace(/^\s+/, '').match(FRONTMATTER_RE);
  if (!m) {
    throw new Error('backlog task is missing a leading --- frontmatter --- block');
  }
  let frontmatter;
  try {
    frontmatter = yaml.load(m[1]) || {};
  } catch (err) {
    throw new Error(`backlog task frontmatter is not valid YAML: ${err.message}`);
  }
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('backlog task frontmatter must be a YAML mapping');
  }
  const body = m[2] || '';
  return {
    frontmatter,
    body,
    acceptanceCriteria: extractAcceptanceCriteria(body),
    raw: markdown,
  };
}

// Read + parse a task file from disk.
function loadTaskFile(path) {
  return parseTask(readFileSync(path, 'utf8'));
}

module.exports = { parseTask, loadTaskFile, extractAcceptanceCriteria, parseAcItems };
