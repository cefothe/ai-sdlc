// Architecture conformance — does the implemented change respect the system
// map? The design gate checks that a DESIGN follows the architecture overview;
// this checks that the CODE does, deterministically, on the real diff:
//
//   unowned-file         a changed source file no component owns — new code with
//                        no home in the architecture (add the component, or move it)
//   undeclared-coupling  an added import/require in component A that reaches
//                        component B with no declared A → B contract
//   dependency-change    a dependency manifest changed (advisory: is the new
//                        external dependency reflected in the architecture?)
//   outside-feature-architecture
//                        the change touches a component the task's feature
//                        architecture (docs/architecture/features/<feature>.md)
//                        does not list — the journey grew without its architecture
//
// Findings are reviewer input (major/minor), never fed to the author mid-turn;
// they also raise the pace to slow. No overview → skipped (fail-open, reported).

const { loadOverviews, ownerOf, mentions } = require('./architecture-context');
const { collectGitInputs, parseNameStatus, addedLinesByFile } = require('./hitl-gate');

const DEPENDENCY_MANIFEST_RE = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.txt|pyproject\.toml|Pipfile(\.lock)?|poetry\.lock|go\.(mod|sum)|Cargo\.(toml|lock)|pom\.xml|build\.gradle(\.kts)?|Gemfile(\.lock)?|composer\.(json|lock))$/;
// Files that are not component code: docs, governance, CI, tests and fixtures,
// throwaway spike scripts, and manifests (handled by dependency-change).
const EXEMPT_RE = /(^|\/)(docs?|\.ai-sdlc|\.github|\.claude|backlog|tests?|__tests__|testdata|fixtures|spikes)\/|\.(md|txt|adoc|rst)$|(^|\/)(LICENSE[^/]*|README[^/]*|CHANGELOG[^/]*|\.gitignore|\.editorconfig)$/i;
const IMPORT_RE = /\b(import|require|from|include|using|use)\b/;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Does an added line reference component B's code? Its full path, or its last
// path segment as a path/package token (../payments/x, '@shop/payments').
function referencesComponent(line, comp) {
  return comp.paths.some((p) => {
    const n = p.replace(/^\.\//, '').replace(/\/+$/, '');
    const seg = n.split('/').pop();
    return line.includes(n) || (seg.length >= 3 && new RegExp(`[/'"@]${escapeRe(seg)}([/'"]|$)`).test(line));
  });
}

function hasEdge(edges, from, to) {
  return edges.some((e) => mentions(e.from, from.name) && mentions(e.to, to.name));
}

// Pure. files: changed paths; addedLines: Map(path → lines); overviews from loadOverviews;
// expectedComponents: the task's feature-architecture components (empty → not checked).
function checkConformance({ files = [], addedLines = new Map(), overviews = [], expectedComponents = [] }) {
  if (!overviews.length) return { status: 'skipped', reason: 'no architecture overview', findings: [], touched: [] };
  const components = overviews.flatMap((o) => o.components);
  const edges = overviews.flatMap((o) => o.edges);
  const findings = [];
  const touched = new Set();

  for (const file of files) {
    if (DEPENDENCY_MANIFEST_RE.test(file)) {
      findings.push({ code: 'dependency-change', severity: 'minor', file, message: `${file} changed — if this adds an external dependency, record it in the architecture overview (and an ADR when it is load-bearing)` });
      continue;
    }
    if (EXEMPT_RE.test(file)) continue;
    const owner = ownerOf(components, file);
    if (!owner) {
      findings.push({ code: 'unowned-file', severity: 'major', file, message: `${file} is owned by no component in the architecture overview — put it in the owning component, or add the new component (with its code path) to the overview in this change` });
      continue;
    }
    touched.add(owner.name);
    for (const line of addedLines.get(file) || []) {
      if (!IMPORT_RE.test(line)) continue;
      for (const other of components) {
        if (other === owner || !referencesComponent(line, other)) continue;
        // Nested components (a project's own component inside the root's subproject entry) are one unit.
        if (ownerOf([owner], other.paths[0] || '') || ownerOf([other], owner.paths[0] || '')) continue;
        if (!hasEdge(edges, owner, other)) {
          findings.push({ code: 'undeclared-coupling', severity: 'major', file, message: `${owner.name} → ${other.name}: \`${line.trim().slice(0, 120)}\` crosses components with no declared contract — go through an existing contract, or declare the ${owner.name} → ${other.name} edge in the overview` });
        }
      }
    }
  }
  if (expectedComponents.length) {
    const expected = new Set(expectedComponents.map((c) => c.toLowerCase()));
    for (const name of [...touched].filter((c) => !expected.has(c.toLowerCase()))) {
      findings.push({ code: 'outside-feature-architecture', severity: 'major', file: null, message: `the change touches ${name}, which the feature architecture does not list (${expectedComponents.join(', ')}) — add it there (components, interactions, contracts), or keep the change inside the feature's components` });
    }
  }
  const unique = [...new Map(findings.map((f) => [`${f.code}|${f.file}|${f.message}`, f])).values()];
  return { status: unique.length ? 'findings' : 'clean', findings: unique, touched: [...touched] };
}

// Evaluate the branch at `cwd` against `base` with the overviews in that tree.
function evaluateConformance({ cwd, base = 'main', runner, projects = [], expectedComponents = [] }) {
  const inputs = collectGitInputs({ runner, cwd, base });
  return checkConformance({
    files: parseNameStatus(inputs.name_status),
    addedLines: addedLinesByFile(inputs.diff),
    overviews: loadOverviews(cwd, projects),
    expectedComponents,
  });
}

// Reviewer-facing block for the findings, or null when clean/skipped.
function formatConformanceContext(res) {
  if (!res || res.status !== 'findings') return null;
  return [
    'Architecture conformance (deterministic, on the real diff) — treat each major item as a major finding unless the overview was updated to match:',
    ...res.findings.map((f) => `  - [${f.severity}] ${f.code}: ${f.message}`),
  ].join('\n');
}

module.exports = { checkConformance, evaluateConformance, formatConformanceContext, referencesComponent, DEPENDENCY_MANIFEST_RE, EXEMPT_RE };

// CLI: node decision-engine/architecture-conformance.js [--base main]
// exit 0 clean/skipped · 2 findings
if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = i >= 0 && args[i + 1] ? args[i + 1] : 'main';
  try {
    const { makeGitRunner } = require('../adapters/claude-code-spawner');
    const { detectProjects } = require('./monorepo');
    const { loadFlowConfig } = require('../pipeline/flow-config');
    const flow = loadFlowConfig(process.cwd());
    const projects = detectProjects(process.cwd(), { declared: flow.monorepo.projects, autoDetect: flow.monorepo.autoDetect });
    const res = evaluateConformance({ cwd: process.cwd(), base, runner: makeGitRunner(), projects });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.status === 'findings' ? 2 : 0);
  } catch (err) {
    console.error(`architecture-conformance failed: ${err.message}`);
    process.exit(1);
  }
}
