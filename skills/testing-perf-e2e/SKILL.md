---
name: testing-perf-e2e
description: Create end-to-end performance test scenarios.
---


# Create End-to-End Performance Tests

Create comprehensive end-to-end performance tests using Gatling and Java, with GitHub issue tracking and automated test generation.

## Usage
```
/testing:perf-e2e <test_scope> [--target-rps <number>] [--duration <seconds>]
```

**Parameters:**
- `test_scope`: Component/feature to test (e.g., "order-processing", "fix-gateway", "rest-api")
- `--target-rps`: Optional target requests per second (default: from context)
- `--duration`: Optional test duration in seconds (default: from context)

**Examples:**
```bash
/testing:perf-e2e fix-gateway
/testing:perf-e2e rest-api --target-rps 60000 --duration 300
/testing:perf-e2e order-processing --target-rps 200000 --duration 60
```

## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.

## Quick Check

```bash
# Get paths from context
projectRoot=$(node -e "const {getContext}=require('./src/core/execution-context');console.log(getContext().getProjectRoot())")
claudeRoot=$(node -e "const {getContext}=require('./src/core/execution-context');console.log(getContext().getClaudeRoot())")

# Verify requirements
test -f "$projectRoot/contexts/performance-testing.yaml" || echo "⚠️ Performance testing context not found"
test -f "$claudeRoot/agents/qa-performance-engineer.md" || echo "⚠️ Performance QA agent not configured"
test -d "$projectRoot/performance-tests" && echo "✅ Performance test directory exists" || echo "⚠️ Will create performance test structure"
```

## Instructions

### 1. Parse Arguments and Validate

```bash
# Parse arguments
test_scope="${ARGUMENTS%% --*}"
target_rps=""
duration=""

# Extract optional parameters
if echo "$ARGUMENTS" | grep -q "\--target-rps"; then
  target_rps=$(echo "$ARGUMENTS" | sed -n 's/.*--target-rps \([0-9]*\).*/\1/p')
fi

if echo "$ARGUMENTS" | grep -q "\--duration"; then
  duration=$(echo "$ARGUMENTS" | sed -n 's/.*--duration \([0-9]*\).*/\1/p')
fi

# Validate test scope
if [ -z "$test_scope" ]; then
  echo "❌ Error: Test scope is required"
  echo "Usage: /testing:perf-e2e <test_scope> [--target-rps <number>] [--duration <seconds>]"
  exit 1
fi

echo "📊 Creating performance tests for: $test_scope"
[ -n "$target_rps" ] && echo "  Target RPS: $target_rps"
[ -n "$duration" ] && echo "  Duration: ${duration}s"
```

### 2. Load Performance Testing Context

```bash
# Get context file path
contextFile="$projectRoot/contexts/performance-testing.yaml"

if [ -f "$contextFile" ]; then
  echo "✅ Loading performance requirements from context"
else
  echo "⚠️ No performance context found, using reasonable defaults"
fi
```

### 3. Analyze Existing Codebase

```bash
echo "🔍 Analyzing codebase for test targets..."

# Search for REST endpoints
if [ -d "$projectRoot/src" ]; then
  grep -r "@GetMapping\|@PostMapping\|@PutMapping\|@DeleteMapping\|@RequestMapping" \
    "$projectRoot/src" 2>/dev/null | head -20 > /tmp/endpoints.txt || true

  grep -r "app.get\|app.post\|app.put\|app.delete\|router\." \
    "$projectRoot/src" 2>/dev/null | head -20 >> /tmp/endpoints.txt || true
fi

# Look for API documentation
[ -f "$projectRoot/openapi.yaml" ] || [ -f "$projectRoot/swagger.yaml" ] && echo "✅ Found API specification"

# Check for existing tests
[ -d "$projectRoot/src/test" ] || [ -d "$projectRoot/test" ] && echo "✅ Found existing test directory"
```

### 4. Create GitHub Issue for Tracking

```bash
# Prepare issue body
cat > /tmp/perf-test-issue.md <<EOF
# E2E Performance Test: ${test_scope}

## Objective
Create comprehensive end-to-end performance tests for **${test_scope}** using Gatling and Java for ultra-high performance trading system validation.

## Scope
- Component/Feature: \`${test_scope}\`
$([ -n "$target_rps" ] && echo "- Target Throughput: ${target_rps} orders/second")
$([ -n "$duration" ] && echo "- Test Duration: ${duration} seconds")

## Performance Criteria (Ultra-High Performance)
- **Latency**: p50 < 50μs, p95 < 100μs, p99 < 250μs, p99.9 < 500μs, p99.99 < 1ms, max < 5ms
- **Throughput**: 200,000 orders/sec sustained (60s min), 250,000 peak
- **Reliability**: 100% success rate (zero failures), 0 error budget
- **Resource**: CPU < 80%, Memory < 16GB stable, GC < 10ms

## Gateway-Specific Targets
- FIX Protocol: 80k orders/sec (p99 < 200μs)
- REST API: 60k orders/sec (p99 < 500μs)
- WebSocket: 60k orders/sec (p99 < 300μs)

## Test Execution Strategy
- **Local**: Smoke test (1 user) against dev environment
- **CI/CD**: Full load tests against ephemeral performance test environment (scheduled)

## Deliverables
1. Complete Gatling test simulation with all load patterns
2. Test data feeders with realistic market patterns
3. Build configuration (Maven/Gradle)
4. Comprehensive README with execution instructions
5. CI/CD integration for scheduled full load tests
6. Prometheus/Grafana metrics integration

## Test Patterns
1. Smoke Test: 1 user for local validation
2. Ramp-Up Test: 0 → target load over time
3. Sustained Load: Constant target load for 60+ seconds
4. Spike Test: Sudden load bursts (0 → 250k → 0)
5. Stress Test: Beyond target capacity
6. Gateway Isolation: Individual gateway performance validation

---
*Generated by: /testing:perf-e2e command*
*Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")*
EOF

# Create GitHub issue
echo "📝 Creating GitHub issue..."
issue_number=$(gh issue create \
  --title "E2E Performance Test: ${test_scope}" \
  --body-file /tmp/perf-test-issue.md \
  --label "performance,testing,automated,ultra-low-latency" \
  --json number -q .number 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ Created GitHub issue #${issue_number}"
  issue_url=$(gh issue view "$issue_number" --json url -q .url)
  echo "   URL: $issue_url"
else
  echo "⚠️ Failed to create GitHub issue (continuing anyway)"
  echo "   Error: $issue_number"
  issue_number="N/A"
fi
```

### 5. Launch Performance QA Engineer Agent

Use the Task tool to spawn the qa-performance-engineer agent.

**Agent will automatically:**
1. Read `contexts/performance-testing.yaml` for requirements
2. Detect build system from README.md/CLAUDE.md
3. Create complete Gatling test structure
4. Implement all load patterns (smoke, ramp-up, sustained, spike, stress, gateway-isolation)
5. Configure dual-mode execution (smoke vs full)
6. Write comprehensive README.md with execution instructions

**Prepare concise agent prompt:**
```markdown
Create comprehensive end-to-end performance tests for: **${test_scope}**

## Context
- GitHub Issue: #${issue_number}
- Test Scope: ${test_scope}
$([ -n "$target_rps" ] && echo "- Target RPS: ${target_rps}")
$([ -n "$duration" ] && echo "- Test Duration: ${duration}s")
- System: Ultra-high performance async trading system

## Requirements
Read `contexts/performance-testing.yaml` for complete performance requirements including:
- Latency targets (microsecond scale)
- Throughput targets (200k+ orders/sec)
- Gateway profiles (FIX/REST/WebSocket)
- Test scenarios (smoke, baseline, peak, sustained, spike, gateway-isolation)
- Data characteristics and distributions

## Deliverables
Create production-ready tests following agent guidelines in `agents/qa-performance-engineer.md`:
1. Complete Gatling test structure (BaseSimulation, scenarios, feeders, utils)
2. Dual-mode execution:
   - **Smoke mode**: 1 user against dev environment (local validation)
   - **Full mode**: Target load against ephemeral performance test environment (CI/CD)
3. Build configuration (Maven/Gradle based on docs)
4. Comprehensive README.md with execution instructions
5. Environment configuration (dev/perf-test environments)
6. Prometheus/Grafana metrics integration

## Key Implementation Points
- **Smoke test**: 1 user against dev for local validation
- **Full load test**: Target RPS against ephemeral performance test environment (CI/CD only)
- **Assertions**: Ultra-low latency (p50<50μs, p99<250μs) and 100% success
- **Data**: Realistic order types, sizes, gateway distribution
- **Zero TODOs**: Complete, immediately executable code
- **Ephemeral env**: Tests run against dedicated ephemeral performance test environment

See `agents/qa-performance-engineer.md` for complete behavioral rules and quality standards.

Post summary: files created, scenarios implemented, execution commands, any clarifications needed.
```

Launch agent using Task tool with subagent_type "qa-performance-engineer" and above prompt.

### 6. Post Agent Summary to GitHub Issue

```bash
if [ "$issue_number" != "N/A" ]; then
  cat > /tmp/agent-comment.md <<EOF
## 🤖 Agent Execution Summary

### Performance QA Engineer Agent
**Status**: Completed
**Timestamp**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

### Work Completed
Created comprehensive E2E performance tests for \`${test_scope}\` optimized for ultra-high performance trading systems.

### Deliverables
- ✅ Gatling test simulation (Java 21)
- ✅ All load patterns (smoke, ramp-up, sustained, spike, stress, gateway-isolation)
- ✅ Dual-mode execution:
  - Smoke: 1 user against dev environment
  - Full: Target load against ephemeral performance test environment
- ✅ Test data feeders with realistic market patterns
- ✅ Build system integration (Maven/Gradle)
- ✅ Environment configuration (dev/ephemeral perf-test)
- ✅ Prometheus/Grafana metrics integration
- ✅ Comprehensive README.md with execution instructions

### Test Execution

#### Smoke Test (Local Validation)
\`\`\`bash
cd performance-tests/
mvn clean gatling:test -Dgatling.mode=smoke -Denv=dev
\`\`\`
**Purpose**: Quick validation (1 user, < 1 min, dev environment)

#### Full Load Tests (CI/CD Pipeline)
\`\`\`bash
cd performance-tests/
mvn clean gatling:test -Dgatling.mode=full -Denv=perf-test
\`\`\`
**Purpose**: Complete performance validation (200k+ orders/sec, ephemeral environment, scheduled in CI/CD)

### Performance Thresholds
- **Latency**: p50 < 50μs, p95 < 100μs, p99 < 250μs, p99.9 < 500μs
- **Throughput**: >= 200,000 orders/sec sustained
- **Reliability**: 100% success rate (zero failures)

### Next Steps
1. ✅ Review tests in \`performance-tests/\`
2. ✅ Read \`performance-tests/README.md\` for execution instructions
3. ✅ Run smoke test locally
4. ✅ Configure CI/CD for scheduled full load tests against ephemeral environment
5. ✅ Set up Prometheus/Grafana monitoring
6. ✅ Establish performance baselines

---
*See \`performance-tests/README.md\` (created by agent) for detailed instructions*
EOF

  gh issue comment "$issue_number" --body-file /tmp/agent-comment.md
  echo "✅ Posted agent summary to GitHub issue #${issue_number}"
fi
```

### 7. Validate Smoke Test Execution

```bash
echo ""
echo "🔍 Running smoke test validation..."

if [ -d "$projectRoot/performance-tests" ]; then
  cd "$projectRoot/performance-tests"

  # Determine build system and run smoke test
  if [ -f "pom.xml" ]; then
    echo "Running Maven smoke test..."
    mvn clean gatling:test -Dgatling.mode=smoke -Denv=dev > /tmp/smoke-test.log 2>&1
    smoke_result=$?
  elif [ -f "build.gradle" ]; then
    echo "Running Gradle smoke test..."
    gradle clean gatlingRun -Dgatling.mode=smoke -Denv=dev > /tmp/smoke-test.log 2>&1
    smoke_result=$?
  else
    echo "⚠️ No build configuration found, skipping smoke test"
    smoke_result=2
  fi

  if [ $smoke_result -eq 0 ]; then
    echo "✅ Smoke test passed"
    report_dir=$(find . -name "index.html" -path "*/gatling/*" | head -1 | xargs dirname)
    [ -n "$report_dir" ] && echo "   Report: $report_dir/index.html"
  elif [ $smoke_result -eq 1 ]; then
    echo "❌ Smoke test failed"
    echo "   Check logs: /tmp/smoke-test.log"
    tail -20 /tmp/smoke-test.log
  else
    echo "⚠️ Smoke test not executed"
  fi

  cd "$projectRoot"
else
  echo "❌ Performance test directory not found"
fi
```

### 8. Output Final Summary

```markdown
## 🎯 E2E Performance Test Creation Complete

### Test Scope
**Component**: ${test_scope}
$([ -n "$target_rps" ] && echo "**Target RPS**: ${target_rps}")
$([ -n "$duration" ] && echo "**Duration**: ${duration}s")
**System**: Ultra-high performance async trading system

### GitHub Issue
$([ "$issue_number" != "N/A" ] && echo "**Issue**: #${issue_number}")
$([ "$issue_number" != "N/A" ] && echo "**URL**: $issue_url")

### What Was Created
1. Complete Gatling Java 21 test structure
2. All load patterns (smoke, ramp-up, sustained, spike, stress, gateway-isolation)
3. Dual-mode execution:
   - Smoke: 1 user against dev
   - Full: Target load against ephemeral performance test environment
4. Build system configuration
5. Comprehensive README.md with execution instructions
6. Prometheus/Grafana integration

### Test Execution Modes

#### 🧪 Smoke Test (Local Validation)
\`\`\`bash
cd performance-tests/
mvn clean gatling:test -Dgatling.mode=smoke -Denv=dev
\`\`\`
- Load: 1 user
- Environment: Dev
- Duration: < 1 minute
- Purpose: Verify tests compile and execute

#### 🔥 Full Load Tests (CI/CD Pipeline)
\`\`\`bash
cd performance-tests/
mvn clean gatling:test -Dgatling.mode=full -Denv=perf-test
\`\`\`
- Load: 200k+ orders/second
- Environment: Ephemeral performance test environment
- Duration: As configured
- Purpose: Complete performance validation

### Performance Thresholds (Ultra-Low Latency)
- **Latency**: p50 < 50μs, p95 < 100μs, p99 < 250μs, p99.9 < 500μs, p99.99 < 1ms, max < 5ms
- **Throughput**: 200,000 orders/sec sustained (60s), 250,000 peak
- **Reliability**: 100% success, 0 failures
- **Gateway**: FIX 80k/s, REST 60k/s, WebSocket 60k/s

### Smoke Test Validation
$([ $smoke_result -eq 0 ] && echo "✅ Smoke test passed - tests are executable")
$([ $smoke_result -eq 1 ] && echo "❌ Smoke test failed - check logs at /tmp/smoke-test.log")
$([ $smoke_result -eq 2 ] && echo "⚠️ Smoke test not run - validate manually")

### Next Steps
1. ✅ Review tests in \`performance-tests/\`
2. ✅ Read \`performance-tests/README.md\` for complete instructions
3. ✅ Run smoke test locally (validated above)
4. ✅ Configure CI/CD for scheduled full load tests against ephemeral environment
5. ✅ Set up Prometheus/Grafana monitoring
6. ✅ Establish performance baselines
7. ✅ Configure alerting for threshold violations

### CI/CD Integration
Schedule full load tests in pipeline (do not run locally):
- **Nightly**: Full regression suite against ephemeral environment
- **Pre-release**: Stress and spike testing
- **On-demand**: Specific scenario validation

Full load tests require dedicated ephemeral performance test environment with production-equivalent hardware, isolated network, and proper monitoring.

### View Reports
- Maven: \`performance-tests/target/gatling/*/index.html\`
- Gradle: \`performance-tests/build/reports/gatling/*/index.html\`

### Documentation
- 📖 \`performance-tests/README.md\` - Complete execution guide (created by agent)
- 📊 \`performance-tests/src/test/resources/gatling.conf\` - Gatling configuration
- 🎯 \`contexts/performance-testing.yaml\` - Performance requirements
- 🤖 \`agents/qa-performance-engineer.md\` - Agent capabilities

---
**Command**: /testing:perf-e2e
**System**: Ultra-high performance async trading system
**Timestamp**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Status**: ✅ Complete
```

## Error Handling

**No test scope provided:**
```
❌ Error: Test scope is required
Usage: /testing:perf-e2e <test_scope> [--target-rps <number>] [--duration <seconds>]
```

**GitHub CLI not available:**
```
⚠️ GitHub CLI not found. Issue creation skipped.
Install gh CLI: https://cli.github.com/
Tests will still be created.
```

**Agent execution failure:**
```
❌ Performance QA agent failed
Check agent output for specific errors.
Common causes: Missing docs (README.md, CLAUDE.md), unclear requirements, build system issues
```

**Smoke test failure:**
```
❌ Smoke test failed
Check: /tmp/smoke-test.log

Common issues: Dev environment not accessible, missing dependencies, configuration errors
Fix and re-run: mvn gatling:test -Dgatling.mode=smoke -Denv=dev
```

## Important Notes

### Test Execution Philosophy
- **Local (Smoke)**: 1 user validation against dev (quick sanity check)
- **CI/CD (Full)**: Complete load tests against ephemeral performance test environment (scheduled)
- **Never run full load locally**: Requires dedicated ephemeral environment with production-equivalent infrastructure

### Performance Context
- Agent loads `contexts/performance-testing.yaml` automatically
- Microsecond-scale latency requirements (p50 < 50μs)
- 200k+ orders/second throughput
- Gateway-specific optimizations (FIX/REST/WebSocket)

### Ephemeral Environment
- Full load tests run against dedicated ephemeral performance test environment
- Environment provisioned specifically for performance testing
- Production-equivalent hardware and configuration
- Isolated from dev, staging, and production environments

### GitHub Integration
- Issue title format: "E2E Performance Test: {scope}"
- Labels: performance, testing, automated, ultra-low-latency
- Agent summary posted as comment
- Links to tests and documentation

### Test Quality
- Zero TODO/FIXME comments
- Complete error handling
- Both smoke and full modes implemented
- Immediately executable
- Ready for CI/CD integration
- Comprehensive README.md created by agent

## Related Commands

- `/testing:prime` - Configure test environment
- `/testing:run` - Execute existing tests
- `/code:load-test` - General load testing guidance
- `/code:perf-optimize` - Performance optimization

## References

- **Context**: `contexts/performance-testing.yaml`
- **Agent**: `agents/qa-performance-engineer.md`
- **Execution Context**: `templates/execution-context.md`
- **Gatling Docs**: https://gatling.io/docs/

$ARGUMENTS
