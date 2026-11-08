const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const sync = require(path.join(ROOT, 'scripts', 'sync-context-protocol.js'));

describe('context protocol sync (CI guard)', () => {
  test('every agent and code/qa/testing skill carries the current protocol and context tools', () => {
    expect(sync.sync({ check: true })).toEqual([]);
  });

  test('targets cover all agents and only the context-dependent skills', () => {
    const t = sync.targets();
    expect(t.filter((x) => x.kind === 'agent').length).toBeGreaterThanOrEqual(100);
    const skills = t.filter((x) => x.kind === 'skill').map((x) => path.basename(path.dirname(x.path)));
    expect(skills).toContain('code-plan');
    expect(skills).toContain('qa-automate-tests');
    expect(skills.some((s) => s.startsWith('firecrawl'))).toBe(false);
  });
});

describe('withProtocol', () => {
  const md = '---\nname: x\n---\n\n# Agent\nBody.\n';
  const block = `${sync.BEGIN}\nPROTOCOL v1\n${sync.END}\n\n`;

  test('inserts after the frontmatter and is idempotent', () => {
    const once = sync.withProtocol(md, block);
    expect(once).toBe(`---\nname: x\n---\n\n${block}# Agent\nBody.\n`);
    expect(sync.withProtocol(once, block)).toBe(once);
  });

  test('replaces a stale block instead of stacking a second one', () => {
    const stale = sync.withProtocol(md, block);
    const fresh = sync.withProtocol(stale, block.replace('v1', 'v2'));
    expect(fresh.match(/ai-sdlc:context-protocol:begin/g)).toHaveLength(1);
    expect(fresh).toMatch(/PROTOCOL v2/);
  });
});

describe('withContextTools', () => {
  test('appends the plugin-scoped and headless MCP names to a tools allowlist once', () => {
    const md = '---\nname: r\ntools:\n  - Read\n  - Grep\ncolor: red\n---\nbody\n';
    const out = sync.withContextTools(md);
    expect(out).toBe([
      '---', 'name: r', 'tools:', '  - Read', '  - Grep',
      ...sync.CONTEXT_TOOLS.map((t) => `  - "${t}"`),
      'color: red', '---', 'body', '',
    ].join('\n'));
    expect(sync.withContextTools(out)).toBe(out);
    expect(sync.CONTEXT_TOOLS).toEqual(['mcp__plugin_ai-sdlc_cxpak__*', 'mcp__plugin_ai-sdlc_ai-sdlc-context__*', 'mcp__cxpak__*', 'mcp__ai-sdlc-context__*']);
  });

  test('an agent without a tools allowlist (inherits everything) is left alone', () => {
    const md = '---\nname: o\nmodel: opus\n---\nbody\n';
    expect(sync.withContextTools(md)).toBe(md);
  });
});

describe('stage grants reach the agents bound to the stage', () => {
  test('stageGrantsByAgent unions base + routed capabilities over base + routed providers', () => {
    const map = { spec: { stages: {
      design: {
        providers: [{ role: 'a', type: 'agent', name: 'architect-review' }],
        capabilities: { web: ['WebSearch'], skills: ['deep-research'] },
        routing: [
          { when: { labels: ['db'] }, addCapabilities: { mcp: ['postgres-ro'] } },
          { when: { labels: ['cloud'] }, addProvider: { role: 'c', type: 'agent', name: 'cloud-architect' } },
        ],
      },
      plan: { provider: { type: 'skill', name: 'code-plan' } },
    } } };
    const g = sync.stageGrantsByAgent([map]);
    expect([...g.get('architect-review')].sort()).toEqual(['Skill', 'WebSearch', 'mcp__plugin_ai-sdlc_postgres-ro__*', 'mcp__postgres-ro__*']);
    expect([...g.get('cloud-architect')].sort()).toEqual([...g.get('architect-review')].sort());
    expect(g.has('code-plan')).toBe(false);
  });

  test('the repo agents already carry their stage grants (e.g. design architects get firecrawl + the DB servers)', () => {
    const fs = require('fs');
    const text = fs.readFileSync(path.join(ROOT, 'agents', 'architect-review.md'), 'utf8');
    for (const t of ['mcp__plugin_ai-sdlc_firecrawl__*', 'mcp__firecrawl__*', 'mcp__postgres-ro__*', 'WebSearch', 'Skill']) expect(text).toContain(`"${t}"`);
  });
});
