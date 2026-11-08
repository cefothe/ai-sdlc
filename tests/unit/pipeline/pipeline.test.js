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

describe('ADRs as implementation context', () => {
  const decisions = [
    { metadata: { id: 'DEC-0001', scope: 'project' }, spec: { summary: 'ed25519 signing', rationale: 'small keys, native crypto' }, status: { lifecycle: 'answered', answeredOptionId: 'ed25519' } },
    { metadata: { id: 'DEC-0009', scope: 'feature' }, spec: { summary: 'cursor pagination' }, status: { lifecycle: 'proposed' } },
  ];

  test('formatDecisionsContext renders each ADR as a constraint with id + chosen option', () => {
    const out = steps.formatDecisionsContext(decisions);
    expect(out).toMatch(/CONSTRAINTS/);
    expect(out).toMatch(/DEC-0001 \[answered\/project\]: ed25519 signing \(chosen: ed25519\)/);
    expect(out).toMatch(/DEC-0009 \[proposed\/feature\]: cursor pagination/);
  });

  test('no decisions -> null (section omitted)', () => {
    expect(steps.formatDecisionsContext([])).toBeNull();
    expect(steps.formatDecisionsContext(undefined)).toBeNull();
  });

  test('formatDecisionsContext renders a { selected, omitted } partition, omitted by id only', () => {
    const out = steps.formatDecisionsContext({ selected: decisions, omitted: [{ metadata: { id: 'DEC-0099' }, spec: { summary: 'long unrelated text' } }] });
    expect(out).toMatch(/DEC-0099/);
    expect(out).not.toMatch(/long unrelated text/);
    expect(out).toMatch(/judged unrelated/);
    expect(steps.formatDecisionsContext({ selected: [], omitted: [] })).toBeNull();
  });

  test('primary ADRs get full detail (context/rationale/consequences/rejected); others one line', () => {
    const primary = {
      metadata: { id: 'DEC-0002', scope: 'feature' },
      spec: { summary: 'cursor pagination', context: 'lists exceed 10k rows', rationale: 'stable under inserts', consequences: 'no random page access', options: [{ id: 'cursor', description: 'chosen' }, { id: 'offset', description: 'drifts under concurrent inserts' }] },
      status: { lifecycle: 'answered', answeredOptionId: 'cursor' },
    };
    const out = steps.formatDecisionsContext({ selected: [decisions[0], primary], omitted: [], primary: ['DEC-0002'] });
    expect(out).toMatch(/implements these decisions directly/);
    expect(out).toMatch(/Context: lists exceed 10k rows/);
    expect(out).toMatch(/Decision\/rationale: stable under inserts/);
    expect(out).toMatch(/Consequences: no random page access/);
    expect(out).toMatch(/Rejected: offset — drifts under concurrent inserts/);
    expect(out).toMatch(/Other decisions in force:\n  - DEC-0001 \[answered\/project\]: ed25519 signing \(chosen: ed25519\) — small keys/);
  });

  test('the developer prompt carries the ADR constraints block', () => {
    const task = { frontmatter: { id: 'AISDLC-1', title: 'x' }, acceptanceCriteria: [{ text: 'do it' }] };
    const { prompt } = steps.buildDeveloperPrompt({ task, branch: 'b', decisionsContext: steps.formatDecisionsContext(decisions) });
    expect(prompt).toMatch(/DEC-0001/);
    expect(prompt).toMatch(/cite the DEC id/);
  });
});

describe('spec + description in prompts', () => {
  const task = {
    frontmatter: { id: 'AISDLC-1', title: 'SSO' },
    body: '## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nAdd OAuth login for admins.\n<!-- SECTION:DESCRIPTION:END -->\n',
    acceptanceCriteria: [{ text: 'logs in' }],
  };

  test('taskDescription reads the marker block or a Description section', () => {
    expect(steps.taskDescription(task)).toBe('Add OAuth login for admins.');
    expect(steps.taskDescription({ body: '## Description\nPlain text.\n## Acceptance Criteria\n- [ ] x' })).toBe('Plain text.');
    expect(steps.taskDescription({ body: '' })).toBe('');
  });

  test('the developer prompt carries the description and the spec block', () => {
    const { prompt } = steps.buildDeveloperPrompt({ task, branch: 'b', specContext: 'SPECIFICATION — PRD body here' });
    expect(prompt).toMatch(/Description:\nAdd OAuth login for admins\./);
    expect(prompt).toMatch(/SPECIFICATION — PRD body here/);
  });

  test('every reviewer prompt carries the spec and the review-against-spec instruction', () => {
    const { prompts } = steps.buildReviewPrompts({ task, diff: 'diff', specContext: 'SPECIFICATION — X' });
    expect(prompts).toHaveLength(3);
    for (const p of prompts) {
      expect(p.prompt).toMatch(/SPECIFICATION — X/);
      expect(p.prompt).toMatch(/acceptance criterion not implemented/);
    }
    const bare = steps.buildReviewPrompts({ task, diff: 'diff' });
    expect(bare.prompts[0].prompt).not.toMatch(/SPECIFICATION/);
  });
});

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

  test('aggregateVerdicts: a reviewer with no structured verdict is not approval', () => {
    const r = steps.aggregateVerdicts({ verdicts: [{ approved: true, findings: [] }, { summary: 'prose, no JSON' }, null] });
    expect(r).toMatchObject({ decision: 'CHANGES_REQUESTED', approved: false, invalidVerdicts: 2 });
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

  test('computeReviewDiff returns the REAL patch, not the summary', () => {
    const patch = 'diff --git a/src/a.js b/src/a.js\n+const x = 1;';
    const stat = 'src/a.js | 1 +';
    const calls = [];
    const runner = (args, o) => {
      calls.push({ args, o });
      if (args[0] === 'diff' && args[1] === '--stat') return { stdout: stat };
      if (args[0] === 'diff') return { stdout: patch };
      return { stdout: '' };
    };
    const diff = steps.computeReviewDiff({ runner, cwd: '/wt', baseBranch: 'main', commitSha: 'abc123', fallbackSummary: 'did the thing' });
    expect(diff).toContain(patch);
    expect(diff).toContain(stat);
    expect(diff).not.toContain('did the thing');
    // diffs against the merge-base range in the worktree cwd
    expect(calls.some((c) => c.args.join(' ') === 'diff main...HEAD' && c.o && c.o.cwd === '/wt')).toBe(true);
  });

  test('computeReviewDiff falls back to git show when the range is empty', () => {
    const runner = (args) => {
      if (args[0] === 'diff') return { stdout: '' };
      if (args[0] === 'show' && args.includes('--stat')) return { stdout: ' f | 1 +' };
      if (args[0] === 'show') return { stdout: 'diff --git a/f b/f\n+y' };
      return { stdout: '' };
    };
    const diff = steps.computeReviewDiff({ runner, cwd: '/wt', commitSha: 'abc123', fallbackSummary: 's' });
    expect(diff).toContain('+y');
  });

  test('computeReviewDiff degrades to a labeled summary only when git yields nothing', () => {
    const runner = () => ({ stdout: '' });
    const diff = steps.computeReviewDiff({ runner, cwd: '/wt', commitSha: '', fallbackSummary: 'only summary' });
    expect(diff).toMatch(/NOT the actual diff/);
    expect(diff).toContain('only summary');
  });

  test('computeReviewDiff truncates an oversized diff with a marker', () => {
    const big = 'x'.repeat(50);
    const runner = (args) => (args[0] === 'diff' && args[1] !== '--stat' ? { stdout: big } : { stdout: '' });
    const diff = steps.computeReviewDiff({ runner, cwd: '/wt', commitSha: 'a', fallbackSummary: 's', maxChars: 20 });
    expect(diff).toMatch(/diff truncated at 20 chars/);
  });

  test('computeReviewDiff survives a throwing runner via captured stdout', () => {
    const runner = (args) => {
      if (args[0] === 'diff' && args[1] !== '--stat') {
        const err = new Error('non-zero exit');
        err.stdout = 'diff --git a/f b/f\n+z';
        throw err;
      }
      return { stdout: '' };
    };
    const diff = steps.computeReviewDiff({ runner, cwd: '/wt', commitSha: 'a', fallbackSummary: 's' });
    expect(diff).toContain('+z');
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

    test('an approved design doc replaces the design panel and the spec reaches plan, developer and reviewers', async () => {
      const { dir, taskFilePath, task, completedDir } = setup();
      try {
        const calls = [];
        const spawn = async (a) => {
          calls.push(a);
          if (a.type === 'plan') return { plan: 'do X then Y' };
          if (a.type === 'developer') return validDevReturn;
          return { approved: true, findings: [] };
        };
        const fetchSpec = async () => ({ text: 'SPECIFICATION — approved contract', prdPath: 'docs/prd/a.md', designPath: 'docs/design/a.md', designApproved: true });
        const r = await executePipeline(baseOpts({
          task, taskFilePath, completedDir, spawn, fetchSpec, worktreePath: path.join(dir, '.worktrees', 'spec'),
          capabilityMap: MAP, taskContext: { labels: ['cloud'], files: [] }, implementerHarness: 'claude',
        }));
        expect(r.ok).toBe(true);
        expect(calls.filter((c) => c.type === 'design')).toHaveLength(0);
        expect(r.steps.design).toEqual({ skipped: true, reason: 'approved design doc docs/design/a.md is the design input' });
        expect(r.steps.spec).toEqual({ injected: true, kind: 'feature', prdPath: 'docs/prd/a.md', designPath: 'docs/design/a.md' });
        for (const type of ['plan', 'developer', 'reviewer']) {
          const c = calls.filter((x) => x.type === type);
          expect(c.length).toBeGreaterThan(0);
          expect(c.every((x) => x.prompt.includes('SPECIFICATION — approved contract'))).toBe(true);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('an unapproved design doc keeps the design panel; a failing fetchSpec degrades to no spec', async () => {
      const { dir, taskFilePath, task, completedDir } = setup();
      try {
        const spawn = recordingSpawn();
        const draft = await executePipeline(baseOpts({
          task, taskFilePath, completedDir, spawn, worktreePath: path.join(dir, '.worktrees', 'draft'),
          fetchSpec: async () => ({ text: 'SPEC', prdPath: 'p', designPath: 'd', designApproved: false }),
          capabilityMap: MAP, taskContext: { labels: ['cloud'], files: [] }, implementerHarness: 'claude',
        }));
        expect(draft.ok).toBe(true);
        expect(spawn.calls.some((c) => c.type === 'design')).toBe(true);

        const failing = await executePipeline(baseOpts({
          task, taskFilePath, completedDir, spawn: recordingSpawn(), worktreePath: path.join(dir, '.worktrees', 'fail'),
          fetchSpec: async () => { throw new Error('disk'); },
          capabilityMap: MAP, taskContext: { files: [] }, implementerHarness: 'claude',
        }));
        expect(failing.ok).toBe(true);
        expect(failing.steps.spec.injected).toBe(false);
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
