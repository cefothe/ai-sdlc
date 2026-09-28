// Step 0–13 pipeline orchestrator. Chains the primitives in steps.js with
// injected seams (runner=git, spawn=agent dispatch, gh=GitHub) so it runs
// end-to-end under test without a real repo or network.
//
// Integration points with our kept strengths:
//   - DoR gate (decision-engine/dor-gate) gates admission BEFORE dispatch.
//   - cxpak context feeds the developer prompt (pre-action, the d=1.82 lever).
//   - Promise verification runs post-change as an ADVISORY signal: it is fed
//     to the independent reviewers as read-only context (never to the author),
//     and only a hard-mandatory QualityGate blocks the *merge* (a pipeline
//     boundary), never the author's turn (R5/R15).
//   - The iterate loop re-dispatches a FRESH developer with aggregated reviewer
//     feedback — R16 informed retry (endorsed), NOT R15 clean-prompt resampling.

const steps = require('./steps');
const capabilities = require('./capabilities');
const { buildTeamPlan } = require('./team-plan');

function abort(stage, reasons, partial = {}) {
  return { ok: false, abortedAt: stage, reasons: Array.isArray(reasons) ? reasons : [reasons], ...partial };
}

async function executePipeline(opts) {
  const {
    taskId, task, projectRoot = process.cwd(),
    repoDir = projectRoot, baseBranch = 'main', worktreePath, worktreesDir,
    runner, spawn, gh, gitState, isMerged,
    dorConfig, evaluateDor, stageBJudge,
    cxpakContext, fetchCxpak,
    promiseVerify, qualityGateConfig, evaluatePromiseGate, formatReviewerContext,
    resolveRepoForPath,
    maxIterations = 2, requireAllAcChecked = false,
    taskFilePath, completedDir, branchPattern,
    capabilityMap, taskContext = {}, implementerHarness = 'claude', runPlan = true, runDesign = true,
  } = opts;

  const result = { ok: false, taskId, steps: {} };
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

    // Optional design stage — a panel of architects shapes the approach before
    // any code. Their notes feed the plan/context; the operator should record
    // the chosen approach as an ADR (Decision). Advisory: failures don't abort.
    let designText = null;
    if (designPanel && designPanel.providers.length && runDesign) {
      try {
        const fmId = (task.frontmatter || {}).id;
        const fmTitle = (task.frontmatter || {}).title;
        const designGuidance = capabilities.formatCapabilityGuidance(grants.design);
        const designTools = capabilities.capabilityToolNames(grants.design);
        const designs = await Promise.all(designPanel.providers.map((p) =>
          spawn({ type: 'design', provider: p, panel: designPanel.panel, capabilities: grants.design, tools: designTools, prompt: [`As the ${p.role} (agent: ${p.name}), propose the design/approach for task ${fmId}: ${fmTitle}. Flag risks and the key architectural decision.`, designGuidance].filter(Boolean).join('\n\n') })));
        const notes = designs.map((d, i) => ({ architect: designPanel.providers[i].name, role: designPanel.providers[i].role, note: typeof d === 'string' ? d : (d && (d.design || d.summary)) || '' }));
        designText = ['Architecture design input (record the chosen approach as an ADR):', ...notes.map((n) => `- ${n.role} (${n.architect}): ${n.note}`)].join('\n');
        result.steps.design = { providers: designPanel.providers.map((p) => p.name), panel: designPanel.panel, notes };
      } catch (err) {
        result.steps.design = { providers: designPanel.providers.map((p) => p.name), error: err.message };
      }
    }

    // Pre-action context (the R8 d=1.82 lever). Interactive runs fetch this at
    // step 4c; for unattended runs we resolve it here via the injected fetchCxpak
    // seam when the caller didn't supply cxpakContext. Advisory — a null result
    // (cxpak absent or a cold index) degrades to design/plan context, never blocks.
    let resolvedCxpak = cxpakContext;
    if (!resolvedCxpak && typeof fetchCxpak === 'function') {
      try { resolvedCxpak = await fetchCxpak(task); } catch (_) { resolvedCxpak = null; }
    }
    result.steps.cxpak = { fetched: !!resolvedCxpak && !cxpakContext, injected: !!cxpakContext };

    // Optional plan stage (e.g. the /code-plan skill) — its output augments the
    // pre-action context handed to the implementer (cxpak + design notes).
    const baseContext = [resolvedCxpak, designText].filter(Boolean).join('\n') || null;
    let planText = baseContext;
    if (planProvider && runPlan) {
      try {
        const plan = await spawn({ type: 'plan', provider: planProvider, prompt: `Produce an implementation plan for task ${(task.frontmatter || {}).id}: ${(task.frontmatter || {}).title}.` });
        const planStr = typeof plan === 'string' ? plan : (plan && plan.plan) || '';
        if (planStr) planText = [baseContext, `Implementation plan (${planProvider.name}):`, planStr].filter(Boolean).join('\n');
        result.steps.plan = { provider: planProvider, produced: !!planStr };
      } catch (err) {
        result.steps.plan = { provider: planProvider, error: err.message }; // planning is advisory; continue
      }
    }

    // Steps 5/6 + 7/8/9 — implement, then iterate dev<->review until approved.
    let developer = null;
    let review = null;
    let promiseResults = null;
    let promiseGate = null;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Step 5 — dev prompt (with cxpak/plan context +, on retries, reviewer feedback).
      const feedback = review && !review.approved ? formatReviewerFeedback(review) : null;
      const { prompt } = steps.buildDeveloperPrompt({ task, branch, cxpakContext: planText, capabilityGuidance: capabilities.formatCapabilityGuidance(grants.implement) });
      const devPrompt = feedback ? `${prompt}\n\nPrior review requested changes (address these specifically):\n${feedback}` : prompt;
      const devReturn = await spawn({ type: 'developer', provider: implementer, tools: capabilities.capabilityToolNames(grants.implement), prompt: devPrompt, iteration: iter });

      // Step 6 — parse/validate dev return.
      developer = steps.parseDeveloperReturn(devReturn);

      // Promise verification (advisory signal) on the produced change.
      let promiseContext = null;
      if (promiseVerify) {
        promiseResults = await promiseVerify({ files: developer.filesChanged, commitSha: developer.commitSha, workDir: activeWorktree });
        if (formatReviewerContext) promiseContext = formatReviewerContext(promiseResults);
        if (evaluatePromiseGate) promiseGate = evaluatePromiseGate(promiseResults, { config: qualityGateConfig });
      }

      // Step 7 — build review prompts (promise context is read-only reviewer
      // input); the reviewer roster comes from the resolved CapabilityMap team.
      const diff = developer.summary || '(diff via commit ' + developer.commitSha + ')';
      const { prompts } = steps.buildReviewPrompts({ task, diff, promiseContext, team: reviewTeam ? reviewTeam.providers : undefined, capabilityGuidance: capabilities.formatCapabilityGuidance(grants.review) });

      // Dispatch the reviewers — as a Native Team when 3+ (reviewTeam.team).
      const asTeam = reviewTeam ? reviewTeam.team : false;
      const reviewTools = capabilities.capabilityToolNames(grants.review);
      const verdicts = await Promise.all(prompts.map((p) => spawn({ type: 'reviewer', reviewer: p.reviewer, provider: p.provider, team: asTeam, tools: reviewTools, prompt: p.prompt })));

      // Step 8 — aggregate.
      review = steps.aggregateVerdicts({ verdicts });
      result.steps.review = { ...review, iterations: iter + 1 };
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

    // Step 10 — finalize.
    result.steps.finalize = steps.finalizeTask({ taskFilePath, completedDir, requireAllAcChecked, task });

    // Step 11 — push + PR.
    if (gh) result.steps.pr = steps.pushAndPr({ branch, task, baseBranch, runner, gh, worktreePath: activeWorktree });

    // Step 12 — sibling PRs for cross-repo changes.
    if (gh && developer.filesChangedExternal && developer.filesChangedExternal.length) {
      result.steps.siblingPrs = steps.siblingPrs({ filesChangedExternal: developer.filesChangedExternal, resolveRepoForPath, gh, branch });
    }

    result.ok = true;
    return result;
  } catch (err) {
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

module.exports = { executePipeline };
