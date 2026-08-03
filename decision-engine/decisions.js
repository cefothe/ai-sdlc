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

module.exports = { newDecision, answerDecision, writeDecision, loadDecision, listDecisions, nextId, storeDir, STORE_REL, LIFECYCLES };

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
      // Nudge toward non-anemic ADRs (Fowler/AWS): a bare summary+options record
      // loses the reasoning. Warn (do not block) when the canonical sections are absent.
      const missing = ['context', 'rationale', 'consequences', 'confidence'].filter((k) => !decision.spec[k]);
      if (missing.length) console.error(`note: ${id} is missing ADR section(s): ${missing.join(', ')} — add --${missing.join(' / --')} so the decision records its reasoning, not just the choice.`);
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
      console.log('usage: decisions new --summary "..." --options a:desc,b:desc \\\n                     [--context ...] [--rationale ...] [--consequences ...] [--confidence high|medium|low] [--body ...]\n       decisions list [--lifecycle open]\n       decisions import       (import existing ADRs from docs/adr etc.)\n       decisions detect       (reverse-engineer proposed ADRs from code)\n       decisions bootstrap    (import + detect)');
    }
    process.exit(0);
  } catch (err) {
    console.error(`decisions: ${err.message}`);
    process.exit(1);
  }
}
