const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const nt = require(path.join(ROOT, 'decision-engine', 'backlog-task-new.js'));
const { parseTask } = require(path.join(ROOT, 'decision-engine', 'backlog-task.js'));

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'task-new-'));
}

describe('nextTaskId', () => {
  test('starts at AISDLC-1 for an empty/absent backlog', () => {
    expect(nt.nextTaskId(tmp())).toBe('AISDLC-0001');
  });

  test('returns max id + 1 across existing task files', () => {
    const root = tmp();
    const dir = nt.tasksDir(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AISDLC-1 - a.md'), 'x');
    fs.writeFileSync(path.join(dir, 'AISDLC-7 - b.md'), 'x');
    fs.writeFileSync(path.join(dir, 'AISDLC-3 - c.md'), 'x');
    expect(nt.nextTaskId(root)).toBe('AISDLC-0008');
  });
});

describe('slugify', () => {
  test('kebab-cases and bounds the title', () => {
    expect(nt.slugify('feat: Add SSO login via OAuth')).toBe('feat-add-sso-login-via-oauth');
    expect(nt.slugify('!!!')).toBe('task');
  });
});

describe('buildTaskMarkdown', () => {
  test('renders parseable frontmatter + AC/description markers', () => {
    const md = nt.buildTaskMarkdown({
      id: 'AISDLC-42',
      title: 'feat: add SSO login',
      createdDate: '2026-07-18 10:00',
      description: 'Add OAuth login.',
      acceptanceCriteria: ['User can log in via OAuth', 'Token refresh handled'],
      labels: ['auth', 'frontend'],
      references: ['src/auth/login.ts', 'src/auth/oauth.ts', 'README.md'],
      priority: 'high',
    });
    const task = parseTask(md);
    expect(task.frontmatter.id).toBe('AISDLC-42');
    expect(task.frontmatter.title).toBe('feat: add SSO login');
    expect(task.frontmatter.dispatchable).toBe(true);
    expect(task.frontmatter.priority).toBe('high');
    expect(task.frontmatter.labels).toEqual(['auth', 'frontend']);
    expect(task.frontmatter.references).toHaveLength(3);
    expect(task.acceptanceCriteria).toHaveLength(2);
    expect(task.acceptanceCriteria[0].text).toContain('User can log in via OAuth');
    expect(md).toContain('<!-- SECTION:DESCRIPTION:BEGIN -->');
    expect(md).toContain('<!-- AC:BEGIN -->');
  });

  test('defaults a placeholder AC when none given', () => {
    const md = nt.buildTaskMarkdown({ id: 'AISDLC-1', title: 't', createdDate: '2026-07-18 10:00' });
    expect(parseTask(md).acceptanceCriteria).toHaveLength(1);
  });

  test('links the PRD via a specRef block (DoR gate 3 contract) and renders success metrics', () => {
    const md = nt.buildTaskMarkdown({
      id: 'AISDLC-9',
      title: 'feat: x',
      createdDate: '2026-07-18 10:00',
      prd: 'docs/prd/auth-revamp.md',
      references: ['src/x.ts'],
      successMetrics: ['activation +5pp', 'p95 < 2s'],
    });
    const task = parseTask(md);
    expect(task.frontmatter.specRef.artifactPath).toBe('docs/prd/auth-revamp.md');
    expect(task.frontmatter.specRef.source).toBe('prd');
    // featureId defaults to the PRD slug
    expect(task.frontmatter.specRef.featureId).toBe('auth-revamp');
    expect(task.frontmatter.references).toContain('src/x.ts');
    expect(md).toContain('## Success Metrics');
    expect(md).toContain('- activation +5pp');
  });

  test('honours an explicit featureId override', () => {
    const md = nt.buildTaskMarkdown({ id: 'AISDLC-9', title: 't', createdDate: '2026-07-18 10:00', prd: 'docs/prd/x.md', featureId: 'sso-login' });
    expect(parseTask(md).frontmatter.specRef.featureId).toBe('sso-login');
  });

  test('omits specRef entirely when no PRD is given', () => {
    const md = nt.buildTaskMarkdown({ id: 'AISDLC-9', title: 't', createdDate: '2026-07-18 10:00' });
    expect(parseTask(md).frontmatter.specRef).toBeUndefined();
  });

  test('validates id, title, and createdDate', () => {
    expect(() => nt.buildTaskMarkdown({ id: 'bad', title: 't', createdDate: 'd' })).toThrow(/AISDLC-NNN/);
    expect(() => nt.buildTaskMarkdown({ id: 'AISDLC-1', title: '', createdDate: 'd' })).toThrow(/title/);
    expect(() => nt.buildTaskMarkdown({ id: 'AISDLC-1', title: 't' })).toThrow(/createdDate/);
  });
});

describe('createTask', () => {
  test('allocates an id, writes the file, and is round-trippable', () => {
    const root = tmp();
    const res = nt.createTask(root, {
      title: 'feat: add SSO login',
      createdDate: '2026-07-18 10:00',
      references: ['a.ts', 'b.ts', 'c.ts'],
      acceptanceCriteria: ['crit one'],
    });
    expect(res.id).toBe('AISDLC-0001');
    expect(res.path).toContain('AISDLC-0001 - feat-add-sso-login.md');
    expect(fs.existsSync(res.path)).toBe(true);
    const task = parseTask(fs.readFileSync(res.path, 'utf8'));
    expect(task.frontmatter.id).toBe('AISDLC-0001');
  });

  test('never overwrites an existing task file', () => {
    const root = tmp();
    nt.createTask(root, { id: 'AISDLC-5', title: 'x', createdDate: '2026-07-18 10:00' });
    expect(() => nt.createTask(root, { id: 'AISDLC-5', title: 'x', createdDate: '2026-07-18 10:00' })).toThrow(/already exists/);
  });
});

describe('CLI arg safety', () => {
  const { spawnSync } = require('child_process');
  const CLI = path.join(ROOT, 'decision-engine', 'backlog-task-new.js');

  test('a trailing flag with no value fails cleanly (no corrupt task, no crash)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-cli-'));
    const r = spawnSync('node', [CLI, 'feat: x', '--root', root, '--ac'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/missing value for flag --ac/);
    // and no task file was written
    const dir = path.join(root, 'backlog', 'tasks');
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toHaveLength(0);
  });
});
