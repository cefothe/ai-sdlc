#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

class RefRunner {
  constructor({ ref, repoRoot, runs = 10, outputDir = null }) {
    if (!ref) throw new Error('ref is required');
    if (!repoRoot) throw new Error('repoRoot is required');
    if (!runs || runs < 1) throw new Error('runs must be >= 1');

    this.ref = ref;
    this.repoRoot = path.resolve(repoRoot);
    this.runs = runs;
    this.outputDir = outputDir;
    this.worktreePath = null;
  }

  async resolveRef() {
    try {
      const sha = execFileSync(
        'git', ['-C', this.repoRoot, 'rev-parse', this.ref],
        { encoding: 'utf8' }
      ).trim();
      return sha;
    } catch (err) {
      throw new Error(`Cannot resolve ref '${this.ref}': ${err.message}`);
    }
  }

  async createWorktree() {
    const sha = await this.resolveRef();
    const sanitized = this.ref.replace(/[^a-zA-Z0-9_-]/g, '-');
    const suffix = crypto.randomBytes(4).toString('hex');
    this.worktreePath = path.join(
      this.repoRoot,
      '..',
      `measurement-${sanitized}-${suffix}`
    );

    execFileSync(
      'git', ['-C', this.repoRoot, 'worktree', 'add', '--detach', this.worktreePath, sha],
      { encoding: 'utf8', stdio: 'pipe' }
    );

    return this.worktreePath;
  }

  async removeWorktree() {
    if (!this.worktreePath) return;

    try {
      execFileSync(
        'git', ['-C', this.repoRoot, 'worktree', 'remove', '--force', this.worktreePath],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (_) {
      // If worktree removal via git fails, clean up manually
      try {
        await fs.rm(this.worktreePath, { recursive: true, force: true });
        execFileSync('git', ['-C', this.repoRoot, 'worktree', 'prune'], { stdio: 'pipe' });
      } catch (_) {
        // best effort
      }
    }
  }

  generateOutputDir() {
    const sanitized = this.ref.replace(/[^a-zA-Z0-9_-]/g, '-');
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', 'T');
    return `${sanitized}-${ts}`;
  }

  async loadTasks() {
    // Tasks are the test battery — always loaded from the measurement tool's
    // own directory (current branch), NOT from the target ref's worktree.
    const tasksDir = path.join(this.repoRoot, 'measurement', 'tasks');
    let files;
    try {
      files = await fs.readdir(tasksDir);
    } catch (_) {
      throw new Error('No measurement/tasks directory found in current repo');
    }

    const mdFiles = files.filter(f => f.endsWith('.md')).sort();
    const tasks = [];

    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(tasksDir, file), 'utf8');
      const id = path.basename(file, '.md');
      const promptMatch = content.match(/## Prompt\n([\s\S]*?)(?=\n## |$)/);
      const prompt = promptMatch ? promptMatch[1].trim() : content;
      tasks.push({ id, prompt, file });
    }

    return tasks;
  }

  buildManifest(taskIds, resolvedSha) {
    const runs = [];
    for (let i = 1; i <= this.runs; i++) {
      runs.push({
        run_number: i,
        run_id: crypto.randomUUID(),
        ref: this.ref,
        resolved_sha: resolvedSha,
        tasks: [...taskIds],
        started_at: null,
        completed_at: null,
      });
    }
    return {
      total_runs: this.runs,
      ref: this.ref,
      resolved_sha: resolvedSha,
      created_at: new Date().toISOString(),
      runs,
    };
  }

  async collectContextSnapshot() {
    if (!this.worktreePath) {
      throw new Error('Worktree not created — call createWorktree() first');
    }

    const snapshot = {};

    // CLAUDE.md size
    try {
      const claudeMd = await fs.readFile(
        path.join(this.worktreePath, 'CLAUDE.md'),
        'utf8'
      );
      snapshot.claude_md_size = claudeMd.length;
    } catch (_) {
      snapshot.claude_md_size = 0;
    }

    // Protocol count
    try {
      const protocolDir = path.join(this.worktreePath, 'protocols');
      const protocolFiles = await fs.readdir(protocolDir);
      snapshot.protocol_count = protocolFiles.filter(
        f => f.endsWith('.yaml') || f.endsWith('.yml')
      ).length;
    } catch (_) {
      snapshot.protocol_count = 0;
    }

    // Agent count
    try {
      const agentDir = path.join(this.worktreePath, 'agents');
      const agentFiles = await fs.readdir(agentDir);
      snapshot.agent_count = agentFiles.filter(
        f => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml')
      ).length;
    } catch (_) {
      snapshot.agent_count = 0;
    }

    return snapshot;
  }

  async execute() {
    const resolvedSha = await this.resolveRef();
    console.log(`Resolved ${this.ref} → ${resolvedSha.slice(0, 12)}`);

    console.log('Creating worktree...');
    await this.createWorktree();

    try {
      const tasks = await this.loadTasks();
      console.log(`Loaded ${tasks.length} task definitions`);

      const snapshot = await this.collectContextSnapshot();
      console.log(`Context: CLAUDE.md=${snapshot.claude_md_size}b, ${snapshot.protocol_count} protocols, ${snapshot.agent_count} agents`);

      const taskIds = tasks.map(t => t.id);
      const manifest = this.buildManifest(taskIds, resolvedSha);
      manifest.context_snapshot = snapshot;
      manifest.tasks = tasks.map(t => ({ id: t.id, file: t.file }));

      const outDir = this.outputDir || path.join(
        this.repoRoot,
        'measurement',
        'results',
        this.generateOutputDir()
      );
      await fs.mkdir(outDir, { recursive: true });

      const manifestPath = path.join(outDir, 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      console.log(`Manifest saved → ${manifestPath}`);

      // Copy task definitions for reproducibility
      const taskOutDir = path.join(outDir, 'tasks');
      await fs.mkdir(taskOutDir, { recursive: true });
      for (const task of tasks) {
        const src = path.join(this.repoRoot, 'measurement', 'tasks', task.file);
        const dst = path.join(taskOutDir, task.file);
        await fs.copyFile(src, dst);
      }
      console.log(`Task definitions copied to ${taskOutDir}`);

      console.log(`\nReady for ${this.runs} runs across ${tasks.length} tasks.`);
      console.log(`Results directory: ${outDir}`);

      return { manifest, outDir, snapshot };
    } finally {
      console.log('Cleaning up worktree...');
      await this.removeWorktree();
    }
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node measurement/run.js --ref <git-ref> [options]

Options:
  --ref <ref>       Git ref to measure (branch, tag, SHA, origin/main)  [required]
  --runs <n>        Number of measurement runs                          [default: 10]
  --output <dir>    Output directory for results                        [auto-generated]
  --compare <a> <b> Compare two result directories instead of running
  --help, -h        Show this help

Examples:
  node measurement/run.js --ref main --runs 5
  node measurement/run.js --ref promise-theory
  node measurement/run.js --ref origin/main --output ./results/baseline
  node measurement/run.js --compare results/main results/promise-theory`);
    process.exit(0);
  }

  // Parse --compare mode
  const compareIdx = args.indexOf('--compare');
  if (compareIdx !== -1) {
    const dir1 = args[compareIdx + 1];
    const dir2 = args[compareIdx + 2];
    if (!dir1 || !dir2) {
      console.error('--compare requires two directories');
      process.exit(1);
    }
    const { ComparisonReport } = require('./comparison-report');

    const metrics1Path = path.join(dir1, 'metrics.jsonl');
    const metrics2Path = path.join(dir2, 'metrics.jsonl');

    const parseMetrics = async (filePath) => {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.map(l => JSON.parse(l));
    };

    const records1 = await parseMetrics(metrics1Path);
    const records2 = await parseMetrics(metrics2Path);

    const extractScores = (records) => ({
      quality_scores: records.map(r => r.quality_score),
      todo_rates: records.map(r => r.todo_count),
      fixme_rates: records.map(r => r.fixme_count),
    });

    const baseline = extractScores(records1);
    const promise = extractScores(records2);

    const minLen = Math.min(baseline.quality_scores.length, promise.quality_scores.length);
    const trim = (obj) => {
      const result = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = v.slice(0, minLen);
      }
      return result;
    };

    const report = ComparisonReport.generateReport(trim(baseline), trim(promise));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // Parse --ref
  const refIdx = args.indexOf('--ref');
  if (refIdx === -1 || !args[refIdx + 1]) {
    console.error('--ref <git-ref> is required. Use --help for usage.');
    process.exit(1);
  }
  const ref = args[refIdx + 1];

  // Parse --runs
  const runsIdx = args.indexOf('--runs');
  const runs = runsIdx !== -1 ? parseInt(args[runsIdx + 1], 10) : 10;

  // Parse --output
  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : null;

  // Find repo root
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

  const runner = new RefRunner({ ref, repoRoot, runs, outputDir });
  try {
    await runner.execute();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { RefRunner };
