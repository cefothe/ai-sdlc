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

  test('cwd roots the agent in the worktree; omitted -> process cwd', async () => {
    const calls = [];
    const exec = (cmd, args, opts) => { calls.push({ opts }); return JSON.stringify({ result: JSON.stringify({ summary: 'ok' }) }); };
    const spawn = adapter.makeClaudeSpawner({ exec });
    await spawn({ type: 'reviewer', provider: { type: 'agent', name: 'code-reviewer' }, prompt: 'r', cwd: '/wt/task-1' });
    expect(calls[0].opts.cwd).toBe('/wt/task-1');
    await spawn({ type: 'reviewer', provider: { type: 'agent', name: 'code-reviewer' }, prompt: 'r' });
    expect('cwd' in calls[1].opts).toBe(false);
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
      // workDir roots the seams (run records, flow config) in the temp dir, never the repo.
      const seams = adapter.makeClaudeCodeSeams({ exec, workDir: dir });
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
      // workDir roots the seams (run records, flow config) in the temp dir, never the repo.
      const seams = adapter.makeClaudeCodeSeams({ exec, workDir: dir });
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

  test('monorepo: cxpak is scoped to the touched subprojects with the budget split', async () => {
    const calls = [];
    const exec = (cmd, args) => { calls.push(args); return `overview of ${args[args.indexOf('--workspace') + 1]}`; };
    const projects = [{ name: 'orders', path: 'packages/orders' }, { name: 'payments', path: 'packages/payments' }, { name: 'web', path: 'apps/web' }];
    const ctx = await adapter.makeCxpakFetcher({ exec, projects })({ frontmatter: { title: 'refund', references: ['packages/orders/a.ts', 'packages/payments/b.ts'] } });
    // deepest (longest) project path first — the order projectsForPaths guarantees
    expect(calls).toEqual([
      ['overview', '--tokens', '3000', '--workspace', 'packages/payments', '.'],
      ['overview', '--tokens', '3000', '--workspace', 'packages/orders', '.'],
    ]);
    expect(ctx).toMatch(/### Subproject orders \(packages\/orders\)\n\noverview of packages\/orders/);
    const root = await adapter.makeCxpakFetcher({ exec: (c, a) => { calls.push(a); return 'whole repo'; }, projects })({ frontmatter: { references: ['docs/x.md'] } });
    expect(calls[calls.length - 1]).toEqual(['overview', '--tokens', '6k']);
    expect(root).toMatch(/whole repo/);
  });

  test('loadMcpServers expands ${CLAUDE_PLUGIN_ROOT} in command and args', () => {
    const servers = adapter.loadMcpServers([path.join(ROOT, '.mcp.json')], { pluginRoot: '/plugin' });
    expect(servers['ai-sdlc-context']).toEqual({ type: 'stdio', command: 'node', args: ['/plugin/mcp/context-server.js', '.'] });
    expect(adapter.ALWAYS_MCP).toEqual(['cxpak', 'ai-sdlc-context']);
  });

  test('makeClaudeCodeSeams exposes fetchCxpak, fetchSpec and the component flow', () => {
    const seams = adapter.makeClaudeCodeSeams({ exec: () => '' });
    expect(typeof seams.fetchCxpak).toBe('function');
    expect(typeof seams.fetchSpec).toBe('function');
    expect(typeof seams.invoke).toBe('function');
    expect(typeof seams.fetchTrust).toBe('function');
    expect(seams.flow.hitl.enabled).toBe(true);
  });

  test('makeTrustFetcher reads the latest ledger score as a tier; unknown agents are null', async () => {
    const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trust-'));
    try {
      fs.mkdirSync(path.join(ledgerDir, 'agents'));
      fs.writeFileSync(path.join(ledgerDir, 'agents', 'java-pro.jsonl'), [
        JSON.stringify({ agent_id: 'java-pro', trust_after: 0.9 }),
        JSON.stringify({ agent_id: 'java-pro', trust_after: 0.3 }),
      ].join('\n') + '\n');
      const fetchTrust = adapter.makeTrustFetcher({ ledgerDir });
      expect(await fetchTrust('java-pro')).toBe('low');
      expect(await fetchTrust('nobody')).toBeNull();
    } finally {
      fs.rmSync(ledgerDir, { recursive: true, force: true });
    }
  });

  test('makeSpecFetcher returns no spec text for a task without specRef', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-f-'));
    try {
      const spec = await adapter.makeSpecFetcher({ root })({ frontmatter: { id: 'X' } });
      expect(spec).toEqual({ text: null, architectureInjected: false, kind: 'feature', bugPath: null, prdPath: null, designPath: null, designApproved: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('parseClaudeResult cost metadata', () => {
  test('carries total_cost_usd / num_turns / duration_ms as _meta on the parsed payload', () => {
    const out = adapter.parseClaudeResult(JSON.stringify({ result: JSON.stringify({ commitSha: 'abc', verifications: ['ok'] }), total_cost_usd: 0.37, num_turns: 4, duration_ms: 1200 }));
    expect(out).toEqual({ commitSha: 'abc', verifications: ['ok'], _meta: { costUsd: 0.37, turns: 4, durationMs: 1200 } });
    expect(adapter.parseClaudeResult(JSON.stringify({ result: 'plain text', total_cost_usd: 0.1 }))).toEqual({ summary: 'plain text', _meta: { costUsd: 0.1, turns: undefined, durationMs: undefined } });
    expect(adapter.parseClaudeResult(JSON.stringify({ result: '{"a":1}' }))).toEqual({ a: 1 });
  });
});

describe('per-stage MCP scoping', () => {
  const servers = {
    cxpak: { type: 'stdio', command: 'cxpak', args: ['serve', '--mcp', '.'] },
    firecrawl: { type: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp'], env: { FIRECRAWL_API_KEY: '${FIRECRAWL_API_KEY}' } },
    'postgres-ro': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', '${DATABASE_URL_RO}'] },
    'clickhouse-ro': { type: 'stdio', command: 'uv', args: ['run'] },
  };

  test('scopeMcpConfig keeps granted servers + cxpak, drops the rest', () => {
    const cfg = adapter.scopeMcpConfig(servers, ['mcp__firecrawl', 'WebSearch', 'mcp__clickhouse-ro__run_query']);
    expect(Object.keys(cfg.mcpServers).sort()).toEqual(['clickhouse-ro', 'cxpak', 'firecrawl']);
  });

  test('a stage with no MCP grant boots only cxpak', () => {
    expect(Object.keys(adapter.scopeMcpConfig(servers, []).mcpServers)).toEqual(['cxpak']);
  });

  test('granted-but-undefined servers are ignored', () => {
    expect(Object.keys(adapter.scopeMcpConfig({}, ['mcp__firecrawl']).mcpServers)).toEqual([]);
  });

  test('spawner passes --strict-mcp-config with the scoped subset; ${VAR} placeholders stay unexpanded', async () => {
    let argv;
    const spawn = adapter.makeClaudeSpawner({ exec: (cmd, args) => { argv = args; return JSON.stringify({ result: '{"summary":"ok"}' }); }, mcpServers: servers });
    await spawn({ type: 'design', provider: { type: 'agent', name: 'architect-review' }, prompt: 'p', tools: ['mcp__postgres-ro'] });
    expect(argv).toContain('--strict-mcp-config');
    const cfg = JSON.parse(argv[argv.indexOf('--mcp-config') + 1]);
    expect(Object.keys(cfg.mcpServers).sort()).toEqual(['cxpak', 'postgres-ro']);
    expect(cfg.mcpServers['postgres-ro'].args).toContain('${DATABASE_URL_RO}');
  });

  test('mcpServers null keeps legacy behavior (no MCP flags)', async () => {
    let argv;
    const spawn = adapter.makeClaudeSpawner({ exec: (cmd, args) => { argv = args; return '{}'; } });
    await spawn({ type: 'developer', prompt: 'p', tools: ['mcp__firecrawl'] });
    expect(argv).not.toContain('--strict-mcp-config');
  });

  test('loadMcpServers merges files (later wins) and skips missing/malformed ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ mcpServers: { cxpak: { command: 'old' }, firecrawl: { command: 'npx' } } }));
      fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ mcpServers: { cxpak: { command: 'new' } } }));
      fs.writeFileSync(path.join(dir, 'bad.json'), '{ nope');
      const merged = adapter.loadMcpServers([path.join(dir, 'a.json'), path.join(dir, 'missing.json'), path.join(dir, 'bad.json'), path.join(dir, 'b.json')]);
      expect(merged).toEqual({ cxpak: { command: 'new' }, firecrawl: { command: 'npx' } });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('makeClaudeCodeSeams scopes MCP from plugin + project .mcp.json by default', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seams-'));
    try {
      fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { 'clickhouse-ro': { command: 'uv' } } }));
      const calls = [];
      const exec = (cmd, args) => { calls.push({ cmd, args }); return JSON.stringify({ result: '{"summary":"ok"}' }); };
      const seams = adapter.makeClaudeCodeSeams({ exec, workDir: dir });
      await seams.spawn({ type: 'design', provider: { type: 'agent', name: 'x', harness: 'claude' }, prompt: 'p', tools: ['mcp__clickhouse-ro'] });
      const argv = calls[0].args;
      const cfg = JSON.parse(argv[argv.indexOf('--mcp-config') + 1]);
      expect(Object.keys(cfg.mcpServers)).toEqual(expect.arrayContaining(['cxpak', 'clickhouse-ro']));
      expect(cfg.mcpServers.firecrawl).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('makeDecisionsFetcher returns the relevance partition', () => {
  test('missing store -> empty partition, never throws', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dec-fetch-'));
    try {
      await expect(adapter.makeDecisionsFetcher({ root: dir })({ frontmatter: {} })).resolves.toEqual({ selected: [], omitted: [], primary: [] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
