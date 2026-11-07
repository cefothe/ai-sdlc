const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const pa = require(path.join(ROOT, 'pipeline', 'plan-artifact.js'));

const task = { frontmatter: { id: 'AISDLC-0001', title: 'math helpers' } };
const manifest = { status: 'ok', nodes: [{ id: 'add', files: ['src/math.js'], accept: 'node test/a.js | grep ok' }], inline: [{ id: 'wire', files: ['src/cli.js'], accept: 'npm test' }] };

describe('plan artifact', () => {
  test('writes docs/plans/<task>.md with the plan and the manifest table', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-'));
    try {
      const rel = pa.writePlanArtifact({ cwd: dir, task, planText: 'Step 1: add', manifest, provider: 'code-plan' });
      expect(rel).toBe('docs/plans/AISDLC-0001.md');
      const text = fs.readFileSync(path.join(dir, rel), 'utf8');
      expect(text).toMatch(/^---\ntask: AISDLC-0001\ntitle: "math helpers"\nplanner: code-plan\n---/);
      expect(text).toMatch(/## Plan\n\nStep 1: add/);
      expect(text).toMatch(/\| add \| `src\/math\.js` \| `node test\/a\.js \\\| grep ok` \| node \(RED oracle\) \|/);
      expect(text).toMatch(/\| wire \| `src\/cli\.js` \| `npm test` \| inline \|/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('refuses an unsafe task id', () => {
    expect(() => pa.planPath('../../etc')).toThrow(/unsafe task id/);
  });

  test('planDrift: changed source files the plan never names; docs/tests exempt', () => {
    expect(pa.planDrift({ files: ['src/math.js', 'src/extra.js', 'docs/x.md', 'test/a.test.js'], planText: 'touch src/math.js', manifest: null })).toEqual(['src/extra.js']);
    expect(pa.planDrift({ files: ['src/cli.js', 'src/math.js'], planText: '', manifest })).toEqual([]);
  });
});
