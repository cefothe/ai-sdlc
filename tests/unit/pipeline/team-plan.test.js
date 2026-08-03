const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { buildTeamPlan } = require(path.join(ROOT, 'pipeline', 'team-plan.js'));

const providers = (n) => Array.from({ length: n }, (_, i) => ({ role: `r${i}`, name: `agent-${i}`, harness: 'codex' }));

describe('buildTeamPlan', () => {
  test('3+ providers -> Native Team dispatch with a team name + JSONL coordination', () => {
    const plan = buildTeamPlan({ taskId: 'AISDLC-1', stage: 'review', providers: providers(3), team: true });
    expect(plan.useTeam).toBe(true);
    expect(plan.dispatch).toBe('native-team');
    expect(plan.teamName).toBe('ai-sdlc-review-aisdlc-1');
    expect(plan.coordination).toBe('jsonl');
    expect(plan.teammates).toHaveLength(3);
    expect(plan.requires).toContain('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1');
    expect(plan.orchestratorSteps[0]).toMatch(/TeamCreate/);
    expect(plan.orchestratorSteps[plan.orchestratorSteps.length - 1]).toMatch(/TeamDelete/);
  });

  test('a single provider -> plain Task, no team', () => {
    const plan = buildTeamPlan({ taskId: 'AISDLC-2', stage: 'review', providers: providers(1) });
    expect(plan.useTeam).toBe(false);
    expect(plan.dispatch).toBe('parallel-task');
    expect(plan.teamName).toBeNull();
    expect(plan.requires).toEqual([]);
  });

  test('2 providers below threshold -> parallel Task unless team forced', () => {
    expect(buildTeamPlan({ taskId: 'A', stage: 'design', providers: providers(2) }).useTeam).toBe(false);
    expect(buildTeamPlan({ taskId: 'A', stage: 'design', providers: providers(2), team: true }).useTeam).toBe(true);
  });

  test('teammates carry role + agentType + harness for Task dispatch', () => {
    const t = buildTeamPlan({ taskId: 'A', stage: 'review', providers: providers(3) }).teammates[0];
    expect(t).toEqual({ role: 'r0', agentType: 'agent-0', harness: 'codex' });
  });
});
