// ADR bootstrap for brownfield adoption: import existing ADRs, THEN
// reverse-engineer proposed ADRs from the code for the decisions no one wrote
// down. ID numbering chains through the shared store so the two passes never
// collide. Called by `init` and exposed via `decisions bootstrap`.

const { importAdrs } = require('./adr-import');
const { proposeArchitectureAdrs } = require('./adr-detect');

function bootstrapAdrs(root, { created = '' } = {}) {
  const imported = importAdrs(root, { created }).imported;
  // proposeArchitectureAdrs recomputes nextId from the store, so imported
  // records are already accounted for — no id collisions.
  const proposed = proposeArchitectureAdrs(root, { created }).proposed;
  return {
    imported,
    proposed,
    summary: `${imported.length} ADR(s) imported, ${proposed.length} proposed from code (lifecycle: proposed — ratify via architect review + \`decisions\`).`,
  };
}

module.exports = { bootstrapAdrs };
