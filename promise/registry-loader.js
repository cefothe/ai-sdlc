const fs = require('fs');
const path = require('path');
const yaml = require('./yaml');

const DEFAULT_REGISTRY_PATH = path.join(__dirname, 'registry.yaml');
const OVERRIDES_PATH = path.join(__dirname, 'overrides.yaml');

function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const content = fs.readFileSync(registryPath, 'utf8');
  const raw = yaml.load(content);

  if (!raw || !raw.version || !raw.promises) {
    throw new Error(`Invalid registry at ${registryPath}: missing version or promises`);
  }

  const promises = new Map();
  for (const [id, spec] of Object.entries(raw.promises)) {
    promises.set(id, { id, enabled: true, ...spec });
  }

  applyOverrides(promises);

  return { version: raw.version, promises };
}

function applyOverrides(promises) {
  let overrides;
  try {
    const content = fs.readFileSync(OVERRIDES_PATH, 'utf8');
    overrides = yaml.load(content);
  } catch (err) {
    // ENOENT is the normal "no overrides on this install" path — silent. Any
    // other error (parse failure, permission denied, etc.) is surfaced to
    // stderr so a malformed overrides.yaml that would silently disable
    // verifiers is visible during measurement runs / hook execution.
    if (err && err.code !== 'ENOENT') {
      try {
        process.stderr.write(`[registry-loader] failed to load ${OVERRIDES_PATH}: ${err.message}\n`);
      } catch (_) { /* never throw from a loader */ }
    }
    return;
  }

  if (!overrides || !overrides.overrides) return;

  for (const [id, patch] of Object.entries(overrides.overrides)) {
    const spec = promises.get(id);
    if (!spec) continue;

    if (patch.enabled === false) {
      spec.enabled = false;
    }
    if (patch.threshold !== undefined) {
      spec.threshold = patch.threshold;
    }
    if (patch.thresholds) {
      spec.thresholds = { ...(spec.thresholds || {}), ...patch.thresholds };
    }
  }
}

function availablePromises(env = { cxpak: false, trace: false }) {
  const { promises } = loadRegistry();
  const result = [];

  for (const [id, spec] of promises) {
    if (spec.enabled === false) continue;

    if (spec.requires == null) {
      // null OR undefined (field omitted) → an unconditional promise. Without
      // this, a promise authored without a `requires` field is silently dropped.
      result.push(spec);
    } else if (spec.requires === 'cxpak' && env.cxpak) {
      result.push(spec);
    } else if (Array.isArray(spec.requires)) {
      const met = spec.requires.every(r => env[r]);
      if (met) result.push(spec);
    }
  }

  return result;
}

module.exports = { loadRegistry, availablePromises };
