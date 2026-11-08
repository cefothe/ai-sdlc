const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const ce = require(path.join(ROOT, 'measurement', 'config-evals.js'));
const repo = require(path.join(ROOT, 'tests', 'helpers', 'git-repo.js'));

function writeEval(dir, name, body) {
  fs.mkdirSync(path.join(dir, ce.EVALS_DIR), { recursive: true });
  fs.writeFileSync(path.join(dir, ce.EVALS_DIR, name), body);
}

describe('config evals', () => {
  let dir;
  beforeEach(() => { dir = repo.makeRepo({ 'src/a.js': 'module.exports = 1;\n' }); });
  afterEach(() => repo.remove(dir));

  test('loads tasks and refuses malformed ones', () => {
    writeEval(dir, 'a.yaml', 'id: t-1\nprompt: do x\nbase: HEAD\nchecks: [ "true" ]\n');
    expect(ce.loadEvalTasks(dir)).toEqual([{ id: 't-1', prompt: 'do x', base: 'HEAD', checks: ['true'], timeoutSec: 600, maxTurns: 40, agent: null }]);
    writeEval(dir, 'b.yaml', 'id: ../x\nprompt: p\nbase: HEAD\nchecks: [ "true" ]\n');
    expect(() => ce.loadEvalTasks(dir)).toThrow(/path-safe id/);
  });

  test('runEvalTask: the agent runs in a worktree at the base commit, checks decide, the worktree is removed', () => {
    const calls = [];
    const run = (cmd, args, opts) => {
      calls.push([cmd, args[0]]);
      if (cmd === 'claude') {
        fs.writeFileSync(path.join(opts.cwd, 'src', 'a.js'), 'module.exports = 2;\n');
        return { status: 0, stdout: JSON.stringify({ total_cost_usd: 0.42, result: 'done' }) };
      }
      return require('child_process').spawnSync(cmd, args, { encoding: 'utf8', ...opts });
    };
    const task = { id: 't-1', prompt: 'make it 2', base: 'HEAD', checks: ['grep -q 2 src/a.js', 'test -f src/a.js'], timeoutSec: 30, maxTurns: 5, agent: 'ai-sdlc:javascript-pro' };
    const r = ce.runEvalTask(task, { root: dir, run });
    expect(r).toMatchObject({ id: 't-1', passed: true, costUsd: 0.42 });
    expect(r.checks.map((c) => c.exit)).toEqual([0, 0]);
    expect(repo.git(dir, 'worktree', 'list').trim().split('\n')).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, 'src', 'a.js'), 'utf8')).toBe('module.exports = 1;\n');
  });

  test('runEvals gates against the baseline and reports UNDERPOWERED below 20 tasks', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }];
    const runTask = (t) => ({ id: t.id, passed: t.id === 'a', costUsd: 0.1, checks: [] });
    const noBase = ce.runEvals({ root: dir, tasks, runTask });
    expect(noBase).toMatchObject({ passRate: 0.5, verdict: 'no-baseline', underpowered: true, costUsd: 0.2 });
    ce.writeBaseline(dir, { passRate: 1, tasks: 2 });
    expect(ce.runEvals({ root: dir, tasks, runTask }).verdict).toBe('regression');
    expect(ce.runEvals({ root: dir, tasks, runTask, tolerance: 0.5 }).verdict).toBe('pass');
    expect(ce.formatReport(noBase)).toMatch(/UNDERPOWERED/);
  });

  test('harvest turns an ok run with accepts into an eval, once', () => {
    fs.mkdirSync(path.join(dir, 'backlog', 'completed'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'backlog', 'completed', 'AISDLC-0001 - add.md'), '---\nid: AISDLC-0001\ntitle: add\n---\n\n## Description\n\nAdd it.\n\n## Acceptance Criteria\n\n- [x] #1 add works\n');
    const rec = { taskId: 'AISDLC-0001', runId: 'r1', ok: true, implementation: { baseSha: 'abc123' }, accepts: [{ id: 'add', accept: 'npm test -- add' }] };
    expect(ce.harvest(dir, [rec, { ...rec, taskId: 'AISDLC-0002' }, { ...rec, ok: false }])).toEqual(['AISDLC-0001']);
    const [t] = ce.loadEvalTasks(dir);
    expect(t).toMatchObject({ id: 'AISDLC-0001', base: 'abc123', checks: ['npm test -- add'] });
    expect(t.prompt).toMatch(/Implement AISDLC-0001: add\nAdd it\.\nAcceptance criteria:\n- #1 add works/);
    expect(ce.harvest(dir, [rec])).toEqual([]);
  });
});
