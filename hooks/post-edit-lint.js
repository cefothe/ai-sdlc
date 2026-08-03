#!/usr/bin/env node
// Post-edit lint hook
// Receives { tool_name, tool_input, ... } via stdin.
// Always returns "{}" — never injects feedback into the next turn.
// Lint output is logged to promise/logs/post-edit-lint.jsonl for the user/CI
// to inspect independently.
//
// Why no additionalContext: the framework's load-bearing invariant
// (R5, n=30, p<0.05, d=−0.64) is that feedback injection into the agent's
// next turn degrades quality. Lint output as additionalContext is the same
// channel the Stop hook was rewritten to avoid (commit 6a931ca). Same
// rationale applies here: pure observer, log-only.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const LOG_PATH = path.resolve(__dirname, '..', 'promise', 'logs', 'post-edit-lint.jsonl');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function getLinterCommand(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      // --no-install: never let npx fetch eslint from the network inside a
      // PostToolUse hook (would block the tool call). If eslint isn't installed
      // locally, npx exits non-zero immediately and lint is skipped (observation-only).
      return { cmd: 'npx', args: ['--no-install', 'eslint', '--no-color', filePath] };
    case '.py':
      return { cmd: 'ruff', args: ['check', '--no-color', filePath] };
    case '.rs':
      return { cmd: 'cargo', args: ['clippy', '--', '-D', 'warnings'] };
    default:
      return null;
  }
}

function commandExists(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function main() {
  const stdin = readStdin();
  if (!stdin.trim()) {
    process.stdout.write('{}');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch (_) {
    process.stdout.write('{}');
    return;
  }

  const toolName = payload.tool_name || '';
  // hooks.json matches Edit|Write|MultiEdit — the allowlist must include MultiEdit
  // or files edited via MultiEdit are never linted.
  if (toolName !== 'Write' && toolName !== 'Edit' && toolName !== 'MultiEdit' && toolName !== 'NotebookEdit') {
    process.stdout.write('{}');
    return;
  }

  const filePath = payload.tool_input?.file_path;
  if (!filePath) {
    process.stdout.write('{}');
    return;
  }

  if (!fs.existsSync(filePath)) {
    process.stdout.write('{}');
    return;
  }

  const linter = getLinterCommand(filePath);
  if (!linter) {
    process.stdout.write('{}');
    return;
  }

  if (!commandExists(linter.cmd)) {
    process.stdout.write('{}');
    return;
  }

  let output = '';
  let success = false;
  try {
    const result = execFileSync(linter.cmd, linter.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    output = result;
    success = true;
  } catch (err) {
    output = (err.stdout || '') + (err.stderr || '');
    success = false;
  }

  if (success || !output.trim()) {
    process.stdout.write('{}');
    return;
  }

  // Log lint output to a side-channel; do NOT inject into the agent's turn.
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      file: filePath,
      linter: linter.cmd,
      output: output.slice(0, 4000),
    };
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_) {
    // Logging failures must not propagate to the agent. Silently drop.
  }
  process.stdout.write('{}');
}

try {
  main();
} catch (err) {
  // Outer-catch must NOT write to stderr — Claude Code surfaces stderr to
  // the user/agent; that's the same feedback channel R5 proved harmful.
  // Log the error to the side-channel and exit cleanly.
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(
      LOG_PATH,
      JSON.stringify({ ts: new Date().toISOString(), hook_error: err.message }) + '\n',
      'utf8'
    );
  } catch (_) {}
  process.stdout.write('{}');
}
