---
name: code-review-pr-strict
description: Rigorous PR review with mandatory verification protocol, security-critical detection, and zero tolerance for false positives.
---

# /code:review-pr-strict

Rigorous PR review with mandatory verification protocol, security-critical detection, and zero tolerance for false positives.

**Extends**: `/code:review-pr` with enhanced verification requirements
**Protocols**:
  - `protocols/pr-security-critical-detection.yaml` (security scanning)
  - `protocols/pr-verification.yaml` (verification protocol)
**Quality Gates**:
  - `quality-gates/pr-security-critical.yaml` (security - runs first)
  - `quality-gates/pr-review-verification.yaml` (verification)
**Templates**:
  - `templates/pr-security-critical-report.md` (if security issues)
  - `templates/pr-review-verified.md` (final report)

## When to Use

- **Production-critical PRs** requiring zero-defect tolerance
- **Security-sensitive changes** (authentication, authorization, payments)
- **Performance-critical code** (HFT, real-time systems, hot paths)
- **Complex refactorings** with high regression risk
- **After false positives** from standard review

For standard PRs, use `/code:review-pr`. Use this when **absolute certainty** is required.

---

## Quick Start

```bash
/code:review-pr-strict https://github.com/org/repo/pull/123
```

The command will:
0. **Security-critical scan** (FIRST - secrets, URLs, malicious patterns, dependencies)
1. **Auto-detect stack** (Java/Spring, Node.js/Express, Python/Django, etc.)
2. **Apply verification protocol** (4-step verification for all findings)
3. **Require proof** (reproduction tests for CRITICAL issues)
4. **Check infrastructure** (framework-specific safeguards)
5. **Enforce scope** (explicit boundaries)
6. **Use mathematical thresholds** (≥1 CRITICAL → block)

---

## Execution Strategy

### Phase 0: Security-Critical Scan (MANDATORY BLOCKING)

**Protocol**: `protocols/pr-security-critical-detection.yaml`
**Quality Gate**: `quality-gates/pr-security-critical.yaml`

```bash
# Get PR diff for scanning
gh pr diff [number] --repo [org/repo] > /tmp/pr-diff.txt

# Run security-critical detection (automatic)
# Detects:
#   - Hardcoded secrets (API keys, passwords, tokens, certificates)
#   - URL changes (new/modified URLs vs whitelist)
#   - Malicious patterns (backdoors, code injection, obfuscation)
#   - Dependency changes (typosquatting, vulnerabilities, suspicious packages)

# Decision tree:
# If BLOCKED:
#   - STOP immediately, do not proceed to Phase 1
#   - Post security report using templates/pr-security-critical-report.md
#   - gh pr review [number] --request-changes
#   - Require human security approval
#
# If FLAGGED:
#   - Continue but carry security flags to final report
#   - Include in Phase 4 consolidated report
#   - Proceed to Phase 1
#
# If CLEAN:
#   - No security issues detected
#   - Proceed normally to Phase 1
```

**CRITICAL**: If security scan blocks the PR, the strict review does NOT run. Security issues must be resolved first.

### Phase 1: Gather Context & Auto-Detect Stack

```bash
# Get PR details
gh pr view [number] --repo [org/repo] --json title,body,files,additions,deletions

# Get full diff
gh pr diff [number] --repo [org/repo] > /tmp/pr-diff.txt

# Auto-detect technology stack
STACK=$(detect_stack_from_pr_files)
# Returns: java-spring, node-express, python-django, ruby-rails, go-gin, etc.
```

**Stack Detection Logic**: See `protocols/pr-verification.yaml` for complete detection rules.

**Supported Stacks**: java-spring, node-express, python-django, ruby-rails, go-gin, generic

**Define Scope**:
```yaml
SCOPE:
  in_scope:
    files: [all files in PR diff]
    functionality: [from PR description]
    dependencies: [direct dependencies only]
    tests: [tests for changed code]

  out_of_scope:
    - Unchanged files
    - Previous architecture decisions
    - Framework/infrastructure handled (detected per stack)
    - Future enhancements not in description
```

---

### Phase 2: Launch Native Teams Review

1. Validate team name before creating team:
   ```bash
   TEAM_NAME="pr-strict-{number}"
   if [[ ! "$TEAM_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]]; then
     echo "❌ Invalid team name: $TEAM_NAME (must be alphanumeric with hyphens/underscores, max 64 chars)"
     exit 1
   fi
   ```

2. Create review team:
   ```
   TeamCreate(team_name="pr-strict-{number}")
   ```

3. Spawn ALL agents in parallel (one per dimension):

   **REQUIRED** teammates (always spawn all 5):
   ```
   Task(subagent_type="security-auditor", team_name="pr-strict-{number}", name="security-reviewer")
   Task(subagent_type="performance-engineer", team_name="pr-strict-{number}", name="perf-reviewer")
   Task(subagent_type="architect-review", team_name="pr-strict-{number}", name="architecture-reviewer")
   Task(subagent_type="general-purpose", team_name="pr-strict-{number}", name="test-reviewer")
   Task(subagent_type="general-purpose", team_name="pr-strict-{number}", name="docs-reviewer")
   ```

   **CONDITIONAL** teammates (based on changes):
   ```
   Task(subagent_type="general-purpose", team_name="pr-strict-{number}", name="code-reviewer")           # deep code analysis
   Task(subagent_type="backend-architect", team_name="pr-strict-{number}", name="backend-reviewer")     # if backend/API changes
   Task(subagent_type="frontend-developer", team_name="pr-strict-{number}", name="frontend-reviewer")   # if UI/frontend changes
   ```

4. Each teammate writes JSONL findings to:
   ```
   ~/.claude/teams/pr-strict-{number}/state/findings/{dimension}.jsonl
   ```

5. Each teammate MUST:
   - Apply 4-step verification (see protocol)
   - Check stack-specific infrastructure
   - Report in standardized JSONL format
   - Provide proof for all CRITICAL issues

6. Aggregate findings from JSONL, then clean up:
   ```
   TeamDelete
   ```

---

### Phase 3: 4-Step Verification Protocol

**For EVERY issue found, execute** (detailed in `protocols/pr-verification.yaml`):

#### Step 1: Code Trace
- Trace execution from entry to bug
- Document each step
- **Pass**: Trace reaches bug
- **Fail**: Discard (false positive)

#### Step 2: Infrastructure Check (Stack-Aware)
- Check if framework/infrastructure handles it
- Use stack-specific checklist from protocol
- **Pass**: Infrastructure does NOT handle
- **Fail**: Discard (framework handles it)

#### Step 3: Reproduction Test (CRITICAL only)
- Create minimal failing test
- Run test to confirm failure
- **Pass**: Test fails (bug confirmed)
- **Fail**: Discard (cannot reproduce)

#### Step 4: Scope Validation
- Confirm file/code in PR diff
- **Pass**: In scope
- **Fail**: Out of scope → suggest separate issue (if CRITICAL) or discard

**False Positive Prevention Checklist**:
- [ ] Code trace completes
- [ ] Infrastructure doesn't handle
- [ ] Reproducible
- [ ] In scope
- [ ] Not by design
- [ ] Actual impact

If ANY fails → DISCARD

---

### Phase 4: Issue Classification & Action

**Severity Levels** (from `protocols/pr-verification.yaml`):

- **CRITICAL**: Data corruption, security vulnerabilities, race conditions → ≥1 blocks merge
- **HIGH**: Performance regression >50%, incorrect logic, missing error handling → ≥2 blocks merge
- **MEDIUM**: Suboptimal patterns, rare edge cases → comment only
- **LOW**: Style, docs, minor optimizations → optional

**Action Thresholds** (mathematical):
```javascript
if (critical >= 1 || test_failures > 0) {
    action = "REQUEST_CHANGES"
} else if (high >= 2) {
    action = "REQUEST_CHANGES"
} else {
    action = "APPROVE"
}
```

---

### Phase 5: Proof Requirement (CRITICAL Issues)

For every CRITICAL issue:

1. **Create test** that FAILS (proves bug exists)
2. **Run test** locally to confirm
3. **Include in review** as proof
4. **Provide fix** with verification steps

**Example**:
```{{stack_test_language}}
@Test  // or it(), test(), def test_
void testReproducesBug() {
    // Minimal setup
    // Execute buggy path
    // Assert failure (NPE, wrong value, etc.)
}
```

---

### Phase 6: Output Format

**Use template**: `templates/pr-review-verified.md`

**8 Required Sections**:
1. **Scope Verification**: In/out explicitly
2. **Critical Issues**: With full proof (trace, infra check, test, scope)
3. **High Priority**: With verification
4. **Medium Observations**: Brief
5. **What Was Verified**: Checklist
6. **Out of Scope Critical**: Separate issue suggestions
7. **Quality Metrics**: 11/11 score
8. **Action Required**: Clear criteria

---

### Phase 7: Execute Action

```bash
# Ensure metrics directory exists
mkdir -p ~/.claude/metrics

# Post review
gh pr review [number] --${action} --body-file /tmp/review.md

# Track metrics
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ"),PR-[number],${action},${critical},${high},${fp_count}" >> ~/.claude/metrics/pr-reviews.csv
```

---

## Stack-Specific Infrastructure Awareness

**This command auto-detects your stack and checks the appropriate infrastructure.**

Full infrastructure checklists are in `protocols/pr-verification.yaml`. Summary:

### Java/Spring
- Spring Boot, Hibernate, Flyway, HikariCP
- @Transactional, @ControllerAdvice, @Valid, @Version

### Node.js/Express
- Express, NestJS, Prisma, TypeORM
- @Injectable, @Transactional, middleware, connection pools

### Python/Django
- Django, Flask, SQLAlchemy, Alembic
- @atomic, middleware, ORM transaction management

### Ruby/Rails
- Rails, ActiveRecord, Sidekiq
- Transactions, validations, callbacks

### Go
- Gin, GORM, pgx
- Context, defer, transaction wrappers

### Generic (No Stack Detected)
- Common patterns only (transactions, error handling, resource cleanup)
- More conservative (fewer assumed safeguards)

**See `protocols/pr-verification.yaml`** for complete infrastructure checklists per stack.

---

## Configuration

### Project-Specific Infrastructure

Add to `protocols/pr-verification.yaml`:
```yaml
infrastructure_awareness:
  project_custom:
    - "Your Framework: What it handles"
    - "Your Tool: What it prevents"
```

### Quality Gate Thresholds

Adjust in `quality-gates/pr-review-verification.yaml`:
```yaml
action_thresholds:
  block_on_critical: 1    # ≥1 CRITICAL → block
  block_on_high: 2        # ≥2 HIGH → block
```

---

## Quality Gates

From `quality-gates/pr-review-verification.yaml`:

**Blocking Gates** (must pass 100%):
1. Verification completeness (all issues verified)
2. Reproduction test coverage (all CRITICAL have tests)
3. Infrastructure awareness (checked for all DB/concurrency)
4. Scope discipline (all findings in scope)
5. Action threshold compliance (correct decision)

**Quality Metrics**:
- False positive rate: <5% target
- Review quality score: ≥9.0/11.0 target
- Author confusion: 0 questions target

---

## Success Criteria

A successful strict review:
- ✅ Zero false positives (all issues proven)
- ✅ Zero missed critical bugs
- ✅ Clear scope boundaries
- ✅ Actionable feedback (exact fixes)
- ✅ Fast iteration (author knows what to do)
- ✅ High confidence (reproduction tests)

**Target Accuracy**: 95%+ on reported issues

---

## When NOT to Use

Use standard `/code:review-pr` instead for:
- Draft PRs or WIP changes
- Documentation-only changes
- Configuration-only changes
- Low-risk refactorings
- When speed > certainty

---

## Differences from Standard Review

| Feature | `/code:review-pr` | `/code:review-pr-strict` |
|---------|-------------------|--------------------------|
| **Verification** | Standard | 4-step mandatory |
| **Proof** | Optional | Required for CRITICAL |
| **Infrastructure** | Implicit | Explicit, stack-aware |
| **Stack Detection** | Manual | Automatic |
| **False Positive Prevention** | Standard | 6-point checklist |
| **Score** | 10/10 | 11/11 |
| **Time** | 15-30 min | 20-40 min |
| **Confidence** | Medium | High |

---

## Protocol Reference

**Full details**: `protocols/pr-verification.yaml`

**Summary**:
- 4-step verification process
- Stack-specific infrastructure checklists
- Severity classification rules
- False positive prevention
- Quality metrics tracking

---

## Example Usage

### Basic
```bash
/code:review-pr-strict https://github.com/org/repo/pull/123
```

### With Context
```bash
/code:review-pr-strict https://github.com/org/repo/pull/123

Additional context:
- High-frequency trading system (performance critical)
- Check for allocations in hot paths
- Verify no blocking calls in main loop
```

### Expected Output
- Auto-detects stack (e.g., "java-spring")
- Applies Java/Spring infrastructure checks
- Verifies all findings with 4-step protocol
- Provides reproduction tests for CRITICAL issues
- Uses mathematical thresholds for action
- Outputs 8-section structured review

---

## Troubleshooting

### Wrong Stack Detected
Add explicit hint in PR description:
```markdown
Stack: python-django
```

Or configure project default in `.claude/.config/review-pr.json`:
```json
{
  "stack": "node-express",
  "infrastructure_custom": [
    "Custom Framework: Description"
  ]
}
```

### Too Many False Positives
1. Check which infrastructure is missing
2. Add to `protocols/pr-verification.yaml`
3. Update stack-specific checklist

### Reviews Too Slow
1. Increase agent parallelization
2. Skip optional agents
3. Use for critical PRs only

---

## Metrics Tracking

Metrics automatically saved to `~/.claude/metrics/pr-reviews.csv`:

```csv
timestamp,pr_number,action,critical_count,high_count,false_positives,stack_detected
2025-02-10T10:00:00Z,382,changes_requested,3,0,0,java-spring
2025-02-10T11:00:00Z,383,approved,0,1,0,node-express
```

**Track**:
- False positive rate (<5% target)
- Review time (20-40 min target)
- Author confusion (0 questions target)
- Stack detection accuracy

---

## Related

- **Protocol**: `protocols/pr-verification.yaml`
- **Quality Gate**: `quality-gates/pr-review-verification.yaml`
- **Template**: `templates/pr-review-verified.md`
- **Standard Review**: `/code:review-pr`

---

**Philosophy**: "When in doubt, CREATE A TEST. If you can't make it fail, it's not a bug."
