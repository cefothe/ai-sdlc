---
name: code-coverage
description: Comprehensive test coverage analysis and validation using Native Teams.
---


# /code:coverage

Comprehensive test coverage analysis and validation

## Launch Native Teams Coverage Analysis

1. Create coverage team:
   ```
   TeamCreate(team_name="coverage-{timestamp}")
   ```

2. Spawn ALL agents in parallel:

   **REQUIRED** teammates:
   ```
   Task(subagent_type="general-purpose", team_name="coverage-{timestamp}", name="test-execution")
   Task(subagent_type="general-purpose", team_name="coverage-{timestamp}", name="untested-paths")
   Task(subagent_type="general-purpose", team_name="coverage-{timestamp}", name="coverage-config")
   ```

   **CONDITIONAL** teammates (based on codebase):
   ```
   Task(subagent_type="performance-engineer", team_name=..., name="coverage-impact")    # coverage impact analysis
   Task(subagent_type="backend-architect", team_name=..., name="test-architecture")     # if architectural changes
   Task(subagent_type="security-auditor", team_name=..., name="security-coverage")      # if security-focused
   Task(subagent_type="android-expert", team_name=..., name="android-coverage")         # if Android codebase
   Task(subagent_type="ios-expert", team_name=..., name="ios-coverage")                 # if iOS codebase
   ```

3. Each writes to `~/.claude/teams/coverage-{timestamp}/state/findings/{name}.jsonl`

4. Aggregate findings from JSONL, identify critical gaps

5. Clean up:
   ```
   TeamDelete
   ```

INTELLIGENT MEMORY MANAGEMENT:
- [ ] ALWAYS delegate large data to specialized agents
- [ ] Use streaming processing for all large datasets
- [ ] Agents return summaries, not raw data
- [ ] Process directory-by-directory for large codebases
- [ ] Agents handle context management internally


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Coverage Analysis Requirements

### Coverage Report Generation
- [ ] Generate coverage report using project's coverage tool
- [ ] Include line, branch, and function coverage
- [ ] Generate HTML report for detailed analysis
- [ ] Export coverage data in machine-readable format

### Coverage Threshold Validation
- [ ] **Line Coverage**: ≥90% for new/modified code
- [ ] **Branch Coverage**: ≥85% for new/modified code
- [ ] **Function Coverage**: ≥95% for new/modified functions
- [ ] **Overall Coverage**: Maintain or improve existing coverage

## Detailed Coverage Analysis

### Uncovered Code Identification
- [ ] List all uncovered lines with file:line references
- [ ] Identify uncovered branches and conditions
- [ ] Find untested functions and methods
- [ ] Highlight complex untested code paths

### Coverage Quality Assessment
- [ ] Distinguish meaningful tests from trivial coverage
- [ ] Identify tests that don't exercise real logic
- [ ] Find redundant or overlapping test coverage
- [ ] Assess edge case coverage completeness

### Risk Assessment
- [ ] Prioritize uncovered code by business criticality
- [ ] Identify high-complexity uncovered functions
- [ ] Flag security-sensitive untested paths
- [ ] Mark error handling paths without coverage

## Coverage Improvement Plan

### Test Gap Analysis
- [ ] Generate list of missing test scenarios
- [ ] Suggest test cases for uncovered branches
- [ ] Identify integration test opportunities
- [ ] Plan property-based or fuzz testing for complex logic

### Implementation Priority
- [ ] **Critical**: Security, payment, data loss scenarios
- [ ] **High**: Core business logic, API endpoints
- [ ] **Medium**: Utility functions, helper methods
- [ ] **Low**: Configuration, logging, trivial getters

## Coverage Reporting

### Summary Report
```markdown
## Coverage Summary
- **Line Coverage**: X.X% (Target: ≥90%)
- **Branch Coverage**: X.X% (Target: ≥85%)
- **Function Coverage**: X.X% (Target: ≥95%)
- **Overall Trend**: ↗️ Improving / ↘️ Declining / → Stable

## Critical Gaps
- file:line - High complexity function missing tests
- file:line - Security-critical path untested
- file:line - Error handling not covered

## Recommended Actions
1. Add tests for critical business logic
2. Cover error scenarios and edge cases
3. Implement integration tests for workflows
```

## Coverage Tool Integration

### Detect Coverage Tools
- [ ] Check for Jest configuration (jest.config.js)
- [ ] Look for pytest-cov setup (pytest.ini, pyproject.toml)
- [ ] Find Go test coverage commands
- [ ] Detect JaCoCo configuration (Java)
- [ ] Check for coverage.py setup (Python)

### Generate Reports
- [ ] Run coverage with appropriate flags
- [ ] Generate both console and HTML output
- [ ] Create coverage badges if supported
- [ ] Export results for CI/CD integration

## Quality Gates

### Coverage Requirements
- [ ] **New Code**: 100% line coverage (no exceptions)
- [ ] **Modified Code**: Must maintain or improve coverage
- [ ] **Critical Paths**: 100% branch coverage required
- [ ] **Public APIs**: Complete test coverage mandatory

### Coverage Trends
- [ ] Coverage percentage not decreasing
- [ ] New untested complexity kept minimal
- [ ] Test quality improving (not just quantity)
- [ ] Coverage gaps decreasing over time

## Integration with Development Workflow

### Pre-Commit Validation
- [ ] Coverage thresholds enforced locally
- [ ] Fail commit if coverage drops below minimum
- [ ] Generate coverage diff for changed files
- [ ] Warn about uncovered new code

### CI/CD Integration
- [ ] Coverage reports published to build artifacts
- [ ] Coverage trends tracked over time
- [ ] PR comments with coverage impact
- [ ] Block merges below coverage thresholds

## NEVER PROCEED IF:
- ❌ Coverage tools not properly configured
- ❌ Tests failing (fix tests before analyzing coverage)
- ❌ Coverage below minimum thresholds for new code
- ❌ Critical business logic paths uncovered
- ❌ Security-sensitive functions not tested
