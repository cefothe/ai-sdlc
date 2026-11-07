// Step 0–13 pipeline orchestrator. Chains the primitives in steps.js with
// injected seams (runner=git, spawn=agent dispatch, gh=GitHub) so it runs
// end-to-end under test without a real repo or network.
//
// Integration points with our kept strengths:
//   - DoR gate (decision-engine/dor-gate) gates admission BEFORE dispatch.
//   - cxpak context feeds the developer prompt (pre-action, the d=1.82 lever).
//   - The approved PRD + design doc (fetchSpec) feed the plan, the implementer
//     and the reviewers; an approved design doc replaces the ad-hoc design panel.
//   - With a `flow` config the harness components plug in (pipeline/flow-config):
//     pace (ceremony from blast radius, HITL floor, raise-only trust), the
//     execution manifest + RED-oracle node executor (slicr contract), and the
//     HITL sign-off gate before push (commitward contract) — never auto-acked.
//     Every fail-open seam that gave way is recorded in result.degraded.
//   - Promise verification runs post-change as an ADVISORY signal: it is fed
//     to the independent reviewers as read-only context (never to the author),
//     and only a hard-mandatory QualityGate blocks the *merge* (a pipeline
//     boundary), never the author's turn (R5/R15).
//   - The iterate loop re-dispatches a FRESH developer with aggregated reviewer
//     feedback — R16 informed retry (endorsed), NOT R15 clean-prompt resampling.

const steps = require('./steps');
const capabilities = require('./capabilities');
const { buildTeamPlan } = require('./team-plan');
const { resolveManifest } = require('./manifest');
const { runNodes, makeAcceptRunner } = require('./node-executor');
const { evaluatePaceForRoot } = require('../decision-engine/pace');
const { evaluateHitlGate, formatBlocked, parseNameStatus, addedLinesByFile } = require('../decision-engine/hitl-gate');
const { evaluateConformance, formatConformanceContext } = require('../decision-engine/architecture-conformance');
const { recordShippedCapability } = require('../decision-engine/product-context');
const { writePlanArtifact, planDrift } = require('./plan-artifact');
const { buildValidationReport } = require('./validation-report');
const { loadReviewContract, formatReviewContract, applyReviewContract } = require('../decision-engine/review-contract');

class BudgetExceeded extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceeded';
  }
}

// Meter every agent dispatch: count calls and sum the cost each `claude -p`
// reports (result._meta.costUsd). With a flow budget, a run that would exceed
// maxCalls is refused before the call, and one that has exceeded maxCostUsd
// stops after it — cost per successful task is a delivery metric, not a surprise.
function meterSpawn(spawn, budget = {}) {
  // `started` counts in-flight calls too, so a parallel panel cannot overshoot the cap.
  const meter = { usd: 0, calls: 0, started: 0 };
  const metered = async (args) => {
    if (budget.maxCalls && meter.started >= budget.maxCalls) throw new BudgetExceeded(`budget: ${meter.started} agent calls reached the cap of ${budget.maxCalls}`);
    meter.started += 1;
    const out = await spawn(args);
    meter.calls += 1;
    meter.usd += (out && out._meta && Number(out._meta.costUsd)) || 0;
    if (budget.maxCostUsd && meter.usd > budget.maxCostUsd) throw new BudgetExceeded(`budget: $${meter.usd.toFixed(2)} spent exceeds the cap of $${budget.maxCostUsd}`);
    return out;
  };
  return { metered, meter };
}

// The run record (spec/schemas/run-record.schema.json) the delivery metrics and
// eval harvesting read. `outcome` is filled later from the PR's fate.
function buildRunRecord({ out, task, startedAt, endedAt, meter, baseSha, nodes }) {
  const st = out.steps || {};
  const findings = (st.review && st.review.findings) || [];
  return {
    runId: `${(task.frontmatter || {}).id}-${startedAt}`,
    taskId: (task.frontmatter || {}).id,
    timestamp: new Date(startedAt).toISOString(),
    leadTimeMs: endedAt - startedAt,
    kind: (st.spec && st.spec.kind) || 'feature',
    ok: !!out.ok,
    abortedAt: out.abortedAt || null,
    specPath: (st.spec && (st.spec.bugPath || st.spec.prdPath)) || null,
    gates: st.validate ? { dor: { verdict: st.validate.verdict, admitted: st.validate.admitted } } : {},
    implementation: st.developer ? { baseSha, commitSha: st.developer.commitSha, filesChanged: st.developer.filesChanged } : { baseSha },
    accepts: nodes ? nodes.map((n) => ({ id: n.id, files: n.files, accept: n.accept })) : [],
    review: st.review ? { cycles: st.review.iterations, verdict: st.review.decision, findings: findings.map((f) => ({ severity: f.severity, message: f.message, file: f.file })) } : undefined,
    pace: st.pace && st.pace.post ? st.pace.post.verdict : null,
    cost: { usd: Number(meter.usd.toFixed(4)), calls: meter.calls },
    degraded: (out.degraded || []).map((d) => d.seam),
    prUrl: st.pr ? st.pr.url : null,
    outcome: { pending: true },
  };
}

// Executes one task and records the run (when a recordRun seam is supplied).
async function executePipeline(opts) {
  const startedAt = Date.now();
  const flowBudget = (opts.flow && opts.flow.budget) || {};
  const { metered, meter } = meterSpawn(opts.spawn, flowBudget);
  let baseSha = null;
  if (opts.runner) {
    try { baseSha = String(opts.runner(['rev-parse', opts.baseBranch || 'main'], { cwd: opts.repoDir || opts.projectRoot || process.cwd() }).stdout || '').trim() || null; } catch { baseSha = null; }
  }
  const ctx = { meter, nodes: null };
  const out = await runPipeline({ ...opts, spawn: metered }, ctx);
  out.steps.cost = { usd: Number(meter.usd.toFixed(4)), calls: meter.calls };
  if (typeof opts.recordRun === 'function') {
    try {
      opts.recordRun(buildRunRecord({ out, task: opts.task, startedAt, endedAt: Date.now(), meter, baseSha, nodes: ctx.nodes }));
    } catch (err) {
      out.degraded.push({ seam: 'run-record', reason: err.message });
    }
  }
  return out;
}

const MANIFEST_INSTRUCTION = [
  'Also emit an execution manifest so the work can be executed against a RED oracle: one fenced ```json block',
  '{"execution-manifest": [{"id", "files", "change", "accept", "local": true, "kind"?, "forbid"?}]}.',
  'Each local node is ONE region (one function body / one contiguous edit, or one new file with kind "create");',
  '`accept` is a shell command that exits 0 only when that node is correctly done — a targeted test run whose',
  'assertions come from the PRD acceptance criteria. Tests are written by a separate test author before any node',
  'runs, so name the test the accept will run. Work that cannot be a single-region node goes in an entry with',
  '"local": false. Omit the block only if the task genuinely cannot be decomposed.',
].join(' ');

// Repo paths a task names up front — the predicted blast radius before code exists.
function referencedPaths(task) {
  const fm = (task && task.frontmatter) || {};
  return [...new Set([...(fm.references || []), ...(fm.refs || [])]
    .filter((r) => typeof r === 'string' && !/^https?:/i.test(r) && (r.includes('/') || /\.\w+$/.test(r))))];
}

function abort(stage, reasons, partial = {}) {
  return { ok: false, abortedAt: stage, reasons: Array.isArray(reasons) ? reasons : [reasons], ...partial };
}

async function runPipeline(opts, ctx) {
  const {
    taskId, task, projectRoot = process.cwd(),
    repoDir = projectRoot, baseBranch = 'main', worktreePath, worktreesDir,
    runner, spawn, gh, gitState, isMerged,
    dorConfig, evaluateDor, stageBJudge,
    cxpakContext, fetchCxpak,
    promiseVerify, qualityGateConfig, evaluatePromiseGate, formatReviewerContext,
    resolveRepoForPath, fetchDecisions, fetchSpec,
    flow = null, invoke, fetchTrust, runAccept: injectedRunAccept,
    evaluatePace = evaluatePaceForRoot, evaluateHitl = evaluateHitlGate, checkArchitecture = evaluateConformance, projects = [],
    maxIterations = 2, requireAllAcChecked = false,
    taskFilePath, completedDir, branchPattern,
    capabilityMap, taskContext = {}, implementerHarness = 'claude', runPlan = true, runDesign = true,
  } = opts;

  const result = { ok: false, taskId, steps: {}, degraded: [] };
  const degrade = (seam, reason) => result.degraded.push({ seam, reason });
  let activeWorktree = worktreePath;

  // Resolve which skills/agents fulfill each stage (CapabilityMap). Falls back
  // to the built-in defaults when no map is supplied. Cross-harness resolution
  // can throw — that's a config error, surfaced as an abort below.
  let implementer = null;
  let reviewTeam = null;
  let planProvider = null;
  let designPanel = null;
  // Per-stage external-capability grants (MCP servers / web tools / skills). Each
  // stage's dispatch gets its own allowlist + prompt guidance so design can ground
  // in real docs/schema and review can research to verify a claim — see
  // .ai-sdlc/capabilities.yaml `capabilities:` blocks.
  const grants = {};
  if (capabilityMap) {
    try {
      designPanel = capabilities.resolveDesignPanel(capabilityMap, taskContext);
      planProvider = capabilities.resolvePlanStage(capabilityMap, taskContext);
      implementer = capabilities.resolveImplementer(capabilityMap, taskContext);
      reviewTeam = capabilities.resolveReviewTeam(capabilityMap, taskContext, { implementerHarness });
      for (const s of ['discovery', 'design', 'plan', 'implement', 'review']) {
        grants[s] = capabilities.resolveStageCapabilities(capabilityMap, s, taskContext);
      }
      // Native Teams dispatch plans (consumed by the interactive orchestrator;
      // the programmatic path below just runs parallel spawns).
      reviewTeam.teamPlan = buildTeamPlan({ taskId, stage: 'review', providers: reviewTeam.providers, team: reviewTeam.team });
      if (designPanel.providers.length) designPanel.teamPlan = buildTeamPlan({ taskId, stage: 'design', providers: designPanel.providers, team: designPanel.panel });
      result.steps.capabilities = { design: designPanel, plan: planProvider, implementer, review: reviewTeam, grants };
      // A grant the dispatched agent's own tools allowlist would drop is no grant
      // at all — report it instead of letting the stage run without it.
      const bound = [
        ...designPanel.providers.map((p) => ['design', p]), ['plan', planProvider], ['implement', implementer],
        ...reviewTeam.providers.map((p) => ['review', p]),
      ];
      for (const [stageName, provider] of bound) {
        const gaps = capabilities.allowlistGaps(provider, grants[stageName]);
        if (gaps.length) result.degraded.push({ seam: 'capability-grant', reason: `${provider.name} (${stageName}) cannot use ${gaps.join(', ')} — not in the tools allowlist of agents/${provider.name}.md` });
      }
    } catch (err) {
      return abort('capabilities', [err.message], result);
    }
  }

  try {
    // Step 0 — sweep.
    if (worktreesDir) result.steps.sweep = steps.sweepMergedWorktrees({ worktreesDir, isMerged, runner });

    // Step 1 — DoR validation.
    if (evaluateDor) {
      const v = steps.validateTaskStep({ task, projectRoot, dorConfig, evaluateDor, stageBJudge });
      result.steps.validate = v;
      if (!v.admitted) return abort('validate', v.reasons.length ? v.reasons : [`DoR verdict: ${v.verdict}`], result);
    }

    // Step 2 — branch.
    const branch = steps.computeBranchName({ taskId, task, pattern: branchPattern });
    result.steps.branch = branch;

    // Step 3 — worktree (Pattern C guard).
    if (!activeWorktree) activeWorktree = worktreesDir ? require('node:path').join(worktreesDir, String(taskId).toLowerCase()) : undefined;
    if (activeWorktree && runner) {
      result.steps.worktree = steps.setupWorktree({ repoDir, worktreePath: activeWorktree, branch, baseBranch, runner, gitState });
    }

    // Step 4 — begin.
    result.steps.begin = steps.beginTask({ taskFilePath, worktreePath: activeWorktree, taskId });

    // The approved spec (PRD + design doc) for this task. Advisory input, never
    // blocks: the DoR gate already decided admission; a read error degrades to
    // no spec block.
    let spec = null;
    if (typeof fetchSpec === 'function') {
      try { spec = await fetchSpec(task); } catch (err) { spec = null; degrade('spec', err.message); }
    }
    const specText = (spec && spec.text) || null;
    const isBugFix = !!(spec && spec.kind === 'bug');
    result.steps.spec = { injected: !!specText, kind: isBugFix ? 'bug' : 'feature', prdPath: (spec && spec.prdPath) || null, designPath: (spec && spec.designPath) || null };
    if (isBugFix) result.steps.spec.bugPath = spec.bugPath;
    if (spec && spec.architectureInjected) result.steps.spec.architecture = true;

    // Optional design stage — a panel of architects shapes the approach before
    // any code. Their notes feed the plan/context; the operator should record
    // the chosen approach as an ADR (Decision). Advisory: failures don't abort.
    // Skipped when the feature already has an APPROVED design doc: that doc is
    // the ratified design, and a panel improvising from the task title would
    // compete with it instead of following it.
    // Trust (raise-only): a low/critical implementer tier raises the pace one layer.
    let trustTier = null;
    if (flow && flow.trust && flow.trust.enabled && typeof fetchTrust === 'function' && implementer) {
      try { trustTier = await fetchTrust(implementer.name); } catch (err) { degrade('trust', err.message); }
    }

    // Pace before code exists: from the task's referenced paths. Decides whether
    // the design panel runs; the post-implementation pace (real diff) sizes review.
    let prePace = null;
    if (flow && flow.pace && flow.pace.enabled) {
      try {
        prePace = evaluatePace(projectRoot, { files: referencedPaths(task), trustTier });
        result.steps.pace = { pre: prePace };
      } catch (err) { degrade('pace', err.message); }
    }

    let designText = null;
    if (designPanel && designPanel.providers.length && runDesign && isBugFix) {
      result.steps.design = { skipped: true, reason: `bug fix: the confirmed bug report ${spec.bugPath} is the input` };
    } else if (designPanel && designPanel.providers.length && runDesign && spec && spec.designApproved) {
      result.steps.design = { skipped: true, reason: `approved design doc ${spec.designPath} is the design input` };
    } else if (designPanel && designPanel.providers.length && runDesign && prePace && prePace.ceremony.designPanel === false) {
      result.steps.design = { skipped: true, reason: `pace ${prePace.verdict}: the change earns no design panel` };
    } else if (designPanel && designPanel.providers.length && runDesign) {
      try {
        const fmId = (task.frontmatter || {}).id;
        const fmTitle = (task.frontmatter || {}).title;
        const designGuidance = capabilities.formatCapabilityGuidance(grants.design);
        const designTools = capabilities.capabilityToolNames(grants.design);
        const designs = await Promise.all(designPanel.providers.map((p) =>
          spawn({ type: 'design', provider: p, panel: designPanel.panel, capabilities: grants.design, tools: designTools, prompt: [`As the ${p.role} (agent: ${p.name}), propose the design/approach for task ${fmId}: ${fmTitle}. Work within the system architecture below — name the components you change and the contracts that connect them. Flag risks and the key architectural decision.`, specText, designGuidance].filter(Boolean).join('\n\n') })));
        const notes = designs.map((d, i) => ({ architect: designPanel.providers[i].name, role: designPanel.providers[i].role, note: typeof d === 'string' ? d : (d && (d.design || d.summary)) || '' }));
        designText = ['Architecture design input (record the chosen approach as an ADR):', ...notes.map((n) => `- ${n.role} (${n.architect}): ${n.note}`)].join('\n');
        result.steps.design = { providers: designPanel.providers.map((p) => p.name), panel: designPanel.panel, notes };
      } catch (err) {
        if (err.name === 'BudgetExceeded') throw err;
        result.steps.design = { providers: designPanel.providers.map((p) => p.name), error: err.message };
      }
    }

    // Pre-action context (the R8 d=1.82 lever). Interactive runs fetch this at
    // step 4c; for unattended runs we resolve it here via the injected fetchCxpak
    // seam when the caller didn't supply cxpakContext. Advisory — a null result
    // (cxpak absent or a cold index) degrades to design/plan context, never blocks.
    let resolvedCxpak = cxpakContext;
    if (!resolvedCxpak && typeof fetchCxpak === 'function') {
      try { resolvedCxpak = await fetchCxpak(task); } catch (err) { resolvedCxpak = null; degrade('cxpak', err.message); }
      if (!resolvedCxpak && !result.degraded.some((d) => d.seam === 'cxpak')) degrade('cxpak', 'no structural context (cxpak absent or index cold)');
    }
    result.steps.cxpak = { fetched: !!resolvedCxpak && !cxpakContext, injected: !!cxpakContext };

    // Architectural decisions (ADRs) — the design-time constraints the plan and
    // the implementer must honor. Resolved via the injected fetchDecisions seam
    // (project-scope + task-referenced DECs). Advisory input, never blocks: no
    // decisions / a read error degrades to null. This is what makes front-loaded
    // design reach implementation instead of only gating admission.
    let decisionsText = null;
    if (typeof fetchDecisions === 'function') {
      try { decisionsText = steps.formatDecisionsContext(await fetchDecisions(task)); } catch (err) { decisionsText = null; degrade('decisions', err.message); }
    }
    result.steps.decisions = { injected: !!decisionsText };

    // Optional plan stage (e.g. the /code-plan skill) — its output augments the
    // pre-action context handed to the implementer (cxpak + design notes). ADRs
    // ride their own dedicated block in the developer prompt (decisionsContext).
    const baseContext = [resolvedCxpak, designText].filter(Boolean).join('\n') || null;
    let planText = baseContext;
    let planStr = '';
    const useManifest = !!(flow && flow.manifest && flow.manifest.enabled);
    if (planProvider && runPlan) {
      try {
        const planGoal = isBugFix
          ? `Produce a fix plan for bug task ${(task.frontmatter || {}).id}: ${(task.frontmatter || {}).title}. Locate the root cause from the bug report below; the fix's accept runs the report's Reproduction test (RED now, GREEN after the fix). Keep the change minimal.`
          : `Produce an implementation plan for task ${(task.frontmatter || {}).id}: ${(task.frontmatter || {}).title}. Derive it from the specification below — every PRD acceptance criterion maps to plan steps, and the design doc's data model/interfaces/data flow are implemented as written.`;
        const planPrompt = [planGoal, useManifest ? MANIFEST_INSTRUCTION : null, specText, decisionsText].filter(Boolean).join('\n\n');
        const plan = await spawn({ type: 'plan', provider: planProvider, prompt: planPrompt });
        planStr = typeof plan === 'string' ? plan : (plan && plan.plan) || '';
        if (planStr) planText = [baseContext, `Implementation plan (${planProvider.name}):`, planStr].filter(Boolean).join('\n');
        result.steps.plan = { provider: planProvider, produced: !!planStr };
      } catch (err) {
        if (err.name === 'BudgetExceeded') throw err;
        result.steps.plan = { provider: planProvider, error: err.message }; // planning is advisory; continue
      }
    }

    // Execution manifest (slicr contract). None → the single-implementer path;
    // refused → abort (falling open past a refusal reruns the rejected input).
    let manifest = null;
    if (useManifest && planStr) {
      manifest = await resolveManifest(planStr, { invoke });
      if (manifest.status === 'refused') return abort('plan', [`execution manifest refused: ${manifest.reason}`], result);
      if (manifest.status === 'ok') {
        manifest.degraded.forEach((d) => degrade(d.seam, d.reason));
        result.steps.manifest = { source: manifest.source, nodes: manifest.nodes.map((n) => n.id), inline: manifest.inline.map((e) => e.id) };
      } else {
        result.steps.manifest = { status: 'none' };
      }
    }
    const nodePlan = manifest && manifest.status === 'ok' && manifest.nodes.length ? manifest : null;
    if (nodePlan) ctx.nodes = nodePlan.nodes;

    // Commit the plan with the change so it is reviewable and auditable.
    if (planStr && runner && flow && flow.plan && flow.plan.commit) {
      try {
        const cwd = activeWorktree || repoDir;
        const rel = writePlanArtifact({ cwd, task, planText: planStr, manifest, provider: planProvider && planProvider.name });
        runner(['add', rel], { cwd });
        runner(['commit', '-m', `docs(plan): ${(task.frontmatter || {}).id} implementation plan`], { cwd });
        result.steps.planArtifact = { path: rel };
      } catch (err) { degrade('plan-artifact', err.message); }
    }

    // Steps 5/6 + 7/8/9 — implement, then iterate dev<->review until approved.
    let developer = null;
    let review = null;
    let promiseResults = null;
    let promiseGate = null;
    let postPace = null;
    const gitCwd = activeWorktree || repoDir;
    let reviewContract = null;
    try { reviewContract = loadReviewContract(gitCwd); } catch (err) { degrade('review-contract', err.message); }

    for (let iter = 0; iter < maxIterations; iter++) {
      const feedback = review && !review.approved ? formatReviewerFeedback(review) : null;
      const implGuidance = capabilities.formatCapabilityGuidance(grants.implement);
      const implTools = capabilities.capabilityToolNames(grants.implement);

      if (iter === 0 && nodePlan) {
        // Step 5 (manifest path) — oracle first, then RED-gated nodes.
        let runAccept = injectedRunAccept;
        if (!runAccept) {
          try {
            runAccept = makeAcceptRunner({ sandbox: flow.sandbox, timeoutSec: flow.manifest.acceptTimeoutSec });
          } catch (err) {
            return abort('sandbox', [err.message], result);
          }
        }
        const nodes = await runNodes({
          task, nodes: nodePlan.nodes, spawn, implementer, tools: implTools, cwd: gitCwd, runner, runAccept,
          specContext: specText, decisionsContext: decisionsText, capabilityGuidance: implGuidance, retries: flow.manifest.nodeRetries,
        });
        result.steps.nodes = { status: nodes.status, nodes: nodes.nodes, testFiles: nodes.testFiles };
        if (nodes.status === 'halted') return abort('implement', [nodes.halt.reason], result);
        developer = nodes.developer;
        if (nodePlan.inline.length) {
          const inlineList = nodePlan.inline.map((e) => `- [${e.id}] ${e.change} (files: ${e.files.join(', ')}; done when: ${e.accept})`).join('\n');
          const { prompt } = steps.buildDeveloperPrompt({ task, branch, cxpakContext: planText, decisionsContext: decisionsText, specContext: specText, capabilityGuidance: implGuidance });
          const inlineRet = steps.parseDeveloperReturn(await spawn({ type: 'developer', provider: implementer, tools: implTools, prompt: `${prompt}\n\nThe manifest nodes are done and committed. Implement the remaining inline entries:\n${inlineList}`, iteration: iter, cwd: activeWorktree }));
          developer = { ...inlineRet, filesChanged: [...new Set([...developer.filesChanged, ...inlineRet.filesChanged])], verifications: [...developer.verifications, ...inlineRet.verifications] };
        }
      } else {
        // Step 5 — dev prompt (with cxpak/plan context +, on retries, reviewer feedback).
        const { prompt } = steps.buildDeveloperPrompt({ task, branch, cxpakContext: planText, decisionsContext: decisionsText, specContext: specText, capabilityGuidance: implGuidance });
        const devPrompt = feedback ? `${prompt}\n\nPrior review requested changes (address these specifically):\n${feedback}` : prompt;
        const devReturn = await spawn({ type: 'developer', provider: implementer, tools: implTools, prompt: devPrompt, iteration: iter, cwd: activeWorktree });

        // Step 6 — parse/validate dev return.
        developer = steps.parseDeveloperReturn(devReturn);
      }

      // Pace on the REAL change (first iteration): sizes the review team and
      // decides a draft PR. The HITL floor and trust apply here too.
      if (iter === 0 && flow && flow.pace && flow.pace.enabled && runner) {
        try {
          const range = `${baseBranch}...HEAD`;
          const files = parseNameStatus(String(runner(['diff', '--name-status', range], { cwd: gitCwd }).stdout || ''));
          const addedLines = addedLinesByFile(String(runner(['diff', '--unified=0', range], { cwd: gitCwd }).stdout || ''));
          postPace = evaluatePace(projectRoot, { files: files.length ? files : developer.filesChanged, addedLines, trustTier });
          result.steps.pace = { ...(result.steps.pace || {}), post: postPace };
          if (result.steps.planArtifact) result.steps.planDrift = planDrift({ files, planText: planStr, manifest });
        } catch (err) { degrade('pace', err.message); }
      }

      // Architecture conformance on the real change: findings go to the
      // reviewers (never the author) and a finding makes the change slow.
      let conformanceText = null;
      if (flow && flow.conformance && flow.conformance.enabled && runner) {
        try {
          const conf = checkArchitecture({ cwd: gitCwd, base: baseBranch, runner, projects });
          result.steps.conformance = { status: conf.status, findings: conf.findings, touched: conf.touched };
          if (conf.status === 'skipped') degrade('architecture-conformance', conf.reason);
          conformanceText = formatConformanceContext(conf);
          if (conf.status === 'findings' && postPace && postPace.verdict !== 'slow' && conf.findings.some((f) => f.severity === 'major')) {
            postPace = { ...postPace, verdict: 'slow', ceremony: { ...postPace.ceremony, maxReviewers: 0, draftPr: true }, conformanceRaised: true };
            result.steps.pace = { ...(result.steps.pace || {}), post: postPace };
          }
        } catch (err) { degrade('architecture-conformance', err.message); }
      }

      // Promise verification (advisory signal) on the produced change.
      let promiseContext = null;
      if (promiseVerify) {
        promiseResults = await promiseVerify({ files: developer.filesChanged, commitSha: developer.commitSha, workDir: activeWorktree });
        if (formatReviewerContext) promiseContext = formatReviewerContext(promiseResults);
        if (evaluatePromiseGate) promiseGate = evaluatePromiseGate(promiseResults, { config: qualityGateConfig });
      }

      // Step 7 — build review prompts (promise context is read-only reviewer
      // input); the reviewer roster comes from the resolved CapabilityMap team.
      // The reviewer must see the REAL diff (actual changed lines), not the
      // implementer's self-reported summary — otherwise a cross-harness review
      // is grading a paraphrase and the independence guarantee is hollow.
      const diff = steps.computeReviewDiff({ runner, cwd: activeWorktree, baseBranch, commitSha: developer.commitSha, fallbackSummary: developer.summary });
      const maxReviewers = postPace && postPace.ceremony.maxReviewers > 0 ? postPace.ceremony.maxReviewers : 0;
      const team = reviewTeam ? (maxReviewers ? reviewTeam.providers.slice(0, maxReviewers) : reviewTeam.providers) : undefined;
      const driftText = result.steps.planDrift && result.steps.planDrift.length
        ? `Plan drift (deterministic): changed but not in the committed plan ${result.steps.planArtifact.path}: ${result.steps.planDrift.join(', ')} — the plan should have been updated with the code, or the change exceeds it (minor unless it is scope creep).`
        : null;
      const reviewerContext = [promiseContext, conformanceText, driftText].filter(Boolean).join('\n\n') || null;
      const { prompts } = steps.buildReviewPrompts({ task, diff, promiseContext: reviewerContext, specContext: specText, team, reviewContract: formatReviewContract(reviewContract), capabilityGuidance: capabilities.formatCapabilityGuidance(grants.review) });

      // Dispatch the reviewers — as a Native Team when 3+ (reviewTeam.team).
      const asTeam = reviewTeam ? reviewTeam.team : false;
      const reviewTools = capabilities.capabilityToolNames(grants.review);
      const rawVerdicts = await Promise.all(prompts.map((p) => spawn({ type: 'reviewer', reviewer: p.reviewer, provider: p.provider, team: asTeam, tools: reviewTools, prompt: p.prompt, cwd: activeWorktree })));
      // REVIEW.md: drop findings on skipped paths, cap nits — deterministically.
      const verdicts = applyReviewContract(rawVerdicts, reviewContract);

      // Step 8 — aggregate.
      review = steps.aggregateVerdicts({ verdicts });
      result.steps.review = { ...review, iterations: iter + 1, findings: verdicts.flatMap((v) => (v && v.findings) || []).slice(0, 100) };
      if (review.approved) break;
    }

    result.steps.developer = { commitSha: developer.commitSha, filesChanged: developer.filesChanged };
    if (promiseGate) result.steps.promiseGate = promiseGate;

    if (!review || !review.approved) {
      return abort('review', ['reviewers requested changes after max iterations'], result);
    }
    // A hard-mandatory promise gate blocks the MERGE (pipeline boundary), not the author.
    if (promiseGate && promiseGate.blocking) {
      return abort('promise-gate', [`hard-mandatory promise gate failed: ${promiseGate.brokenPromises.join(', ')}`], result);
    }

    // A shipped feature joins the product context's Current capabilities, in
    // this branch, so the line rides the feature's own PR.
    if (flow && flow.product && flow.product.recordShipped && runner && spec && spec.kind === 'feature' && spec.prdPath) {
      try {
        const fm = task.frontmatter || {};
        const rec = recordShippedCapability(gitCwd, { title: fm.title, prdPath: spec.prdPath, taskId: fm.id });
        if (rec.recorded) {
          runner(['add', 'docs/product/context.md'], { cwd: gitCwd });
          runner(['commit', '-m', `docs(product): record shipped capability (${fm.id})`], { cwd: gitCwd });
        } else if (!/already recorded/.test(rec.reason)) {
          degrade('product-context', rec.reason);
        }
        result.steps.productContext = rec;
      } catch (err) { degrade('product-context', err.message); }
    }

    // HITL sign-off gate — the last stop before anything leaves the machine. A
    // fired checkpoint without a human HITL-ACK stops the run; the pipeline never
    // acknowledges on a human's behalf.
    if (flow && flow.hitl && flow.hitl.enabled && runner) {
      const hitl = await evaluateHitl({ cwd: gitCwd, base: baseBranch, runner, invoke });
      hitl.degraded.forEach((d) => degrade(d.seam, d.reason));
      result.steps.hitl = { status: hitl.status, fired: hitl.fired, unacked: hitl.unacked, source: hitl.source, warnings: hitl.warnings };
      if (hitl.status === 'blocked') return abort('hitl', formatBlocked(hitl), result);
    }

    // Step 10 — finalize.
    result.steps.finalize = steps.finalizeTask({ taskFilePath, completedDir, requireAllAcChecked, task });

    // Step 11 — push + PR.
    if (gh) {
      result.steps.cost = { usd: Number(ctx.meter.usd.toFixed(4)), calls: ctx.meter.calls };
      result.steps.pr = steps.pushAndPr({
        branch, task, baseBranch, runner, gh, worktreePath: activeWorktree,
        draft: !!(postPace && postPace.ceremony.draftPr), body: buildValidationReport({ task, result }),
      });
    }

    // Step 12 — sibling PRs for cross-repo changes.
    if (gh && developer.filesChangedExternal && developer.filesChangedExternal.length) {
      result.steps.siblingPrs = steps.siblingPrs({ filesChangedExternal: developer.filesChangedExternal, resolveRepoForPath, gh, branch });
    }

    result.ok = true;
    return result;
  } catch (err) {
    if (err && err.name === 'BudgetExceeded') return abort('budget', [err.message], result);
    return abort(result.steps && !result.steps.review ? 'implement' : 'pipeline', [err.message], result);
  } finally {
    // Step 13 — cleanup always runs.
    try {
      result.steps.cleanup = steps.cleanupTask({ worktreePath: activeWorktree });
    } catch {
      /* cleanup is best-effort */
    }
  }
}

function formatReviewerFeedback(review) {
  return `Review decision: ${review.decision} (${review.counts.critical} critical, ${review.counts.major} major).`;
}

module.exports = { executePipeline, meterSpawn, buildRunRecord, BudgetExceeded };
