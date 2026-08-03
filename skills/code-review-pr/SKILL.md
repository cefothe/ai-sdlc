---
name: code-review-pr
description: Comprehensive PR review using parallel specialized agents with mandatory security-critical detection.
---

# /code:review-pr

Comprehensive PR review using parallel specialized agents with mandatory security-critical detection.

## Execution Strategy

**Phase 0: Security-Critical Scan** (MANDATORY - BLOCKS if issues found)
```bash
# Security scan runs FIRST, before any other review
# Scan PR diff for security issues
gh pr diff [number] > /tmp/pr-diff.txt

# Run security detection (automatic)
- Hardcoded secrets (API keys, passwords, tokens)
- URL changes (new/modified URLs checked against whitelist)
- Malicious patterns (backdoors, code injection, obfuscation)
- Dependency changes (new packages, vulnerable versions)

# If BLOCKED:
#   - Post security report as PR comment
#   - REQUEST_CHANGES automatically
#   - STOP - do not proceed to Phase 1
#   - Require human security approval

# If FLAGGED:
#   - Include security flags in final review report
#   - Continue to Phase 1

# If CLEAN:
#   - Continue to Phase 1
```

**Phase 1: Gather PR Information**
```bash
gh pr view [number] --json title,body,state,commits,files,additions,deletions
gh pr checks [number]
```

**Phase 2: Launch Native Teams Review** (only if Phase 0 passed/flagged)

1. Validate team name before creating team:
   ```bash
   TEAM_NAME="pr-review-{number}"
   if [[ ! "$TEAM_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]]; then
     echo "❌ Invalid team name: $TEAM_NAME (must be alphanumeric with hyphens/underscores, max 64 chars)"
     exit 1
   fi
   ```

2. Create review team:
   ```
   TeamCreate(team_name="pr-review-{number}")
   ```

3. Spawn ALL agents in parallel (one per dimension):

   **REQUIRED** teammates:
   ```
   Task(subagent_type="security-auditor", team_name="pr-review-{number}", name="security")
   Task(subagent_type="performance-engineer", team_name="pr-review-{number}", name="performance")
   Task(subagent_type="architect-review", team_name="pr-review-{number}", name="architecture")
   Task(subagent_type="general-purpose", team_name="pr-review-{number}", name="testing")
   Task(subagent_type="general-purpose", team_name="pr-review-{number}", name="docs")
   ```

   **CONDITIONAL** teammates (based on changes):
   - `Task(subagent_type="backend-architect", ...)` if backend/API changes
   - `Task(subagent_type="frontend-developer", ...)` if UI/frontend changes
   - `Task(subagent_type="android-expert", ...)` if Android changes
   - `Task(subagent_type="ios-expert", ...)` if iOS changes
   - `Task(subagent_type="database-optimizer", ...)` if database changes

4. Each teammate writes JSONL findings to:
   ```
   ~/.claude/teams/pr-review-{number}/state/findings/{dimension}.jsonl
   ```

5. Aggregate findings from JSONL files

6. Clean up:
   ```
   TeamDelete
   ```

**Note**: Security-auditor agent performs agent-level security review (code quality, patterns), while Phase 0 performs automated detection (secrets, URLs, malicious patterns).

**Phase 3: Consolidate & Report**
- Aggregate all agent findings
- Include security scan results (if flagged)
- Calculate composite quality score (10/10 base + security clean bonus)
- Provide final approval recommendation

## Agent Instructions

Each agent should:
1. Use `gh` CLI to inspect PR (per CLAUDE.md guidelines)
2. Focus on their specialty area only
3. Provide: score, critical issues, warnings, recommendations
4. Return: APPROVE, REQUEST_CHANGES, or COMMENT

## ABSOLUTE QUALITY GATES (>9/10 minimum score required)

### Security-Critical (MANDATORY BLOCKING GATE - runs first)

**MUST PASS** before any other gates run:
- [ ] Zero hardcoded secrets (not in approved whitelist)
- [ ] All URL changes whitelisted or approved
- [ ] Zero malicious patterns (backdoors, code injection)
- [ ] All new dependencies validated

**If blocked**: PR automatically REQUEST_CHANGES, human security approval required.
**If flagged**: Continue review but include security flags in report.

See Phase 0 in Execution Strategy for details.

---

### Tests (3.0/3.0 required)
- [ ] Coverage ≥90% for new/modified code
- [ ] All tests pass (100% success rate)
- [ ] Tests designed to reveal flaws, not pass trivially

### Code Quality (2.0/2.0 required)
- [ ] Complexity within project limits
- [ ] Consistent style and formatting
- [ ] Follows established patterns

### Documentation (2.0/2.0 required)
- [ ] API documentation complete and accurate
- [ ] Project documentation updated where needed
- [ ] Migration guides if breaking changes

### Performance (2.0/2.0 required)
- [ ] No performance regressions
- [ ] Meets established SLA requirements
- [ ] Resource usage within acceptable bounds

### Security (1.0/1.0 required - agent-level review)
- [ ] No critical vulnerabilities (code patterns)
- [ ] Follows security best practices
- [ ] Input validation and error handling secure
- [ ] SQL injection / XSS prevention implemented

**Note**: This is agent-level security review. Automated detection (secrets, URLs) happens in Phase 0.

## CLAUDE.md Compliance Verification

Verify PR follows ALL absolute rules:
- [ ] NO PARTIAL IMPLEMENTATION
- [ ] NO SIMPLIFICATION with TODO comments
- [ ] NO CODE DUPLICATION
- [ ] NO DEAD CODE present
- [ ] COMPREHENSIVE TESTS for every function
- [ ] NO CHEATER TESTS (tests must be meaningful)
- [ ] CONSISTENT NAMING patterns maintained
- [ ] NO OVER-ENGINEERING introduced
- [ ] NO MIXED CONCERNS (proper separation)
- [ ] NO RESOURCE LEAKS (cleanup implemented)

## PR Scope and Impact Analysis

- [ ] Changes are atomic and focused on single concern
- [ ] No scope creep beyond ticket requirements
- [ ] Changes make sense in broader project context
- [ ] No unnecessary changes included
- [ ] Breaking changes properly documented and versioned
- [ ] Migration path provided for breaking changes

## Review Completeness Check

- [ ] All acceptance criteria from ticket satisfied
- [ ] Implementation uses minimal code changes possible
- [ ] Existing patterns and components reused appropriately
- [ ] New dependencies justified and documented
- [ ] Error handling comprehensive and appropriate
- [ ] Logging implemented where needed for debugging

## Deployment Readiness

- [ ] PR can be merged without breaking main branch
- [ ] Database migrations are reversible (if applicable)
- [ ] Configuration changes documented
- [ ] Monitoring/alerting updated if needed
- [ ] Rollback plan exists and tested

## Final Approval Criteria

NEVER approve PR unless ALL criteria met:
- [ ] Quality score >9.0/10.0
- [ ] All CLAUDE.md rules followed
- [ ] All tests pass with adequate coverage
- [ ] No security vulnerabilities
- [ ] Performance requirements met
- [ ] Documentation complete and current
