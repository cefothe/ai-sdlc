const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const hook = require(path.join(ROOT, 'hooks', 'usage-telemetry.js'));
const usage = require(path.join(ROOT, 'measurement', 'usage-report.js'));

describe('usage telemetry hook', () => {
  test('records Task/Agent subagents and Skills; ignores other tools', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'));
    const log = path.join(dir, 'usage.jsonl');
    try {
      expect(hook.record({ tool_name: 'Task', tool_input: { subagent_type: 'ai-sdlc:java-pro' }, session_id: 's1' }, log)).toMatchObject({ tool: 'Task', name: 'ai-sdlc:java-pro', session: 's1' });
      expect(hook.record({ tool_name: 'Skill', tool_input: { skill: 'code-plan' } }, log)).toMatchObject({ name: 'code-plan' });
      expect(hook.record({ tool_name: 'Read', tool_input: {} }, log)).toBeNull();
      expect(usage.loadUsage(log).map((e) => e.name)).toEqual(['ai-sdlc:java-pro', 'code-plan']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the hook is registered on PostToolUse for Task|Agent|Skill', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks.PostToolUse;
    expect(hooks.some((h) => h.matcher === 'Task|Agent|Skill' && h.hooks[0].command.includes('usage-telemetry.js'))).toBe(true);
  });
});

describe('usageReport', () => {
  test('ranks invocations in the window, strips plugin prefixes, lists never-used agents/skills', () => {
    const now = Date.parse('2026-11-07T00:00:00Z');
    const entries = [
      { at: '2026-11-06T00:00:00Z', name: 'ai-sdlc:java-pro' }, { at: '2026-11-05T00:00:00Z', name: 'java-pro' },
      { at: '2026-11-04T00:00:00Z', name: 'code-plan' }, { at: '2026-01-01T00:00:00Z', name: 'old-agent' },
    ];
    const rep = usage.usageReport(entries, { agents: ['java-pro', 'old-agent', 'rust-pro'], skills: ['code-plan', 'qa-full-cycle'], days: 30, now });
    expect(rep.top).toEqual([{ name: 'java-pro', count: 2 }, { name: 'code-plan', count: 1 }]);
    expect(rep.unusedAgents).toEqual(['old-agent', 'rust-pro']);
    expect(rep.unusedSkills).toEqual(['qa-full-cycle']);
    expect(usage.libraryNames(ROOT).agents).toContain('java-pro');
  });
});
