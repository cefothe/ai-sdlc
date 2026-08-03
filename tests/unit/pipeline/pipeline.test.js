const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const steps = require(path.join(ROOT, 'pipeline', 'steps.js'));
const { executePipeline } = require(path.join(ROOT, 'pipeline', 'execute.js'));
const { parseTask } = require(path.join(ROOT, 'decision-engine', 'backlog-task.js'));
const { evaluateDor } = require(path.join(ROOT, 'decision-engine', 'dor-gate.js'));
const { evaluatePromiseGate, formatReviewerContext } = require(path.join(ROOT, 'quality-gate', 'promise-gate.js'));

const WARN = { spec: { evaluationMode: 'warn-only', autoPassRules: [] } };

function taskMarkdown(status = 'To Do') {
  return [
    '---',
    'id: AISDLC-1',
    "title: 'feat: add a thing'",
    `status: ${status}`,
    'dispatchable: true',
    'references:',
    '  - README.md',
    '---',
    '## Acceptance Criteria',
    '<!-- AC:BEGIN -->',
    '- [x] #1 done',
    '<!-- AC:END -->',
  ].join('\n');
}

// A git runner fake: parent tree on main + clean; records git calls.
function fakeRunner(state = { branch: 'main', clean: true }) {
  const calls = [];
  const runner = (args, o) => {
    calls.push({ args, o });
    if (args[0] === 'rev-parse') return { stdout: `${state.branch}\n` };
    if (args[0] === 'status') return { stdout: state.clean ? '' : ' M file\n' };
    return { stdout: '' };
  };
  runner.calls = calls;
  return runner;
}

const validDevReturn = { commitSha: 'abc123', filesChanged: ['src/a.js'], filesChangedExternal: [], verifications: ['tests pass'], summary: 'did the thing' };

describe('steps: pure primitives', () => {
  test('slugify + computeBranchName', () => {
    expect(steps.slugify('Feat: Add a Thing!!')).toBe('feat-add-a-thing');
    expect(steps.slugify('***')).toBe('task');
    const b = steps.computeBranchName({ taskId: 'AISDLC-1', task: { title: 'Fix the bug' } });
    expect(b).toBe('ai-sdlc/aisdlc-1-fix-the-bug');
  });

  test('aggregateVerdicts: APPROVED only when all approve and no critical/major', () => {
    expect(steps.aggregateVerdicts({ verdicts: [{ approved: true, findings: [{ severity: 'minor' }] }, { approved: true, findings: [] }] }).decision).toBe('APPROVED');
    expect(steps.aggregateVerdicts({ verdicts: [{ approved: true, findings: [{ severity: 'major' }] }] }).decision).toBe('CHANGES_REQUESTED');
    expect(steps.aggregateVerdicts({ verdicts: [{ approved: false, findings: [] }] }).decision).toBe('CHANGES_REQUESTED');
  });

  test('parseDeveloperReturn rejects missing commitSha / verifications', () => {
    expect(() => steps.parseDeveloperReturn({ verifications: ['x'] })).toThrow(/commitSha/);
    expect(() => steps.parseDeveloperReturn({ commitSha: 'x' })).toThrow(/verifications/);
    expect(steps.parseDeveloperReturn(validDevReturn).commitSha).toBe('abc123');
  });

  test('setupWorktree enforces Pattern C', () => {
    const runner = fakeRunner();
    expect(() => steps.setupWorktree({ repoDir: '/r', worktreePath: '/wt', branch: 'b', runner, gitState: () => ({ branch: 'feature', clean: true }) })).toThrow(/must be on main/);
    expect(() => steps.setupWorktree({ repoDir: '/r', worktreePath: '/wt', branch: 'b', runner, gitState: () => ({ branch: 'main', clean: false }) })).toThrow(/dirty/);
    const r = steps.setupWorktree({ repoDir: '/r', worktreePath: '/wt', branch: 'b', runner, gitState: () => ({ branch: 'main', clean: true }) });
    expect(r.branch).toBe('b');
    expect(runner.calls.some((c) => c.args[0] === 'worktree' && c.args[1] === 'add')).toBe(true);
  });

  test('beginTask flips status and writes sentinel', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'begin-'));
    try {
      const tf = path.join(dir, 'task.md');
      fs.writeFileSync(tf, taskMarkdown('To Do'));
      const wt = path.join(dir, 'wt');
      steps.beginTask({ taskFilePath: tf, worktreePath: wt, taskId: 'AISDLC-1' });
      expect(fs.readFileSync(tf, 'utf8')).toMatch(/status: In Progress/);
      expect(fs.readFileSync(path.join(wt, '.active-task'), 'utf8')).toBe('AISDLC-1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('finalizeTask moves file to completed and refuses unchecked ACs when required', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-'));
    try {
      const tf = path.join(dir, 'tasks', 't.md');
      fs.mkdirSync(path.dirname(tf), { recursive: true });
      fs.writeFileSync(tf, taskMarkdown('In Progress'));
      const completed = path.join(dir, 'completed');
      const okTask = { acceptanceCriteria: [{ checked: true }] };
      const r = steps.finalizeTask({ taskFilePath: tf, completedDir: completed, requireAllAcChecked: true, task: okTask });
      expect(r.movedTo).toBe(path.join(completed, 't.md'));
      expect(fs.existsSync(r.movedTo)).toBe(true);
      expect(() => steps.finalizeTask({ taskFilePath: r.movedTo, completedDir: completed, requireAllAcChecked: true, task: { acceptanceCriteria: [{ checked: false }] } })).toThrow(/unchecked/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('executePipeline', () => {
  function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-'));
    const tasksDir = path.join(dir, 'backlog', 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    const taskFilePath = path.join(tasksDir, 'AISDLC-1 - feat.md');
    fs.writeFileSync(taskFilePath, taskMarkdown('To Do'));
    const task = parseTask(fs.readFileSync(taskFilePath, 'utf8'));
    return { dir, taskFilePath, task, completedDir: path.join(dir, 'backlog', 'completed') };
  }

  const baseOpts = (extra) => ({
    taskId: 'AISDLC-1', baseBranch: 'main',
    runner: fakeRunner(), gitState: () => ({ branch: 'main', clean: true }),
    gh: () => ({ stdout: 'https://github.com/org/repo/pull/1\n' }),
    evaluateDor, dorConfig: WARN, projectRoot: ROOT,
    spawn: async ({ type }) => (type === 'developer' ? validDevReturn : { approved: true, findings: [] }),
    ...extra,
  });

  test('happy path: admits, implements, reviews approve, finalizes, opens PR, cleans up', async () => {
    const { dir, taskFilePath, task, completedDir } = setup();
    try {
      const worktreePath = path.join(dir, '.worktrees', 'aisdlc-1');
      const r = await executePipeline(baseOpts({ task, taskFilePath, completedDir, worktreePath }));
      expect(r.ok).toBe(true);
      expect(r.steps.branch).toBe('ai-sdlc/aisdlc-1-feat-add-a-thing');
      expect(r.steps.review.approved).toBe(true);
      expect(r.steps.pr.url).toMatch(/pull\/1/);
      expect(r.steps.finalize.movedTo).toBe(path.join(completedDir, 'AISDLC-1 - feat.md'));
      expect(r.steps.cleanup.cleaned).toBe(true);
      expect(fs.existsSync(path.join(worktreePath, '.active-task'))).toBe(false); // sentinel removed
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('DoR refusal aborts before dispatch (enforce mode, unresolved reference)', async () => {
    const { dir, taskFilePath, completedDir } = setup();
    try {
      const badTask = parseTask(taskMarkdown('To Do').replace('  - README.md', '  - does/not/exist.md'));
      const r = await executePipeline(baseOpts({ task: badTask, taskFilePath, completedDir, dorConfig: { spec: { evaluationMode: 'enforce', autoPassRules: [] } } }));
      expect(r.ok).toBe(false);
      expect(r.abortedAt).toBe('validate');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Pattern C: refuses when parent tree is not on main', async () => {
    const { dir, taskFilePath, task, completedDir } = setup();
    try {
      const r = await executePipeline(baseOpts({ task, taskFilePath, completedDir, worktreePath: path.join(dir, '.worktrees', 'x'), gitState: () => ({ branch: 'feature', clean: true }) }));
      expect(r.ok).toBe(false);
      expect(r.reasons.join(' ')).toMatch(/Pattern C/);
      expect(r.steps.cleanup).toBeDefined(); // cleanup still ran (finally)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('informed retry: dev re-dispatched with feedback until reviewers approve', async () => {
    const { dir, taskFilePath, task, completedDir } = setup();
    try {
      let round = 0;
      const spawn = async ({ type }) => {
        if (type === 'developer') return validDevReturn;
        round += 1;
        // first review round: one reviewer flags major; second: all approve
        return round <= 3 && round % 3 === 1 ? { approved: false, findings: [{ severity: 'major', message: 'fix' }] } : { approved: true, findings: [] };
      };
      const r = await executePipeline(baseOpts({ task, taskFilePath, completedDir, spawn, worktreePath: path.join(dir, '.worktrees', 'r'), maxIterations: 2 }));
      expect(r.ok).toBe(true);
      expect(r.steps.review.iterations).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('promise advisory gate reports but does not block; hard-mandatory blocks the merge', async () => {
    const { dir, taskFilePath, task, completedDir } = setup();
    try {
      const promiseVerify = async () => [{ promise_id: 'error-handling', result: 'broken', confidence: 'high', evidence: 'missing try/catch' }];
      const advisoryCfg = { kind: 'QualityGate', spec: { gates: [{ name: 'promise-verification', enforcement: 'advisory', rule: { metric: 'promise.broken_count', operator: '==', threshold: 0 } }] } };
      const okRun = await executePipeline(baseOpts({ task, taskFilePath, completedDir, worktreePath: path.join(dir, '.worktrees', 'a'), promiseVerify, evaluatePromiseGate, formatReviewerContext, qualityGateConfig: advisoryCfg }));
      expect(okRun.ok).toBe(true);
      expect(okRun.steps.promiseGate.blocking).toBe(false);

      const { dir: dir2, taskFilePath: tf2, task: task2, completedDir: cd2 } = setup();
      const hardCfg = { kind: 'QualityGate', spec: { gates: [{ name: 'promise-verification', enforcement: 'hard-mandatory', rule: { metric: 'promise.broken_count', operator: '==', threshold: 0 } }] } };
      const blocked = await executePipeline(baseOpts({ task: task2, taskFilePath: tf2, completedDir: cd2, worktreePath: path.join(dir2, '.worktrees', 'b'), promiseVerify, evaluatePromiseGate, formatReviewerContext, qualityGateConfig: hardCfg }));
      expect(blocked.ok).toBe(false);
      expect(blocked.abortedAt).toBe('promise-gate');
      fs.rmSync(dir2, { recursive: true, force: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('developer return without commitSha aborts and still cleans up', async () => {
    const { dir, taskFilePath, task, completedDir } = setup();
    try {
      const spawn = async ({ type }) => (type === 'developer' ? { verifications: ['x'] } : { approved: true, findings: [] });
      const r = await executePipeline(baseOpts({ task, taskFilePath, completedDir, spawn, worktreePath: path.join(dir, '.worktrees', 'c') }));
      expect(r.ok).toBe(false);
      expect(r.reasons.join(' ')).toMatch(/commitSha/);
      expect(r.steps.cleanup.cleaned).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('CapabilityMap wiring (skills + agents + teams)', () => {
    const { loadCapabilityMap } = require(path.join(ROOT, 'pipeline', 'capabilities.js'));
    const MAP = loadCapabilityMap(path.join(ROOT, '.ai-sdlc', 'capabilities.yaml'));

    // A recording spawn that captures the provider + team flags per stage.
    function recordingSpawn() {
      const calls = [];
      const spawn = async (a) => {
        calls.push({ type: a.type, provider: a.provider, reviewer: a.reviewer, team: a.team });
        if (a.type === 'plan') return { plan: 'do X then Y' };
        if (a.type === 'developer') return validDevReturn;
        return { approved: true, findings: [] };
      };
      spawn.calls = calls;
      return spawn;
    }

    test('routes plan -> code-plan skill, implement -> java-pro, review -> 3 codex reviewers as a team', async () => {
      const { dir, taskFilePath, task, completedDir } = setup();
      try {
        const spawn = recordingSpawn();
        const r = await executePipeline(baseOpts({
          task, taskFilePath, completedDir, spawn, worktreePath: path.join(dir, '.worktrees', 'cap'),
          capabilityMap: MAP, taskContext: { languages: ['java'], files: ['src/Main.java'] }, implementerHarness: 'claude',
        }));
        expect(r.ok).toBe(true);
        expect(r.steps.capabilities.plan.name).toBe('code-plan');
        expect(r.steps.capabilities.implementer.name).toBe('java-pro');
        expect(r.steps.capabilities.review.team).toBe(true);
        // dev spawn carried the java-pro provider; reviewers carried team=true
        expect(spawn.calls.find((c) => c.type === 'developer').provider.name).toBe('java-pro');
        const reviewerCalls = spawn.calls.filter((c) => c.type === 'reviewer');
        expect(reviewerCalls).toHaveLength(3);
        expect(reviewerCalls.every((c) => c.team === true && c.provider.harness === 'codex')).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('Java test files route the test reviewer to qa-code-reviewer', async () => {
      const { dir, taskFilePath, task, completedDir } = setup();
      try {
        const spawn = recordingSpawn();
        await executePipeline(baseOpts({
          task, taskFilePath, completedDir, spawn, worktreePath: path.join(dir, '.worktrees', 'qa'),
          capabilityMap: MAP, taskContext: { files: ['src/test/java/FooTest.java'] },
        }));
        const testReviewer = spawn.calls.find((c) => c.type === 'reviewer' && c.reviewer === 'test-reviewer');
        expect(testReviewer.provider.name).toBe('qa-code-reviewer');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('design panel of architects runs before implement and feeds its notes forward', async () => {
      const { dir, taskFilePath, task, completedDir } = setup();
      try {
        const spawn = recordingSpawn();
        const r = await executePipeline(baseOpts({
          task, taskFilePath, completedDir, spawn, worktreePath: path.join(dir, '.worktrees', 'design'),
          capabilityMap: MAP, taskContext: { labels: ['cloud'], files: [] }, implementerHarness: 'claude',
        }));
        expect(r.ok).toBe(true);
        // design ran with the architect agents (incl. cloud-architect via routing)
        const designCalls = spawn.calls.filter((c) => c.type === 'design');
        expect(designCalls.map((c) => c.provider.name)).toEqual(expect.arrayContaining(['architect-review', 'backend-architect', 'cloud-architect']));
        expect(r.steps.design.notes.length).toBe(designCalls.length);
        // design happened before implement
        const firstImpl = spawn.calls.findIndex((c) => c.type === 'developer');
        const firstDesign = spawn.calls.findIndex((c) => c.type === 'design');
        expect(firstDesign).toBeLessThan(firstImpl);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a cross-harness misconfig (implementer on codex) aborts at the capabilities stage', async () => {
      const { dir, taskFilePath, task, completedDir } = setup();
      try {
        const r = await executePipeline(baseOpts({
          task, taskFilePath, completedDir, spawn: recordingSpawn(), worktreePath: path.join(dir, '.worktrees', 'x'),
          capabilityMap: MAP, taskContext: { files: [] }, implementerHarness: 'codex',
        }));
        expect(r.ok).toBe(false);
        expect(r.abortedAt).toBe('capabilities');
        expect(r.reasons.join(' ')).toMatch(/cross-harness violation/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
