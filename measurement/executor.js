const fs = require('fs').promises;
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { MetricsCollector } = require('./metrics-collector');
const { RefRunner } = require('./run');
const { filterChildEnv } = require('./spawn-env');

class Executor {
  constructor({ ref, repoRoot, runs = 3, outputDir = null, model = 'sonnet', promiseEnabled = false, ledgerDir = null, gateRetries = 1, mcpConfig = null, cxpakPrompt = false }) {
    if (!ref) throw new Error('ref is required');
    if (!repoRoot) throw new Error('repoRoot is required');

    this.ref = ref;
    this.repoRoot = path.resolve(repoRoot);
    this.runs = runs;
    this.outputDir = outputDir;
    this.model = model;
    this.promiseEnabled = promiseEnabled;
    this.escalationModel = 'opus';
    this.gateRetries = gateRetries;
    this.mcpConfig = mcpConfig;
    this.cxpakPrompt = cxpakPrompt;
    this.refRunner = new RefRunner({ ref, repoRoot, runs });

    if (promiseEnabled) {
      const { PromiseEngine } = require('../promise/promise-engine');
      const { availablePromises } = require('../promise/registry-loader');
      const resolvedLedgerDir = ledgerDir || path.join(repoRoot, '.promise-ledger');
      this.promiseEngine = new PromiseEngine({ ledgerDir: resolvedLedgerDir });
      this._availablePromises = availablePromises;

      try {
        execFileSync('cxpak', ['--version'], { timeout: 5000, stdio: 'pipe' });
        this._cxpakAvailable = true;
      } catch (_) {
        this._cxpakAvailable = false;
      }
    }
  }

  getModelForAgent(trustScore) {
    const { TrustManager } = require('../promise/trust-manager');
    const tier = new TrustManager({ decayFactor: 0.85 }).getTrustTier(trustScore);
    if (tier === 'critical' && this.model !== 'opus') {
      return this.escalationModel;
    }
    return this.model;
  }

  buildPrompt(task, claudeMdContent) {
    return [
      '--- CONTEXT (from project CLAUDE.md) ---',
      claudeMdContent,
      '--- END CONTEXT ---',
      '',
      '--- TASK ---',
      task.prompt,
      '--- END TASK ---',
      '',
      'Produce the complete implementation. Output the full file contents with paths.',
    ].join('\n');
  }

  buildCxpakPrompt(task) {
    return [
      'You have access to cxpak tools to explore this codebase.',
      'Use cxpak:overview to understand the project structure and conventions.',
      'Use cxpak:trace to follow specific concepts through the code.',
      'Use cxpak:architecture to understand the system design.',
      'Explore the codebase before implementing.',
      '',
      '--- TASK ---',
      task.prompt,
      '--- END TASK ---',
      '',
      'Produce the complete implementation. Output the full file contents with paths.',
    ].join('\n');
  }

  async invokeAgent(prompt, workDir, model) {
    const useModel = model || this.model;
    const args = [
      '-p',
      '--model', useModel,
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
    ];
    if (this.mcpConfig) {
      args.push('--mcp-config', this.mcpConfig);
    }
    return new Promise((resolve, reject) => {
      const child = spawn('claude', args, {
        cwd: workDir,
        env: filterChildEnv(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const chunks = [];
      const stderrChunks = [];
      child.stdout.on('data', (d) => chunks.push(d));
      child.stderr.on('data', (d) => stderrChunks.push(d));
      child.on('error', (err) => reject(new Error(`Failed to spawn claude: ${err.message}`)));
      child.on('close', (code) => {
        const stdout = Buffer.concat(chunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        if (code !== 0 && !stdout) {
          const detail = stderr ? `\nstderr: ${stderr.slice(0, 500)}` : '';
          reject(new Error(`Agent invocation failed (exit ${code})${detail}`));
          return;
        }
        if (stderr) {
          console.warn(`  stderr: ${stderr.slice(0, 200)}`);
        }
        resolve(stdout);
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  parseAgentOutput(rawOutput) {
    try {
      const parsed = JSON.parse(rawOutput);
      return typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed, null, 2);
    } catch (_) {
      return rawOutput;
    }
  }

  parseAgentResponse(rawOutput) {
    try {
      const parsed = JSON.parse(rawOutput);
      const text = typeof parsed.result === 'string'
        ? parsed.result
        : JSON.stringify(parsed, null, 2);
      const usage = parsed.usage || null;
      const cost_usd = typeof parsed.total_cost_usd === 'number'
        ? parsed.total_cost_usd
        : null;
      return { text, usage, cost_usd };
    } catch (_) {
      return { text: rawOutput, usage: null, cost_usd: null };
    }
  }

  checkGate(verificationResults, trustTier) {
    const GATE_LEVELS = {
      high:     new Set(['high']),
      medium:   new Set(['high', 'medium']),
      low:      new Set(['high', 'medium']),
      critical: new Set(['high', 'medium', 'low']),
    };

    const broken = verificationResults.filter(vr => vr.result === 'broken');
    const levels = GATE_LEVELS[trustTier] || GATE_LEVELS.high;
    const gated = broken.filter(vr => levels.has(vr.confidence));
    return gated.length === 0;
  }

  computeConsensus(scores) {
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  computeAgreement(scores) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    return Math.sqrt(variance);
  }

  async captureBaseline(workDir) {
    if (!this.promiseEnabled || !this._cxpakAvailable) return null;

    const { CxpakVerifier } = require('../promise/cxpak-verifier');
    const verifier = new CxpakVerifier({ workDir });
    try {
      const available = await verifier.checkAvailability();
      if (!available) return null;

      const [health, architecture, risks] = await Promise.all([
        verifier.callTool('cxpak_health', {}),
        verifier.callTool('cxpak_architecture', {}),
        verifier.callTool('cxpak_risks', {}),
      ]);

      const baseline = { health: null, architecture: null, risks: null };

      if (health) {
        baseline.health = {
          composite: health.composite || null,
          dead_code: health.dead_code || null,
          conventions: health.conventions || null,
        };
      }

      if (architecture) {
        const modules = architecture.modules || [];
        baseline.architecture = {
          modules: modules.length,
          boundary_violations: modules.reduce((sum, m) => sum + (m.boundary_violations || 0), 0),
          circular_deps: (architecture.circular_deps || []).length,
        };
      }

      if (risks) {
        const highRisk = (risks.files || risks.risks || []).filter(f => (f.composite_risk || f.risk_score || 0) > 0.7);
        baseline.risks = { high_risk_count: highRisk.length };
      }

      return baseline;
    } finally {
      verifier.close();
    }
  }

  computeBaselineDeltas(before, after) {
    const { computeDeltas } = require('../promise/baseline-comparator');
    return computeDeltas(before, after);
  }

  async loadCompletedPairs(outDir) {
    const metricsPath = path.join(outDir, 'metrics.jsonl');
    const completed = new Set();
    try {
      const content = await fs.readFile(metricsPath, 'utf8');
      for (const line of content.trim().split('\n')) {
        if (!line) continue;
        const record = JSON.parse(line);
        completed.add(`${record.run}:${record.task_id}`);
      }
    } catch (_) {
      // No existing metrics — fresh run
    }
    return completed;
  }

  async execute() {
    const resolvedSha = await this.refRunner.resolveRef();
    console.log(`Resolved ${this.ref} → ${resolvedSha.slice(0, 12)}`);

    const tasks = await this.refRunner.loadTasks();
    console.log(`Loaded ${tasks.length} task definitions`);

    console.log('Creating worktree...');
    const worktreePath = await this.refRunner.createWorktree();

    try {
      const snapshot = await this.refRunner.collectContextSnapshot();
      console.log(`Context: CLAUDE.md=${snapshot.claude_md_size}b, ${snapshot.protocol_count} protocols, ${snapshot.agent_count} agents`);

      let claudeMd = '';
      try {
        claudeMd = await fs.readFile(path.join(worktreePath, 'CLAUDE.md'), 'utf8');
      } catch (_) {
        console.warn('Warning: No CLAUDE.md at target ref');
      }

      const outDir = this.outputDir || path.join(
        this.repoRoot, 'measurement', 'results',
        this.refRunner.generateOutputDir()
      );
      await fs.mkdir(outDir, { recursive: true });
      const rawDir = path.join(outDir, 'raw');
      await fs.mkdir(rawDir, { recursive: true });

      const collector = new MetricsCollector(outDir);

      const completedPairs = await this.loadCompletedPairs(outDir);
      if (completedPairs.size > 0) {
        console.log(`Resuming: ${completedPairs.size} invocations already complete, skipping them`);
      }

      const taskIds = tasks.map(t => t.id);
      const manifest = this.refRunner.buildManifest(taskIds, resolvedSha);
      manifest.context_snapshot = snapshot;
      manifest.model = this.model;
      manifest.tasks = tasks.map(t => ({ id: t.id, file: t.file }));
      await fs.writeFile(
        path.join(outDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2), 'utf8'
      );

      // Capture cxpak baseline before agent invocations
      let cxpakBaseline = null;
      if (this.promiseEnabled && this._cxpakAvailable) {
        try {
          cxpakBaseline = await this.captureBaseline(worktreePath);
          if (cxpakBaseline) {
            console.log('Captured cxpak baseline for delta verification');
          }
        } catch (_) {
          // Baseline capture failure is non-fatal
        }
      }

      const totalInvocations = this.runs * tasks.length;
      let completed = 0;

      for (let run = 1; run <= this.runs; run++) {
        for (const task of tasks) {
          completed++;
          const label = `[${completed}/${totalInvocations}] run=${run} task=${task.id}`;

          if (completedPairs.has(`${run}:${task.id}`)) {
            console.log(`\n${label} — already complete, skipping`);
            continue;
          }

          console.log(`\n${label} — starting...`);

          let activeModel = this.model;
          const prompt = this.cxpakPrompt
            ? this.buildCxpakPrompt(task)
            : this.buildPrompt(task, claudeMd);
          const startTime = Date.now();

          let bestOutput = null;
          let bestScore = -1;
          let bestAnalysis = null;
          let bestPromiseRecord = null;
          let bestUsage = null;
          let bestCostUsd = null;
          let gateAttempts = 0;
          let gateRetried = false;
          let modelEscalated = false;

          const maxAttempts = this.promiseEnabled ? (1 + this.gateRetries) : 1;

          for (let gate = 0; gate < maxAttempts; gate++) {
            gateAttempts = gate + 1;

            // On final gate attempt, escalate model if trust is low
            if (gate > 0 && gate === maxAttempts - 1 && this.promiseEnabled) {
              const agentId = `${this.model}-${task.id}`;
              const trust = await this.promiseEngine.getAgentTrust(agentId);
              const escalated = this.getModelForAgent(trust);
              if (escalated !== activeModel) {
                activeModel = escalated;
                modelEscalated = true;
                console.log(`${label} — escalating to ${activeModel} (trust=${trust.toFixed(2)})`);
              }
            }

            let rawOutput;
            let lastErr;
            const maxRetries = 2;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                rawOutput = await this.invokeAgent(prompt, worktreePath, activeModel);
                lastErr = null;
                break;
              } catch (err) {
                lastErr = err;
                if (attempt < maxRetries) {
                  const wait = attempt * 10;
                  console.warn(`${label} — attempt ${attempt} failed, retrying in ${wait}s...`);
                  await new Promise(r => setTimeout(r, wait * 1000));
                }
              }
            }

            if (lastErr) {
              if (gate === 0) {
                console.error(`${label} — FAILED after ${maxRetries} attempts: ${lastErr.message}`);
                await collector.writeRecord({
                  run, task_id: task.id, ref: this.ref, resolved_sha: resolvedSha,
                  status: 'error', error: lastErr.message,
                  duration_ms: Date.now() - startTime,
                  quality_score: 0, todo_count: 0, fixme_count: 0,
                  error_handling_present: false, tests_present: false, docs_referenced: false,
                  trust_before: null, trust_after: null, rebinding_triggered: false,
                  model_used: activeModel, model_escalated: false,
                  gate_attempts: gateAttempts, gate_retried: false,
                  usage: null,
                  cost_usd: null,
                });
              }
              break;
            }

            const { text: output, usage, cost_usd } = this.parseAgentResponse(rawOutput);
            const analysis = collector.analyzeOutput(output);
            const qualityScore = collector.computeQualityScore(analysis);

            let promiseRecord = null;
            let passed = true;

            if (this.promiseEnabled) {
              const agentId = `${activeModel}-${task.id}`;
              const promises = this._availablePromises({ cxpak: this._cxpakAvailable, trace: false });

              // Get modified files and diff from worktree for structural + diff-based verification
              let modifiedFiles = [];
              let diffContent = null;
              try {
                const gitFiles = execFileSync('git', ['diff', '--name-only', 'HEAD'], { timeout: 5000, encoding: 'utf8', cwd: worktreePath });
                modifiedFiles = gitFiles.trim().split('\n').filter(Boolean);
              } catch (_) {
                // git diff fails → structural checks skip (empty files)
              }
              try {
                const rawDiff = execFileSync('git', ['diff', 'HEAD'], { timeout: 10000, encoding: 'utf8', cwd: worktreePath });
                if (rawDiff && rawDiff.trim()) diffContent = rawDiff;
              } catch (_) {
                // diff unavailable → standing promises stay on output
              }

              promiseRecord = await this.promiseEngine.evaluate({
                runId: `run-${run}${gate > 0 ? `-gate${gate}` : ''}`,
                agentId,
                taskId: task.id,
                promises,
                output,
                context: { files: modifiedFiles, diff: diffContent, elapsed_ms: Date.now() - startTime, cxpak: this._cxpakAvailable, workDir: worktreePath },
              });

              const trust = await this.promiseEngine.getAgentTrust(agentId);
              const { TrustManager } = require('../promise/trust-manager');
              const trustTier = new TrustManager({ decayFactor: 0.85 }).getTrustTier(trust);
              passed = this.checkGate(promiseRecord.verification_results, trustTier);
            }

            if (qualityScore > bestScore) {
              bestOutput = output;
              bestScore = qualityScore;
              bestAnalysis = analysis;
              bestPromiseRecord = promiseRecord;
              bestUsage = usage;
              bestCostUsd = cost_usd;
            }

            if (passed || gate === maxAttempts - 1) {
              break;
            }

            gateRetried = true;
            const brokenIds = promiseRecord.verification_results
              .filter(vr => vr.result === 'broken' && vr.confidence === 'high')
              .map(vr => vr.promise_id);
            console.log(`${label} — gate rejected (broken: ${brokenIds.join(', ')}), retrying clean...`);
            await new Promise(r => setTimeout(r, 3000));
          }

          if (bestOutput === null) continue;

          const durationMs = Date.now() - startTime;

          const rawFile = path.join(rawDir, `run${run}-${task.id}.txt`);
          await fs.writeFile(rawFile, bestOutput, 'utf8');

          // Compute baseline deltas if available
          let baselineDeltas = null;
          if (cxpakBaseline && this.promiseEnabled && this._cxpakAvailable) {
            try {
              const currentState = await this.captureBaseline(worktreePath);
              baselineDeltas = this.computeBaselineDeltas(cxpakBaseline, currentState);
            } catch (_) {}
          }

          await collector.writeRecord({
            run,
            task_id: task.id,
            ref: this.ref,
            resolved_sha: resolvedSha,
            status: 'complete',
            duration_ms: durationMs,
            output_length: bestOutput.length,
            quality_score: bestScore,
            ...bestAnalysis,
            trust_before: bestPromiseRecord ? bestPromiseRecord.trust_score_before : null,
            trust_after: bestPromiseRecord ? bestPromiseRecord.trust_score_after : null,
            rebinding_triggered: bestPromiseRecord ? bestPromiseRecord.rebinding_triggered : false,
            model_used: activeModel,
            model_escalated: modelEscalated,
            gate_attempts: gateAttempts,
            gate_retried: gateRetried,
            usage: bestUsage,
            cost_usd: bestCostUsd,
            baseline_deltas: baselineDeltas,
          });

          console.log(`${label} — done (${(durationMs / 1000).toFixed(1)}s, score=${bestScore}${gateRetried ? `, gate_attempts=${gateAttempts}` : ''})`);

          if (completed < totalInvocations) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }

      console.log(`\nAll runs complete. Results: ${outDir}`);
      return outDir;

    } finally {
      console.log('Cleaning up worktree...');
      await this.refRunner.removeWorktree();
    }
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node measurement/executor.js --ref <git-ref> [options]

Options:
  --ref <ref>         Git ref to measure (branch, tag, SHA)       [required]
  --runs <n>          Number of measurement runs                  [default: 3]
  --output <dir>      Output directory for results                [auto-generated]
  --model <model>     Claude model to use                         [default: sonnet]
  --promise           Enable promise-theory output gate
  --gate-retries <n>  Max gate retries on broken promises         [default: 1]
  --ledger-dir <dir>  Directory for promise ledger                [default: .promise-ledger]
  --mcp-config <path> Path to MCP config JSON for claude -p
  --cxpak-prompt      Use cxpak exploration prompt instead of CLAUDE.md injection
  --help, -h          Show this help

Promise mode (--promise):
  Output is verified against standing promises AFTER generation.
  If high-confidence promises are broken, the task is retried with a
  clean prompt (no feedback injection). The best output is kept.
  Trust is tracked for observability but never injected into prompts.

Resume: Pass --output pointing to an existing results directory.
  The executor reads metrics.jsonl, skips completed run:task pairs,
  and appends new results.

Examples:
  node measurement/executor.js --ref main --runs 3
  node measurement/executor.js --ref promise-theory --model sonnet
  node measurement/executor.js --ref main --promise --gate-retries 2
  node measurement/executor.js --ref promise-theory --runs 15 --output measurement/results/promise-theory-20260316T113301`);
    process.exit(0);
  }

  const refIdx = args.indexOf('--ref');
  if (refIdx === -1 || !args[refIdx + 1]) {
    console.error('--ref <git-ref> is required');
    process.exit(1);
  }
  const ref = args[refIdx + 1];

  const runsIdx = args.indexOf('--runs');
  const runs = runsIdx !== -1 ? parseInt(args[runsIdx + 1], 10) : 3;

  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : null;

  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : 'sonnet';

  const promiseEnabled = args.includes('--promise');
  const ledgerIdx = args.indexOf('--ledger-dir');
  const ledgerDir = ledgerIdx !== -1 ? args[ledgerIdx + 1] : null;

  const gateRetriesIdx = args.indexOf('--gate-retries');
  const gateRetries = gateRetriesIdx !== -1 ? parseInt(args[gateRetriesIdx + 1], 10) : 1;

  const mcpConfigIdx = args.indexOf('--mcp-config');
  const mcpConfig = mcpConfigIdx !== -1 ? args[mcpConfigIdx + 1] : null;
  const cxpakPrompt = args.includes('--cxpak-prompt');

  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

  const executor = new Executor({ ref, repoRoot, runs, outputDir, model, promiseEnabled, ledgerDir, gateRetries, mcpConfig, cxpakPrompt });
  try {
    await executor.execute();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { Executor };
