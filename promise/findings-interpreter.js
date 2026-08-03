// findings-interpreter — dispatches a reviewer subagent (claude -p) to
// interpret deterministic findings from promise-engine + hooks, and emits
// a structured retry decision. Replaces the clean-prompt retry path that
// R15 measured as harmful (d=-1.37 quality regression).
//
// MT context: mt-executor calls review() when promise-engine emits broken
// findings. The reviewer is a single-shot claude -p invocation loaded with
// the review-deterministic-findings skill. Its JSON output drives whether
// mt-executor performs an informed retry.
//
// LIVE context: the orchestrator (main Claude) already has session context
// and handles findings natively. This module is MT-only — LIVE loads the
// same skill so the orchestrator's interpretation logic matches.

const path = require('path');
const fs = require('fs');
const { execFileSync, spawn } = require('child_process');
const { filterChildEnv } = require('../measurement/spawn-env');

const SKILL_PATH = path.join(__dirname, 'skills', 'review-deterministic-findings.md');
// PR #32 integration: when a turn's findings concern Java test files, route
// the reviewer to the qa-code-reviewer agent definition. qa-code-reviewer
// natively understands the deserialize-for-assertions and parameterize-
// repetitive-tests rules from PR #32 (and the carve-outs: Allure/logger
// diagnostics, response.raw().headers(), 204/304/empty-body). Routing here
// keeps that knowledge in a single source-of-truth (the agent file) rather
// than duplicating it inside a PT-v2-specific skill.
const QA_REVIEWER_PATH = path.join(__dirname, '..', 'agents', 'qa-code-reviewer.md');
// Single source of truth for the Java test-file regex. See
// promise/java-test-file-pattern.js for the canonical pattern + scope
// rationale (Maven/JUnit unit + IT + Tradu SIT). Pre-extraction this regex
// was triplicated across findings-interpreter, standing-promises, and
// registry.yaml — extracted per ryordanov-tradu NEW-4. The cross-check
// test in registry-loader.test.js pins the YAML literal to the JS constant.
const { JAVA_TEST_FILE_PATTERN, JAVA_TEST_FILE_REGEX, isJavaTestFile } = require('./java-test-file-pattern');

class FindingsInterpreter {
  constructor({ model = 'sonnet', timeoutMs = 120000, workDir = null } = {}) {
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.workDir = workDir || process.cwd();
    this._skillCache = null;
    this._qaSkillCache = null;
  }

  _loadSkill() {
    if (this._skillCache !== null) return this._skillCache;
    try {
      this._skillCache = fs.readFileSync(SKILL_PATH, 'utf8');
    } catch (err) {
      throw new Error(`findings-interpreter: cannot load skill at ${SKILL_PATH}: ${err.message}`);
    }
    return this._skillCache;
  }

  // PR #32 integration: load qa-code-reviewer agent body for test-file
  // reviews. If the file is missing (e.g. minimal install without the qa/*
  // surface), fall back silently to the generic skill — log only.
  _loadQaSkill() {
    if (this._qaSkillCache !== null) return this._qaSkillCache;
    try {
      this._qaSkillCache = fs.readFileSync(QA_REVIEWER_PATH, 'utf8');
    } catch (_) {
      this._qaSkillCache = false; // sentinel: tried and failed, don't retry
    }
    return this._qaSkillCache;
  }

  // Returns 'qa-code-reviewer' when any changed file looks like a Java test
  // file, else 'review-deterministic-findings'. Pure function; no I/O.
  _pickReviewerSkill({ files } = {}) {
    if (!Array.isArray(files) || files.length === 0) return 'review-deterministic-findings';
    return files.some(isJavaTestFile) ? 'qa-code-reviewer' : 'review-deterministic-findings';
  }

  _resolveClaudePath() {
    try {
      return execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
    } catch (_) {
      return 'claude';
    }
  }

  _buildPrompt({ task, agentOutput, findings, scenarioContext, files }) {
    const skillChoice = this._pickReviewerSkill({ files });
    let skillBody;
    let reviewerKind;
    if (skillChoice === 'qa-code-reviewer') {
      const qa = this._loadQaSkill();
      if (qa) {
        // qa-code-reviewer is an agent definition; append the structured
        // output contract from the generic skill so the LLM still emits
        // {action, feedback, reasoning} JSON the parser expects. Without
        // this header, qa-code-reviewer would emit its native review report
        // format which _parseDecision can't extract a decision from.
        skillBody = `${qa}\n\n---\n\n## Output contract for this dispatch\n\n${this._loadSkill()}`;
        reviewerKind = 'qa-code-reviewer';
      } else {
        skillBody = this._loadSkill();
        reviewerKind = 'review-deterministic-findings (fallback: qa-code-reviewer agent not found)';
      }
    } else {
      skillBody = this._loadSkill();
      reviewerKind = 'review-deterministic-findings';
    }
    const payload = {
      task,
      agent_output: agentOutput,
      findings,
      scenario_context: scenarioContext || null,
      reviewer_kind: reviewerKind,
      changed_files: Array.isArray(files) ? files : null,
    };
    return `${skillBody}\n\n---\n\n## Payload to review\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nEmit the JSON object now.`;
  }

  // Dispatch the reviewer subagent. Separate from review() so unit tests can
  // mock this seam without spawning real claude.
  async _dispatchReviewer(prompt) {
    return new Promise((resolve, reject) => {
      const claudePath = this._resolveClaudePath();
      const args = [
        '-p',
        '--model', this.model,
        '--output-format', 'json',
        '--dangerously-skip-permissions',
      ];

      const child = spawn(claudePath, args, {
        cwd: this.workDir,
        env: filterChildEnv(process.env),
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });

      const stdoutChunks = [];
      const stderrChunks = [];
      child.stdout.on('data', (d) => stdoutChunks.push(d));
      child.stderr.on('data', (d) => stderrChunks.push(d));

      // SIGTERM-then-SIGKILL escalation. A claude -p reviewer that ignores
      // SIGTERM (e.g. mid-tool-call, signal-trapped) would otherwise keep
      // burning Bedrock tokens after we've already rejected the promise.
      // Five seconds is enough for graceful shutdown on a healthy child;
      // anything beyond that is hung and warrants SIGKILL.
      let killTimer = null;
      const timer = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { child.kill('SIGTERM'); }
        killTimer = setTimeout(() => {
          try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
        }, 5000);
        reject(new Error(`reviewer timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const clearTimers = () => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
      };

      child.on('error', (err) => {
        clearTimers();
        reject(new Error(`reviewer spawn failed: ${err.message}`));
      });

      child.on('close', (code) => {
        clearTimers();
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        if (code !== 0 && !stdout) {
          const detail = stderr ? `\nstderr: ${stderr.slice(0, 500)}` : '';
          reject(new Error(`reviewer exited ${code}${detail}`));
          return;
        }
        resolve(stdout);
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  // Extract the inner text from claude -p --output-format json. The wrapper
  // shape is { result: "<text>", session_id, usage, ... }. Falls through to
  // raw stdout if the wrapper isn't present.
  _extractText(rawStdout) {
    try {
      const wrapper = JSON.parse(rawStdout);
      if (typeof wrapper.result === 'string') return wrapper.result;
      if (typeof wrapper.text === 'string') return wrapper.text;
    } catch (_) { /* fall through */ }
    return rawStdout;
  }

  // Parse the reviewer's JSON decision out of the response text. Handles
  // both bare JSON and JSON wrapped in markdown code fences. On any parse
  // failure, returns a conservative accept decision so a parser bug can't
  // trigger a retry storm.
  _parseDecision(text) {
    const candidates = [];
    // Try fenced ```json blocks first (most likely shape if the model is
    // following the skill's preferences).
    const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenced) candidates.push(fenced[1]);
    // Then the first top-level {} that mentions "action" — handles unfenced.
    const inline = text.match(/\{[^{}]*"action"[\s\S]*?\}/);
    if (inline) candidates.push(inline[0]);

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && (parsed.action === 'accept' || parsed.action === 'retry')) {
          const feedback = parsed.action === 'retry'
            ? (typeof parsed.feedback === 'string' && parsed.feedback.trim() !== '' ? parsed.feedback : null)
            : null;
          // Normalize {action:'retry', feedback:null} to accept. A retry with
          // no actionable feedback can't drive an informed re-attempt — the
          // implementer subagent would re-roll on the same prompt, which is
          // the clean-prompt resampling pattern R15 measured at d=-1.37. Treat
          // it as accept with a distinct parser tag so post-hoc analysis can
          // tell this case apart from a true accept.
          if (parsed.action === 'retry' && !feedback) {
            return {
              action: 'accept',
              feedback: null,
              reasoning: parsed.reasoning || 'retry-without-feedback: reviewer requested retry but provided no actionable feedback',
              parser: 'retry-without-feedback',
            };
          }
          return {
            action: parsed.action,
            feedback,
            reasoning: parsed.reasoning || null,
            parser: 'ok',
          };
        }
      } catch (_) { /* try next candidate */ }
    }

    return {
      action: 'accept',
      feedback: null,
      reasoning: 'parser-failure: no valid {action, feedback, reasoning} JSON found in reviewer output',
      parser: 'failed',
    };
  }

  // Main entry point. Returns { action, feedback, reasoning, parser,
  // reviewer_skill } where action ∈ {'accept', 'retry'}. On dispatch error,
  // returns accept (don't burn money retrying when the reviewer itself is
  // broken). `files` is optional; when present, drives reviewer-skill
  // selection (qa-code-reviewer for Java test files, generic otherwise).
  async review({ task, agentOutput, findings, scenarioContext, files }) {
    const reviewerSkill = this._pickReviewerSkill({ files });
    if (!Array.isArray(findings) || findings.length === 0) {
      return { action: 'accept', feedback: null, reasoning: 'no findings to review', parser: 'ok', reviewer_skill: reviewerSkill };
    }
    const prompt = this._buildPrompt({ task, agentOutput, findings, scenarioContext, files });
    let rawStdout;
    try {
      rawStdout = await this._dispatchReviewer(prompt);
    } catch (err) {
      return {
        action: 'accept',
        feedback: null,
        reasoning: `reviewer-dispatch-error: ${err.message}`,
        parser: 'dispatch-error',
        reviewer_skill: reviewerSkill,
      };
    }
    const text = this._extractText(rawStdout);
    const decision = this._parseDecision(text);
    return { ...decision, reviewer_skill: reviewerSkill };
  }
}

// Re-export isJavaTestFile + JAVA_TEST_FILE_PATTERN/REGEX from the new module
// for backward compatibility with existing import sites (tests, callers that
// already import from this file).
module.exports = { FindingsInterpreter, SKILL_PATH, QA_REVIEWER_PATH, isJavaTestFile, JAVA_TEST_FILE_PATTERN, JAVA_TEST_FILE_REGEX };
