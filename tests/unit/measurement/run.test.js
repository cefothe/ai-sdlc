const { RefRunner } = require('../../../measurement/run');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { execSync } = require('child_process');

describe('RefRunner', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  describe('constructor', () => {
    test('accepts valid ref and defaults', () => {
      const runner = new RefRunner({ ref: 'main', repoRoot });
      expect(runner.ref).toBe('main');
      expect(runner.runs).toBe(10);
      expect(runner.repoRoot).toBe(repoRoot);
    });

    test('accepts custom runs and outputDir', () => {
      const runner = new RefRunner({
        ref: 'HEAD',
        repoRoot,
        runs: 5,
        outputDir: '/tmp/test-output',
      });
      expect(runner.runs).toBe(5);
      expect(runner.outputDir).toBe('/tmp/test-output');
    });

    test('throws if ref is missing', () => {
      expect(() => new RefRunner({ repoRoot })).toThrow('ref is required');
    });

    test('throws if repoRoot is missing', () => {
      expect(() => new RefRunner({ ref: 'main' })).toThrow('repoRoot is required');
    });

    test('throws if runs is less than 1', () => {
      expect(() => new RefRunner({ ref: 'main', repoRoot, runs: 0 })).toThrow('runs must be >= 1');
    });
  });

  describe('resolveRef', () => {
    test('resolves HEAD to a SHA', async () => {
      const runner = new RefRunner({ ref: 'HEAD', repoRoot });
      const sha = await runner.resolveRef();
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    test('resolves HEAD to a SHA', async () => {
      const runner = new RefRunner({ ref: 'HEAD', repoRoot });
      const sha = await runner.resolveRef();
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });

    test('throws for invalid ref', async () => {
      const runner = new RefRunner({ ref: 'nonexistent-branch-xyz-999', repoRoot });
      await expect(runner.resolveRef()).rejects.toThrow();
    });
  });

  describe('createWorktree / removeWorktree', () => {
    let runner;
    let worktreePath;

    afterEach(async () => {
      if (worktreePath) {
        try {
          execSync(`git -C "${repoRoot}" worktree remove --force "${worktreePath}" 2>/dev/null`);
        } catch (_) {
          // already cleaned up
        }
      }
    });

    test('creates a worktree at the specified ref and cleans up', async () => {
      runner = new RefRunner({ ref: 'HEAD', repoRoot });
      worktreePath = await runner.createWorktree();

      // Worktree directory should exist
      const stat = await fs.stat(worktreePath);
      expect(stat.isDirectory()).toBe(true);

      // Should contain the repo files (e.g., CLAUDE.md)
      const files = await fs.readdir(worktreePath);
      expect(files).toContain('CLAUDE.md');

      // Clean up
      await runner.removeWorktree();
      worktreePath = null;

      // Directory should be gone
      await expect(fs.stat(runner.worktreePath)).rejects.toThrow();
    });
  });

  describe('generateOutputDir', () => {
    test('creates output dir name from ref and timestamp', () => {
      const runner = new RefRunner({ ref: 'main', repoRoot });
      const dir = runner.generateOutputDir();
      expect(dir).toMatch(/main-\d{8}T\d{6}/);
    });

    test('sanitizes ref with slashes', () => {
      const runner = new RefRunner({ ref: 'origin/feature/foo', repoRoot });
      const dir = runner.generateOutputDir();
      expect(dir).toMatch(/origin-feature-foo-\d{8}T\d{6}/);
    });
  });

  describe('loadTasks', () => {
    test('loads task definitions from measurement/tasks in current repo', async () => {
      const runner = new RefRunner({ ref: 'HEAD', repoRoot });
      const tasks = await runner.loadTasks();
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0]).toHaveProperty('id');
      expect(tasks[0]).toHaveProperty('prompt');
    });
  });

  describe('buildManifest', () => {
    test('builds manifest from task IDs and run count', () => {
      const runner = new RefRunner({ ref: 'main', repoRoot, runs: 3 });
      const manifest = runner.buildManifest(['task-a', 'task-b'], 'abc123');
      expect(manifest.total_runs).toBe(3);
      expect(manifest.ref).toBe('main');
      expect(manifest.resolved_sha).toBe('abc123');
      expect(manifest.runs).toHaveLength(3);
      expect(manifest.runs[0].tasks).toEqual(['task-a', 'task-b']);
      expect(manifest.runs[0].run_number).toBe(1);
    });

    test('each run has a unique ID', () => {
      const runner = new RefRunner({ ref: 'main', repoRoot, runs: 5 });
      const manifest = runner.buildManifest(['t1'], 'sha');
      const ids = manifest.runs.map(r => r.run_id);
      expect(new Set(ids).size).toBe(5);
    });
  });

  describe('collectContextSnapshot', () => {
    let runner;

    test('collects CLAUDE.md, protocol count, and agent count from worktree', async () => {
      runner = new RefRunner({ ref: 'HEAD', repoRoot });
      await runner.createWorktree();

      try {
        const snapshot = await runner.collectContextSnapshot();
        expect(snapshot).toHaveProperty('claude_md_size');
        expect(snapshot.claude_md_size).toBeGreaterThan(0);
        expect(snapshot).toHaveProperty('protocol_count');
        expect(snapshot).toHaveProperty('agent_count');
        expect(snapshot.protocol_count).toBeGreaterThanOrEqual(0);
        expect(snapshot.agent_count).toBeGreaterThanOrEqual(0);
      } finally {
        await runner.removeWorktree();
      }
    });
  });
});
