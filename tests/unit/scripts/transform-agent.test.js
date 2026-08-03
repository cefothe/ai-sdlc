const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('transform-agent.js', () => {
  let tmpDir;
  const scriptPath = path.resolve(__dirname, '../../../scripts/transform-agent.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('adds promise headers to agent with code tools', () => {
    const input = `---\nname: test-coder\ndescription: writes code\ntools: [Read, Write, Edit, Bash]\n---\n\nBody text.`;
    const file = path.join(tmpDir, 'test-coder.md');
    fs.writeFileSync(file, input, 'utf8');
    execSync(`node ${scriptPath} ${file}`);
    const output = fs.readFileSync(file, 'utf8');
    expect(output).toContain('promises_offered:');
    expect(output).toContain('tested-code');
    expect(output).toContain('promises_accepted:');
  });

  test('read-only agent does NOT get code promises', () => {
    const input = `---\nname: advisor\ndescription: gives advice\ntools: [Read]\n---\n\nAdvice body.`;
    const file = path.join(tmpDir, 'advisor.md');
    fs.writeFileSync(file, input, 'utf8');
    execSync(`node ${scriptPath} ${file}`);
    const output = fs.readFileSync(file, 'utf8');
    expect(output).toContain('complete-output');
    expect(output).not.toContain('tested-code');
  });

  test('preserves original body content', () => {
    const input = `---\nname: test\ntools: [Read]\n---\n\n# Important Body\nKeep this intact.`;
    const file = path.join(tmpDir, 'test.md');
    fs.writeFileSync(file, input, 'utf8');
    execSync(`node ${scriptPath} ${file}`);
    const output = fs.readFileSync(file, 'utf8');
    expect(output).toContain('# Important Body');
    expect(output).toContain('Keep this intact.');
  });

  test('exits with error if no frontmatter', () => {
    const input = `No frontmatter here.`;
    const file = path.join(tmpDir, 'bad.md');
    fs.writeFileSync(file, input, 'utf8');
    expect(() => execSync(`node ${scriptPath} ${file}`, { stdio: 'pipe' })).toThrow();
  });

  test('is idempotent — skips if promises_offered already present', () => {
    const input = `---\nname: test\ntools: [Read]\n---\n\nBody.`;
    const file = path.join(tmpDir, 'idem.md');
    fs.writeFileSync(file, input, 'utf8');
    execSync(`node ${scriptPath} ${file}`);
    const first = fs.readFileSync(file, 'utf8');
    execSync(`node ${scriptPath} ${file}`);
    const second = fs.readFileSync(file, 'utf8');
    expect(first).toBe(second);
  });
});
