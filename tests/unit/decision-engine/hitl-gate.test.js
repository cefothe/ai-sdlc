const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const hg = require(path.join(ROOT, 'decision-engine', 'hitl-gate.js'));
const repo = require(path.join(ROOT, 'tests', 'helpers', 'git-repo.js'));

const DEFAULT_YAML = fs.readFileSync(hg.DEFAULT_REGISTRY, 'utf8');
const names = (r) => r.fired.map((f) => f.name);

describe('compilePattern', () => {
  test('case-insensitive by default; (?-i:X) compiles case-sensitive', () => {
    expect(hg.compilePattern('claude\\.md$').test('CLAUDE.md')).toBe(true);
    const branchD = hg.compilePattern('git +branch +(?-i:-D)');
    expect(branchD.test('git branch -D feature')).toBe(true);
    expect(branchD.test('git branch -d feature')).toBe(false);
  });
});

describe('evaluateInProcess (default registry)', () => {
  const ev = (over) => hg.evaluateInProcess({ global_registry_yaml: DEFAULT_YAML, repo_registry_yaml: '', diff: '', commit_msg: '', ...over });

  test('an ordinary change fires nothing', () => {
    const r = ev({ name_status: 'M\tsrc/app.js', diff: '+++ b/src/app.js\n+const x = 1;\n' });
    expect(r.fired).toEqual([]);
    expect(r.exit_class).toBe(0);
  });

  test('path checkpoints: CLAUDE.md, migrations, CI, .env', () => {
    const r = ev({ name_status: 'M\tCLAUDE.md\nA\tdb/migrations/V2__add.sql\nM\t.github/workflows/ci.yml\nA\t.env.production' });
    expect(names(r)).toEqual(expect.arrayContaining(['agent-instructions-self-mod', 'db-migration', 'ci-pipeline-change', 'secrets-or-credentials']));
    expect(r.exit_class).toBe(2);
  });

  test('.env.example does not fire the secrets checkpoint', () => {
    expect(names(ev({ name_status: 'A\t.env.example' }))).not.toContain('secrets-or-credentials');
  });

  test('content checkpoints fire on added lines, honoring exempt paths', () => {
    const fired = ev({ name_status: 'M\tscripts/deploy.sh', diff: '+++ b/scripts/deploy.sh\n+git push origin main --force\n' });
    expect(names(fired)).toContain('destructive-ops');
    const exempt = ev({ name_status: 'M\tdocs/howto.md', diff: '+++ b/docs/howto.md\n+git push origin main --force\n' });
    expect(names(exempt)).not.toContain('destructive-ops');
    const lease = ev({ name_status: 'M\ts.sh', diff: '+++ b/s.sh\n+git push --force-with-lease\n' });
    expect(names(lease)).not.toContain('destructive-ops');
  });

  test('a HITL-ACK trailer acknowledges a fired checkpoint (exit 1)', () => {
    const r = ev({ name_status: 'M\tCLAUDE.md', commit_msg: 'docs\n\nHITL-ACK: agent-instructions-self-mod reviewed by owner\n' });
    expect(r.unacked).toEqual([]);
    expect(r.exit_class).toBe(1);
  });

  test('repo checkpoints add to the default; removing one fires checkpoint-removed', () => {
    const repoYaml = 'version: "1"\ncheckpoints:\n  - name: payments\n    summary: p\n    paths: ["(^|/)payments/"]\n';
    expect(names(ev({ name_status: 'M\tsrc/payments/charge.js', repo_registry_yaml: repoYaml }))).toEqual(['payments']);
    const removed = ev({ name_status: 'M\tsrc/x.js', repo_registry_yaml: 'version: "1"\ncheckpoints: []\n', base_repo_registry_yaml: repoYaml });
    expect(removed.fired.find((f) => f.name === 'checkpoint-removed').why).toMatch(/payments/);
  });

  test('an uncompilable registry throws', () => {
    expect(() => ev({ name_status: 'M\tx', repo_registry_yaml: 'checkpoints:\n  - name: bad\n    paths: ["("]\n' })).toThrow();
  });
});

describe('evaluateHitlGate on a real branch', () => {
  const unavailable = async () => ({ status: 'unavailable', reason: 'docker not found' });

  function branchRepo(files, message = 'change') {
    const dir = repo.makeRepo({ 'src/app.js': 'module.exports = 1;\n' });
    repo.git(dir, 'checkout', '-q', '-b', 'feature');
    repo.commit(dir, files, message);
    return dir;
  }

  test('falls back in-process (degraded) and blocks an unacknowledged CLAUDE.md edit', async () => {
    const dir = branchRepo({ 'CLAUDE.md': '# rules\n' });
    try {
      const r = await hg.evaluateHitlGate({ cwd: dir, base: 'main', runner: repo.runner, invoke: unavailable });
      expect(r.status).toBe('blocked');
      expect(r.source).toBe('in-process');
      expect(r.unacked).toEqual(['agent-instructions-self-mod']);
      expect(r.degraded).toEqual([{ seam: 'commitward', reason: 'docker not found' }]);
      expect(hg.formatBlocked(r).join('\n')).toMatch(/HITL-ACK: agent-instructions-self-mod/);
    } finally {
      repo.remove(dir);
    }
  });

  test('a human sign-off commit on the branch makes it acked', async () => {
    const dir = branchRepo({ 'CLAUDE.md': '# rules\n' });
    try {
      repo.commit(dir, {}, 'HITL sign-off\n\nHITL-ACK: agent-instructions-self-mod reviewed by the owner');
      const r = await hg.evaluateHitlGate({ cwd: dir, base: 'main', runner: repo.runner, invoke: unavailable });
      expect(r.status).toBe('acked');
      expect(r.exitClass).toBe(1);
    } finally {
      repo.remove(dir);
    }
  });

  test('an ordinary change is clear', async () => {
    const dir = branchRepo({ 'src/app.js': 'module.exports = 2;\n' });
    try {
      expect((await hg.evaluateHitlGate({ cwd: dir, base: 'main', runner: repo.runner, invoke: unavailable })).status).toBe('clear');
    } finally {
      repo.remove(dir);
    }
  });

  test('commitward ok envelope is authoritative; rejected blocks; the request carries the inlined inputs', async () => {
    const dir = branchRepo({ 'src/app.js': 'module.exports = 2;\n' });
    try {
      let request = null;
      const okInvoke = async (name, req) => { request = req; return { status: 'ok', body: { fired: [{ name: 'cm' }], unacked: ['cm'], exit_class: 2, warnings: [] } }; };
      const r = await hg.evaluateHitlGate({ cwd: dir, base: 'main', runner: repo.runner, invoke: okInvoke });
      expect(r).toMatchObject({ status: 'blocked', source: 'commitward', unacked: ['cm'] });
      expect(request.name_status).toMatch(/src\/app\.js/);
      expect(request.global_registry_yaml).toMatch(/agent-instructions-self-mod/);
      expect(request.repo_registry_path).toBe('.ai-sdlc/checkpoints.yaml');

      const rejected = await hg.evaluateHitlGate({ cwd: dir, base: 'main', runner: repo.runner, invoke: async () => ({ status: 'rejected', reason: 'registry will not parse' }) });
      expect(rejected.status).toBe('blocked');
      expect(rejected.reason).toMatch(/registry will not parse/);
    } finally {
      repo.remove(dir);
    }
  });

  test('a broken repo registry blocks rather than passing (always stop for a human)', async () => {
    const dir = branchRepo({ '.ai-sdlc/checkpoints.yaml': 'checkpoints:\n  - name: bad\n    paths: ["("]\n' });
    try {
      const r = await hg.evaluateHitlGate({ cwd: dir, base: 'main', runner: repo.runner, invoke: unavailable });
      expect(r.status).toBe('blocked');
      expect(r.reason).toMatch(/could not evaluate/);
    } finally {
      repo.remove(dir);
    }
  });
});
