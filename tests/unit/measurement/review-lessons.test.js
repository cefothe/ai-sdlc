const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const rl = require(path.join(ROOT, 'measurement', 'review-lessons.js'));

const run = (id, findings) => ({ taskId: id, runId: id, review: { findings } });

describe('review lessons', () => {
  test('signature ignores paths, numbers and quoted identifiers', () => {
    expect(rl.signature('Missing null check on `user.profile` in src/a.js line 42')).toBe(rl.signature('Missing null check on "order" in lib/b.ts line 7'));
  });

  test('a finding recurring across >=2 runs is a lesson; one-offs are not; rated noise moves it to noise', () => {
    const records = [
      run('r1', [{ severity: 'major', message: 'Missing null check on `user` in src/a.js', file: 'src/a.js' }, { severity: 'minor', message: 'Rename variable x' }]),
      run('r2', [{ severity: 'major', message: 'Missing null check on `order` in src/b.js', file: 'src/b.js' }]),
    ];
    const a = rl.analyze(records);
    expect(a.lessons).toHaveLength(1);
    expect(a.lessons[0]).toMatchObject({ runs: ['r1', 'r2'], files: ['src/a.js', 'src/b.js'], severity: 'major' });
    const sig = a.lessons[0].signature;
    const noisy = rl.analyze(records, [1, 2, 3].map(() => ({ signature: sig, rating: 'noise' })));
    expect(noisy.lessons).toEqual([]);
    expect(noisy.noise.map((n) => n.signature)).toEqual([sig]);
    expect(rl.renderProposals(a, '2026-11-07')).toMatch(/major\*\*, 2 runs \(r1, r2\): Missing null check/);
  });

  test('ratings and proposals persist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-'));
    try {
      rl.rate(root, { signature: 'missing null check', rating: 'useful', by: 'lead', at: 't' });
      expect(rl.loadRatings(root)).toEqual([{ signature: 'missing null check', rating: 'useful', by: 'lead', at: 't' }]);
      expect(() => rl.rate(root, { signature: 'x', rating: 'meh' })).toThrow(/useful or noise/);
      expect(rl.writeProposals(root, { lessons: [], noise: [] })).toBe(path.join('docs', 'lessons', 'proposed.md'));
      expect(fs.readFileSync(path.join(root, 'docs', 'lessons', 'proposed.md'), 'utf8')).toMatch(/None yet\./);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
