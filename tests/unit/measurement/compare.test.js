const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { loadMetrics, buildPairedScores, determineResult, generateMarkdownReport, ComparisonRunner } = require('../../../measurement/compare');

const TASK_IDS = ['code-plan', 'degraded-input', 'determinism-control',
                  'multi-agent-coordination', 'single-agent-codegen'];

function makeRecord(run, task_id, quality_score, overrides = {}) {
  return {
    run, task_id, ref: 'test-ref', resolved_sha: 'abc123',
    status: 'complete', duration_ms: 60000, output_length: 5000,
    quality_score,
    todo_count: 0, fixme_count: 0,
    error_handling_present: true, tests_present: true, docs_referenced: false,
    trust_before: null, trust_after: null, rebinding_triggered: false,
    model_used: 'sonnet', model_escalated: false,
    gate_attempts: 1, gate_retried: false,
    usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    cost_usd: 0.01,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeDataset(runs, scoresByTask) {
  const records = [];
  for (let run = 1; run <= runs; run++) {
    for (const taskId of TASK_IDS) {
      const scores = scoresByTask[taskId] || [7];
      const score = scores[(run - 1) % scores.length];
      records.push(makeRecord(run, taskId, score));
    }
  }
  return records;
}

async function writeMetrics(dir, records) {
  await fs.mkdir(dir, { recursive: true });
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  await fs.writeFile(path.join(dir, 'metrics.jsonl'), content, 'utf8');
}

describe('loadMetrics', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compare-')); });
  afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  test('reads JSONL and returns parsed complete records', async () => {
    const records = [makeRecord(1, 'code-plan', 8), makeRecord(1, 'degraded-input', 7)];
    await writeMetrics(tmpDir, records);
    const result = loadMetrics(tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0].task_id).toBe('code-plan');
    expect(result[0].quality_score).toBe(8);
  });

  test('filters out error records', async () => {
    const records = [
      makeRecord(1, 'code-plan', 8),
      makeRecord(1, 'degraded-input', 0, { status: 'error' }),
    ];
    await writeMetrics(tmpDir, records);
    const result = loadMetrics(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].task_id).toBe('code-plan');
  });

  test('throws on missing file', () => {
    expect(() => loadMetrics(path.join(tmpDir, 'nonexistent'))).toThrow('No metrics file');
  });

  test('throws on empty results after filtering', async () => {
    const records = [makeRecord(1, 'code-plan', 0, { status: 'error' })];
    await writeMetrics(tmpDir, records);
    expect(() => loadMetrics(tmpDir)).toThrow('No complete records');
  });
});

describe('buildPairedScores', () => {
  test('pairs by task with correct means', () => {
    const baseline = makeDataset(3, { 'code-plan': [6, 8, 7], 'degraded-input': [5, 5, 5], 'determinism-control': [9, 9, 9], 'multi-agent-coordination': [7, 7, 7], 'single-agent-codegen': [8, 8, 8] });
    const treatment = makeDataset(3, { 'code-plan': [9, 9, 9], 'degraded-input': [6, 6, 6], 'determinism-control': [9, 9, 9], 'multi-agent-coordination': [8, 8, 8], 'single-agent-codegen': [8, 8, 8] });
    const { taskPairs } = buildPairedScores(baseline, treatment);
    expect(taskPairs.baseline).toHaveLength(5);
    expect(taskPairs.treatment).toHaveLength(5);
    // code-plan: baseline mean = 7, treatment mean = 9
    const cpIdx = taskPairs.labels.indexOf('code-plan');
    expect(taskPairs.baseline[cpIdx]).toBe(7);
    expect(taskPairs.treatment[cpIdx]).toBe(9);
  });

  test('produces runPairs when both have >= 5 runs', () => {
    const baseline = makeDataset(5, {});
    const treatment = makeDataset(5, {});
    const { runPairs } = buildPairedScores(baseline, treatment);
    expect(runPairs).not.toBeNull();
    expect(runPairs.baseline).toHaveLength(5);
    expect(runPairs.treatment).toHaveLength(5);
  });

  test('runPairs is null when run counts differ', () => {
    const baseline = makeDataset(5, {});
    const treatment = makeDataset(3, {});
    const { runPairs } = buildPairedScores(baseline, treatment);
    expect(runPairs).toBeNull();
  });

  test('selects primaryPairs as runPairs when available with more entries', () => {
    const baseline = makeDataset(10, {});
    const treatment = makeDataset(10, {});
    const { primaryPairs, runPairs, taskPairs } = buildPairedScores(baseline, treatment);
    // 10 run pairs > 5 task pairs
    expect(primaryPairs).toBe(runPairs);
  });

  test('selects primaryPairs as taskPairs when runPairs unavailable', () => {
    const baseline = makeDataset(3, {});
    const treatment = makeDataset(3, {});
    const { primaryPairs, taskPairs } = buildPairedScores(baseline, treatment);
    expect(primaryPairs).toBe(taskPairs);
  });
});

describe('determineResult', () => {
  test('PASS when quality no_difference and tokens lower', () => {
    const comparison = {
      quality: { wilcoxon: { direction: 'no_difference' }, baseline_mean: 7, treatment_mean: 7.2 },
      tokens: { delta_pct: -15 },
    };
    const result = determineResult(comparison);
    expect(result.passed).toBe(true);
    expect(result.verdict).toBe('PASS');
  });

  test('PASS when quality is promise_better', () => {
    const comparison = {
      quality: { wilcoxon: { direction: 'promise_better' }, baseline_mean: 7, treatment_mean: 8 },
      tokens: { delta_pct: -5 },
    };
    const result = determineResult(comparison);
    expect(result.passed).toBe(true);
    expect(result.verdict).toBe('PASS');
  });

  test('FAIL when quality is baseline_better', () => {
    const comparison = {
      quality: { wilcoxon: { direction: 'baseline_better' }, baseline_mean: 8, treatment_mean: 6 },
      tokens: { delta_pct: -20 },
    };
    const result = determineResult(comparison);
    expect(result.passed).toBe(false);
    expect(result.verdict).toBe('FAIL');
  });

  test('PASS when tokens data is null (skip token check)', () => {
    const comparison = {
      quality: { wilcoxon: { direction: 'no_difference' } },
      tokens: null,
    };
    const result = determineResult(comparison);
    expect(result.passed).toBe(true);
    expect(result.verdict).toBe('PASS');
  });

  test('WARN when quality passes but tokens higher', () => {
    const comparison = {
      quality: { wilcoxon: { direction: 'no_difference' }, baseline_mean: 7, treatment_mean: 7 },
      tokens: { delta_pct: 25 },
    };
    const result = determineResult(comparison);
    expect(result.passed).toBe(true);
    expect(result.verdict).toBe('WARN');
  });

  describe('|d| ≥ 0.5 effect-size floor on no_difference verdict', () => {
    // Post-ryordanov-audit fix: previously, any non-baseline_better Wilcoxon
    // direction passed regardless of effect size. A moderate-but-NS quality
    // regression at modest n (e.g. d=-0.6, p=0.08) would silently rubber-stamp.
    // Floor at |d|=0.5 (conventional "medium effect") catches this class.

    test('downgrades to WARN when Cohen\'s d ≤ -0.5 on no_difference', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'no_difference' }, baseline_mean: 0.85, treatment_mean: 0.65, cohens_d: -0.6 },
        tokens: { delta_pct: -15 },
      };
      const result = determineResult(comparison);
      expect(result.verdict).toBe('WARN');
      expect(result.reasons.join(' ')).toMatch(/floor/);
    });

    test('exactly at floor (d = -0.5) trips WARN', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'no_difference' }, baseline_mean: 0.8, treatment_mean: 0.7, cohens_d: -0.5 },
        tokens: { delta_pct: -10 },
      };
      const result = determineResult(comparison);
      expect(result.verdict).toBe('WARN');
    });

    test('just below floor (d = -0.49) keeps PASS', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'no_difference' }, baseline_mean: 0.8, treatment_mean: 0.7, cohens_d: -0.49 },
        tokens: { delta_pct: -10 },
      };
      const result = determineResult(comparison);
      expect(result.verdict).toBe('PASS');
    });

    test('positive d (treatment-favoring) is not floored', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'no_difference' }, baseline_mean: 0.7, treatment_mean: 0.8, cohens_d: 0.6 },
        tokens: { delta_pct: -10 },
      };
      const result = determineResult(comparison);
      expect(result.verdict).toBe('PASS');
    });

    test('floor does not fire on baseline_better (already FAIL)', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'baseline_better' }, cohens_d: -0.9 },
        tokens: { delta_pct: -10 },
      };
      const result = determineResult(comparison);
      expect(result.verdict).toBe('FAIL');
    });

    test('floor does not fire on promise_better (already PASS direction)', () => {
      const comparison = {
        quality: { wilcoxon: { direction: 'promise_better' }, cohens_d: 0.7 },
        tokens: { delta_pct: -10 },
      };
      const result = determineResult(comparison);
      expect(result.verdict).toBe('PASS');
    });

    test('R16 actual data (d=-0.229) is below floor — does NOT trip WARN', () => {
      // Sanity check that R16's reported result wouldn't be downgraded by
      // the new floor — confirms the fix doesn't retroactively invalidate
      // the existing PASS verdict.
      const comparison = {
        quality: { wilcoxon: { direction: 'no_difference' }, baseline_mean: 0.859, treatment_mean: 0.825, cohens_d: -0.229 },
        tokens: { delta_pct: -19 },
      };
      const result = determineResult(comparison);
      expect(result.verdict).toBe('PASS');
    });
  });
});

describe('generateMarkdownReport', () => {
  const comparison = {
    quality: {
      wilcoxon: { direction: 'no_difference', statistic: 3, n: 5, critical_value: 1 },
      cohens_d: 0.35,
      baseline_mean: 7.0,
      treatment_mean: 7.4,
      pairing_method: 'per_task',
      pairs_count: 5,
    },
    tokens: { baseline_mean: 1500, treatment_mean: 1200, delta: -300, delta_pct: -20 },
    efficiency: { baseline: 200, treatment: 160 },
    taskPairs: {
      baseline: [7, 6, 8, 7, 7],
      treatment: [8, 6, 8, 7, 8],
      labels: TASK_IDS,
    },
  };
  const config = { baseline: 'main', treatment: 'promise-theory-v2', runs: 5, model: 'sonnet' };
  const result = { verdict: 'PASS', passed: true, reasons: ['Quality: OK', 'Tokens: 20.0% fewer'] };

  test('contains required sections', () => {
    const md = generateMarkdownReport(comparison, config, result);
    expect(md).toContain('# Comparison Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Quality Analysis');
    expect(md).toContain('## Verdict');
  });

  test('includes all 5 task IDs in per-task breakdown', () => {
    const md = generateMarkdownReport(comparison, config, result);
    for (const taskId of TASK_IDS) {
      expect(md).toContain(taskId);
    }
  });
});

describe('ComparisonRunner constructor — promise flags', () => {
  test('promise=true, promiseTreatmentOnly=false passes promise to both arms', () => {
    const runner = new ComparisonRunner({
      baseline: 'main', treatment: 'v2', promise: true, promiseTreatmentOnly: false,
    });
    expect(runner.promise).toBe(true);
    expect(runner.promiseTreatmentOnly).toBe(false);
  });

  test('promiseTreatmentOnly=true enables gate on treatment only', () => {
    const runner = new ComparisonRunner({
      baseline: 'main', treatment: 'v2', promise: false, promiseTreatmentOnly: true,
    });
    expect(runner.promise).toBe(false);
    expect(runner.promiseTreatmentOnly).toBe(true);
  });

  test('spawnExecutor includes --promise only when promise param is true', () => {
    const { Readable } = require('stream');
    const runner = new ComparisonRunner({
      baseline: 'main', treatment: 'v2',
    });
    const makeChildMock = () => {
      const child = {
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
        on: jest.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 10);
          return child;
        }),
      };
      return child;
    };
    const spawnSpy = jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => makeChildMock());

    runner.spawnExecutor('main', 'baseline', '/tmp/test-out', { promise: false });
    const argsWithout = spawnSpy.mock.calls[0][1];
    expect(argsWithout).not.toContain('--promise');

    runner.spawnExecutor('v2', 'treatment', '/tmp/test-out2', { promise: true });
    const argsWith = spawnSpy.mock.calls[1][1];
    expect(argsWith).toContain('--promise');

    spawnSpy.mockRestore();
  });

  test('promiseTreatmentOnly defaults to false', () => {
    const runner = new ComparisonRunner({
      baseline: 'main', treatment: 'v2',
    });
    expect(runner.promiseTreatmentOnly).toBe(false);
  });
});
