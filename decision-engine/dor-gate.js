// Definition-of-Ready gate (RFC-0011). Refuses to admit a task for dispatch
// until the operator has actually decided it. Faithful to the reference's
// two-stage design: deterministic gates run here (Stage A); the subjective
// gates (4 scope-bounded, 6 done-state-describable, and any Stage-A gate that
// cannot be settled deterministically) are deferred to an injectable Stage-B
// judge — never silently passed. This is the front-loaded decision gate our
// R15 data supports (decide before dispatch), NOT a post-hoc feedback loop.
//
// The 7 rubric gates (RFC-0011 §4.1):
//   1 ACs binary-testable      2 no marker tokens        3 references resolve
//   4 scope bounded            5 surface named           6 done-state describable
//   7 no invisible dependencies
// Plus two upstream, human-in-the-loop sign-off gates that fire only for feature
// tasks (those linking a PRD via specRef):
//   8 PRD ratified (approved + structurally valid)
//   9 design ratified (design doc approved + valid + >=1 ADR; optional full
//     ADR coverage) — this is what forces new -> design -> execute: no task
//     reaches a worktree on an un-architected feature.
//
// Overall verdict: 'blocked' | 'not-dispatchable' | 'needs-clarification'
//   | 'needs-stage-b' | 'ready'. In enforce mode only 'ready' is admitted;
// in warn-only mode everything is admitted but the verdict is still reported.

const { existsSync, readFileSync } = require('node:fs');
const { join, isAbsolute } = require('node:path');
const yaml = require('js-yaml');

const MARKER_TOKEN_RE = /\b(TBD|TODO|FIXME|XXX|HACK|WIP|\?\?\?)\b/;
// Bounded middle ({0,80}) instead of an unbounded lazy .*? to avoid quadratic
// backtracking on long prose bodies.
const BARE_REF_RE = /\b(?:like|per|see|as in)\s+(?:the\s+)?[A-Za-z][\w\s-]{0,80}?\b(PR|spec|ticket|doc|issue)\b/i;

const DEFAULT_CONFIG = {
  apiVersion: 'ai-sdlc.io/v1alpha1',
  kind: 'DorConfig',
  spec: {
    rubricVersion: 'v1',
    evaluationMode: 'enforce',
    autoPassRules: [],
  },
};

// Load .ai-sdlc/dor-config.yaml, falling back to schema defaults when absent.
function loadDorConfig(path) {
  if (!path || !existsSync(path)) return DEFAULT_CONFIG;
  try {
    const doc = yaml.load(readFileSync(path, 'utf8'));
    if (!doc || typeof doc !== 'object') return DEFAULT_CONFIG;
    doc.spec = doc.spec || {};
    doc.spec.evaluationMode = doc.spec.evaluationMode || 'enforce';
    doc.spec.autoPassRules = doc.spec.autoPassRules || [];
    return doc;
  } catch (err) {
    throw new Error(`invalid dor-config.yaml: ${err.message}`);
  }
}

function isUrl(ref) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(ref);
}

// Does a reference resolve? URLs and non-path strings pass; repo-relative
// paths must exist on disk. (Stage A gate 3 — high-confidence deterministic.)
function referenceResolves(ref, projectRoot) {
  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (isUrl(ref)) return true;
  const looksLikePath = ref.includes('/') || /\.\w+$/.test(ref);
  if (!looksLikePath) return true; // a bare name, not a checkable path
  const abs = isAbsolute(ref) ? ref : join(projectRoot, ref);
  return existsSync(abs);
}

function scanText(task) {
  const fm = task.frontmatter || {};
  return [fm.title, task.body, ...(task.acceptanceCriteria || []).map((a) => a.text)]
    .filter(Boolean)
    .join('\n');
}

// Resolve which gates an autoPassRule skips for this task (machine-authored).
function autoPassedGates(task, config) {
  const fm = task.frontmatter || {};
  const labels = fm.labels || [];
  const source = (fm.specRef && fm.specRef.source) || fm.source;
  for (const rule of config.spec.autoPassRules || []) {
    const bySource = rule.sources && source && rule.sources.includes(source);
    const byLabel = rule.kind && labels.includes(rule.kind);
    if (bySource || byLabel) return new Set(rule.gatesSkipped || []);
  }
  return new Set();
}

// Evaluate the DoR rubric. stageBJudge(task, gateIds) -> Map<gateId, {verdict,finding}>
// is optional; when absent, Stage-B gates surface as 'needs-stage-b'.
// Default PRD evaluator seam. Lazily requires prd-gate so dor-gate has no hard
// dependency on it and stays unit-testable without a filesystem: pass
// opts.evaluatePrd to inject, or opts.prdDir/prdGate:false to control activation.
function defaultPrdEvaluator(prdPath) {
  const { evaluatePrdFile } = require('./prd-gate');
  return evaluatePrdFile(prdPath);
}

// Default design-doc evaluator seam. Lazily requires design-gate so dor-gate has
// no hard dependency on it and stays unit-testable without a filesystem: pass
// opts.evaluateDesignDoc to inject, or opts.designGate:false to deactivate.
function defaultDesignEvaluator(designPath) {
  const { evaluateDesignFile } = require('./design-gate');
  return evaluateDesignFile(designPath);
}

// Default ADR-coverage seam (only consulted when coverage enforcement is on).
function defaultCoverageEvaluator(root) {
  const { evaluateCoverageRoot } = require('./adr-coverage');
  return evaluateCoverageRoot(root);
}

function evaluateDor(task, opts = {}) {
  const {
    projectRoot = process.cwd(),
    config = DEFAULT_CONFIG,
    stageBJudge,
    prdGate = true,
    prdDir = 'docs/prd/',
    evaluatePrd = defaultPrdEvaluator,
    designGate = true,
    designDir = 'docs/design/',
    evaluateDesignDoc = defaultDesignEvaluator,
    evaluateCoverage = defaultCoverageEvaluator,
  } = opts;
  const fm = task.frontmatter || {};
  const mode = config.spec.evaluationMode || 'enforce';
  // Design-gate config: a project can disable it or require full ADR coverage.
  const designCfg = (config.spec && config.spec.designGate) || {};
  const designGateEnabled = designGate && designCfg.enabled !== false;
  const requireCoverage = opts.requireCoverage !== undefined
    ? opts.requireCoverage
    : !!designCfg.requireCoverage;

  // Hard pre-checks that short-circuit the rubric.
  if (fm.blocked && fm.blocked.reason) {
    return {
      verdict: 'blocked', admitted: false, mode, gates: [],
      reasons: [`task is on hold: ${fm.blocked.reason}`],
    };
  }
  if (fm.dispatchable === false) {
    return {
      verdict: 'not-dispatchable', admitted: false, mode, gates: [],
      reasons: [fm.dispatchableReason || 'task marked dispatchable: false'],
    };
  }

  const skip = autoPassedGates(task, config);
  const text = scanText(task);
  const gates = [];
  const stageBNeeded = [];

  function record(gateId, verdict, finding) {
    if (skip.has(gateId)) {
      gates.push({ gateId, verdict: 'pass', finding: 'auto-passed (machine-authored task rule)' });
      return;
    }
    gates.push({ gateId, verdict, finding });
    if (verdict === 'needs-stage-b') stageBNeeded.push(gateId);
  }

  // Gate 1 — ACs present + binary-testable. Deterministic lower bound: at least
  // one AC exists. Binary-testability itself is subjective -> Stage B.
  if ((task.acceptanceCriteria || []).length === 0) {
    record(1, 'fail', 'no acceptance criteria found (need an AC:BEGIN/END block or "## Acceptance Criteria" checklist)');
  } else {
    record(1, 'needs-stage-b', 'ACs present; binary-testability requires judgment');
  }

  // Gate 2 — no marker tokens (fully deterministic, high confidence).
  const marker = text.match(MARKER_TOKEN_RE);
  record(2, marker ? 'fail' : 'pass', marker ? `placeholder marker token "${marker[1]}" present` : 'no marker tokens');

  // Gate 3 — references resolve (deterministic). Includes references[] AND the
  // upstream spec/PRD link (specRef.artifactPath / contractsPath), so a task
  // pointing at a PRD or contract that doesn't exist is refused — this is what
  // makes PRDs/ADRs load-bearing references rather than decoration.
  const refs = [...(fm.references || [])];
  if (fm.specRef) {
    if (fm.specRef.artifactPath) refs.push(fm.specRef.artifactPath);
    if (fm.specRef.contractsPath) refs.push(fm.specRef.contractsPath);
  }
  const unresolved = refs.filter((r) => !referenceResolves(r, projectRoot));
  record(3, unresolved.length ? 'fail' : 'pass',
    unresolved.length ? `unresolved references: ${unresolved.join(', ')}` : 'all references + spec/PRD links resolve');

  // Gate 4 — scope bounded (always Stage B per reference).
  record(4, 'needs-stage-b', 'scope-bounded (fits one PR) requires judgment');

  // Gate 5 — surface named. Deterministic lower bound: a concrete path reference
  // OR an explicit surface field; otherwise defer to Stage B.
  const hasConcretePath = refs.some((r) => typeof r === 'string' && !isUrl(r) && (r.includes('/') || /\.\w+$/.test(r)));
  if (hasConcretePath || fm.surface || fm.affects) {
    record(5, 'pass', 'a concrete affected surface is named');
  } else {
    record(5, 'needs-stage-b', 'no concrete surface path in references; specificity requires judgment');
  }

  // Gate 6 — done-state describable (always Stage B per reference).
  record(6, 'needs-stage-b', 'done-state-describable requires judgment');

  // Gate 7 — no invisible dependencies. Deterministic signal: bare prose
  // references ("like the dashboard PR") that are not linked -> fail.
  const bare = task.body && task.body.match(BARE_REF_RE);
  record(7, bare ? 'needs-stage-b' : 'pass',
    bare ? `possible unlinked reference: "${bare[0].trim()}"` : 'no invisible dependencies detected');

  // Gate 8 — PRD readiness (deterministic, human-in-the-loop). Fires only when
  // the task links a PRD under prdDir via specRef: the PRD must be structurally
  // valid (canonical sections present, no markers) AND status: approved. This is
  // the upstream sign-off — a draft or malformed PRD refuses admission, so no PR
  // is ever opened on an unvetted plan. Quality is scored separately (advisory).
  const prdPath = fm.specRef && fm.specRef.artifactPath;
  const isPrd = typeof prdPath === 'string' && prdPath.replace(/^\.\//, '').startsWith(prdDir);
  if (prdGate && isPrd && !skip.has(8)) {
    if (!referenceResolves(prdPath, projectRoot)) {
      // Missing file is already a gate-3 failure; don't double-report here.
      record(8, 'pass', 'PRD link handled by gate 3 (file missing)');
    } else {
      try {
        const full = require('node:path').isAbsolute(prdPath) ? prdPath : require('node:path').join(projectRoot, prdPath);
        const prd = evaluatePrd(full, projectRoot);
        record(8, prd.valid ? 'pass' : 'fail',
          prd.valid ? 'PRD is structurally valid and approved' : `PRD not ready: ${prd.reasons.join('; ')}`);
      } catch (err) {
        record(8, 'fail', `PRD could not be evaluated: ${err.message}`);
      }
    }
  }

  // Gate 9 — design ratified (deterministic, human-in-the-loop). Fires on the
  // same feature tasks as gate 8 (those linking a PRD via specRef): a feature
  // with a product contract must also have a technical one. The design doc at
  // <designDir>/<featureId>.md must exist, be structurally valid (canonical
  // sections + >=1 linked ADR), and be status: approved. When the project sets
  // spec.designGate.requireCoverage, every foundational ADR-coverage area must
  // also be covered. This is what forces new -> design -> execute: a task cannot
  // be admitted for dispatch on an un-architected feature.
  const featureId = (fm.specRef && fm.specRef.featureId)
    || (isPrd ? prdPath.replace(/^.*\//, '').replace(/\.md$/i, '') : '');
  if (designGateEnabled && isPrd && featureId && !skip.has(9)) {
    const rel = `${designDir}${featureId}.md`;
    if (!referenceResolves(rel, projectRoot)) {
      record(9, 'fail', `no design doc at ${rel} — run /ai-sdlc:design ${featureId} to produce the design + ADRs before dispatch`);
    } else {
      try {
        const full = isAbsolute(rel) ? rel : join(projectRoot, rel);
        const design = evaluateDesignDoc(full, projectRoot);
        const approved = (design.status || '').toString().toLowerCase() === 'approved';
        if (!design.valid || !approved) {
          const why = [...(design.reasons || [])];
          if (!approved) why.push(`design status is "${design.status || 'unset'}" — a human must review + set status: approved`);
          record(9, 'fail', `design not ratified: ${why.join('; ')}`);
        } else if (requireCoverage) {
          const cov = evaluateCoverage(projectRoot);
          record(9, cov.missing.length ? 'fail' : 'pass',
            cov.missing.length
              ? `design ratified but ADR coverage incomplete: ${cov.missing.map((m) => m.label).join('; ')} — record an ADR for each or rule it out of scope`
              : 'design ratified; ADRs linked; foundational coverage complete');
        } else {
          record(9, 'pass', 'design is structurally valid, links ADRs, and is approved');
        }
      } catch (err) {
        record(9, 'fail', `design could not be evaluated: ${err.message}`);
      }
    }
  }

  // Optional Stage-B judge resolves the deferred gates.
  if (stageBJudge && stageBNeeded.length) {
    const verdicts = stageBJudge(task, stageBNeeded.slice());
    for (const g of gates) {
      if (g.verdict === 'needs-stage-b' && verdicts && verdicts.has(g.gateId)) {
        const v = verdicts.get(g.gateId);
        g.verdict = v.verdict;
        g.finding = v.finding || g.finding;
        g.stageB = true;
      }
    }
  }

  const failed = gates.filter((g) => g.verdict === 'fail');
  const deferred = gates.filter((g) => g.verdict === 'needs-stage-b');

  let verdict;
  if (failed.length) verdict = 'needs-clarification';
  else if (deferred.length) verdict = 'needs-stage-b';
  else verdict = 'ready';

  const admitted = mode === 'enforce' ? verdict === 'ready' : true;
  const reasons = [
    ...failed.map((g) => `gate ${g.gateId} failed: ${g.finding}`),
    ...deferred.map((g) => `gate ${g.gateId} needs Stage-B review: ${g.finding}`),
  ];

  return { verdict, admitted, mode, gates, needsStageB: deferred.map((g) => g.gateId), reasons };
}

module.exports = { loadDorConfig, evaluateDor, referenceResolves, DEFAULT_CONFIG, MARKER_TOKEN_RE };
