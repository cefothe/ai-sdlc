// ADR coverage scanner — advisory. Checks whether the recorded ADR set covers
// the foundational decision areas a design pass is expected to reason about, so
// the design phase reliably produces comprehensive ADRs instead of depending on
// whoever wrote the prompt. Never blocks: a "missing" area is a prompt to either
// record the decision or confirm it's intentionally out of scope.
//
// Areas are matched heuristically against each ADR's summary/context/rationale/
// body. Coverage is about the WHY existing somewhere, not exact wording.

const { listDecisions } = require('./decisions');

// The foundational decision areas. `whenRelevant` documents when an area applies
// (a pure backend job needs no frontend ADR); the scanner reports all and lets
// the human judge relevance.
const AREAS = [
  { key: 'backend-stack', label: 'Backend language / runtime', re: /\bnode\b|typescript|python|golang|\bgo\b|\brust\b|\bjava\b|runtime|backend (stack|language|framework)/i },
  { key: 'frontend', label: 'Frontend framework (if there is a UI)', re: /react|next\.?js|svelte|vue|angular|\bspa\b|\bssr\b|frontend/i },
  { key: 'datastore', label: 'Database / datastore', re: /postgres|mysql|mongo|sqlite|dynamo|cassandra|datastore|database engine/i },
  { key: 'data-model', label: 'Data / domain model (canonical entities, fields, relationships, mapping)', re: /canonical (data|domain|common|three|two|entity|model|schema)|data model|domain model|entity model|entity-relationship|field mapping|schema mapping|natural key|composite (primary )?key|normalized (common )?schema/i },
  { key: 'build-vs-buy', label: 'External dependency: build vs buy / self-host', re: /build vs buy|self-?host|third-?party|vendor|hosted|managed service|scrap/i },
  { key: 'resilience', label: 'Resilience / retry / error handling', re: /retry|resilien|backoff|circuit break|failure budget|idempoten|dead-?letter/i },
  { key: 'scale', label: 'Scale / data volume / growth', re: /\bscale\b|volume|partition|shard|throughput|growth|indexing|history table|time.?series/i },
  // Distinct from `scale`: not "how big does it get / what datastore later", but
  // "how does this stay BOUNDED at the stated volume RIGHT NOW" — peak memory,
  // streaming vs batch-all-into-RAM, per-batch/incremental writes, backpressure,
  // crash-durability. A design that says "TB → columnar later" can still leave the
  // v1 ingestion holding the whole dataset in memory; this area forces that call.
  { key: 'resource-budget', label: 'Resource budget / bounded working set (peak memory, streaming vs batch, incremental/crash-durable writes at the stated volume)', re: /working set|bounded memory|memory (budget|ceiling|footprint|bound|limit)|stream(ing|ed)?|batch(ed|ing)?|incremental (write|durabilit|checkpoint|flush)|backpressure|per-?(page|batch|chunk) (upsert|write|flush)|constant[- ]memory|chunk(ed|ing)?|paginate.*(upsert|write|flush)/i },
  { key: 'security', label: 'Security / secrets / auth', re: /security|secret|auth|credential|\btoken\b|encrypt|vault/i },
  { key: 'observability', label: 'Observability / monitoring', re: /observab|monitor|metric|\bslo\b|alert|tracing|logging/i },
  { key: 'api', label: 'API / integration surface', re: /\bapi\b|\brest\b|graphql|\btrpc\b|\bgrpc\b|endpoint|contract/i },
  { key: 'read-path', label: 'Read / query architecture (data-heavy products)', re: /read (path|model|architecture)|query architecture|search (index|engine)|faceted|caching layer/i },
];

function haystack(d) {
  const s = d.spec || {};
  const opts = (s.options || []).map((o) => `${o.id} ${o.description}`).join(' ');
  return [s.summary, s.context, s.rationale, s.consequences, s.body, opts].filter(Boolean).join('\n');
}

// Evaluate coverage over a list of decision objects (decisions.js shape).
function evaluateCoverage(decisions) {
  const texts = decisions.map(haystack);
  const areas = AREAS.map((a) => {
    const hits = decisions.filter((_, i) => a.re.test(texts[i])).map((d) => d.metadata.id);
    return { key: a.key, label: a.label, covered: hits.length > 0, adrs: hits };
  });
  const missing = areas.filter((a) => !a.covered);
  return {
    total: decisions.length,
    covered: areas.filter((a) => a.covered).length,
    areas,
    missing: missing.map((a) => ({ key: a.key, label: a.label })),
  };
}

function evaluateCoverageRoot(root) {
  return evaluateCoverage(listDecisions(root));
}

module.exports = { evaluateCoverage, evaluateCoverageRoot, AREAS };

// CLI: node decision-engine/adr-coverage.js [root]
if (require.main === module) {
  const root = process.argv[2] || process.cwd();
  try {
    const r = evaluateCoverageRoot(root);
    console.log(JSON.stringify(r, null, 2));
    if (r.missing.length) {
      console.error(`\nadvisory: ${r.missing.length} foundational area(s) with no ADR: ${r.missing.map((m) => m.label).join('; ')}`);
      console.error('Record a decision for each, or confirm it is intentionally out of scope.');
    }
    process.exit(0); // advisory — never fails the build
  } catch (err) {
    console.error(`adr-coverage failed: ${err.message}`);
    process.exit(1);
  }
}
