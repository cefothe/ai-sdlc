const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { buildValidationReport } = require(path.join(ROOT, 'pipeline', 'validation-report.js'));

const task = { frontmatter: { id: 'AISDLC-0001', title: 'math helpers' }, acceptanceCriteria: [{ text: 'add works' }, { text: 'errors | clearly' }] };

describe('buildValidationReport', () => {
  test('renders every gate with its evidence, ACs and degraded seams', () => {
    const result = {
      degraded: [{ seam: 'commitward', reason: 'docker not found' }],
      steps: {
        validate: { admitted: true, verdict: 'ready' },
        spec: { injected: true, kind: 'feature', prdPath: 'docs/prd/m.md', designPath: 'docs/design/m.md', architecture: true },
        plan: { produced: true, provider: { name: 'code-plan' } },
        planArtifact: { path: 'docs/plans/AISDLC-0001.md' },
        nodes: { nodes: [{ id: 'add', status: 'done' }, { id: 'weak', status: 'already_satisfied' }] },
        planDrift: ['src/extra.js'],
        conformance: { status: 'clean', findings: [], touched: ['Orders'] },
        review: { approved: true, decision: 'APPROVED', iterations: 1, counts: { critical: 0, major: 0, minor: 2, suggestion: 0 } },
        hitl: { status: 'acked', fired: [{ name: 'db-migration' }] },
        pace: { post: { verdict: 'slow', hitlFloor: [{ path: 'db/migrations/x.sql' }] } },
        cost: { usd: 1.234, calls: 7 },
        developer: { filesChanged: ['src/math.js'] },
      },
    };
    const md = buildValidationReport({ task, result });
    expect(md).toMatch(/^Implements AISDLC-0001: math helpers/);
    expect(md).toMatch(/\| Definition of Ready \| ✅ \| ready \|/);
    expect(md).toMatch(/\| Specification \| ✅ \| PRD docs\/prd\/m\.md · design docs\/design\/m\.md · architecture slice \|/);
    expect(md).toMatch(/\| Plan \| ✅ \| code-plan · committed docs\/plans\/AISDLC-0001\.md \|/);
    expect(md).toMatch(/\| RED oracle nodes \| ⚠️ \| 1\/2 GREEN .*weak accept\): weak \|/);
    expect(md).toMatch(/\| Plan conformance \| ⚠️ \| changed but not in the plan: src\/extra\.js \|/);
    expect(md).toMatch(/\| Human sign-off gate \| ✅ \| signed off by a human: db-migration \|/);
    expect(md).toMatch(/\| Pace \| ✅ \| slow \(HITL floor\) \|/);
    expect(md).toMatch(/\| Cost \| ✅ \| \$1\.23 over 7 agent call\(s\) \|/);
    expect(md).toMatch(/\| AC2 \| errors \\\| clearly \| RED→GREEN nodes: add; reviewed against the spec \|/);
    expect(md).toMatch(/## Degraded seams\n\n- commitward: docker not found/);
  });

  test('a minimal result still renders, with honest skips', () => {
    const md = buildValidationReport({ task: { frontmatter: { id: 'X-1', title: 't' } }, result: { steps: {}, degraded: [] } });
    expect(md).toMatch(/\| Definition of Ready \| ⏭️ \| not evaluated in this run \|/);
    expect(md).toMatch(/\| Specification \| ⚠️ \| no spec block reached the agents \|/);
    expect(md).toMatch(/- none — every component this run uses was available/);
  });
});
