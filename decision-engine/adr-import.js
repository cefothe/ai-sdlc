// Import EXISTING ADRs from a brownfield repo into the Decision store.
//
// Many repos already keep Architecture Decision Records as markdown (Nygard /
// MADR format) under docs/adr, doc/adr, docs/decisions, etc. This module finds
// those files, parses their Title/Status/Context/Decision/Consequences, and
// converts each into a Decision resource (.ai-sdlc/_decisions/DEC-NNNN.yaml) so
// they become first-class, queryable, and enforceable references — the same
// records the DoR gate checks links against.
//
// Provenance goes in the body (Decision.metadata.source is a closed enum and
// metadata is additionalProperties:false), and the ADR's status maps to the
// Decision lifecycle.

const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');
const { newDecision, answerDecision, writeDecision, nextId } = require('./decisions');

const ADR_DIRS = ['docs/adr', 'docs/adrs', 'docs/decisions', 'doc/adr', 'adr', 'architecture/decisions'];

// status text -> Decision lifecycle
function mapStatus(statusText) {
  const s = String(statusText || '').toLowerCase();
  if (s.includes('accept')) return 'answered';
  if (s.includes('supersed')) return 'superseded';
  if (s.includes('deprecat') || s.includes('reject')) return 'archived';
  if (s.includes('propos')) return 'proposed';
  return 'proposed';
}

// Find candidate ADR markdown files in the known locations.
function findAdrFiles(root) {
  const out = [];
  for (const rel of ADR_DIRS) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (/\.md$/i.test(f) && statSync(full).isFile() && !/^readme/i.test(f)) out.push(full);
    }
  }
  return out;
}

// Parse an ADR markdown into { title, status, sections }.
function parseAdr(markdown) {
  const lines = markdown.split(/\r?\n/);
  let title = '';
  const sections = {};
  let current = null;
  let buf = [];
  const flush = () => { if (current) sections[current] = buf.join('\n').trim(); buf = []; };
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    if (h1 && !title) { title = h1[1].replace(/^\d+[.\)]?\s*/, '').trim(); continue; }
    if (h2) { flush(); current = h2[1].trim().toLowerCase(); continue; }
    if (current) buf.push(line);
  }
  flush();
  const status = (sections.status || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || '';
  return { title: title || '(untitled ADR)', status, sections };
}

// Convert a parsed ADR + its origin path into a Decision resource.
function adrToDecision(parsed, { id, originPath, created }) {
  const decisionText = parsed.sections.decision || parsed.title;
  const bodyParts = [`Imported from \`${originPath}\`.`];
  for (const key of ['context', 'decision', 'consequences']) {
    if (parsed.sections[key]) bodyParts.push(`## ${key[0].toUpperCase()}${key.slice(1)}\n${parsed.sections[key]}`);
  }
  const lifecycle = mapStatus(parsed.status);
  const decision = newDecision({
    id,
    summary: parsed.title,
    body: bodyParts.join('\n\n'),
    source: 'ad-hoc',
    options: [{ id: 'as-recorded', description: decisionText.slice(0, 500) }],
    lifecycle: lifecycle === 'answered' ? 'proposed' : lifecycle,
    created,
  });
  if (lifecycle === 'answered') answerDecision(decision, { optionId: 'as-recorded', answeredBy: 'imported-adr', answeredAt: created });
  return decision;
}

// Import all discovered ADRs. Returns { imported: [{id,path,title,lifecycle}] }.
function importAdrs(root, { created = '', startId } = {}) {
  const files = findAdrFiles(root);
  const imported = [];
  let n = startId ? parseInt(String(startId).replace(/^DEC-/, ''), 10) : parseInt(nextId(root).replace('DEC-', ''), 10);
  for (const file of files) {
    let parsed;
    try {
      parsed = parseAdr(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const id = `DEC-${String(n).padStart(4, '0')}`;
    const decision = adrToDecision(parsed, { id, originPath: relative(root, file), created });
    writeDecision(root, decision);
    imported.push({ id, path: relative(root, file), title: parsed.title, lifecycle: decision.status.lifecycle });
    n += 1;
  }
  return { imported };
}

module.exports = { importAdrs, findAdrFiles, parseAdr, adrToDecision, mapStatus, ADR_DIRS };
