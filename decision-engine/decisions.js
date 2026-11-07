// Decision (ADR) store. Architectural decisions are first-class, immutable,
// queryable records — not prose scattered in wikis. Each is a Decision resource
// (spec/schemas/decision.v1.schema.json) stored as .ai-sdlc/_decisions/<id>.yaml.
//
// Lifecycle: proposed -> open -> answered (or deferred/superseded/archived).
// The operator decides; the framework records the decision + who made it + when,
// so every downstream task can reference it and the DoR gate can check the link
// resolves. This is the ADR half of "documented as references".
//
// Clock-free by design (caller injects `created`/`now`) so it's deterministic
// under test; the CLI supplies real time.

const { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const STORE_REL = join('.ai-sdlc', '_decisions');
const LIFECYCLES = ['proposed', 'open', 'deferred', 'answered', 'superseded', 'archived'];
const ID_RE = /^DEC-(\d{4})$/;

function storeDir(root) {
  return join(root, STORE_REL);
}

// Compute the next DEC-NNNN id from existing records.
function nextId(root) {
  const dir = storeDir(root);
  let max = 0;
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = f.match(/^DEC-(\d{4})\.ya?ml$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return `DEC-${String(max + 1).padStart(4, '0')}`;
}

// Build a schema-valid Decision object. Throws on missing required inputs.
const CONFIDENCE = ['high', 'medium', 'low'];

function newDecision({ id, summary, options, body, source = 'ad-hoc', scope = 'project', reversible = true, lifecycle = 'proposed', created, updated, priority, context, rationale, consequences, confidence }) {
  if (!id || !ID_RE.test(id)) throw new Error('decision id must match DEC-NNNN');
  if (!summary || typeof summary !== 'string') throw new Error('decision requires a summary');
  if (!Array.isArray(options) || options.length < 1) throw new Error('decision requires at least one option');
  for (const o of options) {
    if (!o || !o.id || !o.description) throw new Error('each option needs id + description');
  }
  if (!LIFECYCLES.includes(lifecycle)) throw new Error(`unknown lifecycle "${lifecycle}"`);
  if (confidence !== undefined && !CONFIDENCE.includes(confidence)) throw new Error(`confidence must be one of ${CONFIDENCE.join('/')}`);
  const ts = created || '';
  const decision = {
    apiVersion: 'ai-sdlc.io/v1alpha1',
    kind: 'Decision',
    metadata: { id, source, scope, created: ts, updated: updated || ts },
    spec: { summary, reversible, options },
    status: { lifecycle },
  };
  // Canonical ADR sections (Fowler/AWS/Nygard) — optional in the schema but the
  // gate warns when absent, so a decision is not anemic: Context (the forces),
  // Decision rationale, Consequences (trade-offs), and a confidence level.
  if (body) decision.spec.body = body;
  if (context) decision.spec.context = context;
  if (rationale) decision.spec.rationale = rationale;
  if (consequences) decision.spec.consequences = consequences;
  if (confidence) decision.spec.confidence = confidence;
  if (priority !== undefined) decision.spec.priority = priority;
  return decision;
}

// Enrich an existing ADR with reasoning it lacks — append-only, for migrating
// decisions recorded before the completeness rules. Only ABSENT fields are
// filled and only undescribed options described; anything already recorded is
// never overwritten (that would be a new decision, which supersedes instead).
// Throws when an amendment would overwrite, so the caller sees the conflict.
function amendDecision(decision, { context, rationale, consequences, confidence, addOptions = [], describeOptions = {}, amendedAt } = {}) {
  const spec = decision.spec;
  const filled = [];
  for (const [key, value] of Object.entries({ context, rationale, consequences, confidence })) {
    if (value === undefined || value === null || value === '') continue;
    if (spec[key] && String(spec[key]).trim()) throw new Error(`${decision.metadata.id}: ${key} is already recorded — amend fills gaps only`);
    if (key === 'confidence' && !CONFIDENCE.includes(value)) throw new Error(`confidence must be one of ${CONFIDENCE.join('/')}`);
    spec[key] = value;
    filled.push(key);
  }
  spec.options = spec.options || [];
  for (const [id, description] of Object.entries(describeOptions)) {
    const opt = spec.options.find((o) => o.id === id);
    if (!opt) throw new Error(`${decision.metadata.id}: no option "${id}" to describe`);
    if (opt.description && String(opt.description).trim() !== String(opt.id).trim()) throw new Error(`${decision.metadata.id}: option "${id}" already has a description`);
    opt.description = description;
    filled.push(`option:${id}`);
  }
  for (const o of addOptions) {
    if (!o || !o.id || !o.description) throw new Error('each added option needs id + description');
    if (spec.options.some((x) => x.id === o.id)) throw new Error(`${decision.metadata.id}: option "${o.id}" already exists`);
    spec.options.push({ id: o.id, description: o.description });
    filled.push(`+option:${o.id}`);
  }
  if (filled.length) {
    decision.metadata.updated = amendedAt || decision.metadata.updated;
    decision.metadata.amendments = [...(decision.metadata.amendments || []), { at: amendedAt || '', filled }];
  }
  return { decision, filled };
}

// Mark a decision answered with the chosen option.
function answerDecision(decision, { optionId, answeredBy, answeredAt }) {
  const known = (decision.spec.options || []).some((o) => o.id === optionId);
  if (!known) throw new Error(`option "${optionId}" is not one of this decision's options`);
  decision.status.lifecycle = 'answered';
  decision.status.answeredOptionId = optionId;
  decision.status.answeredBy = answeredBy || null;
  decision.status.answeredAt = answeredAt || null;
  decision.metadata.updated = answeredAt || decision.metadata.updated;
  return decision;
}

function writeDecision(root, decision) {
  const dir = storeDir(root);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${decision.metadata.id}.yaml`);
  writeFileSync(file, yaml.dump(decision, { lineWidth: 100 }));
  return file;
}

function loadDecision(root, id) {
  const file = join(storeDir(root), `${id}.yaml`);
  if (!existsSync(file)) throw new Error(`decision ${id} not found`);
  return yaml.load(readFileSync(file, 'utf8'));
}

function listDecisions(root, { lifecycle } = {}) {
  const dir = storeDir(root);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(f)) continue;
    try {
      const d = yaml.load(readFileSync(join(dir, f), 'utf8'));
      if (d && d.kind === 'Decision') out.push(d);
    } catch {
      /* skip unparseable */
    }
  }
  const filtered = lifecycle ? out.filter((d) => d.status && d.status.lifecycle === lifecycle) : out;
  return filtered.sort((a, b) => a.metadata.id.localeCompare(b.metadata.id));
}

// Select the ADRs an implementer must honor for a task. Excludes non-
// constraining lifecycles (open/deferred/superseded/archived). This is the seam
// that turns recorded design decisions into IMPLEMENTATION context, not just an
// admission gate — "look at the ADRs for references" at build time.
//
// Relevance filter. Injecting EVERY project-scope ADR into every plan /
// implementer / parallel-worker / retry prompt does not scale: a repo with ~100
// project ADRs pays ~10k tokens per dispatch, most of them about unrelated
// features. A project-scope decision is kept when it is:
//   - referenced by the task (DEC id in refs/references/specRef/description/ACs/body)
//   - foundational — not sourced from a specific feature's design session
//     (metadata.source other than `design:<slug>`, e.g. design-panel, ad-hoc)
//   - from the task's own feature (`design:<slug>` where the slug is the task's
//     feature / a referenced docs/design|prd/<slug>.md / a referenced DEC's feature)
//   - lexically related: shares >= minOverlap significant terms with the task
//     (top maxRelated by overlap)
// Everything else is OMITTED — returned separately so the prompt can list the ids
// (cheap) and the agent can open one if its change reaches that area.
// `relevance: false` restores the legacy "all project-scope" behavior.
const IMPLEMENTATION_LIFECYCLES = ['proposed', 'answered'];
const FEATURE_SOURCE_RE = /^design:(.+)$/;
const DOC_SLUG_RE = /docs\/(?:design|prd)\/([^/\s]+?)\.md/g;
const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'these', 'those',
  'when', 'where', 'which', 'while', 'will', 'would', 'should', 'could', 'must', 'have', 'been', 'being',
  'each', 'every', 'only', 'also', 'more', 'most', 'other', 'over', 'under', 'per', 'via', 'and', 'the',
  'for', 'not', 'are', 'but', 'any', 'all', 'one', 'two', 'use', 'used', 'uses', 'using', 'task', 'decision',
  'never', 'always', 'none', 'material', 'reference', 'implement', 'implementation', 'support', 'existing',
  'epic', 'superseded', 'done', 'todo',
]);

function terms(text) {
  const out = new Set();
  for (const w of String(text || '').toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || []) {
    if (!STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

function featureOf(decision) {
  const m = FEATURE_SOURCE_RE.exec(((decision && decision.metadata) || {}).source || '');
  return m ? m[1] : null;
}

function taskBlob(task) {
  const fm = (task && task.frontmatter) || {};
  return JSON.stringify([fm.refs, fm.references, fm.specRef, fm.description, fm.feature, task.acceptanceCriteria, task.body]);
}

// Feature slugs are interpolated into a docs/design/<slug>.md path; anything
// that is not a plain kebab/word slug (e.g. "../x") is ignored.
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9_.-]*$/i;

// DEC ids the feature's design doc links. The design doc is where a feature's
// ADRs — including feature-scope ones — are listed, so they are the decisions
// the task implements even when the task file never names them.
function designLinkedDecisionIds(root, features, designDir) {
  const ids = new Set();
  for (const slug of features) {
    if (!SAFE_SLUG_RE.test(slug) || slug.includes('..')) continue;
    const file = join(root, designDir, `${slug}.md`);
    if (!existsSync(file)) continue;
    try {
      for (const m of readFileSync(file, 'utf8').match(/\bDEC-\d{4}\b/g) || []) ids.add(m);
    } catch {
      /* unreadable design doc contributes no links */
    }
  }
  return ids;
}

function partitionDecisionsForTask(root, task = {}, { lifecycles = IMPLEMENTATION_LIFECYCLES, relevance = true, minOverlap = 3, maxRelated = 15, designDir = join('docs', 'design') } = {}) {
  const live = listDecisions(root).filter((d) => d.status && lifecycles.includes(d.status.lifecycle));
  const fm = (task && task.frontmatter) || {};
  const blob = taskBlob(task);
  const referenced = new Set(blob.match(/DEC-\d{4}/g) || []);
  const isReferenced = (d) => referenced.has((d.metadata || {}).id);

  const features = new Set();
  if (fm.feature) features.add(String(fm.feature));
  if (fm.specRef && fm.specRef.featureId) features.add(String(fm.specRef.featureId));
  for (const m of blob.matchAll(DOC_SLUG_RE)) features.add(m[1]);
  for (const d of live) if (isReferenced(d) && featureOf(d)) features.add(featureOf(d));
  for (const id of designLinkedDecisionIds(root, features, designDir)) referenced.add(id);

  const candidates = live.filter((d) => (d.metadata || {}).scope === 'project' || isReferenced(d));
  // Primary = the decisions this task directly implements (named by the task or
  // its design doc, or recorded by its own feature's design session). These get
  // full detail in the prompt; the rest are rendered as one-line constraints.
  const isPrimary = (d) => isReferenced(d) || (featureOf(d) !== null && features.has(featureOf(d)));
  const byId = (a, b) => a.metadata.id.localeCompare(b.metadata.id);
  const primaryIds = (list) => list.filter(isPrimary).map((d) => d.metadata.id);
  if (!relevance) return { selected: candidates.sort(byId), omitted: [], primary: primaryIds(candidates) };

  const taskTerms = terms([fm.title, (fm.labels || []).join(' '), blob].join(' '));
  const selected = [];
  const related = [];
  const omitted = [];
  for (const d of candidates) {
    const feature = featureOf(d);
    if (isReferenced(d) || !feature || features.has(feature)) {
      selected.push(d);
      continue;
    }
    const s = d.spec || {};
    let overlap = 0;
    for (const t of terms([s.summary, s.context].join(' '))) if (taskTerms.has(t)) overlap++;
    if (overlap >= minOverlap) related.push({ d, overlap });
    else omitted.push(d);
  }
  related.sort((a, b) => b.overlap - a.overlap || a.d.metadata.id.localeCompare(b.d.metadata.id));
  selected.push(...related.slice(0, maxRelated).map((r) => r.d));
  omitted.push(...related.slice(maxRelated).map((r) => r.d));

  selected.sort(byId);
  return { selected, omitted: omitted.sort(byId), primary: primaryIds(selected) };
}

// ADR substance check — the reasoning a decision must carry to be usable as an
// implementation constraint: the forces (context), why this option (rationale),
// the trade-offs accepted (consequences), and the alternatives considered (>=2
// options, each described so a rejected one says why it lost). Each section may
// live in its spec field or as a "## <Heading>" section of spec.body (imported
// and hand-written ADRs use the body form).
const ADR_SECTIONS = {
  context: ['context'],
  rationale: ['rationale', 'decision'],
  consequences: ['consequences'],
};

function bodySection(body, heading) {
  const re = new RegExp(`^#{2,}\\s+${heading}\\b[^\\n]*\\n([\\s\\S]*?)(?=^#{2,}\\s|(?![\\s\\S]))`, 'im');
  const m = String(body || '').match(re);
  return m ? m[1].trim() : '';
}

function adrSectionText(decision, key) {
  const spec = (decision && decision.spec) || {};
  if (spec[key] && String(spec[key]).trim()) return String(spec[key]).trim();
  for (const h of ADR_SECTIONS[key]) {
    const t = bodySection(spec.body, h);
    if (t) return t;
  }
  return '';
}

function evaluateAdrQuality(decision) {
  const spec = (decision && decision.spec) || {};
  const id = ((decision && decision.metadata) || {}).id || '<unknown>';
  const issues = [];
  for (const key of Object.keys(ADR_SECTIONS)) {
    if (!adrSectionText(decision, key)) issues.push(`${id}: missing ${key}`);
  }
  const options = Array.isArray(spec.options) ? spec.options : [];
  if (options.length < 2) issues.push(`${id}: ${options.length} option(s) — record at least one rejected alternative`);
  for (const o of options) {
    // The CLI falls back to description = id when none is given ("a" or "a:"),
    // which records the option's name but not why it won or lost.
    if (!o || !o.description || String(o.description).trim() === String(o.id).trim()) {
      issues.push(`${id}: option "${o && o.id}" has no description of why it was chosen/rejected`);
    }
  }
  const chosen = decision && decision.status && decision.status.answeredOptionId;
  if (chosen && !options.some((o) => o && o.id === chosen)) issues.push(`${id}: chosen option "${chosen}" is not among its options`);
  return { id, valid: issues.length === 0, issues };
}

function selectDecisionsForTask(root, task = {}, opts = {}) {
  return partitionDecisionsForTask(root, task, opts).selected;
}

module.exports = { newDecision, amendDecision, answerDecision, writeDecision, loadDecision, listDecisions, selectDecisionsForTask, partitionDecisionsForTask, evaluateAdrQuality, adrSectionText, terms, nextId, storeDir, STORE_REL, LIFECYCLES, IMPLEMENTATION_LIFECYCLES };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const root = process.cwd();
  const now = new Date().toISOString();
  function flag(name, def) {
    const i = rest.indexOf(`--${name}`);
    // Guard the trailing-flag-with-no-value case: rest[i+1] would be undefined
    // and override the default (later `.split` on it throws).
    return i >= 0 && i + 1 < rest.length ? rest[i + 1] : def;
  }
  try {
    if (cmd === 'new') {
      const summary = flag('summary');
      const optsRaw = flag('options', '');
      const options = optsRaw.split(',').filter(Boolean).map((pair) => {
        const [id, ...d] = pair.split(':');
        return { id: id.trim(), description: (d.join(':') || id).trim() };
      });
      const id = flag('id') || nextId(root);
      const decision = newDecision({
        id, summary, options,
        body: flag('body'), context: flag('context'), rationale: flag('rationale'),
        consequences: flag('consequences'), confidence: flag('confidence'),
        source: flag('source', 'ad-hoc'), scope: flag('scope', 'project'), created: now,
      });
      const file = writeDecision(root, decision);
      console.log(`created ${id} -> ${file}`);
      // Anemic ADRs are recorded (the store is append-only) but a design that
      // links one fails design-gate / DoR gate 9 — say so now, not at dispatch.
      const quality = evaluateAdrQuality(decision);
      if (!quality.valid) console.error(`warning: ${id} would fail the design gate: ${quality.issues.join('; ')}. Re-record it with --context/--rationale/--consequences and >=2 described --options.`);
      if (!decision.spec.confidence) console.error(`note: ${id} has no --confidence.`);
    } else if (cmd === 'amend') {
      const id = flag('id');
      if (!id) throw new Error('amend requires --id DEC-NNNN');
      const pairs = (raw) => (raw || '').split(',').filter(Boolean).map((pair) => {
        const [oid, ...d] = pair.split(':');
        return { id: oid.trim(), description: d.join(':').trim() };
      });
      const describeOptions = Object.fromEntries(pairs(flag('describe')).map((o) => [o.id, o.description]));
      const { decision, filled } = amendDecision(loadDecision(root, id), {
        context: flag('context'), rationale: flag('rationale'), consequences: flag('consequences'), confidence: flag('confidence'),
        addOptions: pairs(flag('add-options')), describeOptions, amendedAt: now,
      });
      writeDecision(root, decision);
      const quality = evaluateAdrQuality(decision);
      console.log(`amended ${id}: ${filled.join(', ') || 'nothing to fill'}${quality.valid ? ' — now complete' : ` — still incomplete: ${quality.issues.join('; ')}`}`);
    } else if (cmd === 'list') {
      const rows = listDecisions(root, { lifecycle: flag('lifecycle') });
      if (rows.length === 0) console.log('no decisions recorded yet.');
      for (const d of rows) console.log(`${d.metadata.id}  [${d.status.lifecycle}]  ${d.spec.summary}`);
      console.log(`\n${rows.length} decision(s) in ${storeDir(root)}`);
    } else if (cmd === 'import') {
      const { importAdrs } = require('./adr-import');
      const { imported } = importAdrs(root, { created: now });
      for (const a of imported) console.log(`imported ${a.id} [${a.lifecycle}] <- ${a.path}`);
      console.log(`\n${imported.length} existing ADR(s) imported.`);
    } else if (cmd === 'detect') {
      const { proposeArchitectureAdrs } = require('./adr-detect');
      const { proposed } = proposeArchitectureAdrs(root, { created: now });
      for (const p of proposed) console.log(`proposed ${p.id} [${p.area}] ${p.summary}  (evidence: ${p.evidence})`);
      console.log(`\n${proposed.length} ADR(s) proposed from code — ratify with 'decisions list --lifecycle proposed'.`);
    } else if (cmd === 'bootstrap') {
      const { bootstrapAdrs } = require('./adr-bootstrap');
      const r = bootstrapAdrs(root, { created: now });
      console.log(r.summary);
    } else {
      console.log('usage: decisions new --summary "..." --options a:desc,b:desc \\\n                     [--context ...] [--rationale ...] [--consequences ...] [--confidence high|medium|low] [--body ...]\n       decisions amend --id DEC-NNNN [--context ...] [--rationale ...] [--consequences ...] [--confidence ...] [--add-options b:why-rejected] [--describe a:why-chosen]   (fills gaps only)\n       decisions list [--lifecycle open]\n       decisions import       (import existing ADRs from docs/adr etc.)\n       decisions detect       (reverse-engineer proposed ADRs from code)\n       decisions bootstrap    (import + detect)');
    }
    process.exit(0);
  } catch (err) {
    console.error(`decisions: ${err.message}`);
    process.exit(1);
  }
}
