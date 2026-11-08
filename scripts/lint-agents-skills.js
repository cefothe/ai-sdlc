// Agent / skill lint — the baseline quality gate for the library as it grows
// (Uber: organic growth to thousands of skills brought duplication, poor
// discovery and inconsistent quality; the fix was enforced lint + automated
// review). Errors fail CI; warnings are reported for the owner to tune.
//
//   errors   unparseable frontmatter · missing name/description · agent name !=
//            file name · skill name != directory · description too short to
//            route on (< 20 chars) · a malformed tools field
//   warnings description without a usage cue ("use when/for…") · thin body ·
//            near-duplicate descriptions (token Jaccard >= 0.8) · a missing
//            context-protocol block (scripts/sync-context-protocol.js)
//
//   node scripts/lint-agents-skills.js [--json]   # exit 1 on errors

const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join, basename } = require('node:path');
const yaml = require('js-yaml');

const ROOT = join(__dirname, '..');
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const USAGE_CUE_RE = /\b(use (it |this )?(when|for|to|after|before)|when (you|the user|asked)|invoke|trigger|for )\b/i;
const MIN_DESCRIPTION = 20;
const MIN_BODY = 200;
const DUPLICATE_JACCARD = 0.8;
// The skills the context protocol is synced into (scripts/sync-context-protocol.js).
const PROTOCOL_SKILL_RE = /^(code|qa|testing)-/;

function tokens(text) {
  return new Set(String(text || '').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []);
}

function jaccard(a, b) {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

function lintDoc({ path, kind, expectedName, text }) {
  const errors = [];
  const warnings = [];
  const m = text.match(FRONTMATTER_RE);
  if (!m) return { path, kind, errors: ['no YAML frontmatter'], warnings, description: '' };
  let fm;
  try {
    fm = yaml.load(m[1]) || {};
  } catch (err) {
    return { path, kind, errors: [`frontmatter is not valid YAML: ${err.message.split('\n')[0]}`], warnings, description: '' };
  }
  const description = typeof fm.description === 'string' ? fm.description.trim() : '';
  if (!fm.name) errors.push('missing name');
  else if (expectedName && String(fm.name) !== expectedName) errors.push(`name "${fm.name}" does not match ${kind === 'agent' ? 'the file name' : 'the directory'} "${expectedName}"`);
  if (!description) errors.push('missing description');
  else if (description.length < MIN_DESCRIPTION) errors.push(`description is ${description.length} chars — too short to route on (< ${MIN_DESCRIPTION})`);
  else if (!USAGE_CUE_RE.test(description)) warnings.push('description has no usage cue ("Use when…", "Use for…") — routing relies on it');
  if (fm.tools !== undefined && !Array.isArray(fm.tools) && typeof fm.tools !== 'string') errors.push('tools must be a list or a comma-separated string');
  const body = m[2] || '';
  if (body.replace(/<!--[\s\S]*?-->/g, '').trim().length < MIN_BODY) warnings.push(`body is under ${MIN_BODY} chars`);
  const needsProtocol = kind === 'agent' || PROTOCOL_SKILL_RE.test(expectedName || '');
  if (needsProtocol && !body.includes('ai-sdlc:context-protocol:begin')) warnings.push('no context-protocol block — run node scripts/sync-context-protocol.js');
  return { path, kind, errors, warnings, description };
}

function collect(root = ROOT) {
  const docs = [];
  const agentsDir = join(root, 'agents');
  for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.md')).sort()) {
    const text = readFileSync(join(agentsDir, f), 'utf8');
    if (!FRONTMATTER_RE.test(text)) continue; // agents/README.md and other non-agent docs
    docs.push({ path: join('agents', f), kind: 'agent', expectedName: basename(f, '.md'), text });
  }
  const skillsDir = join(root, 'skills');
  for (const d of readdirSync(skillsDir).sort()) {
    const file = join(skillsDir, d, 'SKILL.md');
    if (existsSync(file)) docs.push({ path: join('skills', d, 'SKILL.md'), kind: 'skill', expectedName: d, text: readFileSync(file, 'utf8') });
  }
  return docs;
}

function lint(root = ROOT) {
  const results = collect(root).map(lintDoc);
  const agents = results.filter((r) => r.kind === 'agent' && r.description);
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const score = jaccard(tokens(agents[i].description), tokens(agents[j].description));
      if (score >= DUPLICATE_JACCARD) {
        agents[i].warnings.push(`near-duplicate of ${agents[j].path} (description overlap ${score.toFixed(2)}) — merge or sharpen both`);
      }
    }
  }
  return {
    results,
    errors: results.reduce((n, r) => n + r.errors.length, 0),
    warnings: results.reduce((n, r) => n + r.warnings.length, 0),
  };
}

module.exports = { lint, lintDoc, jaccard, tokens };

if (require.main === module) {
  try {
    const report = lint();
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      for (const r of report.results.filter((x) => x.errors.length || x.warnings.length)) {
        console.log(r.path);
        for (const e of r.errors) console.log(`  error   ${e}`);
        for (const w of r.warnings) console.log(`  warning ${w}`);
      }
      console.log(`\n${report.results.length} file(s): ${report.errors} error(s), ${report.warnings} warning(s)`);
    }
    process.exit(report.errors ? 1 : 0);
  } catch (err) {
    console.error(`lint-agents-skills failed: ${err.message}`);
    process.exit(1);
  }
}
