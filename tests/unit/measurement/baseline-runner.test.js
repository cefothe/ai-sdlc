const { BaselineRunner } = require('../../../measurement/baseline-runner');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('BaselineRunner', () => {
  let runner;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-'));
    runner = new BaselineRunner({
      tasksDir: path.join(__dirname, '../../../measurement/tasks'),
      outputDir: tmpDir,
      branch: 'main',
      totalRuns: 2,
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('loadTaskDefinitions', () => {
    test('loads all 5 task definition files', async () => {
      const tasks = await runner.loadTaskDefinitions();
      expect(tasks).toHaveLength(5);
      expect(tasks.map(t => t.id)).toEqual(expect.arrayContaining([
        'single-agent-codegen',
        'code-plan',
        'multi-agent-coordination',
        'degraded-input',
        'determinism-control',
      ]));
    });

    test('each task has prompt and measurement_targets fields', async () => {
      const tasks = await runner.loadTaskDefinitions();
      for (const task of tasks) {
        expect(task.prompt).toBeDefined();
        expect(typeof task.prompt).toBe('string');
        expect(task.prompt.length).toBeGreaterThan(10);
      }
    });
  });

  describe('generateRunManifest', () => {
    test('creates manifest with correct run count and task list', () => {
      const taskIds = ['single-agent-codegen', 'code-plan', 'determinism-control'];
      const manifest = runner.generateRunManifest(2, taskIds);
      expect(manifest.total_runs).toBe(2);
      expect(manifest.runs).toHaveLength(2);
      expect(manifest.runs[0].tasks).toHaveLength(3);
      expect(manifest.runs[0].tasks).toEqual(taskIds);
      expect(manifest.runs[0].run_number).toBe(1);
      expect(manifest.runs[1].run_number).toBe(2);
    });

    test('each run has unique run_id', () => {
      const taskIds = ['t1', 't2'];
      const manifest = runner.generateRunManifest(3, taskIds);
      const ids = manifest.runs.map(r => r.run_id);
      expect(new Set(ids).size).toBe(3);
    });

    test('throws if taskIds is empty', () => {
      expect(() => runner.generateRunManifest(2, [])).toThrow('taskIds array is required');
    });
  });

  describe('saveManifest', () => {
    test('writes manifest JSON to output directory', async () => {
      const manifest = { total_runs: 1, branch: 'main', runs: [{ run_number: 1 }] };
      await runner.saveManifest(manifest);
      const written = JSON.parse(
        await fs.readFile(path.join(tmpDir, 'manifest.json'), 'utf8')
      );
      expect(written.total_runs).toBe(1);
      expect(written.runs[0].run_number).toBe(1);
    });
  });
});
