const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../../../hooks/pre-bash-validate.js');

function runHook(stdinJson) {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf8',
  });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

describe('pre-bash-validate hook', () => {
  test('exits 0 for non-Bash tools', () => {
    const result = runHook({ tool_name: 'Read' });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for unrelated bash commands', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 for npm test in npm project', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('exits 2 for mvn in npm project', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'mvn clean install' },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('build system');
  });
});
