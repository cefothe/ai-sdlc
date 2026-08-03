const path = require('path');
const fs = require('fs');
const os = require('os');
const { FindingsInterpreter, SKILL_PATH, QA_REVIEWER_PATH, isJavaTestFile } = require('../../../promise/findings-interpreter');

describe('FindingsInterpreter', () => {
  describe('skill loading', () => {
    test('skill file exists at expected path', () => {
      expect(fs.existsSync(SKILL_PATH)).toBe(true);
    });

    test('skill content is non-trivial and includes the JSON shape', () => {
      const content = fs.readFileSync(SKILL_PATH, 'utf8');
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('"action"');
      expect(content).toContain('accept');
      expect(content).toContain('retry');
    });

    test('_loadSkill caches the file read', () => {
      const interp = new FindingsInterpreter();
      const first = interp._loadSkill();
      const second = interp._loadSkill();
      expect(first).toBe(second); // same string reference (cached)
    });

    test('_loadSkill throws with clear message if file is missing', () => {
      const interp = new FindingsInterpreter();
      // Swap the path by mutating the cache to null and patching fs read.
      interp._skillCache = null;
      const orig = fs.readFileSync;
      fs.readFileSync = (p, enc) => {
        if (p === SKILL_PATH) throw new Error('ENOENT');
        return orig(p, enc);
      };
      try {
        expect(() => interp._loadSkill()).toThrow(/cannot load skill/);
      } finally {
        fs.readFileSync = orig;
      }
    });
  });

  describe('_buildPrompt', () => {
    test('includes skill content + payload as fenced JSON', () => {
      const interp = new FindingsInterpreter();
      const prompt = interp._buildPrompt({
        task: 'Refactor auth middleware',
        agentOutput: 'function authMiddleware() { ... }',
        findings: [{ id: 'error-handling', result: 'broken', confidence: 'high', evidence: 'no try/catch' }],
        scenarioContext: 'cross-module-auth-refactor',
      });
      expect(prompt).toContain('review-deterministic-findings');
      expect(prompt).toContain('```json');
      expect(prompt).toContain('"task":');
      expect(prompt).toContain('Refactor auth middleware');
      expect(prompt).toContain('error-handling');
      expect(prompt).toContain('cross-module-auth-refactor');
    });

    test('handles null scenarioContext gracefully', () => {
      const interp = new FindingsInterpreter();
      const prompt = interp._buildPrompt({
        task: 'task',
        agentOutput: 'output',
        findings: [{ id: 'x', result: 'broken' }],
        scenarioContext: null,
      });
      expect(prompt).toContain('"scenario_context": null');
    });
  });

  describe('_extractText', () => {
    test('extracts .result field from claude -p JSON wrapper', () => {
      const interp = new FindingsInterpreter();
      const wrapped = JSON.stringify({ result: 'the inner text', session_id: 'abc', usage: {} });
      expect(interp._extractText(wrapped)).toBe('the inner text');
    });

    test('falls back to raw stdout if wrapper is malformed', () => {
      const interp = new FindingsInterpreter();
      const raw = 'not json at all';
      expect(interp._extractText(raw)).toBe(raw);
    });

    test('falls back to raw if wrapper exists but lacks result/text fields', () => {
      const interp = new FindingsInterpreter();
      const wrapped = JSON.stringify({ session_id: 'x', usage: {} });
      expect(interp._extractText(wrapped)).toBe(wrapped);
    });
  });

  describe('_parseDecision', () => {
    let interp;
    beforeEach(() => { interp = new FindingsInterpreter(); });

    test('parses bare JSON with accept action', () => {
      const text = '{"action":"accept","feedback":null,"reasoning":"all findings false-positive"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.feedback).toBe(null);
      expect(result.reasoning).toBe('all findings false-positive');
      expect(result.parser).toBe('ok');
    });

    test('parses bare JSON with retry action and feedback', () => {
      const text = '{"action":"retry","feedback":"add try/catch at line 14","reasoning":"missing error handling"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('retry');
      expect(result.feedback).toBe('add try/catch at line 14');
    });

    test('parses fenced ```json block', () => {
      const text = 'Here is my decision:\n```json\n{"action":"retry","feedback":"fix dead code at lines 23-25","reasoning":"dead code"}\n```\n';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('retry');
      expect(result.feedback).toBe('fix dead code at lines 23-25');
    });

    test('parses unfenced JSON surrounded by prose', () => {
      const text = 'Looking at the findings, my assessment is: {"action":"accept","feedback":null,"reasoning":"stylistic only"}.';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
    });

    test('forces null feedback when action is accept (even if reviewer included one)', () => {
      const text = '{"action":"accept","feedback":"should not appear","reasoning":"x"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.feedback).toBe(null);
    });

    test('normalizes {action:"retry", feedback:null} to accept with parser tag', () => {
      // Post-ryordanov-audit fix: a retry without actionable feedback can't
      // drive an informed re-attempt — the implementer would re-roll on the
      // same prompt, which is the clean-prompt-resampling pattern R15
      // measured at d=-1.37 quality regression. Normalize at parse time so
      // mt-executor doesn't end up with the ambiguous {reviewer_action:
      // 'retry', gate_retried: false} telemetry that's hard to interpret
      // post-hoc.
      const text = '{"action":"retry","feedback":null,"reasoning":"unclear"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.feedback).toBe(null);
      expect(result.parser).toBe('retry-without-feedback');
      expect(result.reasoning).toBe('unclear');
    });

    test('normalizes {action:"retry", feedback:""} (empty string) to accept', () => {
      const text = '{"action":"retry","feedback":"","reasoning":"x"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('retry-without-feedback');
    });

    test('normalizes {action:"retry", feedback:"   "} (whitespace) to accept', () => {
      const text = '{"action":"retry","feedback":"   ","reasoning":"x"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('retry-without-feedback');
    });

    test('preserves real retry with substantive feedback unchanged', () => {
      const text = '{"action":"retry","feedback":"add try/catch at line 14","reasoning":"missing error handling"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('retry');
      expect(result.feedback).toBe('add try/catch at line 14');
      expect(result.parser).toBe('ok');
    });

    test('falls back to default reasoning on retry-without-feedback if reviewer omitted reasoning', () => {
      const text = '{"action":"retry"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('retry-without-feedback');
      expect(result.reasoning).toMatch(/retry-without-feedback/);
    });

    test('returns conservative accept on invalid action value', () => {
      const text = '{"action":"reject","feedback":"unknown action","reasoning":"x"}';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('failed');
      expect(result.reasoning).toMatch(/parser-failure/);
    });

    test('returns conservative accept on malformed JSON', () => {
      const text = '{"action": "retry", "feedback": "missing closing brace"';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('failed');
    });

    test('returns conservative accept when no JSON object present', () => {
      const text = 'I would accept these findings — they look fine to me.';
      const result = interp._parseDecision(text);
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('failed');
    });
  });

  describe('review (high-level entry point)', () => {
    test('returns accept immediately when findings array is empty', async () => {
      const interp = new FindingsInterpreter();
      const result = await interp.review({
        task: 'task',
        agentOutput: 'output',
        findings: [],
        scenarioContext: 'sc',
      });
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('ok');
      expect(result.reasoning).toMatch(/no findings/);
    });

    test('returns accept immediately when findings is not an array', async () => {
      const interp = new FindingsInterpreter();
      const result = await interp.review({
        task: 'task',
        agentOutput: 'output',
        findings: null,
        scenarioContext: 'sc',
      });
      expect(result.action).toBe('accept');
    });

    test('catches dispatch error and returns conservative accept', async () => {
      const interp = new FindingsInterpreter();
      // Replace _dispatchReviewer with a thrower
      interp._dispatchReviewer = async () => { throw new Error('claude not found'); };
      const result = await interp.review({
        task: 'task',
        agentOutput: 'output',
        findings: [{ id: 'x', result: 'broken' }],
        scenarioContext: 'sc',
      });
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('dispatch-error');
      expect(result.reasoning).toMatch(/claude not found/);
    });

    test('happy path: dispatch returns wrapped retry JSON, review yields retry decision', async () => {
      const interp = new FindingsInterpreter();
      const innerText = '```json\n{"action":"retry","feedback":"missing try/catch at line 14","reasoning":"error-handling broken"}\n```';
      interp._dispatchReviewer = async () => JSON.stringify({ result: innerText, session_id: 'x', usage: {} });
      const result = await interp.review({
        task: 'add error handling to loadConfig',
        agentOutput: 'function loadConfig() { return JSON.parse(fs.readFileSync(p)); }',
        findings: [{ id: 'error-handling', result: 'broken', confidence: 'high' }],
        scenarioContext: 'sc',
      });
      expect(result.action).toBe('retry');
      expect(result.feedback).toContain('try/catch');
      expect(result.parser).toBe('ok');
    });

    test('happy path: dispatch returns wrapped accept JSON, review yields accept', async () => {
      const interp = new FindingsInterpreter();
      const innerText = '{"action":"accept","feedback":null,"reasoning":"stylistic-only"}';
      interp._dispatchReviewer = async () => JSON.stringify({ result: innerText });
      const result = await interp.review({
        task: 't',
        agentOutput: 'o',
        findings: [{ id: 'x', result: 'broken' }],
        scenarioContext: 'sc',
      });
      expect(result.action).toBe('accept');
      expect(result.feedback).toBe(null);
    });

    test('parser failure on garbage reviewer output yields conservative accept', async () => {
      const interp = new FindingsInterpreter();
      interp._dispatchReviewer = async () => JSON.stringify({ result: 'I cannot decide.' });
      const result = await interp.review({
        task: 't',
        agentOutput: 'o',
        findings: [{ id: 'x', result: 'broken' }],
        scenarioContext: 'sc',
      });
      expect(result.action).toBe('accept');
      expect(result.parser).toBe('failed');
    });
  });

  describe('PR #32 integration: reviewer-skill routing for Java test files', () => {
    describe('isJavaTestFile', () => {
      test('matches src/test/ Java files', () => {
        expect(isJavaTestFile('src/test/java/com/tradu/auth/LoginServiceTest.java')).toBe(true);
        expect(isJavaTestFile('mini-api/src/test/java/com/tradu/UserApiTest.java')).toBe(true);
      });

      test('matches tests/ root paths', () => {
        expect(isJavaTestFile('tests/auth/AuthFlowTest.java')).toBe(true);
        expect(isJavaTestFile('test/integration/OrderFlowIT.java')).toBe(true);
      });

      test('matches *Test.java / *IT.java / *Tests.java / *SIT.java by suffix', () => {
        expect(isJavaTestFile('foo/bar/UserServiceTest.java')).toBe(true);
        expect(isJavaTestFile('foo/IntegrationIT.java')).toBe(true);
        expect(isJavaTestFile('foo/UserApiTests.java')).toBe(true);
        // SIT (system integration tests) support per tradu-georgi-ivanov
        // 2026-06-08 review on PR #25.
        expect(isJavaTestFile('foo/OrderFlowSIT.java')).toBe(true);
      });

      test('matches src/sit/java/ paths (SIT layout)', () => {
        expect(isJavaTestFile('src/sit/java/com/tradu/auth/AuthSystemSIT.java')).toBe(true);
        expect(isJavaTestFile('mini-api/src/sit/java/com/tradu/OrderE2E.java')).toBe(true);
      });

      test('does not match production Java files', () => {
        expect(isJavaTestFile('src/main/java/com/tradu/UserService.java')).toBe(false);
        expect(isJavaTestFile('mini-api/src/main/java/com/tradu/auth/Login.java')).toBe(false);
      });

      test('does not match non-Java files even on test paths', () => {
        expect(isJavaTestFile('src/test/java/conftest.py')).toBe(false);
        expect(isJavaTestFile('tests/foo.test.ts')).toBe(false);
      });

      test('robust against null/undefined input', () => {
        expect(isJavaTestFile(null)).toBe(false);
        expect(isJavaTestFile(undefined)).toBe(false);
        expect(isJavaTestFile('')).toBe(false);
      });

      test('normalizes Windows backslash paths before matching (ryordanov NEW-4)', () => {
        // git diff on Windows can emit backslash separators; without
        // normalization, isJavaTestFile would silently miss those files
        // and routing would fall back to the generic reviewer.
        expect(isJavaTestFile('src\\test\\java\\com\\tradu\\auth\\LoginTest.java')).toBe(true);
        expect(isJavaTestFile('src\\sit\\java\\com\\tradu\\auth\\AuthSystemSIT.java')).toBe(true);
        expect(isJavaTestFile('foo\\bar\\OrderApiIT.java')).toBe(true);
        // Mixed separators still match
        expect(isJavaTestFile('src\\test\\java/com/tradu/UserTest.java')).toBe(true);
        // Backslashes in non-test paths still produce false
        expect(isJavaTestFile('src\\main\\java\\com\\tradu\\User.java')).toBe(false);
      });
    });

    describe('_pickReviewerSkill', () => {
      let interp;
      beforeEach(() => { interp = new FindingsInterpreter(); });

      test('returns review-deterministic-findings when files is empty/null', () => {
        expect(interp._pickReviewerSkill({})).toBe('review-deterministic-findings');
        expect(interp._pickReviewerSkill({ files: [] })).toBe('review-deterministic-findings');
        expect(interp._pickReviewerSkill({ files: null })).toBe('review-deterministic-findings');
      });

      test('returns qa-code-reviewer when any file is a Java test file', () => {
        expect(interp._pickReviewerSkill({ files: ['src/test/java/UserTest.java'] })).toBe('qa-code-reviewer');
      });

      test('returns qa-code-reviewer when changed files mix prod + test Java', () => {
        const files = ['src/main/java/User.java', 'src/test/java/UserTest.java'];
        expect(interp._pickReviewerSkill({ files })).toBe('qa-code-reviewer');
      });

      test('returns generic when changed files are all production code', () => {
        const files = ['src/main/java/User.java', 'src/main/java/Auth.java'];
        expect(interp._pickReviewerSkill({ files })).toBe('review-deterministic-findings');
      });

      test('returns generic when changed files are JS/TS only', () => {
        const files = ['src/foo.js', 'src/bar.ts'];
        expect(interp._pickReviewerSkill({ files })).toBe('review-deterministic-findings');
      });
    });

    describe('_loadQaSkill', () => {
      test('returns string when qa-code-reviewer.md exists', () => {
        // Sanity check that the agent file exists in the repo (it should
        // post-rebase since main carries the qa-* infrastructure).
        if (fs.existsSync(QA_REVIEWER_PATH)) {
          const interp = new FindingsInterpreter();
          const content = interp._loadQaSkill();
          expect(typeof content).toBe('string');
          expect(content.length).toBeGreaterThan(100);
        }
      });

      test('caches sentinel false when file missing — does not re-read', () => {
        const interp = new FindingsInterpreter();
        const orig = fs.readFileSync;
        let calls = 0;
        fs.readFileSync = (p, enc) => {
          if (p === QA_REVIEWER_PATH) { calls++; throw new Error('ENOENT'); }
          return orig(p, enc);
        };
        try {
          expect(interp._loadQaSkill()).toBe(false);
          expect(interp._loadQaSkill()).toBe(false);
          expect(calls).toBe(1); // second call hit the cache
        } finally {
          fs.readFileSync = orig;
        }
      });
    });

    describe('_buildPrompt + review with file routing', () => {
      test('test files trigger qa-code-reviewer skill in the prompt', () => {
        const interp = new FindingsInterpreter();
        // Force a known qa skill body to make the assertion deterministic.
        interp._qaSkillCache = '# QA REVIEWER STUB\n\nReview Java test code against deserialize-for-assertions rule.';
        const prompt = interp._buildPrompt({
          task: 'Add token expiry test',
          agentOutput: '...',
          findings: [{ promise_id: 'test-assertion-deserialize', result: 'broken' }],
          files: ['src/test/java/com/tradu/auth/TokenExpiryTest.java'],
        });
        expect(prompt).toContain('# QA REVIEWER STUB');
        expect(prompt).toContain('Output contract for this dispatch');
        // Payload includes reviewer_kind and changed_files for traceability.
        expect(prompt).toContain('"reviewer_kind": "qa-code-reviewer"');
        expect(prompt).toContain('TokenExpiryTest.java');
      });

      test('production files use generic skill — no qa body in prompt', () => {
        const interp = new FindingsInterpreter();
        interp._qaSkillCache = '# QA REVIEWER STUB — must not appear';
        const prompt = interp._buildPrompt({
          task: 'Refactor auth',
          agentOutput: '...',
          findings: [{ promise_id: 'error-handling', result: 'broken' }],
          files: ['src/main/java/com/tradu/Auth.java'],
        });
        expect(prompt).not.toContain('# QA REVIEWER STUB');
        expect(prompt).toContain('"reviewer_kind": "review-deterministic-findings"');
      });

      test('falls back to generic skill if qa-code-reviewer.md is missing', () => {
        const interp = new FindingsInterpreter();
        // Force the qa skill to be unavailable.
        interp._qaSkillCache = false;
        const prompt = interp._buildPrompt({
          task: 'Add test',
          agentOutput: '...',
          findings: [{ promise_id: 'test-assertion-deserialize', result: 'broken' }],
          files: ['src/test/java/UserTest.java'],
        });
        expect(prompt).toContain('"reviewer_kind": "review-deterministic-findings (fallback: qa-code-reviewer agent not found)"');
      });

      test('review() result includes reviewer_skill telemetry', async () => {
        const interp = new FindingsInterpreter();
        interp._qaSkillCache = '# stub';
        interp._dispatchReviewer = async () => JSON.stringify({
          result: '```json\n{"action":"retry","feedback":"replace response.body() with response.as(UserDto.class)","reasoning":"forbidden raw body access"}\n```',
        });
        const result = await interp.review({
          task: 't',
          agentOutput: 'o',
          findings: [{ id: 'test-assertion-deserialize', result: 'broken' }],
          scenarioContext: 'sc',
          files: ['src/test/java/UserApiTest.java'],
        });
        expect(result.action).toBe('retry');
        expect(result.reviewer_skill).toBe('qa-code-reviewer');
      });

      test('empty-findings short-circuit still reports reviewer_skill', async () => {
        const interp = new FindingsInterpreter();
        const result = await interp.review({
          task: 't',
          agentOutput: 'o',
          findings: [],
          files: ['src/test/java/Foo.java'],
        });
        expect(result.action).toBe('accept');
        expect(result.reviewer_skill).toBe('qa-code-reviewer');
      });
    });
  });
});
