const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { asyncExec } = require(path.join(ROOT, 'adapters', 'async-exec.js'));

describe('asyncExec', () => {
  test('resolves stdout of a successful command', async () => {
    await expect(asyncExec('sh', ['-c', 'printf hello'])).resolves.toBe('hello');
  });

  test('feeds input on stdin and closes it', async () => {
    await expect(asyncExec('cat', [], { input: 'piped' })).resolves.toBe('piped');
  });

  test('rejects with code/stdout/stderr on non-zero exit', async () => {
    const err = await asyncExec('sh', ['-c', 'echo out; echo err >&2; exit 4']).catch((e) => e);
    expect(err.code).toBe(4);
    expect(err.stdout).toBe('out\n');
    expect(err.stderr).toBe('err\n');
  });

  test('rejects with ETIMEDOUT and kills the whole process group (killTree)', async () => {
    const t0 = Date.now();
    const err = await asyncExec('sh', ['-c', 'sleep 5; echo late'], { timeout: 200, killTree: true }).catch((e) => e);
    expect(err.code).toBe('ETIMEDOUT');
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('rejects when stdout exceeds maxBuffer', async () => {
    const err = await asyncExec('sh', ['-c', 'head -c 5000 /dev/zero'], { maxBuffer: 1000 }).catch((e) => e);
    expect(err.message).toMatch(/maxBuffer/);
  });

  test('rejects on a missing binary', async () => {
    const err = await asyncExec('definitely-not-a-binary-xyz', []).catch((e) => e);
    expect(err.code).toBe('ENOENT');
  });

  test('runs concurrently — N sleeps overlap instead of queueing', async () => {
    const t0 = Date.now();
    await Promise.all([1, 2, 3, 4].map(() => asyncExec('sh', ['-c', 'sleep 0.4'])));
    expect(Date.now() - t0).toBeLessThan(1200); // serial would be >= 1600ms
  });

  test('honors cwd', async () => {
    const os = require('os');
    const fs = require('fs');
    const dir = fs.realpathSync(os.tmpdir());
    await expect(asyncExec('pwd', [], { cwd: dir })).resolves.toBe(`${dir}\n`);
  });
});
