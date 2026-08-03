const fs = require('fs');
const path = require('path');
const { ComparisonReport } = require('./comparison-report');

function loadMetrics(dir) {
  const metricsPath = path.join(dir, 'metrics.jsonl');

  if (!fs.existsSync(metricsPath)) {
    throw new Error(`No metrics file found: ${metricsPath}`);
  }

  const content = fs.readFileSync(metricsPath, 'utf8');
  const lines = content.trim().split('\n');
  const records = lines
    .map(line => JSON.parse(line))
    .filter(r => r.status === 'complete');

  if (records.length === 0) {
    throw new Error(`No complete records in ${metricsPath}`);
  }

  return records;
}

function buildPairedScores(baselineRecords, treatmentRecords) {
  // Get all unique task IDs from both sets
  const allTaskIds = new Set([
    ...baselineRecords.map(r => r.task_id),
    ...treatmentRecords.map(r => r.task_id),
  ]);

  // Build task pairs: mean score per task across all runs
  const taskPairs = { baseline: [], treatment: [], labels: [] };
  for (const taskId of allTaskIds) {
    const bScores = baselineRecords.filter(r => r.task_id === taskId).map(r => r.quality_score);
    const tScores = treatmentRecords.filter(r => r.task_id === taskId).map(r => r.quality_score);
    if (bScores.length > 0 && tScores.length > 0) {
      taskPairs.baseline.push(ComparisonReport.mean(bScores));
      taskPairs.treatment.push(ComparisonReport.mean(tScores));
      taskPairs.labels.push(taskId);
    }
  }

  // Build run pairs if both have same number of runs >= 5
  let runPairs = null;
  const baselineRuns = new Set(baselineRecords.map(r => r.run));
  const treatmentRuns = new Set(treatmentRecords.map(r => r.run));

  if (baselineRuns.size === treatmentRuns.size && baselineRuns.size >= 5) {
    const runNumbers = Array.from(baselineRuns).sort((a, b) => a - b);
    const allMatch = runNumbers.every(rn => treatmentRuns.has(rn));

    if (allMatch) {
      runPairs = { baseline: [], treatment: [], labels: [] };
      for (const runNum of runNumbers) {
        const bScores = baselineRecords.filter(r => r.run === runNum).map(r => r.quality_score);
        const tScores = treatmentRecords.filter(r => r.run === runNum).map(r => r.quality_score);
        if (bScores.length > 0 && tScores.length > 0) {
          runPairs.baseline.push(ComparisonReport.mean(bScores));
          runPairs.treatment.push(ComparisonReport.mean(tScores));
          runPairs.labels.push(runNum);
        }
      }
      // If we didn't get valid pairs for all runs, discard
      if (runPairs.baseline.length !== runNumbers.length) {
        runPairs = null;
      }
    }
  }

  // Select primary pairs: use runPairs if available and has more entries than taskPairs
  const primaryPairs = (runPairs && runPairs.baseline.length > taskPairs.baseline.length) ? runPairs : taskPairs;

  return { taskPairs, runPairs, primaryPairs };
}

// Effect-size floor applied when Wilcoxon returns no_difference. Without it,
// the verdict logic would PASS any non-baseline_better direction regardless
// of |d| — so a moderate-but-NS quality regression at modest n (e.g. d=-0.6,
// p=0.08) would silently rubber-stamp. Floor of 0.5 picked to match
// conventional "medium effect" threshold; tunable via env for future runs.
const QUALITY_EFFECT_SIZE_FLOOR = Number(process.env.QUALITY_EFFECT_SIZE_FLOOR) || 0.5;

function determineResult(comparison) {
  const { quality, tokens } = comparison;

  // FAIL if quality regressed
  if (quality.wilcoxon.direction === 'baseline_better') {
    return {
      passed: false,
      verdict: 'FAIL',
      reasons: ['Quality regression: baseline significantly better (Wilcoxon)'],
    };
  }

  // Effect-size floor on the no_difference verdict: if Wilcoxon failed to
  // reach significance but Cohen's d is large enough to suggest a real
  // regression that smaller n would have caught, downgrade to WARN. Negative
  // signed d indicates baseline-favoring.
  const qualityD = typeof quality.cohens_d === 'number' ? quality.cohens_d : 0;
  if (quality.wilcoxon.direction === 'no_difference' && qualityD <= -QUALITY_EFFECT_SIZE_FLOOR) {
    return {
      passed: true,
      verdict: 'WARN',
      reasons: [
        `Quality: Wilcoxon NS but Cohen's d=${qualityD.toFixed(3)} crosses floor (-${QUALITY_EFFECT_SIZE_FLOOR}); investigate before merge`,
      ],
    };
  }

  // Check token efficiency
  if (tokens === null) {
    return {
      passed: true,
      verdict: 'PASS',
      reasons: [
        'Quality: OK',
        'Tokens: no usage data available, skipping token comparison',
      ],
    };
  }

  // WARN if tokens increased
  if (tokens.delta_pct > 0) {
    return {
      passed: true,
      verdict: 'WARN',
      reasons: [
        'Quality: OK',
        `Tokens: treatment uses ${tokens.delta_pct.toFixed(1)}% more tokens`,
      ],
    };
  }

  // PASS - quality OK and tokens reduced
  return {
    passed: true,
    verdict: 'PASS',
    reasons: [
      'Quality: not significantly worse',
      `Tokens: treatment uses ${Math.abs(tokens.delta_pct).toFixed(1)}% fewer tokens`,
    ],
  };
}

function generateMarkdownReport(comparison, config, result) {
  const { quality, tokens, efficiency, taskPairs } = comparison;

  let md = '';

  // Header
  md += `# Comparison Report: ${config.baseline} vs ${config.treatment}\n\n`;

  // Summary section
  md += '## Summary\n\n';
  md += '| Metric | Baseline | Treatment | Delta |\n';
  md += '|--------|----------|-----------|-------|\n';
  md += `| Quality Score | ${quality.baseline_mean.toFixed(2)} | ${quality.treatment_mean.toFixed(2)} | `;
  const qDelta = quality.treatment_mean - quality.baseline_mean;
  md += `${qDelta >= 0 ? '+' : ''}${qDelta.toFixed(2)} |\n`;

  if (tokens) {
    md += `| Tokens | ${tokens.baseline_mean.toFixed(0)} | ${tokens.treatment_mean.toFixed(0)} | `;
    md += `${tokens.delta >= 0 ? '+' : ''}${tokens.delta.toFixed(0)} (${tokens.delta_pct >= 0 ? '+' : ''}${tokens.delta_pct.toFixed(1)}%) |\n`;
  } else {
    md += '| Tokens | N/A | N/A | N/A |\n';
  }

  md += '\n';

  // Quality Analysis
  md += '## Quality Analysis\n\n';
  md += `**Wilcoxon Signed-Rank Test:**\n`;
  md += `- Direction: ${quality.wilcoxon.direction}\n`;
  md += `- Statistic: ${quality.wilcoxon.statistic}\n`;
  md += `- n: ${quality.wilcoxon.n}\n`;
  if (quality.wilcoxon.critical_value !== null) {
    md += `- Critical value (α=0.05): ${quality.wilcoxon.critical_value}\n`;
  }
  md += `\n**Cohen's d:** ${quality.cohens_d.toFixed(3)}\n\n`;
  md += `**Pairing method:** ${quality.pairing_method} (${quality.pairs_count} pairs)\n\n`;

  // Per-Task Breakdown
  md += '## Per-Task Breakdown\n\n';
  md += '| Task | Baseline | Treatment | Delta |\n';
  md += '|------|----------|-----------|-------|\n';
  for (let i = 0; i < taskPairs.labels.length; i++) {
    const task = taskPairs.labels[i];
    const bVal = taskPairs.baseline[i];
    const tVal = taskPairs.treatment[i];
    const delta = tVal - bVal;
    md += `| ${task} | ${bVal.toFixed(2)} | ${tVal.toFixed(2)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} |\n`;
  }
  md += '\n';

  // Token Efficiency
  md += '## Token Efficiency\n\n';
  if (tokens) {
    md += `**Baseline:**\n`;
    md += `- Mean tokens per invocation: ${tokens.baseline_mean.toFixed(0)}\n`;
    md += `- Total tokens: ${tokens.baseline_total}\n`;
    if (efficiency.baseline !== null) {
      md += `- Efficiency ratio: ${efficiency.baseline.toFixed(0)} tokens/quality point\n`;
    }
    md += `\n**Treatment:**\n`;
    md += `- Mean tokens per invocation: ${tokens.treatment_mean.toFixed(0)}\n`;
    md += `- Total tokens: ${tokens.treatment_total}\n`;
    if (efficiency.treatment !== null) {
      md += `- Efficiency ratio: ${efficiency.treatment.toFixed(0)} tokens/quality point\n`;
    }
    md += '\n';
  } else {
    md += 'No token usage data available (baseline or treatment missing usage records).\n\n';
  }

  // Verdict
  md += '## Verdict\n\n';
  md += `**${result.verdict}**\n\n`;
  for (const reason of result.reasons) {
    md += `- ${reason}\n`;
  }
  md += '\n';

  // Configuration
  md += '## Configuration\n\n';
  md += `- Baseline: ${config.baseline} (${config.baselineRecordCount} records)\n`;
  md += `- Treatment: ${config.treatment} (${config.treatmentRecordCount} records)\n`;
  md += `- Runs: ${config.runs}\n`;
  md += `- Model: ${config.model}\n`;
  md += `- Promise mode: ${config.promise}\n`;
  md += `- Baseline dir: ${config.baselineDir}\n`;
  md += `- Treatment dir: ${config.treatmentDir}\n`;

  return md;
}

class ComparisonRunner {
  constructor({ baseline, treatment, runs = 5, model = 'sonnet', promise = false, promiseTreatmentOnly = false, gateRetries = 1, baselineDir = null, treatmentDir = null, mcpConfig = null }) {
    this.baseline = baseline;
    this.treatment = treatment;
    this.runs = runs;
    this.model = model;
    this.promise = promise;
    this.promiseTreatmentOnly = promiseTreatmentOnly;
    this.gateRetries = gateRetries;
    this.baselineDir = baselineDir;
    this.treatmentDir = treatmentDir;
    this.mcpConfig = mcpConfig;
    this.repoRoot = require('child_process').execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  }

  spawnExecutor(ref, label, outputDir, { cxpakPrompt = false, promise = false } = {}) {
    const args = ['measurement/executor.js', '--ref', ref, '--runs', String(this.runs), '--model', this.model, '--output', outputDir];
    if (promise) args.push('--promise');
    if (this.gateRetries > 1) args.push('--gate-retries', String(this.gateRetries));
    if (this.mcpConfig) args.push('--mcp-config', this.mcpConfig);
    if (cxpakPrompt) args.push('--cxpak-prompt');

    return new Promise((resolve, reject) => {
      const child = require('child_process').spawn('node', args, {
        cwd: this.repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const readline = require('readline');
      const rlOut = readline.createInterface({ input: child.stdout });
      const rlErr = readline.createInterface({ input: child.stderr });
      rlOut.on('line', line => console.log(`[${label}] ${line}`));
      rlErr.on('line', line => console.error(`[${label}] ${line}`));

      child.on('close', code => {
        rlOut.close();
        rlErr.close();
        if (code !== 0) reject(new Error(`Executor for ${ref} exited with code ${code}`));
        else resolve(outputDir);
      });
      child.on('error', err => reject(err));
    });
  }

  async run() {
    const fsPromises = require('fs').promises;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const compareDir = path.join(this.repoRoot, 'measurement', 'results', `compare-${timestamp}`);
    await fsPromises.mkdir(compareDir, { recursive: true });

    const baselinePromise = this.promise && !this.promiseTreatmentOnly;
    const treatmentPromise = this.promise || this.promiseTreatmentOnly;

    console.log(`Comparison: ${this.baseline} vs ${this.treatment}`);
    console.log(`Runs: ${this.runs}, Model: ${this.model}, Promise: baseline=${baselinePromise}, treatment=${treatmentPromise}`);
    console.log(`Output: ${compareDir}\n`);

    const bDir = this.baselineDir || path.join(this.repoRoot, 'measurement', 'results', `${this.baseline.replace(/[^a-zA-Z0-9_-]/g, '-')}-${timestamp}-baseline`);
    const tDir = this.treatmentDir || path.join(this.repoRoot, 'measurement', 'results', `${this.treatment.replace(/[^a-zA-Z0-9_-]/g, '-')}-${timestamp}-treatment`);

    const expectedRecords = this.runs * 5;
    const runBranch = async (ref, label, dir, { cxpakPrompt = false, promise = false } = {}) => {
      try {
        const existing = loadMetrics(dir);
        if (existing.length >= expectedRecords) {
          console.log(`[${label}] Complete results found: ${dir} (${existing.length} records)`);
          return dir;
        }
        if (existing.length > 0) {
          console.log(`[${label}] Partial results (${existing.length}/${expectedRecords}), resuming...`);
        }
      } catch (_) {
        // No existing results, fresh run
      }
      return this.spawnExecutor(ref, label, dir, { cxpakPrompt, promise });
    };

    let baselineDir, treatmentDir;
    try {
      [baselineDir, treatmentDir] = await Promise.all([
        runBranch(this.baseline, 'baseline', bDir, { promise: baselinePromise }),
        runBranch(this.treatment, 'treatment', tDir, { cxpakPrompt: this.mcpConfig !== null, promise: treatmentPromise }),
      ]);
    } catch (err) {
      console.error(`\nExecutor failed: ${err.message}`);
      process.exit(2);
    }

    const baselineRecords = loadMetrics(baselineDir);
    const treatmentRecords = loadMetrics(treatmentDir);

    console.log(`\nBaseline: ${baselineRecords.length} complete records`);
    console.log(`Treatment: ${treatmentRecords.length} complete records`);

    const paired = buildPairedScores(baselineRecords, treatmentRecords);
    const pairs = paired.primaryPairs;

    let wilcoxon;
    let cohens_d;
    if (pairs.baseline.length >= 5) {
      wilcoxon = ComparisonReport.wilcoxonSignedRank(pairs.baseline, pairs.treatment);
      cohens_d = ComparisonReport.cohensD(pairs.baseline, pairs.treatment);
    } else {
      wilcoxon = {
        direction: ComparisonReport.mean(pairs.treatment) >= ComparisonReport.mean(pairs.baseline) - 0.5
          ? 'no_difference' : 'baseline_better',
        statistic: null, w_plus: null, w_minus: null,
        n: pairs.baseline.length, critical_value: null,
      };
      cohens_d = pairs.baseline.length >= 2 ? ComparisonReport.cohensD(pairs.baseline, pairs.treatment) : 0;
    }

    const tokenComparison = ComparisonReport.compareTokens(baselineRecords, treatmentRecords);
    const baselineEfficiency = ComparisonReport.efficiencyRatio(baselineRecords);
    const treatmentEfficiency = ComparisonReport.efficiencyRatio(treatmentRecords);

    const comparison = {
      quality: {
        wilcoxon,
        cohens_d,
        baseline_mean: ComparisonReport.mean(pairs.baseline),
        treatment_mean: ComparisonReport.mean(pairs.treatment),
        pairing_method: paired.primaryPairs === paired.runPairs ? 'per_run' : 'per_task',
        pairs_count: pairs.baseline.length,
      },
      tokens: tokenComparison,
      efficiency: { baseline: baselineEfficiency, treatment: treatmentEfficiency },
      taskPairs: paired.taskPairs,
    };

    const result = determineResult(comparison);

    const config = {
      baseline: this.baseline,
      treatment: this.treatment,
      runs: this.runs,
      model: this.model,
      promise: this.promise,
      promiseTreatmentOnly: this.promiseTreatmentOnly,
      baselineDir,
      treatmentDir,
      baselineRecordCount: baselineRecords.length,
      treatmentRecordCount: treatmentRecords.length,
    };

    const report = generateMarkdownReport(comparison, config, result);
    await fsPromises.writeFile(path.join(compareDir, 'report.md'), report, 'utf8');

    const summary = {
      generated_at: new Date().toISOString(),
      config,
      quality: comparison.quality,
      tokens: comparison.tokens,
      efficiency: comparison.efficiency,
      verdict: result.verdict,
      passed: result.passed,
      reasons: result.reasons,
    };
    await fsPromises.writeFile(path.join(compareDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Verdict: ${result.verdict}`);
    result.reasons.forEach(r => console.log(`  ${r}`));
    console.log(`Report: ${path.join(compareDir, 'report.md')}`);
    console.log(`${'='.repeat(60)}`);

    return { ...result, compareDir };
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node measurement/compare.js --baseline <ref> --treatment <ref> [options]

Options:
  --baseline <ref>       Git ref for baseline branch                    [required]
  --treatment <ref>      Git ref for treatment branch                   [required]
  --runs <n>             Number of measurement runs per branch          [default: 5]
  --model <model>        Claude model to use                            [default: sonnet]
  --promise              Enable promise-theory output gate (both arms)
  --promise-treatment-only  Enable gate on treatment arm only (for isolation test)
  --gate-retries <n>     Max gate retries                               [default: 1]
  --baseline-dir <dir>   Reuse existing baseline results directory
  --treatment-dir <dir>  Reuse existing treatment results directory
  --mcp-config <path>    Path to MCP config JSON for claude -p
  --help, -h             Show this help`);
    process.exit(0);
  }

  const baselineIdx = args.indexOf('--baseline');
  const treatmentIdx = args.indexOf('--treatment');
  const baselineDirIdx = args.indexOf('--baseline-dir');
  const treatmentDirIdx = args.indexOf('--treatment-dir');

  const baseline = baselineIdx !== -1 ? args[baselineIdx + 1] : null;
  const treatment = treatmentIdx !== -1 ? args[treatmentIdx + 1] : null;

  if (!baseline && baselineDirIdx === -1) { console.error('--baseline <ref> or --baseline-dir <dir> is required'); process.exit(1); }
  if (!treatment && treatmentDirIdx === -1) { console.error('--treatment <ref> or --treatment-dir <dir> is required'); process.exit(1); }

  const runsIdx = args.indexOf('--runs');
  const runs = runsIdx !== -1 ? parseInt(args[runsIdx + 1], 10) : 5;
  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : 'sonnet';
  const promise = args.includes('--promise');
  const promiseTreatmentOnly = args.includes('--promise-treatment-only');
  const gateRetriesIdx = args.indexOf('--gate-retries');
  const gateRetries = gateRetriesIdx !== -1 ? parseInt(args[gateRetriesIdx + 1], 10) : 1;
  const baselineDir = baselineDirIdx !== -1 ? args[baselineDirIdx + 1] : null;
  const treatmentDir = treatmentDirIdx !== -1 ? args[treatmentDirIdx + 1] : null;
  const mcpConfigIdx = args.indexOf('--mcp-config');
  const mcpConfig = mcpConfigIdx !== -1 ? args[mcpConfigIdx + 1] : null;

  const runner = new ComparisonRunner({
    baseline: baseline || 'unknown',
    treatment: treatment || 'unknown',
    runs, model, promise, promiseTreatmentOnly, gateRetries, baselineDir, treatmentDir, mcpConfig,
  });

  const result = await runner.run();
  process.exit(result.passed ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => { console.error(`Error: ${err.message}`); process.exit(2); });
}

module.exports = { loadMetrics, buildPairedScores, determineResult, generateMarkdownReport, ComparisonRunner };
