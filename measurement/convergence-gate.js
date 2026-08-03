// Convergence gate — the deterministic guardrail that protects the
// architecture's load-bearing invariants as the framework evolves. Run in CI
// alongside `jest`. It is NOT the statistical quality check: the paired
// Wilcoxon promise-gate A/B (ON vs OFF) still runs via measurement/mt-executor.js
// (`node measurement/mt-executor.js --promise ...`) which needs models + git
// fixtures. This gate encodes the invariants those experiments established so a
// regression is caught cheaply and immediately:
//
//   1. schemas + shipped .ai-sdlc/ instances validate
//   2. promise verification NEVER blocks under advisory enforcement (R5/R15)
//   3. Pattern C is enforced (parent tree read-only off its base branch)
//   4. the DoR gate refuses an undecided task in enforce mode
//   5. cross-harness attestation rejects reviewer/implementer collusion
//   6. the DoD gate BLOCKS a red build/test (hard exit gate) and passes when green
//   7. the PRD gate refuses a draft/unapproved PRD (human sign-off enforced)
//   8. the clarify gate blocks unresolved open questions
//   9. the analyze gate blocks an inconsistent task
//  10. the design gate requires a design doc to link at least one ADR
//
// These make every ENFORCED gate self-verifying: a future change that silently
// breaks a gate (so it stops blocking) fails CI here — the pipeline can't rot.

const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const validator = require(path.join(ROOT, 'spec', 'validate-schemas.js'));
const steps = require(path.join(ROOT, 'pipeline', 'steps.js'));
const { evaluateDor } = require(path.join(ROOT, 'decision-engine', 'dor-gate.js'));
const { parseTask } = require(path.join(ROOT, 'decision-engine', 'backlog-task.js'));
const { evaluatePromiseGate } = require(path.join(ROOT, 'quality-gate', 'promise-gate.js'));
const att = require(path.join(ROOT, 'attestation', 'attestation.js'));
const caps = require(path.join(ROOT, 'pipeline', 'capabilities.js'));
const { evaluateDod, DEFAULT_CONFIG: DOD_DEFAULT } = require(path.join(ROOT, 'decision-engine', 'dod-gate.js'));
const { evaluatePrd } = require(path.join(ROOT, 'decision-engine', 'prd-gate.js'));
const { evaluateClarity } = require(path.join(ROOT, 'decision-engine', 'clarify-gate.js'));
const { evaluateConsistency } = require(path.join(ROOT, 'decision-engine', 'analyze-gate.js'));
const { evaluateDesign } = require(path.join(ROOT, 'decision-engine', 'design-gate.js'));

function check(name, fn) {
  try {
    const detail = fn();
    return { name, ok: true, detail: detail || 'ok' };
  } catch (err) {
    return { name, ok: false, detail: err.message };
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runChecks() {
  const checks = [];

  checks.push(check('schemas + instances validate', () => {
    const res = validator.run({ configDir: path.join(ROOT, '.ai-sdlc') });
    assert(res.ok, [...res.errors, ...res.instanceErrors].join('; '));
    return `${Object.keys(res.schemas).length} schemas`;
  }));

  checks.push(check('advisory promise gate never blocks (R5/R15 guardrail)', () => {
    const advisory = { kind: 'QualityGate', spec: { gates: [{ name: 'promise-verification', enforcement: 'advisory', rule: { metric: 'promise.broken_count', operator: '==', threshold: 0 } }] } };
    const g = evaluatePromiseGate([{ promise_id: 'error-handling', result: 'broken' }], { config: advisory });
    assert(g.passed === false, 'expected the gate to detect the broken promise');
    assert(g.blocking === false, 'advisory promise gate must NOT block — this is the R5/R15 guardrail');
    return 'advisory reports, never blocks';
  }));

  checks.push(check('Pattern C enforced (worktree refused off base branch)', () => {
    let threw = false;
    try {
      steps.setupWorktree({ repoDir: '/r', worktreePath: '/wt', branch: 'b', baseBranch: 'main', runner: () => ({ stdout: '' }), gitState: () => ({ branch: 'feature', clean: true }) });
    } catch (e) {
      threw = /Pattern C/.test(e.message);
    }
    assert(threw, 'setupWorktree must refuse when the parent tree is not on the base branch');
    return 'parent tree stays read-only on base branch';
  }));

  checks.push(check('DoR enforce refuses an undecided task', () => {
    const task = parseTask('---\nid: X\ntitle: t\nstatus: To Do\nreferences:\n  - does/not/exist.md\n---\nno criteria');
    const r = evaluateDor(task, { projectRoot: ROOT, config: { spec: { evaluationMode: 'enforce', autoPassRules: [] } } });
    assert(r.admitted === false, 'an undecided task must not be admitted in enforce mode');
    return `verdict=${r.verdict}`;
  }));

  checks.push(check('capability map resolves + is cross-harness-safe', () => {
    const map = caps.loadCapabilityMap(path.join(ROOT, '.ai-sdlc', 'capabilities.yaml'));
    const plan = caps.resolvePlanStage(map, {});
    const impl = caps.resolveImplementer(map, {});
    assert(plan && plan.name, 'plan stage must resolve to a named provider');
    assert(impl && impl.name, 'implement stage must resolve to a named provider');
    // resolveReviewTeam throws if any reviewer shares the implementer harness.
    const team = caps.resolveReviewTeam(map, { files: ['src/test/java/FooTest.java'] }, { implementerHarness: impl.harness || 'claude' });
    assert(team.providers.length >= 1, 'review stage must resolve at least one reviewer');
    for (const p of team.providers) assert(p.name && p.role, `reviewer provider missing name/role: ${JSON.stringify(p)}`);
    // Java-test routing must have swapped in qa-code-reviewer.
    assert(team.providers.some((p) => p.name === 'qa-code-reviewer'), 'Java-test task should route the test reviewer to qa-code-reviewer');
    return `plan=${plan.name}, implement=${impl.name}, review team of ${team.providers.length}`;
  }));

  checks.push(check('DoD gate BLOCKS a red build/test, PASSES when green (hard-enforced exit)', () => {
    const red = evaluateDod({ config: DOD_DEFAULT, runCommand: () => ({ code: 1, stderr: 'fail' }) });
    assert(red.blocked === true, 'DoD must BLOCK when build/tests fail — the exit gate would be useless otherwise');
    const green = evaluateDod({ config: DOD_DEFAULT, runCommand: () => ({ code: 0 }) });
    assert(green.passed === true && green.blocked === false, 'DoD must pass when build + tests are green');
    return 'red→blocked, green→pass';
  }));

  checks.push(check('PRD gate refuses a draft/unapproved PRD (human sign-off enforced)', () => {
    const draft = ['---', 'status: draft', '---', '# PRD',
      '## Problem', 'x', '## Target user', 'x', '## Success metrics', '+5pp',
      '## Scope', 'x', '## Acceptance criteria', '- [ ] a', '## Open questions', 'None.'].join('\n');
    const r = evaluatePrd(draft);
    assert(r.structureValid === true, 'fixture PRD should be structurally valid');
    assert(r.valid === false && r.approved === false, 'a draft PRD must not be valid — approval is the human gate');
    return 'draft blocked';
  }));

  checks.push(check('clarify gate blocks unresolved open questions', () => {
    const md = ['---', 'status: draft', '---', '# PRD', '## Open questions', '- What is the retry policy?'].join('\n');
    const r = evaluateClarity(md);
    assert(r.clear === false && r.unresolvedQuestions.length > 0, 'clarify must block a PRD with unresolved questions');
    return 'unresolved → not clear';
  }));

  checks.push(check('analyze gate blocks an inconsistent task (no PRD link / no ACs)', () => {
    const r = evaluateConsistency({ task: { frontmatter: {}, acceptanceCriteria: [] } });
    assert(r.consistent === false, 'analyze must block a task with no specRef and no acceptance criteria');
    return 'inconsistent blocked';
  }));

  checks.push(check('design gate requires the design doc to link >=1 ADR', () => {
    const noAdr = ['---', 'status: approved', '---', '# Design',
      '## Context', 'x', '## Architecture', 'x', '## Data model', 'x', '## Interfaces', 'x',
      '## Data flow', 'x', '## Decisions', 'none yet', '## Risks', 'x', '## Test strategy', 'x'].join('\n');
    const r = evaluateDesign(noAdr);
    assert(r.valid === false && r.hasAdrLinks === false, 'a design doc that links no ADR (DEC-NNNN) must be invalid');
    return 'no-ADR design blocked';
  }));

  checks.push(check('cross-harness attestation rejects collusion', () => {
    const kp = att.generateKeypair();
    const env = att.signEnvelope({ commitSha: 'a'.repeat(40), headSha: 'x', privateKeyPem: kp.privateKeyPem, now: '2026-07-17T21:00:00Z', leaves: [{ reviewerName: 'code-reviewer', transcript: 't' }] });
    const trusted = { byName: new Map([['code-reviewer', { harness: 'codex', publicKeyPem: kp.publicKeyPem }]]), keys: [kp.publicKeyPem] };
    const good = att.verifyEnvelope(env, { trustedReviewers: trusted, implementerHarness: 'claude' });
    assert(good.ok, `expected a cross-harness envelope to verify: ${good.reasons.join('; ')}`);
    const bad = att.verifyEnvelope(env, { trustedReviewers: trusted, implementerHarness: 'codex' });
    assert(bad.ok === false, 'expected same-harness implementer/reviewer to be rejected');
    return 'claude!=codex enforced';
  }));

  return { ok: checks.every((c) => c.ok), checks };
}

module.exports = { runChecks };

if (require.main === module) {
  const { ok, checks } = runChecks();
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
  console.log(ok
    ? 'convergence gate PASSED — architecture invariants intact. (Statistical quality A/B runs separately via measurement/mt-executor.js --promise.)'
    : 'convergence gate FAILED — an architecture invariant regressed. See FAIL lines above.');
  process.exit(ok ? 0 : 1);
}
