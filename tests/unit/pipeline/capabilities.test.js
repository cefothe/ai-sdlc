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
});

describe('resolveStageCapabilities (per-stage MCP / web / skill grants)', () => {
  test('design grants firecrawl + deep-research skills and web tools by default', () => {
    const g = cap.resolveStageCapabilities(MAP, 'design', {});
    expect(g.skills).toEqual(expect.arrayContaining(['firecrawl', 'deep-research']));
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
    expect(g).toEqual({ mcp: [], web: [], skills: [] });
  });

  test('an unknown stage grants nothing (no throw)', () => {
    expect(cap.resolveStageCapabilities(MAP, 'does-not-exist', {})).toEqual({ mcp: [], web: [], skills: [] });
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
