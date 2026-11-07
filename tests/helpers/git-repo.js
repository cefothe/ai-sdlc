// Real throwaway git repositories for tests that exercise git-reading code
// (HITL gate, pace, node executor, pipeline flow). No git fakes.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A repo on `main` with one initial commit of `files` ({ relPath: content }).
function makeRepo(files = { 'README.md': '# repo\n' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisdlc-git-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFiles(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  return dir;
}

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

function commit(dir, files, message) {
  writeFiles(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', message);
  return git(dir, 'rev-parse', 'HEAD').trim();
}

// The runner shape the pipeline expects: (args, { cwd }) → { stdout }.
function runner(args, opts = {}) {
  return { stdout: execFileSync('git', args, { cwd: opts.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
}

function remove(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { makeRepo, writeFiles, commit, git, runner, remove };
