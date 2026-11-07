// Flow configuration — which harness components the pipeline plugs in and how.
// Read from .ai-sdlc/flow.yaml (a plain config file, not a schema'd resource),
// deep-merged over these defaults. Every knob has a safe default, so a repo
// without the file gets the full flow with host-run accepts.

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const yaml = require('js-yaml');

const FLOW_FILE = join('.ai-sdlc', 'flow.yaml');

const DEFAULTS = {
  components: {
    mode: 'docker',          // docker: call the published images · inprocess: never call docker
    images: {},              // per-component image overrides, e.g. { commitward: ghcr.io/...:0.3.4 }
    timeoutSec: 120,
  },
  manifest: {
    enabled: true,           // honor an execution-manifest in the plan (RED-oracle node execution)
    nodeRetries: 2,          // rolled-back retries per node before it HALTs to a human
    acceptTimeoutSec: 300,
  },
  sandbox: {
    mode: 'host',            // host | cordon
    cordonRun: '',           // path to cordon's bin/cordon-run.sh
    image: '',               // runtime image the accept command runs in (project toolchain)
  },
  hitl: { enabled: true },   // human sign-off gate before push — never auto-acknowledged
  pace: { enabled: true },   // ceremony from blast radius + HITL floor + trust (raise-only)
  trust: {
    enabled: true,
    ledgerDir: '',           // promise ledger dir (default: the plugin's promise/logs)
  },
  conformance: { enabled: true },   // architecture conformance check on the real diff → reviewers
  product: { recordShipped: true }, // add a shipped feature to the product context's Current capabilities
  plan: { commit: true },          // commit docs/plans/<task>.md and report plan drift
  budget: { maxCostUsd: 0, maxCalls: 0 }, // per-run caps; 0 = no cap
  metrics: { owners: {} },         // delivery-metric → owner who acts when it goes red
  monorepo: {
    projects: [],            // [path | {name, path}] — empty = detect from workspace manifests
    autoDetect: true,
  },
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = isObject(v) && isObject(base[k]) ? merge(base[k], v) : v;
  return out;
}

function loadFlowConfig(root) {
  const file = join(root, FLOW_FILE);
  if (!existsSync(file)) return merge(DEFAULTS, {});
  const doc = yaml.load(readFileSync(file, 'utf8'));
  if (doc !== undefined && doc !== null && !isObject(doc)) throw new Error(`${FLOW_FILE} must be a mapping`);
  return merge(DEFAULTS, doc || {});
}

module.exports = { loadFlowConfig, DEFAULTS, FLOW_FILE };
