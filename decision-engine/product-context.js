// Product context — the durable, repo-level knowledge the discovery panel
// (PM/PO/CPO/CMO + clarify) needs to write a PRD for THIS product rather than a
// generic one: vision, personas, what already exists, domain vocabulary, metric
// baselines, regulatory constraints and standing non-goals.
//
// The panel agents stay generic (the plugin serves many products); the product
// knowledge lives once, in docs/product/context.md, versioned with the product,
// and is injected at dispatch — the same pattern spec-context uses to feed the
// PRD + design doc to the implementer. Existing PRDs are indexed alongside it
// (and the most related ones rendered in full) so a new PRD reuses personas and
// baselines and does not duplicate or contradict a shipped/planned feature.
//
// Two tiers, like the PRD gate:
//   - ENFORCED: canonical sections present + substantive, >=1 named persona,
//     numeric metric baselines, no placeholder markers. When the doc exists,
//     prd-gate refuses PRDs while it is invalid, and requires each PRD's Target
//     user to name one of its personas and its Success metrics to cite a baseline.
//   - ADVISORY: thin sections.

const { readFileSync, readdirSync, existsSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { parsePrd, extractListItems, isPlaceholderLine } = require('./prd-gate');
const { makeMatcher, findSection: findDocSection, checkSections, markerTokens, structureReasons, appendToSection } = require('./doc-sections');
const { loadDoc, allocate, renderDoc } = require('./doc-budget');

const DEFAULT_CONTEXT_PATH = join('docs', 'product', 'context.md');
const DEFAULT_PRD_DIR = join('docs', 'prd');
const DEFAULT_MAX_CHARS = 16000;
const MAX_RELATED_PRDS = 3;
const MIN_SECTION_CHARS = 30;
const THIN_SECTION_CHARS = 80;

const REQUIRED_SECTIONS = [
  'Vision',
  'Personas',
  'Current capabilities',
  'Glossary',
  'Metric baselines',
  'Regulatory constraints',
  'Non-goals',
];

// Prefix-matched heading aliases ("## Segments & personas" satisfies Personas).
const SECTION_ALIASES = {
  Vision: ['vision', 'strategy', 'mission'],
  Personas: ['personas', 'segments', 'users', 'target users', 'customer segments'],
  'Current capabilities': ['current capabilities', 'capabilities', 'existing features', 'product map', 'features'],
  Glossary: ['glossary', 'domain glossary', 'terminology', 'domain terms', 'vocabulary'],
  'Metric baselines': ['metric baselines', 'baselines', 'metrics', 'kpis', 'current metrics'],
  'Regulatory constraints': ['regulatory', 'compliance', 'constraints', 'legal'],
  'Non-goals': ['non-goals', 'non goals', 'standing non-goals', 'out of scope'],
};

// Budget rank for the discovery prompt: who the users are and what already
// exists matter most when shaping a new feature.
const CONTEXT_PRIORITY = ['Personas', 'Current capabilities', 'Regulatory constraints', 'Metric baselines', 'Glossary', 'Non-goals', 'Vision'];
const RELATED_PRD_PRIORITY = ['Scope', 'Non-goals', 'Target user', 'Acceptance criteria', 'Success metrics', 'Problem'];

const headingMatchesSection = makeMatcher(SECTION_ALIASES);
const findSection = (sections, name) => findDocSection(sections, name, headingMatchesSection);

// Persona names from the Personas section's list items: the **bold** name if
// present, else the text before the first ":" / " — " / " - ".
function personaName(item) {
  const bold = item.match(/\*\*(.+?)\*\*/);
  const raw = bold ? bold[1] : item.split(/:|\s—\s|\s-\s|\s–\s/)[0];
  return raw.trim().replace(/[.*_`]+$/g, '').trim();
}

function extractPersonas(markdown) {
  const sec = findSection(parsePrd(markdown).sections, 'Personas');
  if (!sec) return [];
  return extractListItems(sec.content).map(personaName).filter((n) => n.length >= 2 && !n.startsWith('<'));
}

function evaluateProductContext(markdown, { path = '<product-context>' } = {}) {
  const { sections } = parsePrd(markdown);
  const { missingSections, emptySections, substanceIssues, advisory } = checkSections(sections, REQUIRED_SECTIONS, {
    matches: headingMatchesSection, minChars: MIN_SECTION_CHARS, thinChars: THIN_SECTION_CHARS,
  });
  const markers = markerTokens(markdown);

  const personas = extractPersonas(markdown);
  const personaSec = findSection(sections, 'Personas');
  if (personaSec && personaSec.hasContent && personas.length === 0) {
    substanceIssues.push({ code: 'no-personas', section: 'Personas', message: 'Personas lists no named persona — one list item per persona, e.g. "- **Desk trader**: ..."' });
  }
  const baselines = findSection(sections, 'Metric baselines');
  if (baselines && baselines.hasContent && !/\d/.test(baselines.content)) {
    substanceIssues.push({ code: 'baselines-not-numeric', section: 'Metric baselines', message: 'Metric baselines states no current values — give each metric its number and source' });
  }

  const reasons = [...structureReasons({ missingSections, emptySections, markers }), ...substanceIssues.map((i) => i.message)];
  const valid = reasons.length === 0;
  return { path, valid, missingSections, emptySections, markers, substanceIssues, personas, advisory, reasons };
}

function contextPath(root, rel = DEFAULT_CONTEXT_PATH) {
  return resolve(root, rel);
}

// The repo's product context evaluation, or null when the repo has none.
function evaluateProductContextRoot(root, { path = DEFAULT_CONTEXT_PATH } = {}) {
  const full = contextPath(root, path);
  if (!existsSync(full)) return null;
  return evaluateProductContext(readFileSync(full, 'utf8'), { path });
}

// Index of existing PRDs: { path, featureId, title, status, problem } each.
function listPrds(root, { prdDir = DEFAULT_PRD_DIR } = {}) {
  const dir = resolve(root, prdDir);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.md') || f.startsWith('_') || f.toLowerCase() === 'readme.md') continue;
    try {
      const md = readFileSync(join(dir, f), 'utf8');
      const { frontmatter, sections } = parsePrd(md);
      const title = (md.match(/^#\s+(?:PRD:\s*)?(.+)$/m) || [])[1] || f.replace(/\.md$/, '');
      const problem = (sections.find((s) => s.heading.toLowerCase().startsWith('problem')) || {}).content || '';
      const firstLine = problem.split(/\r?\n/).find((l) => !isPlaceholderLine(l)) || '';
      out.push({
        path: join(prdDir, f),
        featureId: String(frontmatter.featureId || f.replace(/\.md$/, '')),
        title: title.trim(),
        status: String(frontmatter.status || 'unset').toLowerCase(),
        problem: firstLine.trim(),
      });
    } catch {
      /* an unreadable PRD is left out of the index */
    }
  }
  return out;
}

// The PRDs most related to the feature idea: >= minOverlap shared significant
// terms with its title + problem, top `max` by overlap.
function selectRelatedPrds(prds, idea, { max = MAX_RELATED_PRDS, minOverlap = 2, exclude } = {}) {
  const { terms } = require('./decisions');
  const ideaTerms = terms(idea);
  return prds
    .filter((p) => p.featureId !== exclude)
    .map((p) => {
      let overlap = 0;
      for (const t of terms(`${p.title} ${p.featureId.replace(/-/g, ' ')} ${p.problem}`)) if (ideaTerms.has(t)) overlap++;
      return { p, overlap };
    })
    .filter((x) => x.overlap >= minOverlap)
    .sort((a, b) => b.overlap - a.overlap || a.p.featureId.localeCompare(b.p.featureId))
    .slice(0, max)
    .map((x) => x.p);
}

// Load everything the discovery panel gets for a feature idea.
function loadProductContextForIdea(root, idea, { path = DEFAULT_CONTEXT_PATH, prdDir = DEFAULT_PRD_DIR, exclude } = {}) {
  const full = contextPath(root, path);
  const context = existsSync(full) ? loadDoc(full, root, CONTEXT_PRIORITY, headingMatchesSection) : null;
  const evaluation = context ? evaluateProductContext(readFileSync(full, 'utf8'), { path }) : null;
  const prds = listPrds(root, { prdDir });
  const related = selectRelatedPrds(prds, idea, { exclude }).map((p) =>
    loadDoc(resolve(root, p.path), root, RELATED_PRD_PRIORITY, (h, n) => h.toLowerCase().startsWith(n.toLowerCase())));
  return { context, evaluation, prds, related };
}

function formatProductContext({ context, evaluation, prds, related }, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const out = [
    'PRODUCT CONTEXT — ground the PRD in THIS product, not a generic one.',
    '- Target user must be one of the personas below (or argue explicitly for a new one).',
    '- Success metrics move a listed baseline: state baseline → target.',
    '- Use the glossary terms; respect the regulatory constraints and standing non-goals.',
    '- Do not duplicate or contradict an existing capability or PRD — extend it, or say why not.',
  ];
  if (!context) {
    out.push('', `(no product context doc at ${DEFAULT_CONTEXT_PATH} — ask the operator for personas, baselines and constraints, and recommend creating it)`);
  } else if (evaluation && !evaluation.valid) {
    out.push('', `WARNING: ${context.path} is incomplete (${evaluation.reasons.join('; ')}). PRDs cannot be approved until it is fixed.`);
  }
  const docs = [];
  if (context) docs.push({ key: 'context', doc: context });
  related.forEach((d, i) => docs.push({ key: `related-${i}`, doc: d }));
  const indexText = prds.length
    ? ['', '### Existing PRDs (index)', ...prds.map((p) => `- ${p.featureId} [${p.status}] — ${p.title}${p.problem ? `: ${p.problem}` : ''}`)].join('\n')
    : '';
  const { admitted, dropped } = allocate(docs, Math.max(0, maxChars - indexText.length));
  if (context) out.push('', renderDoc('Product context', context, admitted.get('context'), dropped.get('context')));
  related.forEach((d, i) => out.push('', renderDoc('Related PRD', d, admitted.get(`related-${i}`), dropped.get(`related-${i}`))));
  if (indexText) out.push(indexText);
  return out.join('\n');
}

// When a feature ships, the product context's Current capabilities gains it —
// written in the task's worktree so the line rides the feature's own PR.
// Idempotent (keyed by the PRD path); returns { recorded, reason }.
function recordShippedCapability(root, { title, prdPath, taskId }) {
  const file = join(root, DEFAULT_CONTEXT_PATH);
  if (!existsSync(file)) return { recorded: false, reason: `no ${DEFAULT_CONTEXT_PATH}` };
  const markdown = readFileSync(file, 'utf8');
  const sec = findSection(parsePrd(markdown).sections, 'Current capabilities');
  if (!sec) return { recorded: false, reason: 'no Current capabilities section' };
  if (sec.content.includes(prdPath)) return { recorded: false, reason: 'already recorded' };
  const line = `- ${title} — ${prdPath} (shipped in ${taskId})`;
  writeFileSync(file, appendToSection(markdown, (h) => headingMatchesSection(h, 'Current capabilities'), [line]));
  return { recorded: true, line };
}

module.exports = {
  recordShippedCapability,
  evaluateProductContext, evaluateProductContextRoot, extractPersonas, listPrds, selectRelatedPrds,
  loadProductContextForIdea, formatProductContext, headingMatchesSection,
  REQUIRED_SECTIONS, SECTION_ALIASES, DEFAULT_CONTEXT_PATH,
};

// CLI:
//   node decision-engine/product-context.js "<feature idea>" [--max-chars N] [--exclude <featureId>]
//   node decision-engine/product-context.js --validate
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined; };
  try {
    if (args.includes('--validate')) {
      const res = evaluateProductContextRoot(process.cwd());
      if (!res) {
        console.log(JSON.stringify({ path: DEFAULT_CONTEXT_PATH, exists: false, valid: false, reasons: ['no product context doc — copy docs/product/_template.md'] }, null, 2));
        process.exit(2);
      }
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.valid ? 0 : 2);
    }
    const idea = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).join(' ');
    const maxChars = flag('max-chars') ? Number(flag('max-chars')) : DEFAULT_MAX_CHARS;
    if (!idea || !Number.isFinite(maxChars) || maxChars <= 0) {
      console.error('usage: product-context "<feature idea>" [--max-chars N] [--exclude <featureId>] | --validate');
      process.exit(1);
    }
    console.log(formatProductContext(loadProductContextForIdea(process.cwd(), idea, { exclude: flag('exclude') }), { maxChars }));
    process.exit(0);
  } catch (err) {
    console.error(`product-context failed: ${err.message}`);
    process.exit(1);
  }
}
