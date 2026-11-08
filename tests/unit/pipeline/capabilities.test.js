const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const cap = require(path.join(ROOT, 'pipeline', 'capabilities.js'));

const MAP = cap.loadCapabilityMap(path.join(ROOT, '.ai-sdlc', 'capabilities.yaml'));

describe('loadCapabilityMap', () => {
  test('loads the shipped default map', () => {
    expect(MAP.kind).toBe('CapabilityMap');
    expect(MAP.spec.stages.plan).toBeDefined();
    expect(MAP.spec.stages.review.team).toBe(true);
  });

  test('rejects a non-CapabilityMap file', () => {
    expect(() => cap.loadCapabilityMap(path.join(ROOT, '.ai-sdlc', 'dor-config.yaml'))).toThrow(/CapabilityMap/);
  });
});

describe('single-provider stages', () => {
  test('plan resolves to the code-plan skill', () => {
    const p = cap.resolvePlanStage(MAP, {});
    expect(p).toMatchObject({ stage: 'plan', type: 'skill', name: 'code-plan' });
  });

  test('implement defaults to the general agent', () => {
    expect(cap.resolveImplementer(MAP, { languages: [] })).toMatchObject({ type: 'agent', name: 'claude' });
  });

  test('implement routes to a language specialist', () => {
    expect(cap.resolveImplementer(MAP, { languages: ['java'] }).name).toBe('java-pro');
    expect(cap.resolveImplementer(MAP, { languages: ['typescript'] }).name).toBe('typescript-pro');
    expect(cap.resolveImplementer(MAP, { languages: ['python'] }).name).toBe('python-pro');
  });

  test('test stage resolves to test-runner', () => {
    expect(cap.resolveTestStage(MAP, {}).name).toBe('test-runner');
  });
});

describe('resolveReviewTeam', () => {
  test('default team = 3 cross-harness reviewers (codex vs claude implementer)', () => {
    const { providers, team } = cap.resolveReviewTeam(MAP, { files: ['src/App.java'] }, { implementerHarness: 'claude' });
    expect(team).toBe(true);
    expect(providers.map((p) => p.role)).toEqual(['code-reviewer', 'test-reviewer', 'security-reviewer']);
    expect(providers.every((p) => p.harness === 'codex')).toBe(true);
  });

  test('Java test files route the test reviewer to qa-code-reviewer', () => {
    const { providers } = cap.resolveReviewTeam(MAP, { files: ['src/test/java/FooTest.java'] }, { implementerHarness: 'claude' });
    const testReviewer = providers.find((p) => p.role === 'test-reviewer');
    expect(testReviewer.name).toBe('qa-code-reviewer');
  });

  test('non-Java tasks keep the default test reviewer', () => {
    const { providers } = cap.resolveReviewTeam(MAP, { files: ['src/app.ts'] }, { implementerHarness: 'claude' });
    expect(providers.find((p) => p.role === 'test-reviewer').name).toBe('test-automator');
  });

  test('cross-harness enforcement throws when a reviewer shares the implementer harness', () => {
    expect(() => cap.resolveReviewTeam(MAP, { files: [] }, { implementerHarness: 'codex' })).toThrow(/cross-harness violation/);
  });

  test('umbrella skill (code-review-pr) is surfaced', () => {
    expect(cap.resolveReviewTeam(MAP, { files: [] }, { implementerHarness: 'claude' }).umbrellaSkill).toBe('code-review-pr');
  });
});

describe('resolveDiscoveryPanel (product panel)', () => {
  test('core panel is PM + PO', () => {
    const { providers, panel } = cap.resolveDiscoveryPanel(MAP, {});
    expect(providers.map((p) => p.name)).toEqual(['product-manager', 'product-owner']);
    expect(panel).toBe(true);
  });

  test('trading labels add the trading advisor; compliance labels add the compliance advisor', () => {
    for (const label of ['trading', 'execution', 'risk']) {
      expect(cap.resolveDiscoveryPanel(MAP, { labels: [label] }).providers.find((p) => p.role === 'trading-advisor').name).toBe('grizzled-trader');
    }
    for (const label of ['compliance', 'regulatory']) {
      expect(cap.resolveDiscoveryPanel(MAP, { labels: [label] }).providers.find((p) => p.role === 'compliance-advisor').name).toBe('qa-compliance-engineer');
    }
    const both = cap.resolveDiscoveryPanel(MAP, { labels: ['trading', 'compliance', 'strategic'] }).providers.map((p) => p.role);
    expect(both).toEqual(['product-manager', 'product-owner', 'cmo', 'cpo', 'trading-advisor', 'compliance-advisor']);
  });

  test('the init capabilities stub routes the same discovery advisors', () => {
    const yaml = require('js-yaml');
    const stub = yaml.load(require(path.join(ROOT, 'init', 'config-stubs.js')).capabilities());
    const roles = cap.resolveDiscoveryPanel(stub, { labels: ['trading', 'compliance'] }).providers.map((p) => p.role);
    expect(roles).toEqual(['product-manager', 'product-owner', 'trading-advisor', 'compliance-advisor']);
  });
});

describe('resolveDesignPanel (architects)', () => {
  test('default panel is the solution + backend architects', () => {
    const { providers, panel } = cap.resolveDesignPanel(MAP, {});
    expect(panel).toBe(true);
    expect(providers.map((p) => p.role)).toEqual(expect.arrayContaining(['solution-architect', 'backend-architect']));
    expect(providers.some((p) => p.name === 'architect-review')).toBe(true);
    expect(providers.some((p) => p.name === 'backend-architect')).toBe(true);
  });

  test('design is cross-MODEL: the solution lens is mirrored on the codex harness', () => {
    const { providers } = cap.resolveDesignPanel(MAP, {});
    const codex = providers.filter((p) => p.harness === 'codex');
    expect(codex.length).toBeGreaterThanOrEqual(1);
    // the codex twin runs the same architect agent as the claude solution lens
    expect(codex.some((p) => p.name === 'architect-review')).toBe(true);
    // and the panel genuinely spans both harnesses (diversity, not attestation)
    expect(providers.some((p) => (p.harness || 'claude') === 'claude')).toBe(true);
  });

  test('infra/cloud tasks pull in the cloud-architect', () => {
    const { providers } = cap.resolveDesignPanel(MAP, { labels: ['cloud'] });
    expect(providers.some((p) => p.name === 'cloud-architect')).toBe(true);
  });

  test('graphql tasks pull in the graphql-architect', () => {
    const { providers } = cap.resolveDesignPanel(MAP, { languages: ['graphql'] });
    expect(providers.some((p) => p.name === 'graphql-architect')).toBe(true);
  });

  test('security is front-loaded: auth/payment tasks add a threat-model lens at design', () => {
    for (const label of ['auth', 'payment', 'pii']) {
      const { providers } = cap.resolveDesignPanel(MAP, { labels: [label] });
      expect(providers.some((p) => p.role === 'security-architect' && p.name === 'security-auditor')).toBe(true);
    }
    // ordinary tasks do NOT get the security lens at design
    expect(cap.resolveDesignPanel(MAP, { labels: ['docs'] }).providers.some((p) => p.role === 'security-architect')).toBe(false);
  });

  test('AI/ML lens is front-loaded: LLM tasks add ai-engineer, ML tasks add ml-engineer', () => {
    for (const label of ['ai', 'llm', 'rag', 'genai', 'embeddings', 'prompt', 'agent']) {
      const { providers } = cap.resolveDesignPanel(MAP, { labels: [label] });
      expect(providers.some((p) => p.role === 'ai-architect' && p.name === 'ai-engineer')).toBe(true);
    }
    for (const label of ['ml', 'model', 'inference', 'training', 'mlops']) {
      const { providers } = cap.resolveDesignPanel(MAP, { labels: [label] });
      expect(providers.some((p) => p.role === 'ml-architect' && p.name === 'ml-engineer')).toBe(true);
    }
    // ordinary tasks get neither lens
    const ordinary = cap.resolveDesignPanel(MAP, { labels: ['docs'] }).providers;
    expect(ordinary.some((p) => p.role === 'ai-architect' || p.role === 'ml-architect')).toBe(false);
  });
});

describe('architect-review lens on the review team', () => {
  test('architecture/refactor tasks add an architect-reviewer', () => {
    const { providers } = cap.resolveReviewTeam(MAP, { labels: ['architecture'] }, { implementerHarness: 'claude' });
    expect(providers.some((p) => p.role === 'architect-reviewer' && p.name === 'code-review-architect')).toBe(true);
    expect(providers.length).toBe(4); // 3 base + architect lens
  });

  test('ordinary tasks do NOT add the architect lens', () => {
    const { providers } = cap.resolveReviewTeam(MAP, { labels: ['bug'] }, { implementerHarness: 'claude' });
    expect(providers.some((p) => p.role === 'architect-reviewer')).toBe(false);
  });

  test('scale/throughput tasks add a cross-harness NFR reviewer (performance-engineer)', () => {
    for (const label of ['scale', 'throughput', 'ingestion', 'data']) {
      const { providers } = cap.resolveReviewTeam(MAP, { labels: [label] }, { implementerHarness: 'claude' });
      const nfr = providers.find((p) => p.role === 'performance-reviewer');
      expect(nfr).toBeDefined();
      expect(nfr.name).toBe('performance-engineer');
      expect(nfr.harness).toBe('codex'); // cross-harness, like the other reviewers
    }
    // ordinary tasks do NOT get the NFR lens
    expect(cap.resolveReviewTeam(MAP, { labels: ['bug'] }, { implementerHarness: 'claude' })
      .providers.some((p) => p.role === 'performance-reviewer')).toBe(false);
  });

  test('backend tasks add a cross-harness backend-architect reviewer (codex), symmetric with design', () => {
    for (const label of ['api', 'backend', 'microservice', 'service', 'rest', 'database', 'schema']) {
      const { providers } = cap.resolveReviewTeam(MAP, { labels: [label] }, { implementerHarness: 'claude' });
      const rev = providers.find((p) => p.role === 'backend-reviewer');
      expect(rev).toBeDefined();
      expect(rev.name).toBe('backend-architect');
      expect(rev.harness).toBe('codex'); // cross-harness, like the other reviewers
    }
    // ordinary tasks do NOT get the backend lens
    expect(cap.resolveReviewTeam(MAP, { labels: ['bug'] }, { implementerHarness: 'claude' })
      .providers.some((p) => p.role === 'backend-reviewer')).toBe(false);
  });

  test('AI/ML tasks add a cross-harness ai/ml reviewer (codex)', () => {
    for (const label of ['ai', 'llm', 'rag', 'genai', 'embeddings', 'prompt', 'agent']) {
      const { providers } = cap.resolveReviewTeam(MAP, { labels: [label] }, { implementerHarness: 'claude' });
      const rev = providers.find((p) => p.role === 'ai-reviewer');
      expect(rev).toBeDefined();
      expect(rev.name).toBe('ai-engineer');
      expect(rev.harness).toBe('codex'); // cross-harness, like the other reviewers
    }
    for (const label of ['ml', 'model', 'inference', 'training', 'mlops']) {
      const { providers } = cap.resolveReviewTeam(MAP, { labels: [label] }, { implementerHarness: 'claude' });
      const rev = providers.find((p) => p.role === 'ml-reviewer');
      expect(rev).toBeDefined();
      expect(rev.name).toBe('ml-engineer');
      expect(rev.harness).toBe('codex');
    }
    // ordinary tasks get neither reviewer
    const ordinary = cap.resolveReviewTeam(MAP, { labels: ['bug'] }, { implementerHarness: 'claude' }).providers;
    expect(ordinary.some((p) => p.role === 'ai-reviewer' || p.role === 'ml-reviewer')).toBe(false);
  });
});

describe('resolveStageCapabilities (per-stage MCP / web / skill grants)', () => {
  test('design grants firecrawl + deep-research skills and web tools by default', () => {
    const g = cap.resolveStageCapabilities(MAP, 'design', {});
    expect(g.skills).toEqual(expect.arrayContaining(['firecrawl', 'deep-research', 'mermaid-diagrams']));
    expect(g.web).toEqual(expect.arrayContaining(['WebSearch', 'WebFetch']));
    expect(g.mcp).toEqual([]); // no DB grant without a db label
  });

  test('db-labelled tasks union in the read-only postgres MCP server', () => {
    const g = cap.resolveStageCapabilities(MAP, 'design', { labels: ['db'] });
    expect(g.mcp).toContain('postgres-ro');
    // base grant is preserved (union, not replace)
    expect(g.skills).toContain('firecrawl');
  });

  test('integration-labelled tasks union in the firecrawl MCP server', () => {
    const g = cap.resolveStageCapabilities(MAP, 'design', { labels: ['integration'] });
    expect(g.mcp).toContain('firecrawl');
  });

  test('analytics-labelled tasks union in the read-only clickhouse MCP server', () => {
    for (const label of ['analytics', 'clickhouse', 'olap']) {
      expect(cap.resolveStageCapabilities(MAP, 'design', { labels: [label] }).mcp).toContain('clickhouse-ro');
    }
    // discovery too: data-driven product decisions query real usage
    expect(cap.resolveStageCapabilities(MAP, 'discovery', { labels: ['metrics'] }).mcp).toContain('clickhouse-ro');
  });

  test('review grants web research + deep-research', () => {
    const g = cap.resolveStageCapabilities(MAP, 'review', {});
    expect(g.web).toContain('WebSearch');
    expect(g.skills).toContain('deep-research');
  });

  test('a stage with no capabilities block grants nothing', () => {
    const g = cap.resolveStageCapabilities(MAP, 'implement', {});
    expect(g).toEqual({ mcp: [], web: [], skills: [], poc: false });
  });

  test('an unknown stage grants nothing (no throw)', () => {
    expect(cap.resolveStageCapabilities(MAP, 'does-not-exist', {})).toEqual({ mcp: [], web: [], skills: [], poc: false });
  });

  test('design may run a proof-of-concept (poc grant); review may not', () => {
    expect(cap.resolveStageCapabilities(MAP, 'design', {}).poc).toBe(true);
    expect(cap.resolveStageCapabilities(MAP, 'review', {}).poc).toBe(false);
  });
});

describe('formatCapabilityGuidance — PoC', () => {
  test('mentions the throwaway PoC validation when granted', () => {
    const line = cap.formatCapabilityGuidance({ mcp: [], web: [], skills: ['firecrawl'], poc: true });
    expect(line).toMatch(/proof-of-concept/i);
    expect(line).toMatch(/never commit/i);
  });

  test('no PoC line when not granted', () => {
    const line = cap.formatCapabilityGuidance({ mcp: [], web: ['WebSearch'], skills: [], poc: false });
    expect(line).not.toMatch(/proof-of-concept/i);
  });
});

describe('capabilityToolNames', () => {
  test('maps mcp servers -> mcp__<server>, passes web verbatim, adds Skill when skills present', () => {
    const tools = cap.capabilityToolNames({ mcp: ['firecrawl', 'postgres-ro'], web: ['WebSearch'], skills: ['deep-research'] });
    expect(tools).toEqual(['mcp__firecrawl', 'mcp__postgres-ro', 'WebSearch', 'Skill']);
  });

  test('empty grant -> empty allowlist', () => {
    expect(cap.capabilityToolNames({ mcp: [], web: [], skills: [] })).toEqual([]);
    expect(cap.capabilityToolNames(null)).toEqual([]);
  });
});

describe('formatCapabilityGuidance', () => {
  test('names the granted MCP servers / web tools / skills', () => {
    const line = cap.formatCapabilityGuidance({ mcp: ['firecrawl'], web: ['WebSearch'], skills: ['deep-research'] });
    expect(line).toMatch(/firecrawl/);
    expect(line).toMatch(/WebSearch/);
    expect(line).toMatch(/deep-research/);
  });

  test('returns null when nothing is granted', () => {
    expect(cap.formatCapabilityGuidance({ mcp: [], web: [], skills: [] })).toBeNull();
    expect(cap.formatCapabilityGuidance(null)).toBeNull();
  });
});

describe('matchesWhen helper', () => {
  test('AND-composes languages/labels/javaTestFiles', () => {
    expect(cap.matchesWhen({ languages: ['java'] }, { languages: ['java', 'go'] })).toBe(true);
    expect(cap.matchesWhen({ languages: ['rust'] }, { languages: ['java'] })).toBe(false);
    expect(cap.matchesWhen({ javaTestFiles: true }, { files: ['XTest.java'] })).toBe(true);
    expect(cap.matchesWhen({ javaTestFiles: true }, { files: ['x.ts'] })).toBe(false);
  });
});

describe('allowlistGaps', () => {
  const fs = require('fs');
  const os = require('os');
  function agentsDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-'));
    for (const [name, fm] of Object.entries(files)) fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${fm}\n---\nbody\n`);
    return dir;
  }
  const grant = { mcp: ['firecrawl'], web: ['WebSearch'], skills: ['deep-research'], poc: false };

  test('reports granted tools an explicit allowlist would drop', () => {
    const dir = agentsDir({ narrow: 'name: narrow\ntools:\n  - Read' });
    try {
      expect(cap.allowlistGaps({ type: 'agent', name: 'narrow' }, grant, { agentsDir: dir })).toEqual(['mcp__firecrawl', 'WebSearch', 'Skill']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('plugin-scoped, headless and server-level names all cover an MCP grant', () => {
    const dir = agentsDir({
      plugin: 'name: plugin\ntools:\n  - "mcp__plugin_ai-sdlc_firecrawl__*"\n  - WebSearch\n  - Skill',
      headless: 'name: headless\ntools: mcp__firecrawl__*, WebSearch, Skill',
      inherit: 'name: inherit\nmodel: opus',
    });
    try {
      for (const name of ['plugin', 'headless', 'inherit']) expect(cap.allowlistGaps({ type: 'agent', name }, grant, { agentsDir: dir })).toEqual([]);
      expect(cap.allowlistGaps({ type: 'agent', name: 'not-a-plugin-agent' }, grant, { agentsDir: dir })).toEqual([]);
      expect(cap.allowlistGaps({ type: 'skill', name: 'code-plan' }, grant, { agentsDir: dir })).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the plugin default map leaves no bound agent without its stage grant', () => {
    for (const stageName of ['discovery', 'design', 'review']) {
      for (const labels of [[], ['db'], ['analytics'], ['cloud'], ['security'], ['trading', 'compliance', 'strategic']]) {
        const grant = cap.resolveStageCapabilities(MAP, stageName, { labels });
        const panel = stageName === 'review' ? cap.resolveReviewTeam(MAP, { labels }, { implementerHarness: 'claude' }).providers
          : stageName === 'design' ? cap.resolveDesignPanel(MAP, { labels }).providers : cap.resolveDiscoveryPanel(MAP, { labels }).providers;
        for (const p of panel) expect([p.name, cap.allowlistGaps(p, grant)]).toEqual([p.name, []]);
      }
    }
  });
});
