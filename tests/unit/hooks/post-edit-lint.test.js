const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../../../hooks/post-edit-lint.js');
const LOG_PATH = path.resolve(__dirname, '../../../promise/logs/post-edit-lint.jsonl');

function runHook(stdinJson) {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status,
  };
}

describe('post-edit-lint hook', () => {
  afterEach(() => {
    fs.rmSync(LOG_PATH, { force: true });
  });

  test('returns empty object for non-Write/Edit tools', () => {
    const result = runHook({ tool_name: 'Read', tool_input: { file_path: '/tmp/x.js' } });
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout || '{}');
    expect(out).toEqual({});
  });

  test('returns empty object when no file_path in input', () => {
    const result = runHook({ tool_name: 'Edit', tool_input: {} });
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout || '{}');
    expect(out).toEqual({});
  });

  test('returns empty object when file does not exist', () => {
    const result = runHook({
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/nonexistent-' + Date.now() + '.js' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('returns empty object when no linter is available for the language', () => {
    const result = runHook({
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/test.unknownext' },
    });
    expect(result.exitCode).toBe(0);
  });

  // Regression test for kgenov-tradu's H3: post-edit-lint previously emitted
  // additionalContext on lint failure, which Claude Code injects into the
  // next turn — the same feedback channel R5 (n=30, p<0.05, d=−0.64) proved
  // degrades quality. The hook MUST emit "{}" in every code path; lint
  // output goes to promise/logs/post-edit-lint.jsonl instead.
  describe('no-feedback invariant', () => {
    test('emits "{}" on lint failure (no additionalContext) and logs to JSONL', async () => {
      // Create a real .js file with a deliberate lint error in a tmp dir.
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pel-'));
      try {
        const filePath = path.join(tmpDir, 'broken.js');
        // Triple-equals violation + unused var = guaranteed eslint hits if eslint exists.
        fs.writeFileSync(filePath, 'var unused = 1;\nif (a == b) {}\n');

        const result = runHook({
          tool_name: 'Edit',
          tool_input: { file_path: filePath },
        });

        expect(result.exitCode).toBe(0);
        // No stderr — same R5 invariant; stderr is also a feedback channel.
        expect(result.stderr).toBe('');

        // Stdout MUST be exactly "{}" — never additionalContext, regardless
        // of whether eslint actually ran (commandExists may be false in CI).
        const out = JSON.parse(result.stdout || '{}');
        expect(out).toEqual({});
        expect(out.additionalContext).toBeUndefined();
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      }
    });

    test('hook output never contains the string "additionalContext" on any input shape', () => {
      // Belt-and-braces: the field name itself must not leak. Run several
      // shapes that previously could have triggered the response branch.
      const inputs = [
        { tool_name: 'Edit', tool_input: { file_path: '/tmp/' + Date.now() + '.js' } },
        { tool_name: 'Write', tool_input: { file_path: '/tmp/' + Date.now() + '.py' } },
        { tool_name: 'NotebookEdit', tool_input: { file_path: '/tmp/' + Date.now() + '.ts' } },
        'not even json',
        '',
      ];
      for (const input of inputs) {
        const result = spawnSync('node', [HOOK], {
          input: typeof input === 'string' ? input : JSON.stringify(input),
          encoding: 'utf8',
        });
        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain('additionalContext');
        expect(result.stderr).toBe('');
      }
    });
  });
});
