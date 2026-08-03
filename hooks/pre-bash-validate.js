#!/usr/bin/env node
// PreToolUse hook for Bash — validates build/test commands match documented build system
// Receives { tool_name, tool_input } via stdin
// Exit code 2 if wrong build system used; 0 otherwise
//
// ADVISORY ONLY — NOT A SECURITY BOUNDARY.
//
// This hook is best-effort build-system hygiene to nudge agents toward the
// project's documented toolchain (mvn vs gradle, npm vs yarn, etc.). It is
// NOT and was never intended to be a security control.
//
// Known bypasses (intentional simplicity — extractBuildToolFromCommand only
// looks at the first token):
//   • `cd path && gradle build`     — first token is `cd`
//   • `env JAVA_HOME=... gradle …`   — first token is `env`
//   • `/usr/bin/gradle …`            — absolute paths not in the lookup table
//   • `nohup gradle …`               — prefix wrapper not unwrapped
//   • `sh -c "gradle …"`             — wrapped invocation
//
// Each of these is a legitimate developer-productivity construct. Robustly
// parsing every shell prefix would balloon the hook into a shell-parser; for
// the actual goal (catch obvious mvn-vs-gradle mistakes), the simple first-
// token check is sufficient. Real safety is enforced by Claude Code's
// permission system, not by this hook.
//
// kgenov-tradu / ryordanov-tradu both flagged the bypass as a finding. The
// project decision is to document the advisory framing rather than chase
// every bypass — see PR #25 Tier 3 decisions.

const fs = require('fs');
const path = require('path');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function detectBuildSystem(cwd) {
  if (fs.existsSync(path.join(cwd, 'pom.xml'))) return 'maven';
  if (fs.existsSync(path.join(cwd, 'build.gradle')) || fs.existsSync(path.join(cwd, 'build.gradle.kts'))) return 'gradle';
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'cargo';
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) return 'python';
  return null;
}

function extractBuildToolFromCommand(command) {
  const cmd = command.trim().split(/\s+/)[0];
  const buildTools = {
    mvn: 'maven',
    gradle: 'gradle',
    './gradlew': 'gradle',
    npm: 'npm',
    yarn: 'npm',
    pnpm: 'npm',
    cargo: 'cargo',
    pip: 'python',
    pytest: 'python',
    poetry: 'python',
    uv: 'python',
  };
  return buildTools[cmd] || null;
}

function main() {
  const stdin = readStdin();
  if (!stdin.trim()) process.exit(0);

  let payload;
  try { payload = JSON.parse(stdin); } catch (_) { process.exit(0); }

  if (payload.tool_name !== 'Bash') process.exit(0);

  const command = payload.tool_input?.command || '';
  const usedTool = extractBuildToolFromCommand(command);
  if (!usedTool) process.exit(0);

  const expectedSystem = detectBuildSystem(process.cwd());
  if (!expectedSystem) process.exit(0);

  if (usedTool !== expectedSystem) {
    process.stderr.write(
      `Build system mismatch: command uses '${usedTool}' but project build system is '${expectedSystem}'.\n` +
      `Use the documented build system. Check CLAUDE.md or README.md for the correct commands.\n`
    );
    process.exit(2);
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(`pre-bash-validate error: ${err.message}\n`);
  process.exit(0);
}
