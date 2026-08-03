const { MtExecutor } = require('../../../measurement/mt-executor');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('MtExecutor', () => {
  describe('constructor', () => {
    test('sets defaults', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      expect(exec.runs).toBe(5);
      expect(exec.concurrency).toBe(2);
      expect(exec.model).toBe('sonnet');
      expect(exec.promiseEnabled).toBe(false);
      // R16: maxInformedRetries replaces gateRetries; default 1 informed retry per turn
      expect(exec.maxInformedRetries).toBe(1);
      expect(exec.promiseEngine).toBeUndefined();
      expect(exec.findingsInterpreter).toBeUndefined();
    });

    test('accepts custom parameters', () => {
      const exec = new MtExecutor({
        baseline: 'main', treatment: 'feature',
        runs: 3, concurrency: 1, model: 'opus',
        scenarioDir: '/tmp/scenarios',
      });
      expect(exec.runs).toBe(3);
      expect(exec.concurrency).toBe(1);
      expect(exec.model).toBe('opus');
      expect(exec.scenarioDir).toBe('/tmp/scenarios');
    });

    test('requires baseline', () => {
      expect(() => new MtExecutor({ treatment: 'feature' })).toThrow(/baseline/i);
    });

    test('requires treatment', () => {
      expect(() => new MtExecutor({ baseline: 'main' })).toThrow(/treatment/i);
    });

    test('accepts promiseEnabled and maxInformedRetries; spins up findings-interpreter', () => {
      const exec = new MtExecutor({
        baseline: 'main', treatment: 'feature',
        promiseEnabled: true, maxInformedRetries: 3,
      });
      expect(exec.promiseEnabled).toBe(true);
      expect(exec.maxInformedRetries).toBe(3);
      expect(exec.promiseEngine).toBeDefined();
      expect(exec.findingsInterpreter).toBeDefined();
      expect(typeof exec.findingsInterpreter.review).toBe('function');
      expect(exec._availablePromises).toBeInstanceOf(Function);
      expect(typeof exec._cxpakAvailable).toBe('boolean');
    });

    test('does not initialize promise engine or findings-interpreter when promiseEnabled is false', () => {
      const exec = new MtExecutor({
        baseline: 'main', treatment: 'feature',
        promiseEnabled: false, maxInformedRetries: 2,
      });
      expect(exec.promiseEnabled).toBe(false);
      expect(exec.maxInformedRetries).toBe(2);
      expect(exec.promiseEngine).toBeUndefined();
      expect(exec.findingsInterpreter).toBeUndefined();
      expect(exec._availablePromises).toBeUndefined();
      expect(exec._cxpakAvailable).toBeUndefined();
    });

    test('maxInformedRetries=0 disables the retry path (verifiers run as telemetry only)', () => {
      const exec = new MtExecutor({
        baseline: 'main', treatment: 'feature',
        promiseEnabled: true, maxInformedRetries: 0,
      });
      expect(exec.maxInformedRetries).toBe(0);
      expect(exec.findingsInterpreter).toBeDefined();
      // Interpreter is constructed even at 0 retries (instantiation is cheap);
      // the turn loop just won't call it when budget = 0.
    });
  });

  describe('buildSessionSpecs', () => {
    test('creates specs for all combinations', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature', runs: 2 });
      const scenarios = [
        { name: 'scenario-a', turns: [{ message: 'hi', checkpoint: [] }], workspace_setup: { repo: 'x' } },
        { name: 'scenario-b', turns: [{ message: 'hi', checkpoint: [] }], workspace_setup: { repo: 'x' } },
      ];
      const specs = exec.buildSessionSpecs(scenarios);
      // 2 scenarios * 2 runs * 2 arms = 8
      expect(specs).toHaveLength(8);
      expect(specs.filter(s => s.arm === 'baseline')).toHaveLength(4);
      expect(specs.filter(s => s.arm === 'treatment')).toHaveLength(4);
    });

    test('generates unique session IDs', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature', runs: 3 });
      const scenarios = [
        { name: 'sc', turns: [{ message: 'm', checkpoint: [] }], workspace_setup: { repo: 'x' } },
      ];
      const specs = exec.buildSessionSpecs(scenarios);
      const ids = specs.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test('runStart offsets the run numbering', () => {
      // CI matrix sharding: chunk 2 of N=10 (chunks of 5) sets runStart=6, runs=5
      // so its specs should be runs 6..10, not 1..5.
      const exec = new MtExecutor({
        baseline: 'main', treatment: 'feature',
        baselineRuns: 5, treatmentRuns: 5, runStart: 6,
      });
      const scenarios = [
        { name: 'sc', turns: [{ message: 'm', checkpoint: [] }], workspace_setup: { repo: 'x' } },
      ];
      const specs = exec.buildSessionSpecs(scenarios);
      // 1 scenario * 5 runs * 2 arms = 10
      expect(specs).toHaveLength(10);
      const runNumbers = [...new Set(specs.map(s => s.run))].sort((a, b) => a - b);
      expect(runNumbers).toEqual([6, 7, 8, 9, 10]);
      const resumeKeys = specs.map(s => MtExecutor.resumeKey(s.scenario.name, s.arm, s.run));
      expect(resumeKeys).toContain('sc-baseline-run6');
      expect(resumeKeys).toContain('sc-treatment-run10');
      expect(resumeKeys).not.toContain('sc-baseline-run1');
    });

    test('runStart defaults to 1', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature', runs: 2 });
      expect(exec.runStart).toBe(1);
      const scenarios = [
        { name: 'sc', turns: [{ message: 'm', checkpoint: [] }], workspace_setup: { repo: 'x' } },
      ];
      const specs = exec.buildSessionSpecs(scenarios);
      const runNumbers = [...new Set(specs.map(s => s.run))].sort((a, b) => a - b);
      expect(runNumbers).toEqual([1, 2]);
    });

    test('runStart rejects non-positive values', () => {
      expect(() => new MtExecutor({
        baseline: 'main', treatment: 'feature', runStart: 0,
      })).toThrow(/runStart/);
      expect(() => new MtExecutor({
        baseline: 'main', treatment: 'feature', runStart: -1,
      })).toThrow(/runStart/);
      expect(() => new MtExecutor({
        baseline: 'main', treatment: 'feature', runStart: 1.5,
      })).toThrow(/runStart/);
    });
  });

  describe('isSessionComplete', () => {
    test('returns false for empty set', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const spec = { scenario: { name: 'sc' }, arm: 'baseline', run: 1 };
      expect(exec.isSessionComplete(spec, new Set())).toBe(false);
    });

    test('returns true when resume key in set', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const spec = { scenario: { name: 'sc' }, arm: 'baseline', run: 1 };
      expect(exec.isSessionComplete(spec, new Set(['sc-baseline-run1']))).toBe(true);
    });
  });

  describe('resumeKey', () => {
    test('generates deterministic key from scenario, arm, run', () => {
      expect(MtExecutor.resumeKey('sc-a', 'baseline', 1)).toBe('sc-a-baseline-run1');
      expect(MtExecutor.resumeKey('sc-a', 'treatment', 3)).toBe('sc-a-treatment-run3');
    });
  });

  describe('loadCompletedSessions', () => {
    test('returns empty set for missing file', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const completed = exec.loadCompletedSessions('/nonexistent/dir');
      expect(completed.size).toBe(0);
    });

    test('loads resume keys from results JSONL', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-exec-test-'));
      try {
        const records = [
          { session_id: 'random1', scenario: 'sc-a', arm: 'baseline', run: 1, status: 'complete' },
          { session_id: 'random2', scenario: 'sc-a', arm: 'treatment', run: 1, status: 'complete' },
          { session_id: 'random3', scenario: 'sc-b', arm: 'baseline', run: 1, status: 'error' },
        ];
        fs.writeFileSync(
          path.join(tmpDir, 'mt-results.jsonl'),
          records.map(r => JSON.stringify(r)).join('\n'),
          'utf8'
        );
        const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
        const completed = exec.loadCompletedSessions(tmpDir);
        expect(completed.size).toBe(2);
        expect(completed.has('sc-a-baseline-run1')).toBe(true);
        expect(completed.has('sc-a-treatment-run1')).toBe(true);
        expect(completed.has('sc-b-baseline-run1')).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('copyFixture', () => {
    test('reads fixture from repoRoot and copies into worktree', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      // copyFixture reads from this.repoRoot, so set up fixture there
      const fixtureDir = path.join(exec.repoRoot, 'measurement', 'fixtures', 'mini-api');
      const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-worktree-'));

      try {
        // The real fixture exists at repoRoot — just verify it copies into worktree
        if (fs.existsSync(fixtureDir)) {
          exec.copyFixture(worktreeDir, 'measurement/fixtures/mini-api');
          // Should have copied fixture contents into worktree root
          expect(fs.existsSync(path.join(worktreeDir, 'src'))).toBe(true);
        }
      } finally {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    });

    test('throws when fixture not found at repoRoot', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-worktree-'));
      try {
        expect(() => exec.copyFixture(worktreeDir, 'nonexistent/fixture'))
          .toThrow(/Fixture not found at/);
      } finally {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    });

    // Regression test for ryordanov #4 (CWE-22 defense-in-depth): scenario YAML
    // could specify a fixture path that escapes the repo via ../../etc.
    test('regression — fixture path that escapes repoRoot is refused', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-worktree-'));
      try {
        expect(() => exec.copyFixture(worktreeDir, '../../../tmp/escaped'))
          .toThrow(/escapes repo/);
        expect(() => exec.copyFixture(worktreeDir, '/etc/passwd'))
          .toThrow(/escapes repo/);
      } finally {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    });
  });

  describe('injectDefect path containment', () => {
    // Regression test for ryordanov #1 (CWE-22): a malicious scenario YAML
    // could supply defect.file: "../../.claude/hooks/stop-verify.js" and
    // overwrite host hooks via the replace+write call. Defense-in-depth.
    test('refuses defect.file that traverses out of worktree', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-worktree-'));
      try {
        const defect = { file: '../../escaped.js', original: 'foo', mutated: 'bar' };
        expect(() => exec.injectDefect(worktreeDir, defect))
          .toThrow(/escapes worktree/);
      } finally {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    });

    test('refuses absolute defect.file outside worktree', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-worktree-'));
      try {
        const defect = { file: '/tmp/escaped.js', original: 'foo', mutated: 'bar' };
        expect(() => exec.injectDefect(worktreeDir, defect))
          .toThrow(/escapes worktree/);
      } finally {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    });

    test('allows relative defect.file inside worktree', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-worktree-'));
      try {
        fs.mkdirSync(path.join(worktreeDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(worktreeDir, 'src/foo.js'), 'const x = 1;\n');
        const defect = { file: 'src/foo.js', original: 'const x = 1;', mutated: 'const x = 2;' };
        expect(() => exec.injectDefect(worktreeDir, defect)).not.toThrow();
        const content = fs.readFileSync(path.join(worktreeDir, 'src/foo.js'), 'utf8');
        expect(content).toContain('const x = 2;');
      } finally {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
      }
    });

    test('no-op when defect is null/undefined', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      expect(() => exec.injectDefect('/tmp/whatever', null)).not.toThrow();
      expect(() => exec.injectDefect('/tmp/whatever', undefined)).not.toThrow();
    });
  });

  describe('createWorktree (isolated fixture dir)', () => {
    // Pre-fix, createWorktree did `git worktree add` from the omnius repo,
    // and copyFixture overlaid mini-api on top — leaving cxpak to index a
    // 342-file ~3.5M-token mix instead of the fixture. Now createWorktree
    // returns a clean git-init'd dir so cxpak sees only the fixture.
    test('returns a fresh git-init dir with no omnius files', async () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      let dir = null;
      try {
        dir = await exec.createWorktree('main');
        expect(fs.existsSync(dir)).toBe(true);
        expect(fs.existsSync(path.join(dir, '.git'))).toBe(true);
        // Critically: must NOT contain omnius framework files
        expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'measurement'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'promise'))).toBe(false);
        // Local user config must be set so commitWorktreeState works without
        // depending on global git config in CI.
        const email = require('child_process').execFileSync(
          'git', ['-C', dir, 'config', 'user.email'], { encoding: 'utf8' }
        ).trim();
        expect(email).toBe('measurement@local');
      } finally {
        if (dir) await exec.removeWorktree(dir);
      }
    });

    test('commitWorktreeState succeeds in fresh dir without global git config', async () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      let dir = null;
      try {
        dir = await exec.createWorktree('main');
        fs.writeFileSync(path.join(dir, 'foo.txt'), 'hello\n');
        // Should not throw — local user.email/user.name set in createWorktree
        expect(() => exec.commitWorktreeState(dir, 'first')).not.toThrow();
        const log = require('child_process').execFileSync(
          'git', ['-C', dir, 'log', '--oneline'], { encoding: 'utf8' }
        );
        expect(log).toContain('first');
      } finally {
        if (dir) await exec.removeWorktree(dir);
      }
    });

    test('removeWorktree deletes the dir', async () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const dir = await exec.createWorktree('main');
      expect(fs.existsSync(dir)).toBe(true);
      await exec.removeWorktree(dir);
      expect(fs.existsSync(dir)).toBe(false);
    });
  });

  // ryordanov-tradu Finding 2 on PR #25: `mt-executor.js` was building the
  // promise-engine evaluate context without a `diff:` field, so the
  // diff-eligible promotion in observability-checker (error-handling,
  // resource-cleanup, implementation-depth) never fired in measurement runs.
  // Three verifiers were perma-broken-low instead of broken-medium / kept.
  describe('getDiffContent (Finding 2 fix)', () => {
    test('returns unstaged diff content when files modified', async () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      let dir = null;
      try {
        dir = await exec.createWorktree('main');
        fs.writeFileSync(path.join(dir, 'foo.js'), 'const a = 1;\n');
        exec.commitWorktreeState(dir, 'base');
        // Unstaged modification — what evaluate() should see after a turn.
        fs.writeFileSync(path.join(dir, 'foo.js'), 'const a = 1;\nconst b = 2;\n');
        const diff = exec.getDiffContent(dir);
        expect(diff).not.toBeNull();
        expect(diff).toContain('foo.js');
        expect(diff).toContain('+const b = 2;');
      } finally {
        if (dir) await exec.removeWorktree(dir);
      }
    });

    test('returns null when worktree is clean', async () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      let dir = null;
      try {
        dir = await exec.createWorktree('main');
        fs.writeFileSync(path.join(dir, 'foo.js'), 'const a = 1;\n');
        exec.commitWorktreeState(dir, 'base');
        // No unstaged changes
        expect(exec.getDiffContent(dir)).toBeNull();
      } finally {
        if (dir) await exec.removeWorktree(dir);
      }
    });

    test('returns null when git diff fails (non-repo path)', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-notgit-'));
      try {
        expect(exec.getDiffContent(tmpDir)).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('switchGlobalConfig', () => {
    test('returns null when ~/.claude is not an ai-sdlc repo', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const origHome = process.env.HOME;
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-home-'));
      try {
        process.env.HOME = tmpHome;
        // No .claude dir at all
        expect(exec.switchGlobalConfig('main')).toBeNull();
      } finally {
        process.env.HOME = origHome;
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    });

    // Regression test for nmilenkov #7: silent skip when ~/.claude isn't an
    // ai-sdlc clone. Reproducibility outside author's environment
    // requires the warn so users know the global switch was a no-op.
    test('warns to stderr when ~/.claude is not a git repo', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature' });
      const origHome = process.env.HOME;
      const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-home-'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        process.env.HOME = tmpHome;
        exec.switchGlobalConfig('main');
        expect(warnSpy).toHaveBeenCalled();
        const args = warnSpy.mock.calls.map(c => c.join(' ')).join(' ');
        expect(args).toMatch(/~\/\.claude/);
        expect(args).toMatch(/Reproducing|skip/i);
      } finally {
        process.env.HOME = origHome;
        warnSpy.mockRestore();
        fs.rmSync(tmpHome, { recursive: true, force: true });
      }
    });
  });

  describe('computePromiseStats', () => {
    test('returns null when no treatment results have promise data', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature', promiseEnabled: true });
      const results = [
        { scenario: 'sc', arm: 'treatment', status: 'complete', artifact_quality: 0.8 },
      ];
      expect(exec.computePromiseStats(results)).toBeNull();
    });

    test('computes compliance rate from verification results', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature', promiseEnabled: true });
      const results = [
        {
          scenario: 'sc',
          arm: 'treatment',
          status: 'complete',
          gate_retries_used: 1,
          trust_trajectory: [0.5, 0.6],
          promise_verification: [
            {
              verification_results: [
                { result: 'kept', confidence: 'high' },
                { result: 'kept', confidence: 'high' },
              ],
            },
            {
              verification_results: [
                { result: 'broken', confidence: 'high' },
                { result: 'kept', confidence: 'medium' },
              ],
            },
          ],
        },
      ];
      const stats = exec.computePromiseStats(results);
      expect(stats.total_turns).toBe(2);
      expect(stats.compliant_turns).toBe(1);
      expect(stats.compliance_rate).toBe(0.5);
      expect(stats.total_retries).toBe(1);
      expect(stats.retry_rate).toBe(0.5);
      expect(stats.per_scenario_trust.sc.mean_final_trust).toBe(0.6);
      expect(stats.per_scenario_trust.sc.session_count).toBe(1);
    });

    test('aggregates across multiple sessions and scenarios', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature', promiseEnabled: true });
      const results = [
        {
          scenario: 'sc-a',
          arm: 'treatment',
          status: 'complete',
          gate_retries_used: 0,
          trust_trajectory: [0.8],
          promise_verification: [
            { verification_results: [{ result: 'kept', confidence: 'high' }] },
          ],
        },
        {
          scenario: 'sc-b',
          arm: 'treatment',
          status: 'complete',
          gate_retries_used: 2,
          trust_trajectory: [0.4, 0.5],
          promise_verification: [
            { verification_results: [{ result: 'kept', confidence: 'high' }] },
            { verification_results: [{ result: 'broken', confidence: 'high' }] },
          ],
        },
      ];
      const stats = exec.computePromiseStats(results);
      expect(stats.total_turns).toBe(3);
      expect(stats.compliant_turns).toBe(2);
      expect(stats.compliance_rate).toBeCloseTo(0.667, 2);
      expect(stats.total_retries).toBe(2);
      expect(stats.per_scenario_trust['sc-a'].mean_final_trust).toBe(0.8);
      expect(stats.per_scenario_trust['sc-b'].mean_final_trust).toBe(0.5);
    });

    test('ignores low-confidence broken results for compliance', () => {
      const exec = new MtExecutor({ baseline: 'main', treatment: 'feature', promiseEnabled: true });
      const results = [
        {
          scenario: 'sc',
          arm: 'treatment',
          status: 'complete',
          gate_retries_used: 0,
          trust_trajectory: [0.7],
          promise_verification: [
            {
              verification_results: [
                { result: 'broken', confidence: 'low' },
                { result: 'broken', confidence: 'medium' },
                { result: 'kept', confidence: 'high' },
              ],
            },
          ],
        },
      ];
      const stats = exec.computePromiseStats(results);
      expect(stats.compliant_turns).toBe(1);
      expect(stats.compliance_rate).toBe(1.0);
    });
  });
});
