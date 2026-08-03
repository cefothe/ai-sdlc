---
name: code-review-skill
description: Expert review of Claude Code skills analyzing 8 dimensions including structure, context budget, content quality, eval rigor, and benchmark methodology.
---

# /code:review-skill

Expert review of Claude Code skills (SKILL.md + references + evals). Analyzes 8 dimensions that human reviewers miss: structure, context budget, content quality, eval rigor, benchmark methodology, integration, maintenance, and verdict.

## Input

Accepts one of:
- A PR number: `/code:review-skill 473`
- A local skill path: `/code:review-skill skills/my-skill/`
- No argument: scans current repo for `skills/*/SKILL.md` and reviews all found

## Execution

### Step 0: Gather Materials

Collect all review inputs:

1. **Skill files** — Read SKILL.md, all `references/*.md`, `evals/evals.json`
2. **Project CLAUDE.md** — Read the project's CLAUDE.md (for redundancy analysis)
3. **Benchmark results** — If `*-workspace/iteration-*/benchmark.json` exists, read it
4. **PR diff** — If PR number provided, fetch with `gh pr diff [number]`

If any skill files are missing, note the gap and proceed with what's available.

### Step 1: Execute the 8-Phase Review Protocol

Execute ALL 8 phases. Each finding is rated: **CRITICAL** (blocks merge), **HIGH** (fix before merge), **MEDIUM** (follow-up), **LOW** (nitpick).

---

#### Phase 1: Structure & Convention Compliance

Verify the skill follows Claude Code conventions:

1. **SKILL.md frontmatter** — Valid YAML with required fields (`name`, `description`). Description must be specific enough to trigger correctly but not false-positive on unrelated tasks.
2. **Directory layout** — `SKILL.md` at root, `references/` for on-demand content, `evals/` for eval definitions.
3. **File sizes** — SKILL.md should be <300 lines (always-loaded context budget). References should be loaded on-demand.
4. **Naming conventions** — Kebab-case directory name matching `name` field.
5. **Trigger accuracy** — List 3 edge cases where trigger behavior is ambiguous (false positives or false negatives).

---

#### Phase 2: Context Budget Analysis

Every token in SKILL.md costs context on EVERY interaction. This is the dimension humans miss most.

1. **Token count** — Measure empirically, don't guess. Run `wc -w SKILL.md` and apply the heuristic `tokens ≈ words × 1.3`. Flag if >3,000 tokens (expensive for always-loaded). Do the same for each reference file.
2. **Information density** — For each SKILL.md section, rate: (a) frequency of use, (b) whether it could live in references instead.
3. **Progressive disclosure** — Is the core/reference split optimal?
4. **Redundancy with CLAUDE.md** — Compare every rule/pattern in the skill against the project's CLAUDE.md. Classify each as:
   - **Identical** = pure context waste + divergence risk
   - **Complementary** = adds value beyond CLAUDE.md
   - **Contradictory** = CRITICAL (different advice for same topic)
   - **Novel** = unique to the skill (highest value)
5. **Reference structure** — Can the model load sections selectively, or must it load entire reference files?

**Report these metrics:**
- Estimated SKILL.md tokens
- Estimated total tokens (all files)
- Redundancy ratio (% of skill content already in CLAUDE.md)
- Context efficiency score (unique value-add per token, 1-10)

---

#### Phase 3: Content Quality & Correctness

1. **Technical accuracy** — Verify claims against the actual codebase and CLAUDE.md. Flag contradictions.
2. **Conflict resolution** — Does the skill define clear precedence when it conflicts with CLAUDE.md?
3. **Completeness** — Are there codebase patterns the skill should cover but doesn't?
4. **Actionability** — For each rule: can the model unambiguously apply it?
5. **Examples** — Every rule should have correct AND incorrect examples. Are they realistic?
6. **Staleness risk** — Flag hardcoded file paths, line numbers, class names, or version-specific details.

---

#### Phase 4: Eval Quality & Rigor

##### 4a: Assertion Analysis

For EACH eval assertion, analyze:
1. **Discriminating power** — Does this assertion differentiate with-skill from without-skill? If baseline already passes it, it's non-discriminating and inflates the headline.
2. **Gaming resistance** — Can the model satisfy it via keyword-dropping without understanding? Flag `keyword_check` assertions where `semantic_check` is needed.
3. **False negative risk** — Could a correct response fail due to wording?
4. **False positive risk** — Could an incorrect response pass?
5. **Coverage gaps** — What important behaviors are untested?

**Report:** Count of discriminating vs non-discriminating assertions. Recalculate the true discriminating pass rate.

##### 4b: Eval Design

1. **Prompt realism** — Do prompts match real user requests?
2. **Difficulty calibration** — Too easy (baseline passes most) or too hard?
3. **Scenario diversity** — Do evals cover the skill's full scope?
4. **Missing scenarios** — What should be tested but isn't?

##### 4c: Grading Methodology

1. **Grader consistency** — Could grading bias favor the with-skill run?
2. **Rubric clarity** — Would two independent graders agree?
3. **Statistical significance** — N=1 is insufficient. Recommend minimum N=3 per configuration.

---

#### Phase 5: Benchmark Methodology

1. **Fairness** — Same model, temperature, system prompt (minus skill) for both configs?
2. **Confounders** — Does without-skill still have CLAUDE.md? (It should — measures incremental value.)
3. **Reproducibility** — Are all inputs (prompts, model settings, grading criteria) checked in?
4. **Cost analysis** — Calculate: `(with_tokens - without_tokens) / without_tokens`. Report quality/cost ratio.
5. **Cherry-picking** — Were unfavorable iterations discarded? The eval workspace convention uses `iteration-N/` directories (e.g., `iteration-0/`, `iteration-1/`). If only `iteration-1/` exists, ask: was there an `iteration-0` that was discarded because results were worse? Missing early iterations are a red flag for cherry-picked benchmarks.
6. **Baseline validity** — Does without-skill represent realistic usage?

---

#### Phase 6: Interaction & Integration

1. **CLAUDE.md harmony** — Produce a full mapping table: every skill rule vs its CLAUDE.md counterpart, classified as Identical/Complementary/Contradictory/Novel.
2. **Skill chaining** — Could this skill interact badly with others loaded simultaneously?
3. **Behavioral prediction** — Will the skill cause unintended behavioral changes? (e.g., over-prescriptive tone causing refusals)

---

#### Phase 7: Maintenance & Evolution

1. **Update frequency** — How often will the skill need updates?
2. **Single source of truth** — Risk of CLAUDE.md and skill diverging?
3. **Versioning** — Is the skill versioned?
4. **Deprecation path** — Plan if the skill's rules get absorbed into CLAUDE.md?

---

#### Phase 8: Verdict

Produce a summary table:

| Dimension | Score (1-10) | Key Finding |
|-----------|-------------|-------------|
| Structure & Conventions | | |
| Context Budget | | |
| Content Quality | | |
| Eval Quality | | |
| Benchmark Methodology | | |
| Integration | | |
| Maintenance | | |
| **Overall** | | |

Then list:
- **Blocking Issues (CRITICAL)** — Must fix before merge
- **Recommended Improvements (HIGH)** — Fix before or shortly after merge
- **Future Iterations** — Improvements for next eval iteration

**Final Recommendation:** One of APPROVE, APPROVE WITH CONDITIONS, REQUEST CHANGES, REJECT.

### Step 2: Post Results

- If reviewing a PR, offer to post as a PR review comment via `gh pr review`
- If reviewing locally, output the full report to the user
