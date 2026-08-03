const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class BaselineRunner {
  constructor({ tasksDir, outputDir, branch, totalRuns }) {
    if (!tasksDir) throw new Error('tasksDir is required');
    if (!outputDir) throw new Error('outputDir is required');
    if (!branch) throw new Error('branch is required');
    if (!totalRuns || totalRuns < 1) throw new Error('totalRuns must be >= 1');
    this.tasksDir = tasksDir;
    this.outputDir = outputDir;
    this.branch = branch;
    this.totalRuns = totalRuns;
  }

  async loadTaskDefinitions() {
    const files = await fs.readdir(this.tasksDir);
    const mdFiles = files.filter(f => f.endsWith('.md')).sort();
    const tasks = [];

    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(this.tasksDir, file), 'utf8');
      const id = path.basename(file, '.md');
      const promptMatch = content.match(/## Prompt\n([\s\S]*?)(?=\n## |$)/);
      const prompt = promptMatch ? promptMatch[1].trim() : content;
      tasks.push({ id, prompt, file, raw: content });
    }

    return tasks;
  }

  generateRunManifest(totalRuns, taskIds) {
    if (!taskIds || taskIds.length === 0) {
      throw new Error('taskIds array is required — call loadTaskDefinitions() first');
    }
    const runs = [];
    for (let i = 1; i <= totalRuns; i++) {
      runs.push({
        run_number: i,
        run_id: crypto.randomUUID(),
        branch: this.branch,
        tasks: [...taskIds],
        started_at: null,
        completed_at: null,
      });
    }
    return { total_runs: totalRuns, branch: this.branch, runs };
  }

  async saveManifest(manifest) {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(
      path.join(this.outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
  }
}

module.exports = { BaselineRunner };
