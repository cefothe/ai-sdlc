#!/usr/bin/env node
// codex-dispatch — run a single agent turn on the Codex harness for the
// interactive slash commands. The interactive /ai-sdlc:design dispatches its
// architects via Claude Code's Task tool (all claude subagents); a panelist
// declared `harness: codex` would be inert there. This script is the bridge:
// it shells the prompt through the same makeCodexSpawner the unattended pipeline
// uses, so a codex-harness architect GENUINELY runs on Codex and the design
// panel is truly cross-model (claude ∥ codex) before the chair converges.
//
// Usage (prompt on stdin):
//   printf '%s' "$PROMPT" | node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-dispatch.mjs" \
//     --type design --role solution-architect-codex --name architect-review
//
// Prints the agent's proposal text to stdout (prose for design/plan; JSON for a
// reviewer). Exit 1 on dispatch failure, 2 on empty prompt. Requires codex
// installed + logged in (`codex login status`).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { makeCodexSpawner } = require('../adapters/codex-spawner.js');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const type = arg('--type', 'design');
const role = arg('--role', 'architect');
const name = arg('--name', 'architect-review');
const reasoningEffort = arg('--reasoning-effort', 'high');

let prompt = '';
try {
  prompt = readFileSync(0, 'utf8');
} catch (err) {
  console.error(`codex-dispatch: could not read prompt from stdin: ${err.message}`);
  process.exit(2);
}
if (!prompt.trim()) {
  console.error('codex-dispatch: empty prompt on stdin');
  process.exit(2);
}

makeCodexSpawner({ reasoningEffort })({ type, provider: { role, name, harness: 'codex' }, prompt })
  .then((out) => {
    const text =
      typeof out === 'string'
        ? out
        : out && typeof out.summary === 'string'
          ? out.summary
          : JSON.stringify(out);
    process.stdout.write(text);
  })
  .catch((err) => {
    console.error(`codex-dispatch failed: ${err.message}`);
    process.exit(1);
  });
