#!/usr/bin/env node
/**
 * Transforms obligation-based protocol YAML files into promise-specification format.
 * Usage: node scripts/transform-protocol.js protocols/first-time-right.yaml
 *
 * This generates a STARTING POINT. Each protocol MUST be hand-reviewed and tuned
 * after transformation.
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('Usage: node transform-protocol.js <protocol.yaml>'); process.exit(1); }

const content = fs.readFileSync(file, 'utf8');
const name = path.basename(file, '.yaml');

// Idempotency: skip if output already exists
const outFile = file.replace('.yaml', '.promise.yaml');
if (fs.existsSync(outFile)) {
  console.log(`Skipping ${file} — ${outFile} already exists`);
  process.exit(0);
}

// Extract key behavioral requirements from the obligation text
// Cap at 5 MUST + 3 NEVER to keep promise sets focused
const mustPatterns = content.match(/MUST\s+[^"'\n]+/gi) || [];
const neverPatterns = content.match(/NEVER\s+[^"'\n]+/gi) || [];
const zeroPatterns = content.match(/ZERO\s+[^"'\n]+/gi) || [];

const escapeQuotes = (s) => s.replace(/"/g, '\\"');

const promises = [];
let id = 1;

for (const must of mustPatterns.slice(0, 5)) {
  const cleaned = must.replace(/^MUST\s+/i, '').replace(/[.;,]+$/, '').trim();
  promises.push({
    id: `${name}-${id++}`,
    direction: '+b',
    declaration: `I will ${escapeQuotes(cleaned.toLowerCase())}`,
    confidence: 'medium',
  });
}

for (const never of neverPatterns.slice(0, 3)) {
  const cleaned = never.replace(/^NEVER\s+/i, '').replace(/[.;,]+$/, '').trim();
  promises.push({
    id: `${name}-${id++}`,
    direction: '+b',
    declaration: `I will not ${escapeQuotes(cleaned.toLowerCase())}`,
    confidence: 'medium',
  });
}

// ZERO patterns are treated as high-importance negative promises
for (const zero of zeroPatterns.slice(0, 2)) {
  const cleaned = zero.replace(/^ZERO\s+/i, '').replace(/[.;,]+$/, '').trim();
  promises.push({
    id: `${name}-${id++}`,
    direction: '+b',
    declaration: `I will ensure zero ${escapeQuotes(cleaned.toLowerCase())}`,
    confidence: 'medium',
  });
}

const output = `# ${name} — Promise Specification
# Transformed from obligation-based protocol. REVIEW AND TUNE before use.
name: ${name}
type: promise-specification

promises:
${promises.map(p => `  - id: ${p.id}
    direction: ${p.direction}
    declaration: "${p.declaration}"
    observable_by:
      - method: output_contains  # TUNE: select correct verification method
        confidence: ${p.confidence}  # TUNE: set to high/medium/low based on verifiability
        check: "FILL_IN"  # TUNE: specific verifiable criterion
`).join('\n')}
acceptance:
  - id: ${name}-accept-verification
    direction: -b
    declaration: "I accept independent verification of these promises"

consequences:
  kept:
    trust_increment: 0.05  # TUNE per promise importance
  broken:
    trust_decrement: 0.15  # TUNE per promise importance
`;

fs.writeFileSync(outFile, output, 'utf8');
console.log(`Wrote ${outFile} — REVIEW AND TUNE before replacing original`);
