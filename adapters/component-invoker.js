// Component invoker — calls a Barnett Studios harness component (commitward,
// slicr, …) through its published container image and the ADR-0052 response
// envelope: a JSON request on stdin, `{schema_version, status, body}` on stdout.
//
// The envelope status decides what the caller may do:
//   ok        → use body
//   rejected  → the component judged the INPUT and declined it; the caller must
//               fail, never fall open (a malformed manifest is not a missing one)
//   error / no envelope / docker absent / timeout → the component failed at its
//               own job; the caller falls open to its in-process path and records
//               the seam as degraded (fail-open, never fail-silent)
//
// Containers run with --network none: every request carries its inputs inline.

const { spawnSync } = require('node:child_process');

const DEFAULT_IMAGES = {
  commitward: 'ghcr.io/barnett-studios/commitward:0.3.4',
  slicr: 'ghcr.io/barnett-studios/slicr:0.3.1',
};

// The op each component's envelope front door answers on.
const DEFAULT_OPS = {
  commitward: 'gate',
  slicr: 'run-json',
};

const DEFAULT_TIMEOUT_MS = 120000;

function defaultRun(cmd, args, { input, timeout }) {
  return spawnSync(cmd, args, { input, timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function unavailable(reason) {
  return { status: 'unavailable', body: null, reason };
}

// Parse a component's stdout into an envelope, or null when it is not one.
function parseEnvelope(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    const env = JSON.parse(text.split(/\r?\n/).filter(Boolean).pop());
    return env && typeof env === 'object' && typeof env.status === 'string' ? env : null;
  } catch {
    return null;
  }
}

// mode: 'docker' (default) runs the image; 'inprocess' never calls docker and
// reports every component unavailable, so callers take their in-process path.
function makeComponentInvoker({
  run = defaultRun,
  mode = process.env.AI_SDLC_COMPONENT_MODE || 'docker',
  docker = process.env.AI_SDLC_DOCKER_BIN || 'docker',
  images = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const imageFor = (name) => process.env[`AI_SDLC_${name.toUpperCase()}_IMAGE`] || images[name] || DEFAULT_IMAGES[name];

  return async function invoke(name, request) {
    if (mode === 'inprocess') return unavailable('component mode is inprocess');
    const image = imageFor(name);
    const op = DEFAULT_OPS[name];
    if (!image || !op) return unavailable(`unknown component "${name}"`);
    let res;
    try {
      res = run(docker, ['run', '--rm', '-i', '--network', 'none', image, op], { input: JSON.stringify(request), timeout: timeoutMs });
    } catch (err) {
      return unavailable(`${name}: ${err.message}`);
    }
    if (res.error) {
      const why = res.error.code === 'ENOENT' ? `${docker} not found` : res.error.code === 'ETIMEDOUT' ? `timed out after ${timeoutMs}ms` : res.error.message;
      return unavailable(`${name}: ${why}`);
    }
    const env = parseEnvelope(res.stdout);
    if (!env) {
      const err = String(res.stderr || '').trim().split(/\r?\n/).pop() || `exit ${res.status}`;
      return unavailable(`${name}: no response envelope (${err})`);
    }
    if (env.status === 'ok') return { status: 'ok', body: env.body || {}, reason: null };
    if (env.status === 'rejected') return { status: 'rejected', body: env.body || {}, reason: (env.body && env.body.message) || 'rejected' };
    return unavailable(`${name}: ${env.status}${env.body && env.body.message ? ` — ${env.body.message}` : ''}`);
  };
}

module.exports = { makeComponentInvoker, parseEnvelope, DEFAULT_IMAGES, DEFAULT_OPS };
