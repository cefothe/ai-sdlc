const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const rc = require(path.join(ROOT, 'decision-engine', 'review-contract.js'));

function withReview(text, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
  try {
    if (text !== null) fs.writeFileSync(path.join(dir, 'REVIEW.md'), text);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('review contract', () => {
  test('loads frontmatter (maxNits, skip) and body; the template is valid', () => {
    withReview(fs.readFileSync(path.join(ROOT, 'templates', 'REVIEW.md'), 'utf8'), (dir) => {
      const c = rc.loadReviewContract(dir);
      expect(c.maxNits).toBe(5);
      expect(c.skip.map((r) => r.source)).toContain('^src\\/gen\\/');
      expect(c.body).toMatch(/## Review passes/);
      expect(rc.formatReviewContract(c)).toMatch(/^REVIEW CONTRACT \(REVIEW\.md\)/);
    });
  });

  test('no REVIEW.md → null; invalid frontmatter throws', () => {
    withReview(null, (dir) => expect(rc.loadReviewContract(dir)).toBeNull());
    withReview('---\nmaxNits: [\n---\nbody', (dir) => expect(() => rc.loadReviewContract(dir)).toThrow(/not valid YAML/));
  });

  test('applyReviewContract drops skipped paths and caps nits across reviewers, never Important findings', () => {
    const contract = { maxNits: 2, skip: [/^src\/gen\//], body: '' };
    const verdicts = [
      { approved: true, findings: [{ severity: 'suggestion', file: 'a.js' }, { severity: 'major', file: 'src/gen/x.js' }, { severity: 'minor', file: 'b.js' }] },
      { approved: false, findings: [{ severity: 'minor', file: 'c.js' }, { severity: 'critical', file: 'd.js' }] },
    ];
    const out = rc.applyReviewContract(verdicts, contract);
    expect(out[0].findings).toEqual([{ severity: 'minor', file: 'b.js' }, { severity: 'suggestion', file: 'a.js' }]);
    expect(out[1].findings).toEqual([{ severity: 'critical', file: 'd.js' }]);
    expect(out[1].approved).toBe(false);
    expect(rc.applyReviewContract(verdicts, null)).toBe(verdicts);
  });
});
