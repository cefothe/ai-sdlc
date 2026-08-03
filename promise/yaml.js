// Lazy js-yaml accessor.
//
// Deferring require('js-yaml') to call time keeps module load side-effect-free.
// That matters for the hook chain: registry-loader is imported at the top of
// the Stop hook (stop-verify.js), whose error handling is a main().catch().
// A top-level require of a missing dependency throws BEFORE main() runs, so the
// catch cannot see it and the hook crashes with a non-zero exit. Resolving the
// dependency lazily moves any failure inside loadRegistry()/loadAgentPromises(),
// which run within the caught path — the hook logs and exits 0 as designed.
//
// js-yaml (v4) is dependency-free. In a plugin install (no npm install step),
// run `npm install --omit=dev` in the plugin directory to activate YAML-backed
// promise loading.
let cached = null;

function lib() {
  if (cached) return cached;
  try {
    cached = require('js-yaml');
  } catch (err) {
    throw new Error(
      'js-yaml is not installed — run `npm install --omit=dev` in the ai-sdlc ' +
      `plugin directory to enable promise-registry loading (original: ${err.message})`
    );
  }
  return cached;
}

function load(content) {
  return lib().load(content);
}

module.exports = { load };
