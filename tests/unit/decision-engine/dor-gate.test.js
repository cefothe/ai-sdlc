const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { parseTask, loadTaskFile } = require(path.join(ROOT, 'decision-engine', 'backlog-task.js'));
const { loadDorConfig, evaluateDor, referenceResolves } = require(path.join(ROOT, 'decision-engine', 'dor-gate.js'));

const ENFORCE = { spec: { evaluationMode: 'enforce', autoPassRules: [] } };

function task(frontmatter, body = '') {
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return parseTask(`---\n${fm}\n---\n${body}`);
}

describe('backlog-task parser', () => {
  test('parses frontmatter and AC-marker block', () => {
    const t = parseTask(
      '---\nid: AISDLC-9\ntitle: x\nstatus: To Do\n---\n' +
        'body text\n## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [ ] #1 first\n- [x] #2 done\n<!-- AC:END -->\n',
    );
    expect(t.frontmatter.id).toBe('AISDLC-9');
    expect(t.acceptanceCriteria).toHaveLength(2);
    expect(t.acceptanceCriteria[1].checked).toBe(true);
  });

  test('parses AC from a heading section without markers', () => {
    const t = parseTask('---\nid: A\ntitle: t\nstatus: To Do\n---\n## Acceptance Criteria\n- [ ] one\n- [ ] two\n## Next\n- [ ] ignored');
    expect(t.acceptanceCriteria.map((a) => a.text)).toEqual(['one', 'two']);
  });

  test('throws on missing frontmatter', () => {
    expect(() => parseTask('no frontmatter here')).toThrow(/frontmatter/);
  });

  test('loads the shipped example task file', () => {
    const t = loadTaskFile(path.join(ROOT, 'backlog', 'tasks', 'AISDLC-1 - example-ready-task.md'));
    expect(t.frontmatter.id).toBe('AISDLC-1');
    expect(t.acceptanceCriteria.length).toBe(3);
  });
});

describe('loadDorConfig', () => {
  test('loads the shipped enforce config', () => {
    const cfg = loadDorConfig(path.join(ROOT, '.ai-sdlc', 'dor-config.yaml'));
    expect(cfg.spec.evaluationMode).toBe('enforce');
    expect(cfg.spec.autoPassRules[0].gatesSkipped).toEqual([1, 4, 5, 6]);
  });

  test('falls back to defaults when file absent', () => {
    const cfg = loadDorConfig('/no/such/file.yaml');
    expect(cfg.spec.evaluationMode).toBe('enforce');
  });
});

describe('evaluateDor short-circuits', () => {
  test('blocked task is a hold, not admitted', () => {
    const t = task({ id: 'A', title: 't', status: 'To Do', blocked: { reason: 'waiting on API key' } });
    const r = evaluateDor(t, { config: ENFORCE });
    expect(r.verdict).toBe('blocked');
    expect(r.admitted).toBe(false);
  });

  test('dispatchable:false is refused with its reason', () => {
    const t = task({ id: 'A', title: 't', status: 'To Do', dispatchable: false, dispatchableReason: 'superseded' });
    const r = evaluateDor(t, { config: ENFORCE });
    expect(r.verdict).toBe('not-dispatchable');
    expect(r.reasons[0]).toMatch(/superseded/);
  });
});

describe('deterministic gates', () => {
  test('gate 2 fails on a marker token', () => {
    const t = task({ id: 'A', title: 'do the TODO thing', status: 'To Do' }, '## Acceptance Criteria\n- [ ] x');
    const r = evaluateDor(t, { config: ENFORCE });
    const g2 = r.gates.find((g) => g.gateId === 2);
    expect(g2.verdict).toBe('fail');
    expect(r.verdict).toBe('needs-clarification');
    expect(r.admitted).toBe(false);
  });

  test('gate 3 fails on an unresolved path reference', () => {
    const t = task({ id: 'A', title: 't', status: 'To Do', references: ['does/not/exist.md'] }, '- [ ] x');
    const r = evaluateDor(t, { projectRoot: ROOT, config: ENFORCE });
    const g3 = r.gates.find((g) => g.gateId === 3);
    expect(g3.verdict).toBe('fail');
  });

  test('gate 1 fails when there are zero ACs', () => {
    const t = task({ id: 'A', title: 't', status: 'To Do' }, 'no criteria here');
    const r = evaluateDor(t, { config: ENFORCE });
    expect(r.gates.find((g) => g.gateId === 1).verdict).toBe('fail');
  });

  test('referenceResolves: URLs pass, missing paths fail', () => {
    expect(referenceResolves('https://example.com', ROOT)).toBe(true);
    expect(referenceResolves('README.md', ROOT)).toBe(true);
    expect(referenceResolves('nope/missing.md', ROOT)).toBe(false);
  });

  test('gate 3 resolves a specRef.artifactPath (PRD link) — existing passes', () => {
    const t = task({ id: 'A', title: 't', status: 'To Do', specRef: { source: 'adopter-rfc', artifactPath: 'docs/prd/README.md' } }, '- [ ] x');
    const r = evaluateDor(t, { projectRoot: ROOT, config: ENFORCE });
    expect(r.gates.find((g) => g.gateId === 3).verdict).toBe('pass');
  });

  test('gate 3 fails when specRef.artifactPath (PRD link) does not resolve', () => {
    const t = task({ id: 'A', title: 't', status: 'To Do', specRef: { source: 'adopter-rfc', artifactPath: 'docs/prd/ghost-feature.md' } }, '- [ ] x');
    const r = evaluateDor(t, { projectRoot: ROOT, config: ENFORCE });
    const g3 = r.gates.find((g) => g.gateId === 3);
    expect(g3.verdict).toBe('fail');
    expect(g3.finding).toMatch(/ghost-feature/);
  });
});

describe('stage-b deferral and admission', () => {
  test('the example task defers to Stage B and is NOT admitted without a judge (enforce)', () => {
    const t = loadTaskFile(path.join(ROOT, 'backlog', 'tasks', 'AISDLC-1 - example-ready-task.md'));
    const r = evaluateDor(t, { projectRoot: ROOT, config: ENFORCE });
    expect(r.verdict).toBe('needs-stage-b');
    expect(r.admitted).toBe(false);
    expect(r.needsStageB).toEqual(expect.arrayContaining([1, 4, 6]));
  });

  test('a Stage-B judge that passes all deferred gates yields ready + admitted', () => {
    const t = loadTaskFile(path.join(ROOT, 'backlog', 'tasks', 'AISDLC-1 - example-ready-task.md'));
    const judge = (_t, ids) => new Map(ids.map((id) => [id, { verdict: 'pass', finding: 'ok' }]));
    const r = evaluateDor(t, { projectRoot: ROOT, config: ENFORCE, stageBJudge: judge });
    expect(r.verdict).toBe('ready');
    expect(r.admitted).toBe(true);
  });

  test('warn-only admits even when gates defer', () => {
    const t = loadTaskFile(path.join(ROOT, 'backlog', 'tasks', 'AISDLC-1 - example-ready-task.md'));
    const r = evaluateDor(t, { projectRoot: ROOT, config: { spec: { evaluationMode: 'warn-only', autoPassRules: [] } } });
    expect(r.admitted).toBe(true);
    expect(r.verdict).toBe('needs-stage-b');
  });
});

describe('autoPassRules', () => {
  test('machine-authored task auto-passes content gates but keeps structural checks', () => {
    const cfg = { spec: { evaluationMode: 'enforce', autoPassRules: [{ kind: 'signal-pipeline-generated', sources: ['ai-sdlc/signal-pipeline'], gatesSkipped: [1, 4, 5, 6] }] } };
    const t = task({ id: 'A', title: 't', status: 'To Do', source: 'ai-sdlc/signal-pipeline', references: ['README.md'] }, 'body');
    const r = evaluateDor(t, { projectRoot: ROOT, config: cfg });
    // gates 1,4,5,6 auto-passed; 2,3,7 checked -> all pass -> ready
    expect(r.gates.find((g) => g.gateId === 1).finding).toMatch(/auto-passed/);
    expect(r.verdict).toBe('ready');
    expect(r.admitted).toBe(true);
  });
});
