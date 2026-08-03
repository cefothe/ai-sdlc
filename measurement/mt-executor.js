const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { loadAllScenarios } = require('./scenario-loader');
const { evaluateCheckpoints } = require('./checkpoint-runner');
const { SessionDriver } = require('./session-driver');
const { computeArtifactQuality, computeCorrectionSpeed, computeEfficiency, aggregateSessionScores, buildMtPairedScores, determineMtResult, aggregateContextDecomposition } = require('./mt-scoring');
const { ComparisonReport } = require('./comparison-report');

class MtExecutor {
  constructor({ baseline, treatment, runs = 5, baselineRuns = null, treatmentRuns = null, runStart = 1, concurrency = 2, model = 'sonnet', scenarioDir = null, outputDir = null, promiseEnabled = false, maxInformedRetries = 1, mcpConfig = null, scenarioFilter = null }) {
    if (!baseline) throw new Error('baseline is required');
    if (!treatment) throw new Error('treatment is required');
    this.baseline = baseline;
    this.treatment = treatment;
    this.runs = runs;
    // Per-arm run counts: default to `runs` for both. Asymmetric counts let
    // you reuse a fixed baseline while gathering more treatment data
    // (paired Wilcoxon will pair only runs that exist in both arms).
    this.baselineRuns = baselineRuns !== null ? baselineRuns : runs;
    this.treatmentRuns = treatmentRuns !== null ? treatmentRuns : runs;
    // Run numbering offset (1-indexed). CI matrix sharding splits N runs into
    // chunks; each chunk passes runStart so its session run numbers don't
    // collide with other chunks' (resume key = scenario+arm+run).
    if (!Number.isInteger(runStart) || runStart < 1) {
      throw new Error(`runStart must be a positive integer, got ${runStart}`);
    }
    this.runStart = runStart;
    this.concurrency = concurrency;
    this.model = model;
    this.repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    this.scenarioDir = scenarioDir || path.join(this.repoRoot, 'measurement', 'scenarios');
    this.outputDir = outputDir;
    this.mcpConfig = mcpConfig;
    this.aborted = false;
    this.promiseEnabled = promiseEnabled;
    // R16: max informed retries per turn. The retry path is no longer
    // clean-prompt resampling (R15 measured d=-1.37 quality regression);
    // it dispatches a reviewer subagent that decides whether to retry and
    // produces specific feedback for the implementer's next attempt.
    // 0 disables the retry path entirely (verifiers still run as telemetry).
    this.maxInformedRetries = maxInformedRetries;
    // Optional whitelist of scenario names (matches scenario.name from yaml).
    // Used by CI matrix sharding to run one scenario per job.
    this.scenarioFilter = Array.isArray(scenarioFilter) && scenarioFilter.length > 0 ? scenarioFilter : null;

    if (this.promiseEnabled) {
      const { PromiseEngine } = require('../promise/promise-engine');
      const { availablePromises } = require('../promise/registry-loader');
      const { FindingsInterpreter } = require('../promise/findings-interpreter');
      this.promiseEngine = new PromiseEngine({
        ledgerDir: path.join(this.repoRoot, '.promise-ledger'),
      });
      this._availablePromises = availablePromises;
      // R16: reviewer subagent for informed retry decisions. Lazy-spawns
      // claude -p only when broken findings emit AND retry budget remains.
      this.findingsInterpreter = new FindingsInterpreter({
        model: this.model,
        timeoutMs: 120000,
        workDir: this.repoRoot,
      });

      try {
        execFileSync('cxpak', ['--version'], { timeout: 5000, stdio: 'pipe' });
        this._cxpakAvailable = true;
      } catch (_) {
        this._cxpakAvailable = false;
      }
    }
  }

  buildSessionSpecs(scenarios) {
    const specs = [];
    for (const scenario of scenarios) {
      const armRuns = { baseline: this.baselineRuns, treatment: this.treatmentRuns };
      for (const arm of ['baseline', 'treatment']) {
        for (let run = this.runStart; run < this.runStart + armRuns[arm]; run++) {
          specs.push({
            id: `${scenario.name}-${arm}-run${run}-${crypto.randomBytes(4).toString('hex')}`,
            scenario,
            run,
            arm,
            ref: arm === 'baseline' ? this.baseline : this.treatment,
          });
        }
      }
    }
    return specs;
  }

  static resumeKey(scenario, arm, run) {
    return `${scenario}-${arm}-run${run}`;
  }

  isSessionComplete(spec, completedSet) {
    return completedSet.has(MtExecutor.resumeKey(spec.scenario.name, spec.arm, spec.run));
  }

  loadCompletedSessions(outputDir) {
    const resultsPath = path.join(outputDir, 'mt-results.jsonl');
    const completed = new Set();
    try {
      const content = fs.readFileSync(resultsPath, 'utf8');
      for (const line of content.trim().split('\n')) {
        if (!line) continue;
        const record = JSON.parse(line);
        if (record.status === 'complete') {
          completed.add(MtExecutor.resumeKey(record.scenario, record.arm, record.run));
        }
      }
    } catch (_) {}
    return completed;
  }

  async createWorktree(ref) {
    // Isolated git-init'd dir, NOT a git worktree of omnius. Framework code
    // (hooks, verifiers, cxpak server) is locked via switchGlobalConfig
    // (~/.claude swap), so the agent's working dir doesn't need omnius
    // checked out. Indexing only fixture files keeps cxpak focused (mini-api
    // is ~hundreds of tokens vs ~3.5M for omnius+fixture overlay).
    const sanitized = ref.replace(/[^a-zA-Z0-9_-]/g, '-');
    const suffix = crypto.randomBytes(4).toString('hex');
    const worktreePath = path.join(this.repoRoot, '..', `mt-${sanitized}-${suffix}`);
    fs.mkdirSync(worktreePath, { recursive: true });
    execFileSync('git', ['-C', worktreePath, 'init', '-q'], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-C', worktreePath, 'config', 'user.email', 'measurement@local'], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-C', worktreePath, 'config', 'user.name', 'mt-executor'], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-C', worktreePath, 'config', 'commit.gpgsign', 'false'], { encoding: 'utf8', stdio: 'pipe' });
    return worktreePath;
  }

  async removeWorktree(worktreePath) {
    try {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    } catch (_) {}
  }

  injectDefect(worktreePath, defect) {
    if (!defect) return;
    const wtResolved = path.resolve(worktreePath);
    // path.resolve(base, child) honors absolute child paths (replacing base),
    // which is exactly what we need to detect — both ../traversal and
    // /absolute targets can escape and must be refused (CWE-22).
    const filePath = path.resolve(worktreePath, defect.file);
    if (filePath !== wtResolved && !filePath.startsWith(wtResolved + path.sep)) {
      throw new Error(`defect.file escapes worktree: ${defect.file}`);
    }
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replaceAll(defect.original, defect.mutated);
    fs.writeFileSync(filePath, content, 'utf8');
  }

  copyFixture(worktreePath, fixtureRepo) {
    const repoResolved = path.resolve(this.repoRoot);
    const fixturePath = path.resolve(this.repoRoot, fixtureRepo);
    if (fixturePath !== repoResolved && !fixturePath.startsWith(repoResolved + path.sep)) {
      throw new Error(`fixture path escapes repo: ${fixtureRepo}`);
    }
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture not found at: ${fixturePath}`);
    }
    copyDirSync(fixturePath, worktreePath);
  }

  getModifiedFiles(worktreePath) {
    try {
      const output = execFileSync('git', ['-C', worktreePath, 'diff', '--name-only'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return output.trim().split('\n').filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  // Returns the unstaged diff of the agent's turn-N edits (vs the pre-turn-N
  // commit), or null when nothing has been modified. Mirrors what
  // hooks/stop-verify.js:156 does. Without this, observability-checker's
  // diff-eligible promotion (DIFF_ELIGIBLE: error-handling, resource-cleanup,
  // implementation-depth) silently misses in measurement runs — those three
  // verifiers stay perma-broken-low instead of broken-medium (or kept), per
  // ryordanov-tradu Finding 2 on PR #25.
  getDiffContent(worktreePath) {
    try {
      const output = execFileSync('git', ['-C', worktreePath, 'diff'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
      const trimmed = output.trim();
      return trimmed ? output : null;
    } catch (_) {
      return null;
    }
  }

  commitWorktreeState(worktreePath, label) {
    try {
      execFileSync('git', ['-C', worktreePath, 'add', '-A'], { encoding: 'utf8', stdio: 'pipe' });
      execFileSync('git', ['-C', worktreePath, 'commit', '--allow-empty', '-m', label], { encoding: 'utf8', stdio: 'pipe' });
    } catch (_) {}
  }

  resetToPreTurnState(worktreePath) {
    try {
      execFileSync('git', ['-C', worktreePath, 'reset', '--hard', 'HEAD~1'], { encoding: 'utf8', stdio: 'pipe' });
      execFileSync('git', ['-C', worktreePath, 'clean', '-fd'], { encoding: 'utf8', stdio: 'pipe' });
    } catch (_) {}
  }

  async runSession(spec) {
    const { scenario, arm, ref, run } = spec;
    let worktreePath = null;
    const turnResults = [];
    const promiseRecords = [];
    const trustScores = [];
    const turnToolUses = [];
    // R16: reviewer-subagent decisions per dispatch. Persisted as a flat
    // session-level array (not nested in turn_results) because per-turn
    // metadata attached to a JS array property (turn_results[idx]._promise
    // pattern) is silently dropped by JSON.stringify — own enumerable
    // properties on arrays don't survive serialization.
    const reviewerRecords = [];
    let totalGateRetries = 0;
    const startTime = Date.now();

    const isTreatmentWithPromise = arm === 'treatment' && this.promiseEnabled && this.promiseEngine;

    try {
      worktreePath = await this.createWorktree(ref);
      this.copyFixture(worktreePath, scenario.workspace_setup.repo);
      this.injectDefect(worktreePath, scenario.defect);
      this.commitWorktreeState(worktreePath, 'fixture-base');

      // 900s (15 min) per-turn timeout. Bumped from 600s after R16 smoke
      // (run 26163855796) showed data-migration treatment turn 3 hitting
      // the 600s cap when cxpak indexing + reviewer dispatch + heavy
      // implementation stacked. 15 min covers the observed tail without
      // letting a truly stuck turn drag the chunk indefinitely.
      const driver = new SessionDriver({ workDir: worktreePath, model: this.model, turnTimeout: 900000, mcpConfig: this.mcpConfig });
      try {
        await driver.start();

        for (let t = 0; t < scenario.turns.length; t++) {
          if (this.aborted) throw new Error('Session aborted');
          const turn = scenario.turns[t];
          let turnResult = {
            checkResults: [],
            promise_record: null,
            trust_after: null,
            gate_retried: false,
            reviewer_action: null,
            reviewer_feedback: null,
            reviewer_parser: null,
            reviewer_reasoning: null,
            reviewer_skill: null,
          };

          // R16: max attempts = 1 (initial) + maxInformedRetries.
          // The retry path goes through findings-interpreter, not clean-prompt
          // resampling. Pre-R16 (R15-and-earlier) this was a gate-retry loop
          // that forced an unconditional re-attempt on broken-promise findings;
          // R15 measured that pattern at d=-1.37 quality regression.
          const maxAttempts = isTreatmentWithPromise ? (1 + this.maxInformedRetries) : 1;
          let reviewerFeedback = null;
          // Aggregate tool uses across all attempts of this turn. Pre-fix,
          // the retry `continue` skipped the push at the end of the attempt
          // loop, so attempt-0 work was lost from telemetry and degenerate
          // detection could mis-classify retry sessions whose final attempt
          // happened to use zero tools. Now we accumulate per attempt and
          // push the union after the attempt loop exits.
          const attemptUses = [];

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (isTreatmentWithPromise) {
              this.commitWorktreeState(worktreePath, `pre-turn-${t}`);
            }

            console.log(`  [${arm}] ${scenario.name} run${run} turn${t + 1}/${scenario.turns.length}${attempt > 0 ? ` (informed-retry ${attempt})` : ''}`);
            const turnStart = Date.now();
            // Build the turn message. cxpak directive goes on the very first
            // turn; reviewer feedback (if any) appends on retries.
            let message = turn.message;
            if (this._cxpakAvailable && t === 0 && attempt === 0) {
              message = `Before implementing, call cxpak_auto_context with a one-line description of this task.\n\n${message}`;
            }
            if (attempt > 0 && reviewerFeedback) {
              message = `${message}\n\n---\n\n[Code review feedback on your previous attempt — address this on the retry]:\n${reviewerFeedback}\n[End of review feedback. Produce a corrected response that addresses the points above.]`;
            }
            const output = await driver.injectTurn(message);

            const turnUses = driver.getLastTurnToolUses();
            if (Array.isArray(turnUses) && turnUses.length > 0) {
              attemptUses.push(...turnUses);
            }

            if (isTreatmentWithPromise) {
              const modifiedFiles = this.getModifiedFiles(worktreePath);
              const diffContent = this.getDiffContent(worktreePath);
              const agentId = `${this.model}-mt-${scenario.name}`;
              const turnToolCalls = driver.getLastTurnToolCalls();
              const hasTrace = turnToolCalls.length > 0;
              const promises = this._availablePromises({ cxpak: this._cxpakAvailable, trace: hasTrace });
              const trace = turnUses.map(tu => ({
                ev: 'tool',
                name: tu.name,
                file_path: tu.input?.file_path,
              }));

              const record = await this.promiseEngine.evaluate({
                runId: `mt-${spec.id}-turn${t}-a${attempt}`,
                agentId,
                taskId: scenario.name,
                promises,
                output: output || '',
                context: {
                  files: modifiedFiles,
                  diff: diffContent,
                  elapsed_ms: Date.now() - turnStart,
                  cxpak: this._cxpakAvailable,
                  workDir: worktreePath,
                  trace,
                },
              });

              const brokenFindings = record.verification_results
                .filter(vr => vr.result === 'broken' && vr.confidence === 'high');
              const hasBroken = brokenFindings.length > 0;

              // Only dispatch reviewer if there are broken findings AND we
              // have retry budget remaining. The reviewer's decision drives
              // whether to retry (with its specific feedback) or accept.
              if (hasBroken && attempt < maxAttempts - 1) {
                const review = await this.findingsInterpreter.review({
                  task: turn.message,
                  agentOutput: output || '',
                  findings: brokenFindings,
                  scenarioContext: scenario.name,
                  // PR #32 integration: pass changed files so the interpreter
                  // can route to qa-code-reviewer when Java test files are
                  // touched. Telemetry records reviewer_skill so post-hoc
                  // analysis can correlate retry quality with reviewer choice.
                  files: modifiedFiles,
                });
                turnResult.reviewer_action = review.action;
                turnResult.reviewer_feedback = review.feedback;
                turnResult.reviewer_parser = review.parser;
                turnResult.reviewer_reasoning = review.reasoning;
                turnResult.reviewer_skill = review.reviewer_skill;
                // Persist a session-level record so the JSONL artifact
                // carries the full reviewer telemetry. Includes the broken
                // findings the reviewer saw so post-hoc analysis can verify
                // calibration (was the reviewer rejecting false-positives?
                // Accepting real issues?).
                reviewerRecords.push({
                  turn: t,
                  attempt,
                  action: review.action,
                  feedback: review.feedback,
                  parser: review.parser,
                  reasoning: review.reasoning,
                  reviewer_skill: review.reviewer_skill,
                  findings_count: brokenFindings.length,
                  findings_ids: brokenFindings.map(f => f.promise_id || f.id),
                });

                if (review.action === 'retry' && review.feedback) {
                  reviewerFeedback = review.feedback;
                  totalGateRetries++;
                  this.resetToPreTurnState(worktreePath);
                  // Record this attempt for telemetry; next iteration produces
                  // the corrected attempt that replaces it.
                  promiseRecords.push(record);
                  continue;
                }
                // action === 'accept' OR retry without feedback → fall through
                // and accept this attempt's result.
              }

              turnResult.promise_record = record;
              turnResult.trust_after = record.trust_score_after;
              turnResult.gate_retried = attempt > 0;
              promiseRecords.push(record);
              trustScores.push(record.trust_score_after);
            }

            const checkResults = await evaluateCheckpoints(turn.checkpoint || [], worktreePath);
            turnResult.checkResults = checkResults;
            break;
          }

          // Push the union of all attempts' tool uses for this turn so
          // degenerate detection and context decomposition see the full
          // picture (not just the accepted attempt). Empty array is fine —
          // it preserves the "this turn ran" signal even if zero tools fired.
          turnToolUses.push(attemptUses);

          turnResults.push(turnResult.checkResults);

          if (isTreatmentWithPromise) {
            const idx = turnResults.length - 1;
            if (!turnResults[idx]._promise) {
              turnResults[idx] = turnResult.checkResults;
              turnResults[idx]._promise = {
                record: turnResult.promise_record,
                trust_after: turnResult.trust_after,
                gate_retried: turnResult.gate_retried,
                reviewer_action: turnResult.reviewer_action,
                reviewer_feedback: turnResult.reviewer_feedback,
                reviewer_parser: turnResult.reviewer_parser,
                reviewer_reasoning: turnResult.reviewer_reasoning,
                reviewer_skill: turnResult.reviewer_skill,
              };
            }
          }
        }
      } finally {
        await driver.stop();
      }

      const duration_ms = Date.now() - startTime;
      const artifact_quality = computeArtifactQuality(turnResults);
      const correction_speed = computeCorrectionSpeed(turnResults);
      const total_tokens = driver.getTotalTokens();
      const efficiency = computeEfficiency(total_tokens || 1, artifact_quality);

      // Zero-tool-use detection. If the agent ran every turn but produced
      // no tool calls in any of them, it didn't actually do work — quality
      // is artificially 0 because checkpoints look for files/patterns the
      // agent never created. Marking status='degenerate' lets the aggregate
      // analysis exclude these from quality averages without losing the
      // session's tokens/timing data for diagnostics. Smoke run 26163855796
      // surfaced one such session on data-migration treatment.
      const totalToolUses = turnToolUses.reduce((sum, uses) => sum + (Array.isArray(uses) ? uses.length : 0), 0);
      const isDegenerate = turnToolUses.length > 0 && totalToolUses === 0;

      const result = {
        session_id: spec.id,
        scenario: scenario.name,
        arm,
        ref,
        run,
        status: isDegenerate ? 'degenerate' : 'complete',
        degenerate_reason: isDegenerate ? 'zero-tool-uses-across-all-turns' : null,
        duration_ms,
        artifact_quality,
        correction_speed,
        total_tokens,
        efficiency,
        turn_tool_uses: turnToolUses,
        turn_results: turnResults,
        timestamp: new Date().toISOString(),
      };

      if (isTreatmentWithPromise) {
        result.promise_verification = promiseRecords;
        result.trust_trajectory = trustScores;
        result.gate_retries_used = totalGateRetries;
        // R16: explicit session-level reviewer telemetry. Survives JSONL
        // serialization (unlike the historical turn_results[idx]._promise
        // attachment which was lost as a non-array property).
        result.reviewer_records = reviewerRecords;
      }

      return result;
    } catch (err) {
      return {
        session_id: spec.id,
        scenario: scenario.name,
        arm,
        ref,
        run,
        status: 'error',
        error: err.message,
        duration_ms: Date.now() - startTime,
        artifact_quality: 0,
        correction_speed: 0,
        total_tokens: 0,
        efficiency: Infinity,
        turn_results: turnResults,
        timestamp: new Date().toISOString(),
      };
    } finally {
      if (worktreePath) {
        await this.removeWorktree(worktreePath);
      }
    }
  }

  writeResult(outputDir, record) {
    const resultsPath = path.join(outputDir, 'mt-results.jsonl');
    const line = JSON.stringify(record) + '\n';
    try {
      fs.appendFileSync(resultsPath, line, 'utf8');
    } catch (err) {
      if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')) {
        try { execFileSync('sleep', ['1'], { stdio: 'ignore' }); } catch (_) {}
        fs.appendFileSync(resultsPath, line, 'utf8');
      } else {
        throw err;
      }
    }
  }

  switchGlobalConfig(ref) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const globalClaudeDir = path.join(homeDir, '.claude');
    try {
      const remote = execFileSync('git', ['-C', globalClaudeDir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
      if (!remote.includes('ai-sdlc')) {
        console.warn(`  [global] ~/.claude is not an ai-sdlc clone (remote: ${remote}). Skipping global config switch — measurement will use whatever is currently checked out in ~/.claude. Reproducing R-runs outside the author's environment requires cloning ai-sdlc to ~/.claude.`);
        return null;
      }
    } catch (err) {
      console.warn(`  [global] ~/.claude is not a git repository (${err.message}). Skipping global config switch — measurement will use whatever is currently in ~/.claude. Reproducing R-runs outside the author's environment requires cloning ai-sdlc to ~/.claude.`);
      return null;
    }
    const previousRef = execFileSync('git', ['-C', globalClaudeDir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    console.log(`  [global] switching ~/.claude to ${ref}`);
    execFileSync('git', ['-C', globalClaudeDir, 'checkout', ref], { encoding: 'utf8', stdio: 'pipe' });
    try { execFileSync('sleep', ['3'], { stdio: 'ignore' }); } catch (_) {}
    return previousRef;
  }

  async run() {
    let scenarios = loadAllScenarios(this.scenarioDir);
    if (this.scenarioFilter && this.scenarioFilter.length > 0) {
      const allowed = new Set(this.scenarioFilter);
      const filtered = scenarios.filter(s => allowed.has(s.name));
      const skipped = scenarios.filter(s => !allowed.has(s.name)).map(s => s.name);
      if (filtered.length === 0) {
        throw new Error(`scenario filter matched nothing. requested=${[...allowed].join(',')} available=${scenarios.map(s => s.name).join(',')}`);
      }
      if (skipped.length > 0) {
        console.log(`Scenario filter: ${filtered.map(s => s.name).join(',')} (skipping ${skipped.join(',')})`);
      }
      scenarios = filtered;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const outputDir = this.outputDir || path.join(this.repoRoot, 'measurement', 'results', `mt-compare-${timestamp}`);
    fs.mkdirSync(outputDir, { recursive: true });

    const specs = this.buildSessionSpecs(scenarios);
    const completed = this.loadCompletedSessions(outputDir);

    const pending = specs.filter(s => !this.isSessionComplete(s, completed));
    const baselinePending = pending.filter(s => s.arm === 'baseline');
    const treatmentPending = pending.filter(s => s.arm === 'treatment');
    console.log(`Multi-turn measurement: ${this.baseline} vs ${this.treatment}`);
    console.log(`Scenarios: ${scenarios.length}, Runs: ${this.runs}, Concurrency: ${this.concurrency}`);
    console.log(`Total sessions: ${specs.length}, Completed: ${completed.size}, Pending: ${pending.length}`);
    console.log(`Baseline pending: ${baselinePending.length}, Treatment pending: ${treatmentPending.length}`);
    console.log(`Output: ${outputDir}\n`);

    const handleAbort = () => {
      console.log('\nGraceful shutdown requested...');
      this.aborted = true;
    };
    process.on('SIGINT', handleAbort);

    // SIGTERM diagnostic: previous CI smoke runs were killed with exit
    // code 143 at varying mid-flight points with no observable cause
    // (no OOM, no cancellation event, well under all configured
    // timeouts). Log loudly when SIGTERM arrives so the next death
    // identifies node as the direct target (vs bash dying first and
    // taking node down with it).
    process.on('SIGTERM', () => {
      const stamp = new Date().toISOString();
      try {
        process.stdout.write(`\n=== mt-executor received SIGTERM @ ${stamp} ===\n`);
        process.stdout.write(`pid=${process.pid} ppid=${process.ppid}\n`);
        process.stdout.write(`uptime_s=${Math.round(process.uptime())}\n`);
        process.stdout.write(`rss_mb=${Math.round(process.memoryUsage().rss / 1024 / 1024)}\n`);
      } catch (_) { /* drained */ }
      process.exit(143);
    });

    const semaphore = { current: 0, max: this.concurrency };
    const results = [];

    const runWithSemaphore = async (spec) => {
      while (semaphore.current >= semaphore.max) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (this.aborted) return null;
      semaphore.current++;
      try {
        const result = await this.runSession(spec);
        this.writeResult(outputDir, result);
        results.push(result);
        return result;
      } finally {
        semaphore.current--;
      }
    };

    let originalGlobalRef = null;
    try {
      if (baselinePending.length > 0) {
        originalGlobalRef = this.switchGlobalConfig(this.baseline);
        console.log(`--- Running ${baselinePending.length} baseline sessions ---`);
        await Promise.all(baselinePending.map(spec => runWithSemaphore(spec)));
      }

      if (!this.aborted && treatmentPending.length > 0) {
        const prev = this.switchGlobalConfig(this.treatment);
        if (originalGlobalRef === null) originalGlobalRef = prev;
        console.log(`\n--- Running ${treatmentPending.length} treatment sessions ---`);
        await Promise.all(treatmentPending.map(spec => runWithSemaphore(spec)));
      }
    } finally {
      if (originalGlobalRef) {
        this.switchGlobalConfig(originalGlobalRef);
      }
    }

    process.removeListener('SIGINT', handleAbort);

    if (this.aborted) {
      console.log(`\nAborted. ${results.length} sessions completed. Resume with same command.`);
      return { outputDir, partial: true };
    }

    const allResults = [...this.loadAllResults(outputDir)];
    return this.generateReport(allResults, scenarios, outputDir);
  }

  loadAllResults(outputDir) {
    const resultsPath = path.join(outputDir, 'mt-results.jsonl');
    const results = [];
    try {
      const content = fs.readFileSync(resultsPath, 'utf8');
      for (const line of content.trim().split('\n')) {
        if (!line) continue;
        results.push(JSON.parse(line));
      }
    } catch (_) {}
    return results;
  }

  computePromiseStats(treatmentResults) {
    const withPromise = treatmentResults.filter(r => Array.isArray(r.promise_verification) && r.promise_verification.length > 0);
    if (withPromise.length === 0) return null;

    let totalTurns = 0;
    let compliantTurns = 0;
    let totalRetries = 0;
    const trustTrajectories = {};

    for (const session of withPromise) {
      const records = session.promise_verification;
      totalRetries += session.gate_retries_used || 0;

      for (const record of records) {
        totalTurns++;
        const highBroken = record.verification_results
          .filter(vr => vr.result === 'broken' && vr.confidence === 'high')
          .length;
        if (highBroken === 0) compliantTurns++;
      }

      if (Array.isArray(session.trust_trajectory) && session.trust_trajectory.length > 0) {
        const scenario = session.scenario;
        if (!trustTrajectories[scenario]) trustTrajectories[scenario] = [];
        trustTrajectories[scenario].push(session.trust_trajectory);
      }
    }

    const perScenarioTrust = {};
    for (const [scenario, trajectories] of Object.entries(trustTrajectories)) {
      const finalScores = trajectories.map(t => t[t.length - 1]);
      perScenarioTrust[scenario] = {
        mean_final_trust: finalScores.length > 0 ? ComparisonReport.mean(finalScores) : null,
        session_count: trajectories.length,
      };
    }

    return {
      total_turns: totalTurns,
      compliant_turns: compliantTurns,
      compliance_rate: totalTurns > 0 ? compliantTurns / totalTurns : 0,
      total_retries: totalRetries,
      retry_rate: totalTurns > 0 ? totalRetries / totalTurns : 0,
      per_scenario_trust: perScenarioTrust,
    };
  }

  generateReport(results, scenarios, outputDir) {
    const baselineResults = results.filter(r => r.arm === 'baseline' && r.status === 'complete');
    const treatmentResults = results.filter(r => r.arm === 'treatment' && r.status === 'complete');

    const baselinePerRun = aggregateSessionScores(baselineResults);
    const treatmentPerRun = aggregateSessionScores(treatmentResults);

    const pairs = buildMtPairedScores(baselinePerRun, treatmentPerRun);

    const comparison = { quality: {}, efficiency: {}, correction: {} };

    if (pairs.quality.baseline.length >= 5) {
      // Quality: higher is better. Positive d / 'promise_better' = treatment higher quality.
      comparison.quality.wilcoxon = ComparisonReport.wilcoxonSignedRank(pairs.quality.baseline, pairs.quality.treatment);
      comparison.quality.cohens_d = ComparisonReport.cohensD(pairs.quality.baseline, pairs.quality.treatment);
      // Efficiency: tokens per quality — LOWER is better. Flip args so positive d /
      // 'promise_better' consistently means "treatment better on this metric".
      comparison.efficiency.wilcoxon = ComparisonReport.wilcoxonSignedRank(pairs.efficiency.treatment, pairs.efficiency.baseline);
      comparison.efficiency.cohens_d = ComparisonReport.cohensD(pairs.efficiency.treatment, pairs.efficiency.baseline);
    } else {
      comparison.quality.wilcoxon = { direction: 'insufficient_data', statistic: null, n: pairs.quality.baseline.length };
      comparison.quality.cohens_d = null;
      comparison.efficiency.wilcoxon = { direction: 'insufficient_data', statistic: null, n: pairs.efficiency.baseline.length };
      comparison.efficiency.cohens_d = null;
    }

    if (pairs.correction.baseline.length >= 5) {
      comparison.correction.wilcoxon = ComparisonReport.wilcoxonSignedRank(pairs.correction.baseline, pairs.correction.treatment);
      comparison.correction.cohens_d = ComparisonReport.cohensD(pairs.correction.baseline, pairs.correction.treatment);
    } else {
      comparison.correction.wilcoxon = { direction: 'insufficient_data', statistic: null, n: pairs.correction.baseline.length };
      comparison.correction.cohens_d = null;
    }

    const promiseStats = this.promiseEnabled ? this.computePromiseStats(treatmentResults) : null;
    const result = determineMtResult(comparison, promiseStats);

    const report = this.buildMarkdownReport(comparison, result, baselineResults, treatmentResults, scenarios, promiseStats);
    fs.writeFileSync(path.join(outputDir, 'report.md'), report, 'utf8');

    const summary = {
      comparison,
      result,
      baseline_sessions: baselineResults.length,
      treatment_sessions: treatmentResults.length,
    };
    if (promiseStats) summary.promise_stats = promiseStats;
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

    console.log(`\nVerdict: ${result.verdict}`);
    for (const reason of result.reasons) console.log(`  ${reason}`);
    if (promiseStats) {
      console.log(`  Promise compliance: ${(promiseStats.compliance_rate * 100).toFixed(1)}% (${promiseStats.compliant_turns}/${promiseStats.total_turns} turns)`);
      console.log(`  Gate retries: ${promiseStats.total_retries}`);
    }
    console.log(`\nReport: ${path.join(outputDir, 'report.md')}`);

    return { outputDir, comparison, result, promiseStats, partial: false };
  }

  buildMarkdownReport(comparison, result, baselineResults, treatmentResults, scenarios, promiseStats) {
    let md = `# Multi-Turn Comparison Report: ${this.baseline} vs ${this.treatment}\n\n`;

    md += '## Summary\n\n';
    md += '| Metric | Baseline | Treatment | Delta |\n';
    md += '|--------|----------|-----------|-------|\n';

    const bqMean = ComparisonReport.mean(baselineResults.map(r => r.artifact_quality));
    const tqMean = ComparisonReport.mean(treatmentResults.map(r => r.artifact_quality));
    md += `| Artifact Quality | ${bqMean.toFixed(3)} | ${tqMean.toFixed(3)} | ${(tqMean - bqMean >= 0 ? '+' : '')}${(tqMean - bqMean).toFixed(3)} |\n`;

    const btMean = ComparisonReport.mean(baselineResults.map(r => r.total_tokens));
    const ttMean = ComparisonReport.mean(treatmentResults.map(r => r.total_tokens));
    md += `| Total Tokens | ${btMean.toFixed(0)} | ${ttMean.toFixed(0)} | ${(ttMean - btMean >= 0 ? '+' : '')}${(ttMean - btMean).toFixed(0)} |\n`;

    const bcs = baselineResults.map(r => r.correction_speed).filter(v => v !== null && v !== 0);
    const tcs = treatmentResults.map(r => r.correction_speed).filter(v => v !== null && v !== 0);
    if (bcs.length > 0 && tcs.length > 0) {
      const bcsMean = ComparisonReport.mean(bcs);
      const tcsMean = ComparisonReport.mean(tcs);
      md += `| Correction Speed | ${bcsMean.toFixed(3)} | ${tcsMean.toFixed(3)} | ${(tcsMean - bcsMean >= 0 ? '+' : '')}${(tcsMean - bcsMean).toFixed(3)} |\n`;
    }

    md += '\n## Statistical Tests\n\n';
    md += '_Cohen\'s d is signed: positive = treatment better on this metric. Wilcoxon `direction: promise_better` = treatment better; `baseline_better` = baseline better; threshold p ≤ 0.05 (two-tailed)._\n\n';
    for (const dim of ['quality', 'efficiency', 'correction']) {
      const c = comparison[dim];
      md += `### ${dim.charAt(0).toUpperCase() + dim.slice(1)}\n`;
      md += `- Wilcoxon direction: ${c.wilcoxon.direction}\n`;
      if (c.wilcoxon.statistic !== null) md += `- W statistic: ${c.wilcoxon.statistic}\n`;
      md += `- n: ${c.wilcoxon.n}\n`;
      if (c.wilcoxon.p_value !== undefined && c.wilcoxon.p_value !== null) {
        md += `- p-value (two-tailed): ${c.wilcoxon.p_value.toFixed(4)}\n`;
      }
      if (c.cohens_d !== null) md += `- Cohen's d (signed): ${c.cohens_d.toFixed(3)}\n`;
      md += '\n';
    }

    const baselineCtx = aggregateContextDecomposition(baselineResults);
    const treatmentCtx = aggregateContextDecomposition(treatmentResults);
    if (baselineCtx || treatmentCtx) {
      md += '## Context Acquisition Decomposition\n\n';
      md += 'Mean per session. `chars` is tool-result content size (≈4 chars/token); attribution is by tool category, not API token usage.\n\n';
      md += '| Category | Baseline | Treatment | Delta |\n';
      md += '|----------|----------|-----------|-------|\n';
      const fmt = (v) => v == null ? 'N/A' : Math.round(v).toLocaleString();
      const delta = (b, t) => (b == null || t == null) ? '—' : `${(t - b) >= 0 ? '+' : ''}${Math.round(t - b).toLocaleString()}`;
      const ctxBase = baselineCtx || {};
      const ctxTrt = treatmentCtx || {};
      md += `| Context calls | ${fmt(ctxBase.mean_context_calls)} | ${fmt(ctxTrt.mean_context_calls)} | ${delta(ctxBase.mean_context_calls, ctxTrt.mean_context_calls)} |\n`;
      md += `| — cxpak calls | ${fmt(ctxBase.mean_cxpak_calls)} | ${fmt(ctxTrt.mean_cxpak_calls)} | ${delta(ctxBase.mean_cxpak_calls, ctxTrt.mean_cxpak_calls)} |\n`;
      md += `| — unstructured calls (Read/Grep/Glob/Bash-search) | ${fmt(ctxBase.mean_unstructured_context_calls)} | ${fmt(ctxTrt.mean_unstructured_context_calls)} | ${delta(ctxBase.mean_unstructured_context_calls, ctxTrt.mean_unstructured_context_calls)} |\n`;
      md += `| Context chars | ${fmt(ctxBase.mean_context_chars)} | ${fmt(ctxTrt.mean_context_chars)} | ${delta(ctxBase.mean_context_chars, ctxTrt.mean_context_chars)} |\n`;
      md += `| — cxpak chars | ${fmt(ctxBase.mean_cxpak_chars)} | ${fmt(ctxTrt.mean_cxpak_chars)} | ${delta(ctxBase.mean_cxpak_chars, ctxTrt.mean_cxpak_chars)} |\n`;
      md += `| — unstructured chars | ${fmt(ctxBase.mean_unstructured_context_chars)} | ${fmt(ctxTrt.mean_unstructured_context_chars)} | ${delta(ctxBase.mean_unstructured_context_chars, ctxTrt.mean_unstructured_context_chars)} |\n`;
      md += `| Implementation calls | ${fmt(ctxBase.mean_implementation_calls)} | ${fmt(ctxTrt.mean_implementation_calls)} | ${delta(ctxBase.mean_implementation_calls, ctxTrt.mean_implementation_calls)} |\n`;
      md += `| Implementation chars | ${fmt(ctxBase.mean_implementation_chars)} | ${fmt(ctxTrt.mean_implementation_chars)} | ${delta(ctxBase.mean_implementation_chars, ctxTrt.mean_implementation_chars)} |\n`;
      md += '\n';
    }

    if (promiseStats) {
      md += '## Promise Theory Verification\n\n';
      md += '| Metric | Value |\n';
      md += '|--------|-------|\n';
      md += `| Compliance Rate | ${(promiseStats.compliance_rate * 100).toFixed(1)}% (${promiseStats.compliant_turns}/${promiseStats.total_turns}) |\n`;
      md += `| Gate Retries | ${promiseStats.total_retries} |\n`;
      md += `| Retry Rate | ${(promiseStats.retry_rate * 100).toFixed(1)}% |\n`;
      md += '\n';

      if (Object.keys(promiseStats.per_scenario_trust).length > 0) {
        md += '### Trust Trajectory (per scenario)\n\n';
        md += '| Scenario | Mean Final Trust | Sessions |\n';
        md += '|----------|-----------------|----------|\n';
        for (const [scenario, data] of Object.entries(promiseStats.per_scenario_trust)) {
          const trustStr = data.mean_final_trust !== null ? data.mean_final_trust.toFixed(3) : 'N/A';
          md += `| ${scenario} | ${trustStr} | ${data.session_count} |\n`;
        }
        md += '\n';
      }
    }

    md += '## Per-Scenario Breakdown\n\n';
    for (const sc of scenarios) {
      md += `### ${sc.name}\n\n`;
      const bSessions = baselineResults.filter(r => r.scenario === sc.name);
      const tSessions = treatmentResults.filter(r => r.scenario === sc.name);
      md += `| Metric | Baseline (n=${bSessions.length}) | Treatment (n=${tSessions.length}) |\n`;
      md += '|--------|----------|----------|\n';
      if (bSessions.length > 0 && tSessions.length > 0) {
        md += `| Quality | ${ComparisonReport.mean(bSessions.map(r => r.artifact_quality)).toFixed(3)} | ${ComparisonReport.mean(tSessions.map(r => r.artifact_quality)).toFixed(3)} |\n`;
        md += `| Tokens | ${ComparisonReport.mean(bSessions.map(r => r.total_tokens)).toFixed(0)} | ${ComparisonReport.mean(tSessions.map(r => r.total_tokens)).toFixed(0)} |\n`;
      }
      md += '\n';
    }

    md += `## Verdict\n\n**${result.verdict}**\n\n`;
    for (const reason of result.reasons) md += `- ${reason}\n`;
    md += '\n';

    md += '## Configuration\n\n';
    md += `- Baseline: ${this.baseline}\n`;
    md += `- Treatment: ${this.treatment}\n`;
    md += `- Runs: ${this.runs}\n`;
    md += `- Model: ${this.model}\n`;
    md += `- Scenarios: ${scenarios.map(s => s.name).join(', ')}\n`;
    md += `- Concurrency: ${this.concurrency}\n`;
    if (this.promiseEnabled) {
      md += `- Promise verification: enabled (R16 informed-retry path)\n`;
      md += `- Max informed retries per turn: ${this.maxInformedRetries}\n`;
    }

    return md;
  }
}

function copyDirSync(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = { MtExecutor };

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name, fallback) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
  };

  const promiseEnabled = args.includes('--promise');
  // R16: --max-informed-retries is the new name. --gate-retries is accepted
  // as an alias for backward compat with prior CI dispatches; semantics
  // shift from clean-prompt retries to informed retries.
  const maxInformedRetries = parseInt(
    getArg('max-informed-retries', getArg('gate-retries', '1')),
    10,
  );
  const mcpConfig = getArg('mcp-config', null);
  const scenariosArg = getArg('scenarios', null);
  const scenarioFilter = scenariosArg
    ? scenariosArg.split(',').map(s => s.trim()).filter(Boolean)
    : null;
  const analyzeOnly = getArg('analyze-only', null);

  // --analyze-only <jsonl-path>: skip running sessions, just read the
  // combined mt-results.jsonl and produce report.md + summary.json from
  // the existing data. Used by CI's aggregate job to compute the full
  // statistical verdict across all matrix shards.
  if (analyzeOnly) {
    const outputDir = getArg('output-dir', null);
    if (!outputDir) {
      console.error('--analyze-only requires --output-dir');
      process.exit(2);
    }
    let records;
    try {
      records = fs.readFileSync(analyzeOnly, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (err) {
      console.error(`Fatal: failed to read ${analyzeOnly}: ${err.message}`);
      process.exit(2);
    }
    // Detect promise-mode from the data, not the CLI: if any treatment
    // record carries promise_verification, promise was enabled.
    const detectedPromise = records.some(r => r.arm === 'treatment' && r.promise_verification);
    fs.mkdirSync(outputDir, { recursive: true });
    const executor = new MtExecutor({
      baseline: getArg('baseline', 'main'),
      treatment: getArg('treatment', 'promise-theory-v2'),
      runs: 1,
      scenarioDir: getArg('scenario-dir', null),
      outputDir,
      promiseEnabled: detectedPromise,
      maxInformedRetries,
    });
    const scenarios = loadAllScenarios(executor.scenarioDir);
    try {
      const { result } = executor.generateReport(records, scenarios, outputDir);
      console.log(`Analysis written to ${outputDir}/report.md and ${outputDir}/summary.json`);
      console.log(`Records analysed: ${records.length}, promise mode: ${detectedPromise}`);
      process.exit(result && !result.passed ? 1 : 0);
    } catch (err) {
      console.error(`Fatal: analysis failed: ${err.message}`);
      process.exit(2);
    }
  }

  const executor = new MtExecutor({
    baseline: getArg('baseline', 'main'),
    treatment: getArg('treatment', 'promise-theory-v2'),
    runs: parseInt(getArg('runs', '5'), 10),
    baselineRuns: getArg('baseline-runs', null) !== null ? parseInt(getArg('baseline-runs'), 10) : null,
    treatmentRuns: getArg('treatment-runs', null) !== null ? parseInt(getArg('treatment-runs'), 10) : null,
    runStart: parseInt(getArg('run-start', '1'), 10),
    concurrency: parseInt(getArg('concurrency', '2'), 10),
    model: getArg('model', 'sonnet'),
    scenarioDir: getArg('scenario-dir', null),
    outputDir: getArg('output-dir', null),
    promiseEnabled,
    maxInformedRetries,
    mcpConfig,
    scenarioFilter,
  });

  executor.run().then(({ result, partial }) => {
    if (partial) process.exit(3);
    process.exit(result && !result.passed ? 1 : 0);
  }).catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(2);
  });
}
