# Native Teams Validation - Run Checklist

## Quick Reference

**Test Subject**: [tradu/utop#296](https://github.com/tradu/utop/pull/296)
**Runs Required**: 5 per approach (10 total)
**Estimated Time**: 15-20 min per run

---

## Pre-Test Setup (Once)

### 1. Create Directory Structure

```bash
mkdir -p ~/.claude/benchmarks/{golden,task-tool,native-teams,analysis,report}
mkdir -p ~/.claude/benchmarks/task-tool/run-{1,2,3,4,5}
mkdir -p ~/.claude/benchmarks/native-teams/run-{1,2,3,4,5}
```

### 2. Fetch PR Data

```bash
# Save PR metadata
gh pr view 296 --repo tradu/utop --json title,body,files,additions,deletions > ~/.claude/benchmarks/pr-metadata.json

# Get diff for reference
gh pr diff 296 --repo tradu/utop > ~/.claude/benchmarks/pr-diff.txt
```

### 3. Golden Baseline (requires human reviewers)

- [ ] Reviewer 1 completes independent review
- [ ] Reviewer 2 completes independent review
- [ ] Reviewers reconcile differences
- [ ] Save to `~/.claude/benchmarks/golden/baseline.json`

---

## Task Tool Run Checklist (Control)

### Run #___

**Date/Time**: _______________

#### Pre-Run
- [ ] Fresh terminal session
- [ ] Verify native teams DISABLED: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` (should be empty)
- [ ] Run directory ready: `~/.claude/benchmarks/task-tool/run-{N}/`
- [ ] Note start time: `date -u +"%Y-%m-%dT%H:%M:%SZ"` → ______________

#### Execute

Copy this prompt into fresh Claude Code session:

```
Analyze PR tradu/utop#296 for code review. Use parallel Task agents for each dimension.

## PR Context
- 86 files changed, 9633 additions
- Account management feature (UTOP-213)
- Backend: Java/Spring (controllers, services, DTOs, validation)
- Frontend: React/TypeScript (pages, components, hooks)
- SBE integration, Keycloak auth, tests

## Spawn 4 parallel agents:

1. **Security Analysis** (Task tool, code-analyzer):
   Analyze all Java and TypeScript files for:
   - OWASP vulnerabilities (injection, XSS, CSRF)
   - Authentication/authorization issues
   - Input validation gaps
   - Secrets exposure
   - IDOR vulnerabilities
   Report findings with file:line references.

2. **Performance Analysis** (Task tool, code-analyzer):
   Analyze service and repository classes for:
   - N+1 query patterns
   - Memory leaks
   - Blocking calls in async context
   - Algorithmic complexity issues
   - Missing pagination
   Report findings with file:line references.

3. **Architecture Review** (Task tool, architect-review):
   Analyze production code for:
   - SOLID principle violations
   - Tight coupling
   - Missing abstractions
   - Pattern violations
   - Code organization issues
   Report findings with file:line references.

4. **Test Coverage Analysis** (Task tool, code-analyzer):
   Analyze test files for:
   - Coverage gaps
   - Missing edge cases
   - Test quality issues
   - Missing integration tests
   - Assertion quality
   Report findings with file:line references.

Synthesize all findings into a unified report sorted by severity.
```

#### During Execution
- [ ] Note any errors or retries
- [ ] Note any context warnings
- [ ] Note agent completion order

#### Post-Run
- [ ] Note end time: `date -u +"%Y-%m-%dT%H:%M:%SZ"` → ______________
- [ ] Calculate duration: __________ seconds
- [ ] Save full transcript to `run-{N}/transcript.txt`
- [ ] Extract findings to `run-{N}/findings.json`
- [ ] Record any cost/token info if available
- [ ] Complete metadata.json

#### Findings Count
| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | | | | | |
| Performance | | | | | |
| Architecture | | | | | |
| Testing | | | | | |
| **Total** | | | | | |

#### Notes
```
[Any observations, errors, unusual behavior]


```

---

## Native Teams Run Checklist (Treatment)

### Run #___

**Date/Time**: _______________

#### Pre-Run
- [ ] Fresh terminal session
- [ ] Enable native teams: `export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- [ ] Verify enabled: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` → should output `1`
- [ ] Initialize external state:
  ```bash
  TEAM_ID="benchmark-run-{N}"
  mkdir -p ~/.claude/teams/$TEAM_ID/state/{checkpoints,findings,handoffs}
  ```
- [ ] Note start time: `date -u +"%Y-%m-%dT%H:%M:%SZ"` → ______________

#### Execute

Copy this prompt into fresh Claude Code session:

```
Create an agent team to review PR tradu/utop#296.

## PR Context
- 86 files changed, 9633 additions
- Account management feature (UTOP-213)
- Backend: Java/Spring (controllers, services, DTOs, validation)
- Frontend: React/TypeScript (pages, components, hooks)
- SBE integration, Keycloak auth, tests

## Spawn four teammates:

1. **security-reviewer**:
   - Focus: OWASP vulnerabilities, auth issues, input validation, secrets, IDOR
   - Scope: All Java and TypeScript files
   - Output: ~/.claude/teams/benchmark-run-{N}/state/findings/security.jsonl
   - Format: {"ts":"ISO8601","type":"vulnerability","severity":"critical|high|medium|low","file":"path","line":N,"msg":"description","recommendation":"fix"}
   - At 80% context: checkpoint to state/checkpoints/security-{timestamp}.json

2. **performance-reviewer**:
   - Focus: N+1 queries, memory leaks, blocking calls, complexity
   - Scope: Service classes, repositories, React components
   - Output: state/findings/performance.jsonl
   - Same format and checkpoint rules

3. **architecture-reviewer**:
   - Focus: SOLID violations, coupling, abstractions, patterns
   - Scope: All production code
   - Output: state/findings/architecture.jsonl

4. **test-reviewer**:
   - Focus: Coverage gaps, edge cases, test quality
   - Scope: Test files and corresponding production code
   - Output: state/findings/testing.jsonl

All teammates: Write one JSON object per line (JSONL). Checkpoint at 80% context.
When complete, write: {"ts":"...","type":"complete","msg":"Finished. N findings."}
Then message me.

I will synthesize from the JSONL files when all complete.
```

#### During Execution
- [ ] Use Shift+Up/Down to monitor teammates
- [ ] Use Ctrl+T to check task list
- [ ] Note any checkpoint messages
- [ ] Note any handoff events

#### Post-Run
- [ ] Note end time: `date -u +"%Y-%m-%dT%H:%M:%SZ"` → ______________
- [ ] Calculate duration: __________ seconds
- [ ] Copy external state:
  ```bash
  cp -r ~/.claude/teams/benchmark-run-{N}/state ~/.claude/benchmarks/native-teams/run-{N}/external-state
  ```
- [ ] Save lead transcript to `run-{N}/lead-transcript.txt`
- [ ] Aggregate findings:
  ```bash
  cat ~/.claude/benchmarks/native-teams/run-{N}/external-state/findings/*.jsonl > run-{N}/findings-raw.jsonl
  ```
- [ ] Convert to JSON for analysis
- [ ] Record any cost/token info
- [ ] Complete metadata.json

#### External State Summary
| File | Lines | Complete? |
|------|-------|-----------|
| security.jsonl | | [ ] |
| performance.jsonl | | [ ] |
| architecture.jsonl | | [ ] |
| testing.jsonl | | [ ] |

| Checkpoints | Handoffs |
|-------------|----------|
| | |

#### Findings Count
| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | | | | | |
| Performance | | | | | |
| Architecture | | | | | |
| Testing | | | | | |
| **Total** | | | | | |

#### Notes
```
[Any observations, errors, checkpoints, handoffs]


```

---

## Post-Test Analysis

### 1. Aggregate Metrics

```bash
cd ~/.claude/benchmarks

# Combine all task-tool runs
jq -s '.' task-tool/run-*/metadata.json > analysis/task-tool-metrics.json

# Combine all native-teams runs
jq -s '.' native-teams/run-*/metadata.json > analysis/native-teams-metrics.json
```

### 2. Token Comparison

| Run | Task Tool Tokens | Native Teams Tokens | Difference |
|-----|------------------|---------------------|------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| **Mean** | | | |
| **Std Dev** | | | |

### 3. Finding Extraction

Normalize all findings to common format for matching.

### 4. Human Validation

- [ ] Findings list prepared (blinded)
- [ ] Validator reviews each finding
- [ ] Classifications recorded
- [ ] Results saved to `analysis/human-validation.csv`

### 5. Statistical Analysis

- [ ] Token t-test completed
- [ ] Quality McNemar's test completed
- [ ] Effect sizes calculated
- [ ] Report generated

---

## Quick Commands Reference

```bash
# Check native teams status
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

# Enable native teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Disable native teams
unset CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

# Create team state directory
mkdir -p ~/.claude/teams/{team-id}/state/{checkpoints,findings,handoffs}

# Count findings in JSONL
wc -l ~/.claude/teams/*/state/findings/*.jsonl

# View latest findings
tail -20 ~/.claude/teams/*/state/findings/*.jsonl

# Aggregate findings
cat ~/.claude/teams/*/state/findings/*.jsonl | jq -s '.'
```
