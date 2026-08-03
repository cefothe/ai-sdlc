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
    expect(providers.map((p) => p.name)).toEqual(['architect-review', 'backend-architect']);
    expect(providers.map((p) => p.role)).toContain('solution-architect');
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

describe('matchesWhen helper', () => {
  test('AND-composes languages/labels/javaTestFiles', () => {
    expect(cap.matchesWhen({ languages: ['java'] }, { languages: ['java', 'go'] })).toBe(true);
    expect(cap.matchesWhen({ languages: ['rust'] }, { languages: ['java'] })).toBe(false);
    expect(cap.matchesWhen({ javaTestFiles: true }, { files: ['XTest.java'] })).toBe(true);
    expect(cap.matchesWhen({ javaTestFiles: true }, { files: ['x.ts'] })).toBe(false);
  });
});
