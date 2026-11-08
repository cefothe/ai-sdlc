const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const m = require(path.join(ROOT, 'pipeline', 'manifest.js'));

const entry = (over = {}) => ({ id: 'compact-path', files: ['src/util.js'], change: 'Implement compactPath.', accept: 'npx jest tests/util.test.js', local: true, ...over });
const plan = (entries) => `# Plan\n\nSteps...\n\n\`\`\`json\n${JSON.stringify({ 'execution-manifest': entries })}\n\`\`\`\n`;

describe('extractManifest', () => {
  test('finds the fenced manifest block, skipping unrelated blocks', () => {
    const text = '```json\n{"other": 1}\n```\n' + plan([entry()]);
    expect(m.extractManifest(text)).toEqual([entry()]);
  });

  test('no manifest → []; an unrelated broken block is ignored', () => {
    expect(m.extractManifest('```js\nconst x = {\n```\nno manifest here')).toEqual([]);
  });

  test('a block declaring the key that will not parse is refused', () => {
    expect(() => m.extractManifest('```json\n{"execution-manifest": [ {broken\n```')).toThrow(m.ManifestRefused);
    expect(() => m.extractManifest('```json\n{"execution-manifest": {"a": 1}}\n```')).toThrow(/must be a list/);
  });
});

describe('validateEntry (slicr rules)', () => {
  const bad = [
    [{ id: '../x' }, /path-safe slug/],
    [{ id: '.hidden' }, /path-safe slug/],
    [{ files: ['/etc/passwd'] }, /relative path/],
    [{ files: ['src/../../x'] }, /relative path/],
    [{ files: ['~/x'] }, /relative path/],
    [{ files: [] }, /non-empty list/],
    [{ accept: '' }, /'accept'/],
    [{ kind: 'delete' }, /kind 'delete'/],
    [{ kind: 'create', files: ['a.js', 'b.js'] }, /exactly one file/],
    [{ forbid: ['network'] }, /unknown forbid/],
    [{ forbid: ['new_deps', 'new_deps'] }, /duplicate/],
    [{ local: 'yes' }, /'local' must be a boolean/],
  ];
  test.each(bad)('refuses %j', (over, re) => {
    expect(() => m.validateEntry(entry(over), 0)).toThrow(re);
  });

  test('a missing required key is refused', () => {
    const { accept, ...noAccept } = entry();
    expect(accept).toBeTruthy();
    expect(() => m.validateEntry(noAccept, 0)).toThrow(/missing required key 'accept'/);
  });
});

describe('resolveManifest', () => {
  test('none when the plan carries no manifest', async () => {
    expect(await m.resolveManifest('just prose')).toEqual({ status: 'none' });
  });

  test('in-process: splits local nodes from inline entries', async () => {
    const r = await m.resolveManifest(plan([entry(), entry({ id: 'wire-cli', local: false }), entry({ id: 'new-file', kind: 'create', files: ['src/new.js'], forbid: ['new_deps'] })]));
    expect(r.status).toBe('ok');
    expect(r.source).toBe('in-process');
    expect(r.nodes.map((n) => n.id)).toEqual(['compact-path', 'new-file']);
    expect(r.nodes[1]).toEqual({ id: 'new-file', files: ['src/new.js'], change: 'Implement compactPath.', accept: 'npx jest tests/util.test.js', forbid: ['new_deps'], kind: 'create' });
    expect(r.inline.map((e) => e.id)).toEqual(['wire-cli']);
  });

  test('slicr ok is authoritative for nodes; unavailable falls back (degraded); rejected refuses', async () => {
    const text = plan([entry()]);
    const ok = await m.resolveManifest(text, { invoke: async () => ({ status: 'ok', body: { nodes: [{ filename: '01-compact-path.json', node: { id: 'compact-path', files: ['src/util.js'], change: 'c', accept: 'a' } }] } }) });
    expect(ok).toMatchObject({ status: 'ok', source: 'slicr', nodes: [{ id: 'compact-path', change: 'c' }] });

    const down = await m.resolveManifest(text, { invoke: async () => ({ status: 'unavailable', reason: 'docker not found' }) });
    expect(down).toMatchObject({ status: 'ok', source: 'in-process', degraded: [{ seam: 'slicr', reason: 'docker not found' }] });

    const rejected = await m.resolveManifest(text, { invoke: async () => ({ status: 'rejected', reason: 'bad_manifest: x' }) });
    expect(rejected).toEqual({ status: 'refused', reason: 'slicr: bad_manifest: x' });
  });

  test('an invalid entry is refused in-process', async () => {
    expect(await m.resolveManifest(plan([entry({ id: '../evil' })]))).toMatchObject({ status: 'refused' });
  });
});
