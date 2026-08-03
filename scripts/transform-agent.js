#!/usr/bin/env node
/**
 * Adds promise headers to agent markdown definition files.
 * Usage: node scripts/transform-agent.js agents/code-analyzer.md
 *
 * Reads existing frontmatter, adds promises_offered and promises_accepted
 * based on the agent's tools field (not keyword heuristics).
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('Usage: node transform-agent.js <agent.md>'); process.exit(1); }

const content = fs.readFileSync(file, 'utf8');
const name = path.basename(file, '.md');

// Parse existing frontmatter (multiline-safe)
const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/m);
if (!fmMatch) { console.error(`No frontmatter in ${file}`); process.exit(1); }

const frontmatter = fmMatch[1];
const body = content.slice(fmMatch[0].length);

// Idempotency: skip if already transformed
if (frontmatter.includes('promises_offered')) {
  console.log(`Skipping ${file} — already has promise headers`);
  process.exit(0);
}

// Determine agent type from tools field (not keyword heuristics)
// Agents with Write/Edit/Bash produce code; Read-only agents do analysis
const toolsMatch = frontmatter.match(/tools:\s*\[([^\]]*)\]/i);
const tools = toolsMatch ? toolsMatch[1] : '';
const producesCode = /Write|Edit|Bash/i.test(tools);
const producesAnalysis = /Read|Grep|Glob/i.test(tools);

// Build universal promises (all agents make these)
const promiseLines = [
  'promises_offered:',
  '  - id: complete-output',
  '    declaration: "I will produce complete output with zero TODO/FIXME markers"',
  '    verification: { method: grep, confidence: high, pattern: "TODO|FIXME|HACK" }',
  '  - id: context-awareness',
  '    declaration: "I will reference project context in my output"',
  '    verification: { method: output_contains, confidence: low, check: "CLAUDE.md" }',
];

// Add code-specific promises only for agents that can write code
if (producesCode) {
  promiseLines.push(
    '  - id: tested-code',
    '    declaration: "I will include tests for all code I produce"',
    '    verification: { method: file_check, confidence: high, check: "test file exists" }',
    '  - id: error-handling',
    '    declaration: "I will include error handling in all code"',
    '    verification: { method: output_contains, confidence: medium, check: "catch|throw|Error" }',
  );
}

if (producesAnalysis && !producesCode) {
  promiseLines.push(
    '  - id: actionable-output',
    '    declaration: "I will provide specific file:line references for all findings"',
    '    verification: { method: output_contains, confidence: medium, check: ":" }',
  );
}

promiseLines.push(
  'promises_accepted:',
  '  - "I accept the task description and context provided"',
  '  - "I accept independent verification of my output"',
);

// Reconstruct file with clean newline handling
const newFrontmatter = `---\n${frontmatter}\n${promiseLines.join('\n')}\n---`;
const newContent = newFrontmatter + body;

fs.writeFileSync(file, newContent, 'utf8');
console.log(`Updated ${file} with promise headers`);
