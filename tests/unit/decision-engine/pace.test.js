const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const pace = require(path.join(ROOT, 'decision-engine', 'pace.js'));
const { loadCheckpointsForRoot } = require(path.join(ROOT, 'decision-engine', 'hitl-gate.js'));

const layers = pace.compilePace(fs.readFileSync(pace.DEFAULT_PACE, 'utf8'));
const checkpoints = loadCheckpointsForRoot(ROOT); // this repo has no .ai-sdlc/checkpoints.yaml → plugin default only
const ev = (files, extra = {}) => pace.evaluatePace({ files, layers, checkpoints, ...extra });

describe('evaluatePace', () => {
  test('docs-only change is fast with a capped review team and no design panel', () => {
    const r = ev(['docs/guide.md', 'README.md']);
    expect(r.verdict).toBe('fast');
    expect(r.ceremony).toEqual({ designPanel: false, maxReviewers: 1, draftPr: false });
  });

  test('an unclassified path is normal and reported', () => {
    const r = ev(['docs/guide.md', 'src/app.js']);
    expect(r.verdict).toBe('normal');
    expect(r.unclassified).toEqual(['src/app.js']);
  });

  test('a HITL-claimed path is slow whatever the layers say (path and content mode)', () => {
    const r = ev(['docs/guide.md', 'CLAUDE.md']);
    expect(r.verdict).toBe('slow');
    expect(r.hitlFloor).toEqual([{ path: 'CLAUDE.md', checkpoints: ['agent-instructions-self-mod'] }]);
    expect(r.ceremony.draftPr).toBe(true);
    const content = ev(['scripts/run.sh'], { addedLines: new Map([['scripts/run.sh', ['git push origin main --force']]]) });
    expect(content.verdict).toBe('slow');
  });

  test('highest layer wins within one path (docs/adrs is slow although ^docs/ is fast)', () => {
    expect(ev(['docs/adrs/0001.md']).verdict).toBe('slow');
  });

  test('empty change set is normal, never fast', () => {
    expect(ev([]).verdict).toBe('normal');
  });

  test('low/critical trust raises one layer; high trust never lowers', () => {
    expect(ev(['docs/a.md'], { trustTier: 'low' })).toMatchObject({ verdict: 'normal', trustRaised: true });
    expect(ev(['src/a.js'], { trustTier: 'critical' }).verdict).toBe('slow');
    expect(ev(['src/a.js'], { trustTier: 'high' })).toMatchObject({ verdict: 'normal', trustRaised: false });
    expect(ev(['CLAUDE.md'], { trustTier: 'low' }).verdict).toBe('slow');
  });
});

describe('compilePace', () => {
  test('normal and slow are mandatory', () => {
    expect(() => pace.compilePace('layers:\n  fast: { paths: [] }\n  normal: { paths: [] }\n')).toThrow(/"slow"/);
    expect(() => pace.compilePace('layers:\n  slow: { paths: [] }\n')).toThrow(/"normal"/);
  });

  test('a repo pace.yaml replaces the default', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pace-repo-'));
    try {
      fs.mkdirSync(path.join(root, '.ai-sdlc'));
      fs.writeFileSync(path.join(root, '.ai-sdlc', 'pace.yaml'), 'layers:\n  fast: { paths: ["^src/"] }\n  normal: { paths: [] }\n  slow: { paths: [] }\n');
      const r = pace.evaluatePaceForRoot(root, { files: ['src/a.js'] });
      expect(r.verdict).toBe('fast');
      expect(r.registry).toBe(path.join(root, '.ai-sdlc', 'pace.yaml'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
