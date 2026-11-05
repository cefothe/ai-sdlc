const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { globToRegExp, filterByGlobs } = require(path.join(ROOT, 'decision-engine', 'path-glob.js'));

describe('globToRegExp', () => {
  const m = (pattern, file) => globToRegExp(pattern).test(file);

  test('trailing slash scopes to the whole subtree', () => {
    expect(m('deploy/', 'deploy/helm/values.yaml')).toBe(true);
    expect(m('deploy/', 'deployment.md')).toBe(false);
  });

  test('a bare directory/file name matches itself and anything under it', () => {
    expect(m('migrations', 'migrations')).toBe(true);
    expect(m('migrations', 'migrations/ch/0001.sql')).toBe(true);
    expect(m('migrations', 'migrations-old/x.sql')).toBe(false);
  });

  test('* stays within a segment, ** crosses segments', () => {
    expect(m('internal/*.go', 'internal/a.go')).toBe(true);
    expect(m('internal/*.go', 'internal/x/a.go')).toBe(false);
    expect(m('internal/**/*.go', 'internal/a.go')).toBe(true);
    expect(m('internal/**/*.go', 'internal/x/y/a.go')).toBe(true);
    expect(m('**/*.sql', 'migrations/ch/1.sql')).toBe(true);
  });

  test('? matches one character; regex metacharacters are literal', () => {
    expect(m('a?.txt', 'ab.txt')).toBe(true);
    expect(m('a?.txt', 'a/.txt')).toBe(false);
    expect(m('scripts/kind+up.sh', 'scripts/kind+up.sh')).toBe(true);
    expect(m('scripts/kind+up.sh', 'scripts/kinddup.sh')).toBe(false);
  });

  test('leading ./ is ignored on pattern and file', () => {
    expect(filterByGlobs(['./cmd/x/main.go'], ['./cmd/'])).toEqual(['./cmd/x/main.go']);
  });

  test('empty pattern throws', () => {
    expect(() => globToRegExp('  ')).toThrow(/empty glob/);
  });
});
