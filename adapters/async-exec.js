// Non-blocking process runner for the agent spawners.
//
// The spawners used to shell out through execFileSync. Wrapping a synchronous
// call in `await Promise.resolve(...)` does not make it concurrent: the event
// loop is blocked until the child exits, so `Promise.all` over a design panel or
// a review team ran every agent back-to-back. This runner uses child_process
// .spawn so N agents genuinely overlap.
//
// Contract mirrors execFileSync closely enough to be a drop-in `exec` seam:
//   asyncExec(cmd, args, { cwd, env, timeout, maxBuffer, input, killTree }) -> Promise<stdout>
// killTree runs the child as its own process group and signals the whole group on
// timeout, so `sh -c "make smoke"` doesn't leave make/go/docker orphans behind.
// On non-zero exit / timeout / spawn failure it rejects with an Error carrying
// { code, signal, stdout, stderr } — the same fields callers already read off an
// execFileSync throw (e.g. the cxpak fetcher salvages err.stdout).

const { spawn } = require('node:child_process');

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

function asyncExec(cmd, args = [], opts = {}) {
  const { cwd, env, timeout = 0, maxBuffer = DEFAULT_MAX_BUFFER, input, killTree = false } = opts;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: env || process.env, stdio: ['pipe', 'pipe', 'pipe'], detached: killTree });
    } catch (err) {
      reject(err);
      return;
    }

    const out = [];
    const errChunks = [];
    let outBytes = 0;
    let errBytes = 0;
    let settled = false;
    let failure = null;
    let timer = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    const kill = (reason) => {
      if (failure) return;
      failure = reason;
      try {
        if (killTree && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch { /* already gone */ }
    };

    child.stdout.on('data', (chunk) => {
      outBytes += chunk.length;
      if (outBytes > maxBuffer) { kill(new Error(`${cmd}: stdout exceeded maxBuffer (${maxBuffer} bytes)`)); return; }
      out.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      errBytes += chunk.length;
      if (errBytes > maxBuffer) { kill(new Error(`${cmd}: stderr exceeded maxBuffer (${maxBuffer} bytes)`)); return; }
      errChunks.push(chunk);
    });

    if (timeout > 0) {
      timer = setTimeout(() => kill(Object.assign(new Error(`${cmd}: timed out after ${timeout}ms`), { code: 'ETIMEDOUT' })), timeout);
    }

    child.on('error', (err) => {
      err.stdout = Buffer.concat(out).toString('utf8');
      err.stderr = Buffer.concat(errChunks).toString('utf8');
      finish(reject, err);
    });

    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(errChunks).toString('utf8');
      if (failure || code !== 0) {
        const err = failure || new Error(`${cmd} exited with code ${code}${signal ? ` (signal ${signal})` : ''}: ${stderr.split('\n').slice(-5).join('\n')}`);
        if (err.code === undefined) err.code = code;
        err.signal = signal;
        err.stdout = stdout;
        err.stderr = stderr;
        finish(reject, err);
        return;
      }
      finish(resolve, stdout);
    });

    // Close stdin (with optional payload) so headless CLIs that probe stdin do
    // not block waiting for input.
    child.stdin.on('error', () => { /* child exited before reading stdin */ });
    child.stdin.end(input == null ? '' : input);
  });
}

module.exports = { asyncExec, DEFAULT_MAX_BUFFER };
