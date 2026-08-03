const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../../../hooks/stop-verify.js');

function runHook(stdinJson) {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf8',
  });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

describe('stop-verify hook', () => {
  jest.setTimeout(30000);
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sv-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    const logPath = path.resolve(__dirname, '../../../promise/logs/stop-verify.jsonl');
    await fs.rm(logPath, { force: true }).catch(() => {});
    const errLogPath = path.resolve(__dirname, '../../../promise/logs/hook-errors.jsonl');
    await fs.rm(errLogPath, { force: true }).catch(() => {});
    const baselineDir = path.resolve(__dirname, '../../../promise/logs/baselines');
    await fs.rm(baselineDir, { recursive: true, force: true }).catch(() => {});
  });

  test('exits 0 when no transcript_path provided', () => {
    const result = runHook({ session_id: 'test' });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 when transcript file does not exist', () => {
    const result = runHook({
      session_id: 'test',
      transcript_path: path.join(tmpDir, 'nonexistent.jsonl'),
    });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 when transcript has clean assistant output', async () => {
    const transcript = path.join(tmpDir, 'transcript.jsonl');
    const lines = [
      { type: 'user', message: { content: 'Write a function' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'function add(a, b) { try { return a + b; } catch (e) { throw e; } }\n\ntest("adds", () => { expect(add(1,2)).toBe(3); });',
            },
          ],
        },
      },
    ];
    await fs.writeFile(transcript, lines.map(l => JSON.stringify(l)).join('\n'));

    const result = runHook({ session_id: 'test', transcript_path: transcript });
    expect(result.exitCode).toBe(0);
  });

  test('exits 0 and logs broken promises when transcript has TODO markers', async () => {
    const transcript = path.join(tmpDir, 'transcript.jsonl');
    const lines = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'function foo() {\n  // TODO: implement\n}' }],
        },
      },
    ];
    await fs.writeFile(transcript, lines.map(l => JSON.stringify(l)).join('\n'));

    const result = runHook({ session_id: 'test', transcript_path: transcript });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('Standing promise verification failed');

    const logPath = path.resolve(__dirname, '../../../promise/logs/stop-verify.jsonl');
    const logContent = await fs.readFile(logPath, 'utf8');
    const lastEntry = JSON.parse(logContent.trim().split('\n').pop());
    expect(lastEntry.broken.length).toBeGreaterThan(0);
    // When cxpak is available, complete-output may be verified via diff (kept);
    // when absent, it is detected via grep on output text (broken).
    if (!lastEntry.cxpak_available) {
      expect(lastEntry.broken.some(b => b.id === 'complete-output')).toBe(true);
      expect(lastEntry.broken.find(b => b.id === 'complete-output').confidence).toBe('low');
    }
  });

  test('baseline_loaded is true when baseline file exists', async () => {
    const transcript = path.join(tmpDir, 'transcript.jsonl');
    const lines = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'function add(a, b) { try { return a + b; } catch (e) { throw e; } }\ntest("adds", () => expect(add(1,2)).toBe(3));' }],
        },
      },
    ];
    await fs.writeFile(transcript, lines.map(l => JSON.stringify(l)).join('\n'));

    const baselineDir = path.resolve(__dirname, '../../../promise/logs/baselines');
    await fs.mkdir(baselineDir, { recursive: true });
    const baseline = {
      session_id: 'baseline-test',
      timestamp: new Date().toISOString(),
      cxpak_available: false,
      health: { composite: 8.0 },
    };
    await fs.writeFile(
      path.join(baselineDir, 'baseline-test.json'),
      JSON.stringify(baseline)
    );

    const result = runHook({ session_id: 'baseline-test', transcript_path: transcript });
    expect(result.exitCode).toBe(0);

    const logPath = path.resolve(__dirname, '../../../promise/logs/stop-verify.jsonl');
    const logContent = await fs.readFile(logPath, 'utf8');
    const lastLine = logContent.trim().split('\n').pop();
    const entry = JSON.parse(lastLine);
    expect(entry.baseline_loaded).toBe(true);
  });

  test('baseline_loaded is false when no baseline file exists', async () => {
    const transcript = path.join(tmpDir, 'transcript.jsonl');
    const lines = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'function add(a, b) { try { return a + b; } catch (e) { throw e; } }\ntest("adds", () => expect(add(1,2)).toBe(3));' }],
        },
      },
    ];
    await fs.writeFile(transcript, lines.map(l => JSON.stringify(l)).join('\n'));

    const result = runHook({ session_id: 'no-baseline-exists', transcript_path: transcript });
    expect(result.exitCode).toBe(0);

    const logPath = path.resolve(__dirname, '../../../promise/logs/stop-verify.jsonl');
    const logContent = await fs.readFile(logPath, 'utf8');
    const lastLine = logContent.trim().split('\n').pop();
    const entry = JSON.parse(lastLine);
    expect(entry.baseline_loaded).toBe(false);
  });

  // Regression test for nmilenkov #8: outer-catch previously wrote to stderr
  // on hook error. Stop-hook stderr is the same feedback channel the rest
  // of the file is rewritten to avoid (no-feedback-injection invariant
  // per R5). The hook MUST exit 0 with no stderr in every code path.
  test('regression — never writes to stderr (no-feedback invariant on all paths)', async () => {
    // Path 1: non-JSON stdin — main() catches JSON.parse and exits 0 cleanly
    const r1 = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
    expect(r1.status).toBe(0);
    expect(r1.stderr).toBe('');

    // Path 2: missing transcript_path — main() exits 0 cleanly
    const r2 = spawnSync('node', [HOOK], { input: '{}', encoding: 'utf8' });
    expect(r2.status).toBe(0);
    expect(r2.stderr).toBe('');

    // Path 3: nonexistent transcript path — main() handles gracefully, exit 0
    const r3 = spawnSync('node', [HOOK], {
      input: JSON.stringify({ session_id: 's', transcript_path: '/nonexistent/path/to/transcript' }),
      encoding: 'utf8',
    });
    expect(r3.status).toBe(0);
    expect(r3.stderr).toBe('');

    // Path 4: malformed transcript JSONL — main() filters bad lines, exit 0
    const transcript = path.join(tmpDir, 'broken.jsonl');
    await fs.writeFile(transcript, 'not even close to json\n{partial');
    const r4 = spawnSync('node', [HOOK], {
      input: JSON.stringify({ session_id: 's', transcript_path: transcript }),
      encoding: 'utf8',
    });
    expect(r4.status).toBe(0);
    expect(r4.stderr).toBe('');
  });
});
