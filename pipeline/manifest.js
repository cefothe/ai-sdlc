// Execution manifest — the plan → execute seam (slicr contract,
// https://github.com/Barnett-Studios/slicr). The plan embeds one fenced JSON
// block `{"execution-manifest": [entry, …]}`; each `local: true` entry becomes a
// node: one region of change, an `accept` command authored up front that is RED
// before the change and GREEN only on a correct one. The implementer fills the
// region and never writes the test it is judged by.
//
// Three outcomes, deliberately distinguishable (slicr#3/#10):
//   none     — the plan carries no manifest → single-implementer path (fall back)
//   refused  — a manifest is present but unusable → the pipeline must FAIL
//   ok       — validated nodes + the inline (local:false) entries
//
// The published slicr container validates first (ADR-0052 `run-json`); when it is
// unavailable the same rules run in-process and the seam is reported degraded.

const FENCE_RE = /```[^\n]*\n([\s\S]*?)\n```/g;
const MANIFEST_KEY = '"execution-manifest"';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ID_MAX_LEN = 100;
const ALLOWED_KIND = new Set(['edit', 'create']);
const ALLOWED_FORBID = new Set(['new_deps']);

class ManifestRefused extends Error {}

// The manifest list, [] when the plan has none. Throws ManifestRefused when a
// block declares the key but will not parse or is not a list.
function extractManifest(text) {
  for (const m of String(text || '').matchAll(FENCE_RE)) {
    const block = m[1];
    let data;
    try {
      data = JSON.parse(block);
    } catch (err) {
      if (block.includes(MANIFEST_KEY)) throw new ManifestRefused(`bad_manifest: a fenced block declares ${MANIFEST_KEY} but is not valid JSON: ${err.message}`);
      continue;
    }
    if (data && typeof data === 'object' && !Array.isArray(data) && 'execution-manifest' in data) {
      if (!Array.isArray(data['execution-manifest'])) throw new ManifestRefused(`bad_manifest: ${MANIFEST_KEY} must be a list`);
      return data['execution-manifest'];
    }
  }
  return [];
}

function refuse(idx, id, msg) {
  throw new ManifestRefused(`bad_manifest: entry ${idx}${id ? ` (${id})` : ''}: ${msg}`);
}

// slicr's validate_entry, rule for rule (plan_to_nodes.py is the authority).
function validateEntry(e, idx) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) refuse(idx, null, 'must be an object');
  for (const key of ['id', 'files', 'change', 'accept']) if (!(key in e)) refuse(idx, null, `missing required key '${key}'`);
  if (typeof e.id !== 'string' || !e.id) refuse(idx, null, "'id' must be a non-empty string");
  if (e.id.length > ID_MAX_LEN) refuse(idx, null, `'id' exceeds ${ID_MAX_LEN} characters`);
  if (!ID_RE.test(e.id)) refuse(idx, null, `'id' ${JSON.stringify(e.id)} is not a path-safe slug`);
  if (typeof e.change !== 'string') refuse(idx, e.id, "'change' must be a string");
  if (typeof e.accept !== 'string' || !e.accept) refuse(idx, e.id, "'accept' must be a non-empty string");
  if (!Array.isArray(e.files) || !e.files.length) refuse(idx, e.id, "'files' must be a non-empty list");
  for (const f of e.files) {
    if (typeof f !== 'string' || !f) refuse(idx, e.id, "'files' entries must all be non-empty strings");
    if (f.startsWith('/') || f.startsWith('~') || f.split('/').includes('..')) {
      refuse(idx, e.id, `'files' entry ${JSON.stringify(f)} must be a relative path inside the repo`);
    }
  }
  if ('local' in e && typeof e.local !== 'boolean') refuse(idx, e.id, "'local' must be a boolean");
  const kind = e.kind === undefined ? 'edit' : e.kind;
  if (!ALLOWED_KIND.has(kind)) refuse(idx, e.id, `kind '${kind}' not in [create, edit]`);
  if (kind === 'create' && e.files.length !== 1) refuse(idx, e.id, 'create node must list exactly one file');
  const fb = e.forbid === undefined ? [] : e.forbid;
  if (!Array.isArray(fb) || !fb.every((t) => typeof t === 'string')) refuse(idx, e.id, "'forbid' must be a list of strings");
  if (new Set(fb).size !== fb.length) refuse(idx, e.id, "'forbid' has duplicate tokens");
  const bad = fb.filter((t) => !ALLOWED_FORBID.has(t));
  if (bad.length) refuse(idx, e.id, `unknown forbid tokens ${JSON.stringify(bad)}`);
}

function toNode(e) {
  const node = { id: e.id, files: e.files, change: e.change, accept: e.accept };
  if (e.forbid && e.forbid.length) node.forbid = e.forbid;
  if (e.kind && e.kind !== 'edit') node.kind = e.kind;
  return node;
}

// In-process: validate every entry, then split local nodes from inline entries.
function computeManifest(entries) {
  entries.forEach(validateEntry);
  return {
    nodes: entries.filter((e) => e.local === true).map(toNode),
    inline: entries.filter((e) => e.local !== true),
  };
}

// Resolve a plan's manifest. Returns
//   { status: 'none' } | { status: 'refused', reason } |
//   { status: 'ok', nodes, inline, source, degraded }
async function resolveManifest(planText, { invoke } = {}) {
  const degraded = [];
  let entries;
  try {
    entries = extractManifest(planText);
  } catch (err) {
    if (err instanceof ManifestRefused) return { status: 'refused', reason: err.message };
    throw err;
  }
  if (!entries.length) return { status: 'none' };

  if (typeof invoke === 'function') {
    const r = await invoke('slicr', { plan_text: String(planText) });
    if (r.status === 'rejected') return { status: 'refused', reason: `slicr: ${r.reason}` };
    if (r.status === 'ok') {
      const nodes = ((r.body && r.body.nodes) || []).map((n) => n.node);
      return { status: 'ok', nodes, inline: entries.filter((e) => e.local !== true), source: 'slicr', degraded };
    }
    degraded.push({ seam: 'slicr', reason: r.reason });
  }
  try {
    return { status: 'ok', ...computeManifest(entries), source: 'in-process', degraded };
  } catch (err) {
    if (err instanceof ManifestRefused) return { status: 'refused', reason: err.message };
    throw err;
  }
}

module.exports = { extractManifest, validateEntry, computeManifest, resolveManifest, ManifestRefused };

// CLI: node pipeline/manifest.js <plan.md> [--inprocess]
// exit 0 ok/none · 1 refused (the plan must be fixed) · 64 usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: manifest <plan.md> [--inprocess]');
    process.exit(64);
  }
  const { readFileSync } = require('node:fs');
  const { makeComponentInvoker } = require('../adapters/component-invoker');
  const invoke = makeComponentInvoker({ mode: args.includes('--inprocess') ? 'inprocess' : undefined });
  resolveManifest(readFileSync(file, 'utf8'), { invoke })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.status === 'refused' ? 1 : 0);
    })
    .catch((err) => {
      console.error(`manifest failed: ${err.message}`);
      process.exit(1);
    });
}
