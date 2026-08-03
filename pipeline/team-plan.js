// Native Teams dispatch planner.
//
// This is the bridge between the pipeline's resolved roster (a review team or a
// design panel) and Claude Code's Native Teams mechanism. It does NOT call the
// team tools itself — TeamCreate / Task / TeamDelete are session tools the
// ORCHESTRATOR (the Claude session running /ai-sdlc:execute) invokes. This
// helper produces a deterministic, testable descriptor telling the orchestrator
// exactly how to run the stage:
//
//   - useTeam=true  -> TeamCreate a team, Task each teammate into it, collect
//     verdicts from the per-teammate JSONL inboxes, aggregate, TeamDelete.
//     Used when >=3 agents run together (the reviewer team; a large design panel).
//   - useTeam=false -> dispatch the providers as plain parallel Task calls (no
//     team needed — independent agents with nothing to coordinate).
//
// The unattended adapter (adapters/claude-code-spawner.js) doesn't use Native
// Teams at all: independent reviewers need no shared inbox, so it just runs
// parallel `claude -p` processes. Native Teams matters in INTERACTIVE mode,
// where teammates coordinate and the orchestrator watches the JSONL state.

const TEAM_THRESHOLD = 3;

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

// Build a dispatch plan for a stage roster.
//   opts: { taskId, stage, providers, team?, threshold? }
// Returns a descriptor the orchestrator (or execute.md) consumes verbatim.
function buildTeamPlan({ taskId, stage, providers = [], team, threshold = TEAM_THRESHOLD }) {
  const roster = providers.map((p) => ({
    role: p.role || p.name,
    agentType: p.name,
    harness: p.harness || null,
  }));
  const useTeam = (team === true || roster.length >= threshold) && roster.length > 1;
  const teamName = `ai-sdlc-${slug(stage)}-${slug(taskId)}`;

  return {
    stage,
    taskId,
    useTeam,
    teamName: useTeam ? teamName : null,
    dispatch: useTeam ? 'native-team' : 'parallel-task',
    teammates: roster,
    coordination: useTeam ? 'jsonl' : 'none',
    // The exact tool sequence the orchestrator runs for this stage.
    orchestratorSteps: useTeam
      ? [
          `TeamCreate { name: "${teamName}" }`,
          'Task each teammate into the team (one per reviewer/architect role)',
          'Collect each teammate verdict from its JSONL inbox',
          'Aggregate verdicts (APPROVED iff all approve and no critical/major)',
          'TeamDelete the team',
        ]
      : [
          'Dispatch each provider as a parallel Task call',
          'Await all results',
        ],
    requires: useTeam ? ['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1'] : [],
  };
}

module.exports = { buildTeamPlan, TEAM_THRESHOLD };
