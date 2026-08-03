const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { loadAgentPromises } = require('../../../promise/agent-promises-loader');

describe('agent-promises-loader', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apl-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array for missing agent file', async () => {
    const result = await loadAgentPromises('nonexistent', tmpDir);
    expect(result).toEqual([]);
  });

  test('returns empty array for agent file with no promises_offered', async () => {
    const agentFile = path.join(tmpDir, 'no-promises.md');
    await fs.writeFile(agentFile, '---\nname: no-promises\nmodel: sonnet\n---\n\nBody.');
    const result = await loadAgentPromises('no-promises', tmpDir);
    expect(result).toEqual([]);
  });

  test('parses promises_offered from frontmatter', async () => {
    const agentFile = path.join(tmpDir, 'with-promises.md');
    const content = `---
name: with-promises
model: sonnet
promises_offered:
  - id: custom-promise
    declaration: "I will produce custom output"
    verification:
      method: grep
      pattern: "custom"
      confidence: high
---

Agent body.`;
    await fs.writeFile(agentFile, content);

    const result = await loadAgentPromises('with-promises', tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('custom-promise');
    expect(result[0].declaration).toBe('I will produce custom output');
    expect(result[0].verification.method).toBe('grep');
    expect(result[0].verification.pattern).toBe('custom');
    expect(result[0].verification.confidence).toBe('high');
  });

  test('returns empty array for malformed frontmatter', async () => {
    const agentFile = path.join(tmpDir, 'bad.md');
    await fs.writeFile(agentFile, '---\nthis is not: valid\n  yaml:\n   indentation\n---\n');
    const result = await loadAgentPromises('bad', tmpDir);
    expect(result).toEqual([]);
  });

  test('handles multiple promises_offered entries', async () => {
    const agentFile = path.join(tmpDir, 'multi.md');
    const content = `---
name: multi
promises_offered:
  - id: promise-one
    declaration: "First promise"
    verification: { method: grep, pattern: "one", confidence: high }
  - id: promise-two
    declaration: "Second promise"
    verification: { method: grep_absent, pattern: "two", confidence: medium }
---
`;
    await fs.writeFile(agentFile, content);

    const result = await loadAgentPromises('multi', tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('promise-one');
    expect(result[1].id).toBe('promise-two');
    expect(result[1].verification.method).toBe('grep_absent');
  });
});
