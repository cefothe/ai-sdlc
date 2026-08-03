// Standalone review-team stage. Runs just Step 7–8 (cross-harness review +
// aggregate) against an existing branch/diff — no DoR, no worktree, no PR. It
// reuses the same capability resolution, team plan, prompt building, promise
// context, and aggregation the full pipeline uses, so a standalone `/ai-sdlc:review`
// gives byte-identical review behavior to a review inside `/ai-sdlc:execute`.
//
// The reviewers are dispatched through the injected `spawn` seam; in an
// interactive session that maps to Native Teams (see teamPlan in the return),
// unattended it maps to parallel `claude -p`.

const { resolveReviewTeam } = require('./capabilities');
const { buildTeamPlan } = require('./team-plan');
const { buildReviewPrompts, aggregateVerdicts } = require('./steps');

async function runReview(opts) {
  const {
    taskId = 'branch', task = { frontmatter: {} }, diff, capabilityMap, taskContext = {},
    implementerHarness = 'claude', spawn,
    promiseResults, formatReviewerContext, evaluatePromiseGate, qualityGateConfig,
  } = opts;

  if (!capabilityMap) throw new Error('runReview requires a capabilityMap');
  if (typeof spawn !== 'function') throw new Error('runReview requires a spawn seam');

  // Resolve the reviewer team (throws on a cross-harness misconfig) + team plan.
  const reviewTeam = resolveReviewTeam(capabilityMap, taskContext, { implementerHarness });
  if (reviewTeam.providers.length === 0) throw new Error('no reviewers resolved from the capability map');
  const teamPlan = buildTeamPlan({ taskId, stage: 'review', providers: reviewTeam.providers, team: reviewTeam.team });

  // Advisory promise signal -> read-only reviewer context + (optional) gate.
  let promiseContext = null;
  let promiseGate = null;
  if (promiseResults && formatReviewerContext) promiseContext = formatReviewerContext(promiseResults);
  if (promiseResults && evaluatePromiseGate) promiseGate = evaluatePromiseGate(promiseResults, { config: qualityGateConfig });

  const { prompts } = buildReviewPrompts({ task, diff, promiseContext, team: reviewTeam.providers });
  const verdicts = await Promise.all(prompts.map((p) =>
    spawn({ type: 'reviewer', reviewer: p.reviewer, provider: p.provider, team: reviewTeam.team, prompt: p.prompt })));

  const aggregate = aggregateVerdicts({ verdicts });
  const findings = verdicts.flatMap((v, i) => (v.findings || []).map((f) => ({ ...f, reviewer: prompts[i].reviewer })));

  return {
    ...aggregate,
    reviewers: reviewTeam.providers.map((p) => ({ role: p.role, name: p.name, harness: p.harness })),
    teamPlan,
    promiseGate,
    findings,
    // A hard-mandatory promise gate blocks the merge (pipeline boundary), not the author.
    blocked: aggregate.decision !== 'APPROVED' || !!(promiseGate && promiseGate.blocking),
  };
}

module.exports = { runReview };
