const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const lint = require(path.join(ROOT, 'scripts', 'lint-agents-skills.js'));

describe('agent/skill lint (CI guard)', () => {
  test('the library has zero lint errors', () => {
    const report = lint.lint();
    const errors = report.results.filter((r) => r.errors.length).map((r) => `${r.path}: ${r.errors.join('; ')}`);
    expect(errors).toEqual([]);
  });

  test('lintDoc errors: name mismatch, short description, malformed tools, no frontmatter', () => {
    const doc = (fm, body = 'x'.repeat(250)) => ({ path: 'agents/a.md', kind: 'agent', expectedName: 'a', text: `---\n${fm}\n---\n${body}` });
    expect(lint.lintDoc(doc('name: b\ndescription: Use when reviewing Java services for bugs')).errors).toEqual(['name "b" does not match the file name "a"']);
    expect(lint.lintDoc(doc('name: a\ndescription: short')).errors[0]).toMatch(/too short to route on/);
    expect(lint.lintDoc(doc('name: a\ndescription: Use when reviewing Java services for bugs\ntools: 3')).errors).toEqual(['tools must be a list or a comma-separated string']);
    expect(lint.lintDoc({ path: 'x', kind: 'agent', expectedName: 'x', text: 'no fm' }).errors).toEqual(['no YAML frontmatter']);
  });

  test('lintDoc warnings: no usage cue, thin body, missing protocol', () => {
    const r = lint.lintDoc({ path: 'agents/a.md', kind: 'agent', expectedName: 'a', text: '---\nname: a\ndescription: Expert Java developer with deep JVM knowledge\n---\nshort' });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/no usage cue.*body is under 200 chars.*no context-protocol block/);
  });

  test('jaccard similarity', () => {
    expect(lint.jaccard(lint.tokens('review java code for bugs'), lint.tokens('review java code for bugs'))).toBe(1);
    expect(lint.jaccard(lint.tokens('alpha beta'), lint.tokens('gamma delta'))).toBe(0);
  });
});
