const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const adapter = require(path.join(ROOT, 'adapters', 'claude-code-spawner.js'));
const { executePipeline } = require(path.join(ROOT, 'pipeline', 'execute.js'));
const { parseTask } = require(path.join(ROOT, 'decision-engine', 'backlog-task.js'));
const { evaluateDor } = require(path.join(ROOT, 'decision-engine', 'dor-gate.js'));

describe('buildClaudeArgs', () => {
  test('agent provider adds --agent and requests JSON', () => {
    const args = adapter.buildClaudeArgs({ type: 'agent', name: 'java-pro' }, 'do it', { model: 'sonnet' });
    expect(args).toEqual(expect.arrayContaining(['-p', 'do it', '--output-format', 'json', '--agent', 'java-pro', '--model', 'sonnet']));
  });

  test('the general "claude" agent gets no --agent flag', () => {
    const args = adapter.buildClaudeArgs({ type: 'agent', name: 'claude' }, 'x');
    expect(args).not.toContain('--agent');
  });

  test('skill provider prefixes the prompt with /skill', () => {
    const args = adapter.buildClaudeArgs({ type: 'skill', name: 'code-plan' }, 'plan this');
    expect(args[1]).toBe('/code-plan\nplan this');
    expect(args).not.toContain('--agent');
  });

  test('a capability grant becomes a comma-joined --allowedTools allowlist', () => {
    const args = adapter.buildClaudeArgs({ type: 'agent', name: 'architect-review' }, 'design it', { tools: ['mcp__firecrawl', 'WebSearch', 'Skill'] });
    const i = args.indexOf('--allowedTools');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('mcp__firecrawl,WebSearch,Skill');
  });

  test('no tools -> no --allowedTools flag', () => {
    const args = adapter.buildClaudeArgs({ type: 'agent', name: 'claude' }, 'x');
    expect(args).not.toContain('--allowedTools');
  });
});

describe('parseClaudeResult', () => {
  test('unwraps the JSON payload from the result envelope', () => {
    const env = JSON.stringify({ type: 'result', result: JSON.stringify({ commitSha: 'abc', verifications: ['ok'] }) });
    expect(adapter.parseClaudeResult(env)).toMatchObject({ commitSha: 'abc' });
  });

  test('accepts an already-structured payload', () => {
    expect(adapter.parseClaudeResult(JSON.stringify({ approved: true, findings: [] })).approved).toBe(true);
  });

  test('falls back to { summary } for non-JSON output', () => {
    expect(adapter.parseClaudeResult('just some text')).toEqual({ summary: 'just some text' });
  });
});

describe('makeClaudeSpawner', () => {
  test('maps provider+prompt to a claude call and parses the return', async () => {
    const calls = [];
    const exec = (cmd, args) => {
      calls.push({ cmd, args });
      return JSON.stringify({ result: JSON.stringify({ commitSha: 'deadbeef', verifications: ['tests pass'], summary: 'ok' }) });
    };
    const spawn = adapter.makeClaudeSpawner({ exec });
    const out = await spawn({ type: 'developer', provider: { type: 'agent', name: 'java-pro' }, prompt: 'implement' });
    expect(out.commitSha).toBe('deadbeef');
    expect(calls[0].cmd).toBe('claude');
    expect(calls[0].args).toContain('--agent');
  });

  test('normalizes a reviewer reply missing approved', async () => {
    const exec = () => JSON.stringify({ result: JSON.stringify({ findings: [{ severity: 'minor' }] }) });
    const spawn = adapter.makeClaudeSpawner({ exec });
    const out = await spawn({ type: 'reviewer', provider: { type: 'agent', name: 'code-reviewer' }, prompt: 'review' });
    expect(out.approved).toBe(false);
    expect(out.findings).toHaveLength(1);
  });
});

describe('git + gh runners', () => {
  test('makeGitRunner shells git and returns stdout', () => {
    const exec = (cmd, args) => (args[0] === 'rev-parse' ? 'main\n' : '');
    const runner = adapter.makeGitRunner({ exec });
    expect(runner(['rev-parse', '--abbrev-ref', 'HEAD']).stdout).toBe('main\n');
  });

  test('makeGhRunner shells gh', () => {
    const exec = () => 'https://github.com/o/r/pull/9\n';
    expect(adapter.makeGhRunner({ exec })(['pr', 'create']).stdout).toMatch(/pull\/9/);
  });
});

describe('adapter drives the real pipeline end-to-end (fake exec)', () => {
  test('a single fake exec fulfills git, claude, and gh for a full run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
    const tasksDir = path.join(dir, 'backlog', 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    const taskFilePath = path.join(tasksDir, 'AISDLC-1 - feat.md');
    fs.writeFileSync(taskFilePath, ['---', 'id: AISDLC-1', "title: 'feat: thing'", 'status: To Do', 'dispatchable: true', 'references:', '  - README.md', '---', '## Acceptance Criteria', '<!-- AC:BEGIN -->', '- [x] #1 done', '<!-- AC:END -->'].join('\n'));
    const task = parseTask(fs.readFileSync(taskFilePath, 'utf8'));
    try {
      const exec = (cmd, args) => {
        if (cmd === 'git') return args[0] === 'rev-parse' ? 'main\n' : '';
        if (cmd === 'gh') return 'https://github.com/o/r/pull/1\n';
        if (cmd === 'claude') {
          const isReviewer = String(args[1]).includes('reviewer');
          const payload = isReviewer ? { approved: true, findings: [] } : { commitSha: 'abc123', verifications: ['ok'], summary: 'did it', filesChanged: ['README.md'] };
          return JSON.stringify({ result: JSON.stringify(payload) });
        }
        return '';
      };
      const seams = adapter.makeClaudeCodeSeams({ exec });
      const r = await executePipeline({
        taskId: 'AISDLC-1', task, taskFilePath, completedDir: path.join(dir, 'backlog', 'completed'),
        worktreePath: path.join(dir, '.worktrees', 'aisdlc-1'), baseBranch: 'main', projectRoot: ROOT,
        evaluateDor, dorConfig: { spec: { evaluationMode: 'warn-only', autoPassRules: [] } },
        gitState: () => ({ branch: 'main', clean: true }),
        ...seams,
      });
      expect(r.ok).toBe(true);
      expect(r.steps.pr.url).toMatch(/pull\/1/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unattended run auto-fetches cxpak and feeds it to the implementer', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cx-'));
    const tasksDir = path.join(dir, 'backlog', 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    const taskFilePath = path.join(tasksDir, 'AISDLC-2 - feat.md');
    fs.writeFileSync(taskFilePath, ['---', 'id: AISDLC-2', "title: 'feat: wire cxpak'", 'status: To Do', 'dispatchable: true', 'references:', '  - README.md', '---', '## Acceptance Criteria', '<!-- AC:BEGIN -->', '- [x] #1 done', '<!-- AC:END -->'].join('\n'));
    const task = parseTask(fs.readFileSync(taskFilePath, 'utf8'));
    const prompts = [];
    try {
      const exec = (cmd, args) => {
        if (cmd === 'git') return args[0] === 'rev-parse' ? 'main\n' : '';
        if (cmd === 'gh') return 'https://github.com/o/r/pull/2\n';
        if (cmd === 'cxpak' && args[0] === 'overview') return '## Module / Component Map\n- src/x.js exports foo';
        if (cmd === 'claude') {
          prompts.push(String(args[1]));
          const isReviewer = String(args[1]).includes('reviewer');
          const payload = isReviewer ? { approved: true, findings: [] } : { commitSha: 'abc123', verifications: ['ok'], summary: 'did it', filesChanged: ['README.md'] };
          return JSON.stringify({ result: JSON.stringify(payload) });
        }
        return '';
      };
      const seams = adapter.makeClaudeCodeSeams({ exec });
      const r = await executePipeline({
        taskId: 'AISDLC-2', task, taskFilePath, completedDir: path.join(dir, 'backlog', 'completed'),
        worktreePath: path.join(dir, '.worktrees', 'aisdlc-2'), baseBranch: 'main', projectRoot: ROOT,
        evaluateDor, dorConfig: { spec: { evaluationMode: 'warn-only', autoPassRules: [] } },
        gitState: () => ({ branch: 'main', clean: true }),
        ...seams,
      });
      expect(r.ok).toBe(true);
      expect(r.steps.cxpak.fetched).toBe(true);
      // The auto-fetched cxpak overview must reach the implementer's prompt.
      const devPrompt = prompts.find((p) => !p.includes('reviewer'));
      expect(devPrompt).toContain('Module / Component Map');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('makeCxpakFetcher', () => {
  test('returns overview context with the task title on success', async () => {
    const exec = (cmd, args) => (cmd === 'cxpak' && args[0] === 'overview') ? '## Module Map\n- a.js' : '';
    const ctx = await adapter.makeCxpakFetcher({ exec })({ frontmatter: { title: 'do X' } });
    expect(ctx).toContain('cxpak overview');
    expect(ctx).toContain('do X');
    expect(ctx).toContain('Module Map');
  });

  test('returns null when cxpak is absent (exec throws, no stdout)', async () => {
    const ctx = await adapter.makeCxpakFetcher({ exec: () => { throw new Error('ENOENT'); } })({});
    expect(ctx).toBeNull();
  });

  test('recovers captured stdout on a non-zero exit', async () => {
    const exec = () => { const e = new Error('exit 1'); e.stdout = '## Overview\ncontent'; throw e; };
    const ctx = await adapter.makeCxpakFetcher({ exec })({});
    expect(ctx).toContain('Overview');
  });

  test('returns null on a cold (indexing) index', async () => {
    const exec = () => 'cxpak: indexing in progress — retry in a few seconds';
    const ctx = await adapter.makeCxpakFetcher({ exec })({});
    expect(ctx).toBeNull();
  });

  test('makeClaudeCodeSeams exposes fetchCxpak', () => {
    const seams = adapter.makeClaudeCodeSeams({ exec: () => '' });
    expect(typeof seams.fetchCxpak).toBe('function');
  });
});
