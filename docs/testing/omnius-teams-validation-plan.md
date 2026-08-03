# Native Teams Validation Plan

## Objective

Rigorously validate that Native Teams (+ external state) provides:
1. **Token efficiency**: Measurable reduction vs Task tool approach
2. **Quality parity or better**: Same or more findings, same or better accuracy

## Test Subject

**PR**: [tradu/utop#296](https://github.com/tradu/utop/pull/296)
**Title**: feat(UTOP-213): Account management - create and read
**Scope**: 86 files, 9,633 additions, 96 deletions

**Domains covered**:
- Backend (Java/Spring): Controllers, Services, DTOs, Repositories, Validation
- Frontend (React/TypeScript): Pages, Components, Hooks, API clients
- SBE Integration: Command encoding, Response decoding
- Security: Keycloak roles, JWT validation
- Tests: Unit, Integration, Component tests
- Documentation: OpenAPI spec, Bruno collections

---

## Hypotheses

**H1 (Cost Efficiency)**: Native Teams achieves ≥40% lower cost-per-finding compared to Task tool for equivalent analysis.

**H2 (Quality Parity)**: Native Teams produces ≥95% of findings identified by Task tool approach.

**H3 (Quality Improvement)**: External state persistence enables ≥10% more findings due to eliminated context loss.

---

## Experimental Design

### Independent Variable
- **Approach**: Task tool (control) vs Native teams + external state (treatment)

### Dependent Variables
- Token consumption (estimated via proxy metrics)
- Finding count by severity
- Finding accuracy (validated by human review)
- Finding completeness (against golden baseline)
- Time to completion
- Handoff/recovery events

### Controlled Variables
- Same PR target
- Same review dimensions (security, performance, architecture, testing)
- Same model (Claude Opus 4.5)
- Same prompts/instructions (adapted for approach)
- Same reviewer for quality validation

### Runs
- **N = 5** runs per approach (10 total)
- **Randomized order** to control for cache/learning effects
- **24-hour spacing** between runs to avoid rate limit artifacts

---

## Phase 1: Establish Golden Baseline

Before comparing approaches, establish ground truth.

### 1.1 Expert Human Review

Have 2 senior engineers independently review PR #296 for:

| Category | Reviewer Focus |
|----------|---------------|
| Security | Auth bypass, injection, XSS, secrets exposure, IDOR |
| Performance | N+1 queries, memory leaks, blocking calls, inefficient algorithms |
| Architecture | SOLID violations, coupling, missing abstractions, pattern violations |
| Testing | Coverage gaps, missing edge cases, test quality issues |

**Deliverable**: `golden-baseline.json` with all confirmed issues

### 1.2 Baseline Schema

```json
{
  "pr": "tradu/utop#296",
  "reviewedBy": ["engineer1", "engineer2"],
  "reviewDate": "2026-02-XX",
  "findings": [
    {
      "id": "GOLD-001",
      "category": "security",
      "severity": "high",
      "file": "AccountManagementController.java",
      "line": 145,
      "description": "Missing authorization check for account deletion",
      "confirmed": true,
      "confirmedBy": ["engineer1", "engineer2"]
    }
  ],
  "totalConfirmed": {
    "critical": 0,
    "high": 2,
    "medium": 5,
    "low": 8
  }
}
```

### 1.3 Consensus Requirement

- Both reviewers must agree for "confirmed" status
- Disagreements resolved by third reviewer
- False positives documented separately

---

## Phase 2: Task Tool Baseline (Control)

### 2.1 Setup

```bash
# Ensure clean environment
unset CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

# Create run directory
mkdir -p ~/.claude/benchmarks/task-tool/run-{N}
```

### 2.2 Execution Protocol

For each run (N = 1 to 5):

```markdown
## Pre-Run Checklist
- [ ] Fresh Claude Code session (no prior context)
- [ ] Record session start timestamp
- [ ] Record initial /cost or equivalent baseline

## Execution

Analyze PR tradu/utop#296 using parallel Task agents:

1. Spawn security-analyzer agent:
   - Focus: OWASP vulnerabilities, auth issues, input validation, secrets
   - Scope: All Java and TypeScript files
   - Output: Detailed findings with file:line references

2. Spawn performance-analyzer agent:
   - Focus: N+1 queries, memory leaks, blocking calls, complexity
   - Scope: Service classes, repository classes, React components
   - Output: Detailed findings with file:line references

3. Spawn architecture-reviewer agent:
   - Focus: SOLID principles, coupling, patterns, abstractions
   - Scope: All production code (exclude tests)
   - Output: Detailed findings with file:line references

4. Spawn test-coverage-analyzer agent:
   - Focus: Coverage gaps, missing edge cases, test quality
   - Scope: Test files and corresponding production files
   - Output: Detailed findings with file:line references

Wait for all agents to complete. Synthesize findings.

## Post-Run Checklist
- [ ] Record session end timestamp
- [ ] Record final /cost or equivalent
- [ ] Save complete conversation transcript
- [ ] Extract all findings to JSON format
- [ ] Note any errors, handoffs, or retries
```

### 2.3 Data Collection

Save to `~/.claude/benchmarks/task-tool/run-{N}/`:

```
run-{N}/
├── metadata.json       # Timestamps, costs, errors
├── transcript.txt      # Full conversation
├── findings.json       # Extracted findings
├── agent-outputs/      # Individual agent responses
│   ├── security.md
│   ├── performance.md
│   ├── architecture.md
│   └── testing.md
└── notes.md           # Observer notes
```

### 2.4 Metrics Schema

```json
{
  "run": 1,
  "approach": "task-tool",
  "pr": "tradu/utop#296",
  "timestamps": {
    "start": "2026-02-12T10:00:00Z",
    "end": "2026-02-12T10:15:32Z",
    "durationSeconds": 932
  },
  "tokens": {
    "method": "cost-command|character-estimate|api-header",
    "inputTokens": null,
    "outputTokens": null,
    "totalTokens": null,
    "estimatedFromCharacters": 450000,
    "costUsd": null
  },
  "agents": {
    "spawned": 4,
    "completed": 4,
    "failed": 0,
    "handoffs": 0
  },
  "findings": {
    "total": 18,
    "bySeverity": {
      "critical": 0,
      "high": 3,
      "medium": 8,
      "low": 7
    },
    "byCategory": {
      "security": 5,
      "performance": 4,
      "architecture": 6,
      "testing": 3
    }
  },
  "errors": [],
  "notes": ""
}
```

---

## Phase 3: Native Teams (Treatment)

### 3.1 Setup

```bash
# Enable native teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Verify enabled
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS  # Should output: 1

# Create run directory with external state
TEAM_ID="benchmark-run-{N}"
mkdir -p ~/.claude/teams/$TEAM_ID/state/{checkpoints,findings,handoffs}
mkdir -p ~/.claude/benchmarks/native-teams/run-{N}
```

### 3.2 Execution Protocol

For each run (N = 1 to 5):

```markdown
## Pre-Run Checklist
- [ ] Fresh Claude Code session (no prior context)
- [ ] Native teams enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)
- [ ] External state directory initialized
- [ ] Record session start timestamp
- [ ] Record initial /cost or equivalent baseline

## Execution

Initialize external state, then spawn native team:

"Create an agent team to review PR tradu/utop#296. Spawn four teammates:

1. security-reviewer:
   - Focus: OWASP vulnerabilities, auth issues, input validation, secrets exposure
   - Scope: All Java and TypeScript files
   - Write findings to: ~/.claude/teams/benchmark-run-{N}/state/findings/security.jsonl
   - Format: {"ts":"ISO8601","type":"vulnerability|issue|note","severity":"critical|high|medium|low","file":"path","line":N,"msg":"description","recommendation":"fix"}
   - At 80% context: Write checkpoint to state/checkpoints/security-{timestamp}.json

2. performance-reviewer:
   - Focus: N+1 queries, memory leaks, blocking calls, algorithmic complexity
   - Scope: Service classes, repository classes, React components
   - Write findings to: state/findings/performance.jsonl
   - Same format and checkpoint rules

3. architecture-reviewer:
   - Focus: SOLID violations, coupling issues, missing abstractions, pattern violations
   - Scope: All production code
   - Write findings to: state/findings/architecture.jsonl

4. test-reviewer:
   - Focus: Coverage gaps, missing edge cases, test quality issues
   - Scope: Test files and corresponding production code
   - Write findings to: state/findings/testing.jsonl

All teammates: Use JSONL format. Checkpoint at 80% context. Message me when complete.
I will synthesize from the JSONL files."

## Monitoring
- Use Shift+Up/Down to check teammate progress
- Use Ctrl+T to view shared task list
- Note any checkpoint/handoff events

## Post-Run Checklist
- [ ] Record session end timestamp
- [ ] Record final /cost or equivalent
- [ ] Copy external state files to benchmark directory
- [ ] Save lead agent transcript
- [ ] Note any errors, handoffs, or recoveries
```

### 3.3 Data Collection

Save to `~/.claude/benchmarks/native-teams/run-{N}/`:

```
run-{N}/
├── metadata.json           # Timestamps, costs, errors
├── lead-transcript.txt     # Lead agent conversation
├── findings.json           # Aggregated findings (from JSONL)
├── external-state/         # Copy of team state
│   ├── findings/
│   │   ├── security.jsonl
│   │   ├── performance.jsonl
│   │   ├── architecture.jsonl
│   │   └── testing.jsonl
│   ├── checkpoints/        # Any checkpoint files
│   └── handoffs/           # Any handoff records
└── notes.md               # Observer notes
```

### 3.4 Metrics Schema

Same as Task tool, plus:

```json
{
  "externalState": {
    "findingsFiles": 4,
    "totalFindingLines": 22,
    "checkpointFiles": 1,
    "handoffFiles": 0
  },
  "nativeTeams": {
    "teammatesSpawned": 4,
    "teammatesCompleted": 4,
    "contextCheckpoints": 1,
    "handoffs": 0
  }
}
```

---

## Phase 4: Token Measurement Methodology

Since exact token counts may not be directly exposed, use multiple proxy methods:

### 4.1 Method A: Cost Command (if available)

```bash
# Before run
/cost  # Record baseline

# After run
/cost  # Record final, calculate delta
```

### 4.2 Method B: Character Count Estimation

```python
# Estimate tokens from transcript length
# Rule of thumb: 1 token ≈ 4 characters (English)

def estimate_tokens(transcript_path):
    with open(transcript_path) as f:
        chars = len(f.read())
    return chars / 4
```

### 4.3 Method C: API Response Headers

If using API directly, capture `x-ratelimit-*` headers or usage metadata.

### 4.4 Method D: Conversation Turn Analysis

Count and categorize conversation turns:
- Tool calls (high token cost)
- File reads (proportional to file size)
- Agent spawns (fixed overhead + context copy for Task tool)
- Responses (proportional to length)

### 4.5 Calibration Run

Perform one calibration run with known content to establish conversion factors:
- Read a 1000-line file, note cost delta
- Spawn one agent with minimal task, note cost delta
- Generate 500-word response, note cost delta

---

## Phase 5: Quality Validation

### 5.1 Finding Extraction

Normalize all findings to common format:

```json
{
  "id": "RUN1-TASK-SEC-001",
  "run": 1,
  "approach": "task-tool",
  "category": "security",
  "severity": "high",
  "file": "AccountManagementController.java",
  "line": 145,
  "description": "Missing authorization check",
  "recommendation": "Add @PreAuthorize annotation"
}
```

### 5.2 Matching Algorithm

Match findings across runs and approaches:

```python
def match_findings(finding_a, finding_b):
    """
    Match if:
    - Same file (exact match)
    - Same line (±5 lines tolerance)
    - Similar description (>80% similarity via fuzzy match)
    """
    if finding_a['file'] != finding_b['file']:
        return False
    if abs(finding_a['line'] - finding_b['line']) > 5:
        return False
    if similarity(finding_a['description'], finding_b['description']) < 0.8:
        return False
    return True
```

### 5.3 Metrics Calculation

**Recall (vs Golden Baseline)**:
```
Recall = Findings matching golden / Total golden findings
```

**Precision (validated by human)**:
```
Precision = True positives / Total findings reported
```

**F1 Score**:
```
F1 = 2 * (Precision * Recall) / (Precision + Recall)
```

**Finding Overlap**:
```
Overlap = Findings in both approaches / Union of all findings
```

### 5.4 Human Validation Protocol

For each unique finding (deduplicated across all runs):

1. **Classify**: True Positive, False Positive, or Uncertain
2. **Severity Check**: Is reported severity accurate?
3. **Actionability**: Is the recommendation useful?

Validator must not know which approach produced the finding (blind review).

---

## Phase 6: Statistical Analysis

### 6.1 Token Comparison

```
H0: μ_task = μ_native (no difference)
H1: μ_native < μ_task (native teams more efficient)

Test: One-tailed paired t-test
α = 0.05
```

Report:
- Mean tokens (Task tool): X ± SD
- Mean tokens (Native teams): Y ± SD
- Reduction: (X - Y) / X * 100%
- p-value
- 95% CI for difference

### 6.2 Quality Comparison

```
H0: Recall_native = Recall_task
H1: Recall_native ≠ Recall_task

Test: McNemar's test (paired binary outcomes)
α = 0.05
```

Report:
- Recall (Task tool): X%
- Recall (Native teams): Y%
- Precision (Task tool): A%
- Precision (Native teams): B%
- F1 scores
- p-value for recall difference

### 6.3 Effect Size

Calculate Cohen's d for token reduction:
```
d = (μ_task - μ_native) / pooled_SD
```

Interpretation:
- d < 0.2: negligible
- 0.2 ≤ d < 0.5: small
- 0.5 ≤ d < 0.8: medium
- d ≥ 0.8: large

---

## Phase 7: Reporting

### 7.1 Summary Table

| Metric | Task Tool | Native Teams | Δ | p-value |
|--------|-----------|--------------|---|---------|
| Tokens (mean) | X | Y | -Z% | p |
| Duration (mean) | Xm | Ym | -Z% | p |
| Findings (mean) | X | Y | +Z% | p |
| Recall vs Golden | X% | Y% | +Z% | p |
| Precision | X% | Y% | +Z% | p |
| Handoffs | X | Y | - | - |

### 7.2 Detailed Analysis

- Token breakdown by agent/teammate
- Finding category distribution
- False positive analysis
- Unique findings per approach
- Handoff/recovery analysis (native teams)
- Failure mode comparison

### 7.3 Conclusion Template

```markdown
## Conclusion

**Token Efficiency**: Native teams consumed {X}% {fewer|more} tokens than Task tool
(p = {p}, 95% CI [{lower}, {upper}]). Effect size: {d} ({interpretation}).

**Quality**: Native teams achieved {X}% recall vs {Y}% for Task tool against
the golden baseline (p = {p}). Precision was {A}% vs {B}%.

**Recommendation**: {ADOPT|DO NOT ADOPT|CONDITIONAL ADOPT} Native Teams based on:
- Token savings: {significant|not significant}
- Quality impact: {improved|parity|degraded}
- Operational factors: {handoff reliability, recovery, complexity}
```

---

## Appendices

### A. Detailed Finding Schemas

[See templates/team-state-schemas.md]

### B. Run Checklists

[Printable checklists for each run]

### C. Raw Data Location

```
~/.claude/benchmarks/
├── golden-baseline.json
├── task-tool/
│   ├── run-1/
│   ├── run-2/
│   ├── run-3/
│   ├── run-4/
│   └── run-5/
├── native-teams/
│   ├── run-1/
│   ├── run-2/
│   ├── run-3/
│   ├── run-4/
│   └── run-5/
├── analysis/
│   ├── token-comparison.csv
│   ├── finding-matches.csv
│   ├── human-validation.csv
│   └── statistical-results.json
└── report/
    └── omnius-teams-validation-report.md
```

### D. Execution Timeline

| Day | Activity |
|-----|----------|
| 1 | Golden baseline: Human review |
| 2 | Calibration run + Task tool runs 1-2 |
| 3 | Task tool runs 3-5 |
| 4 | Native teams runs 1-2 |
| 5 | Native teams runs 3-5 |
| 6 | Finding extraction + matching |
| 7 | Human validation (blind review) |
| 8 | Statistical analysis + report |

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Test Designer | | |
| Golden Baseline Reviewer 1 | | |
| Golden Baseline Reviewer 2 | | |
| Test Executor | | |
| Finding Validator | | |
| Statistical Reviewer | | |
