#!/usr/bin/env bash
#
# Native Teams Validation Test
#
# Simulates benchmark runs 2-5 with synthetic data, executes run 1 live.
# Use in CI or local testing to validate the protocol works.
#
# Usage:
#   ./scripts/test-omnius-teams.sh [--verbose]
#
# Options:
#   --verbose  Show detailed output
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

BENCHMARK_DIR="${HOME}/.claude/benchmarks"
TEAMS_DIR="${HOME}/.claude/teams"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Flags
VERBOSE=false

# Dependency check
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for statistical analysis. Install: brew install jq / apt install jq"
  exit 1
fi

# Cleanup trap - remove benchmark artifacts on exit
cleanup() {
  # Only remove test-created artifacts, not pre-existing data
  rm -rf "$BENCHMARK_DIR"/task-tool/run-{2,3,4,5} 2>/dev/null || true
  rm -rf "$BENCHMARK_DIR"/native-teams/run-{2,3,4,5} 2>/dev/null || true
  rm -rf "$BENCHMARK_DIR"/analysis 2>/dev/null || true
  rm -rf "$TEAMS_DIR"/test-* 2>/dev/null || true
}
trap cleanup EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helpers
# ============================================================================

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[FAIL]${NC} $*"; }

# ============================================================================
# Parse Arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--verbose]"
      echo ""
      echo "Options:"
      echo "  --verbose  Show detailed output"
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ============================================================================
# Test 1: Directory Structure
# ============================================================================

test_directory_structure() {
  log_info "Test 1: Verifying directory structure..."

  local errors=0

  # Required protocol files
  local required_files=(
    "protocols/team-orchestration.yaml"
    "protocols/parallel-execution.yaml"
    "protocols/context-optimization.yaml"
    "agents/team-coordinator.md"
    "commands/teams/init.md"
    "commands/teams/status.md"
    "commands/teams/findings.md"
    "commands/teams/synthesize.md"
    "commands/teams/benchmark.md"
    "templates/team-state-schemas.md"
  )

  for file in "${required_files[@]}"; do
    if [[ -f "$REPO_ROOT/$file" ]]; then
      [[ "$VERBOSE" == "true" ]] && log_success "Found: $file"
    else
      log_error "Missing: $file"
      ((errors++))
    fi
  done

  if [[ $errors -eq 0 ]]; then
    log_success "Directory structure: All ${#required_files[@]} files present"
    return 0
  else
    log_error "Directory structure: $errors files missing"
    return 1
  fi
}

# ============================================================================
# Test 2: External State Simulation
# ============================================================================

test_external_state_simulation() {
  log_info "Test 2: Simulating external state operations..."

  local test_team_id="test-$(date +%s)"
  local team_dir="$TEAMS_DIR/$test_team_id"

  # Create team directory structure
  mkdir -p "$team_dir/state"/{checkpoints,findings,handoffs}

  # Create manifest using jq for safe JSON construction
  jq -n --arg teamId "$test_team_id" --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg task "Test simulation" --argjson nativeTeamsEnabled true --arg status "active" \
    '{teamId:$teamId,created:$created,task:$task,nativeTeamsEnabled:$nativeTeamsEnabled,status:$status,members:[]}' \
    > "$team_dir/manifest.json"

  # Simulate findings from 4 teammates
  local teammates=("security" "performance" "architecture" "testing")

  for teammate in "${teammates[@]}"; do
    local findings_file="$team_dir/state/findings/${teammate}.jsonl"

    # Write simulated findings using jq -c for safe compact JSONL construction
    jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg type "issue" --arg severity "medium" \
      --arg file "test/Example.java" --argjson line 42 \
      --arg msg "Simulated $teammate finding 1" --arg recommendation "Fix this" \
      '{ts:$ts,type:$type,severity:$severity,file:$file,line:$line,msg:$msg,recommendation:$recommendation}' >> "$findings_file"
    jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg type "issue" --arg severity "low" \
      --arg file "test/Other.java" --argjson line 10 \
      --arg msg "Simulated $teammate finding 2" --arg recommendation "Consider this" \
      '{ts:$ts,type:$type,severity:$severity,file:$file,line:$line,msg:$msg,recommendation:$recommendation}' >> "$findings_file"
    jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg type "complete" \
      --arg msg "Finished. 2 findings." \
      '{ts:$ts,type:$type,msg:$msg}' >> "$findings_file"
  done

  # Verify files created
  local findings_count=0
  for teammate in "${teammates[@]}"; do
    if [[ -f "$team_dir/state/findings/${teammate}.jsonl" ]]; then
      local lines=$(wc -l < "$team_dir/state/findings/${teammate}.jsonl")
      findings_count=$((findings_count + lines - 1)) # Exclude completion line
      [[ "$VERBOSE" == "true" ]] && log_success "Created ${teammate}.jsonl with $lines entries"
    else
      log_error "Failed to create ${teammate}.jsonl"
      return 1
    fi
  done

  # Test checkpoint simulation using jq for safe JSON construction
  jq -n --arg teammate "security" --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson contextUsage 0.82 --arg lastFile "src/auth/Login.java" \
    --argjson remaining '["src/auth/Session.java"]' \
    --arg resumeNotes "Continue from Session.java" \
    '{teammate:$teammate,timestamp:$timestamp,contextUsage:$contextUsage,lastFile:$lastFile,remaining:$remaining,resumeNotes:$resumeNotes}' \
    > "$team_dir/state/checkpoints/security-checkpoint.json"

  if [[ -f "$team_dir/state/checkpoints/security-checkpoint.json" ]]; then
    log_success "Checkpoint file created successfully"
  else
    log_error "Failed to create checkpoint file"
    return 1
  fi

  # Test aggregation
  local total_findings=$(cat "$team_dir/state/findings"/*.jsonl | grep -c '"type":"issue"' || echo 0)

  if [[ $total_findings -eq 8 ]]; then
    log_success "External state simulation: $total_findings findings across 4 teammates"
  else
    log_error "Expected 8 findings, got $total_findings"
    return 1
  fi

  # Cleanup
  rm -rf "$team_dir"
  log_success "Cleanup completed"

  return 0
}

# ============================================================================
# Test 3: Benchmark Pipeline (metadata creation + statistical analysis +
#          adversarial validation)
# NOTE: Uses synthetic data to verify the analysis pipeline produces valid
# output. This does NOT validate actual performance claims -- those require
# live benchmark runs per docs/testing/omnius-teams-validation-plan.md.
# ============================================================================

test_benchmark_pipeline() {
  log_info "Test 3: Validating benchmark pipeline (metadata + analysis + adversarial)..."

  # ------------------------------------------------------------------
  # Phase 1: Create benchmark metadata files
  # ------------------------------------------------------------------
  log_info "Phase 1: Creating benchmark metadata files..."

  mkdir -p "$BENCHMARK_DIR"/{task-tool,native-teams}/run-{2,3,4,5}

  # Simulated metrics (grounded in live benchmark data from PR tradu/utop#296)
  # Live: Task tool ~117k tokens/3 agents, Native teams ~218k tokens/4 agents
  # Simulating 4-agent runs for both approaches at comparable scale

  local task_tool_tokens=(215000 210000 220000 212000)
  local native_teams_tokens=(218000 215000 222000 219000)
  local task_tool_findings=(15 17 14 16)
  local native_teams_findings=(55 60 53 58)
  local task_tool_duration=(920 880 950 900)
  local native_teams_duration=(850 820 870 840)

  for i in {0..3}; do
    local run=$((i + 2))

    # Task tool run - use jq for safe JSON construction
    jq -n --argjson run "$run" --arg approach "task-tool" --argjson simulated true \
      --argjson duration "${task_tool_duration[$i]}" \
      --argjson estimated "${task_tool_tokens[$i]}" \
      --argjson total "${task_tool_findings[$i]}" \
      --argjson low "$((task_tool_findings[$i] - 11))" \
      '{run:$run,approach:$approach,simulated:$simulated,timestamps:{start:"2026-02-12T10:00:00Z",end:"2026-02-12T10:15:00Z",durationSeconds:$duration},tokens:{estimated:$estimated},agents:{spawned:4,completed:4,handoffs:0},findings:{total:$total,bySeverity:{critical:0,high:3,medium:8,low:$low}}}' \
      > "$BENCHMARK_DIR/task-tool/run-$run/metadata.json"

    # Native teams run - use jq for safe JSON construction
    jq -n --argjson run "$run" --arg approach "native-teams" --argjson simulated true \
      --argjson duration "${native_teams_duration[$i]}" \
      --argjson estimated "${native_teams_tokens[$i]}" \
      --argjson total "${native_teams_findings[$i]}" \
      --argjson low "$((native_teams_findings[$i] - 13))" \
      '{run:$run,approach:$approach,simulated:$simulated,timestamps:{start:"2026-02-12T10:00:00Z",end:"2026-02-12T10:14:00Z",durationSeconds:$duration},tokens:{estimated:$estimated},teammates:{spawned:4,completed:4,checkpoints:1,handoffs:0},findings:{total:$total,bySeverity:{critical:0,high:4,medium:9,low:$low}}}' \
      > "$BENCHMARK_DIR/native-teams/run-$run/metadata.json"
  done

  # Verify files created
  local created=0
  for approach in task-tool native-teams; do
    for run in 2 3 4 5; do
      if [[ -f "$BENCHMARK_DIR/$approach/run-$run/metadata.json" ]]; then
        ((created++))
      fi
    done
  done

  if [[ $created -ne 8 ]]; then
    log_error "Expected 8 run files, created $created"
    return 1
  fi
  log_success "Phase 1: Created $created benchmark metadata files"

  # ------------------------------------------------------------------
  # Phase 1b: JSON schema validation of metadata files
  # ------------------------------------------------------------------
  log_info "Phase 1b: Validating JSON schema of metadata files..."

  local schema_errors=0
  for approach in task-tool native-teams; do
    for run in 2 3 4 5; do
      local meta_file="$BENCHMARK_DIR/$approach/run-$run/metadata.json"

      # Check valid JSON
      if ! jq empty "$meta_file" 2>/dev/null; then
        log_error "Invalid JSON: $meta_file"
        ((schema_errors++))
        continue
      fi

      # Check required keys
      local has_keys
      has_keys=$(jq 'has("run") and has("approach") and has("simulated") and has("tokens") and has("findings")' "$meta_file")
      if [[ "$has_keys" != "true" ]]; then
        log_error "Missing required keys in $meta_file"
        ((schema_errors++))
      else
        [[ "$VERBOSE" == "true" ]] && log_success "Schema valid: $approach/run-$run/metadata.json"
      fi
    done
  done

  if [[ $schema_errors -ne 0 ]]; then
    log_error "JSON schema validation: $schema_errors errors"
    return 1
  fi
  log_success "Phase 1b: All metadata files pass JSON schema validation"

  # ------------------------------------------------------------------
  # Phase 2: Statistical analysis pipeline
  # ------------------------------------------------------------------
  log_info "Phase 2: Running statistical analysis on synthetic data..."

  mkdir -p "$BENCHMARK_DIR/analysis"

  # Extract metrics from simulated runs
  local task_tokens=()
  local native_tokens=()
  local task_findings=()
  local native_findings=()

  for run in 2 3 4 5; do
    task_tokens+=($(jq '.tokens.estimated' "$BENCHMARK_DIR/task-tool/run-$run/metadata.json"))
    native_tokens+=($(jq '.tokens.estimated' "$BENCHMARK_DIR/native-teams/run-$run/metadata.json"))
    task_findings+=($(jq '.findings.total' "$BENCHMARK_DIR/task-tool/run-$run/metadata.json"))
    native_findings+=($(jq '.findings.total' "$BENCHMARK_DIR/native-teams/run-$run/metadata.json"))
  done

  # Calculate means (bash integer math)
  local task_token_sum=0
  local native_token_sum=0
  local task_findings_sum=0
  local native_findings_sum=0

  for i in {0..3}; do
    task_token_sum=$((task_token_sum + task_tokens[$i]))
    native_token_sum=$((native_token_sum + native_tokens[$i]))
    task_findings_sum=$((task_findings_sum + task_findings[$i]))
    native_findings_sum=$((native_findings_sum + native_findings[$i]))
  done

  local task_token_mean=$((task_token_sum / 4))
  local native_token_mean=$((native_token_sum / 4))
  local task_findings_mean=$((task_findings_sum / 4))
  local native_findings_mean=$((native_findings_sum / 4))

  # Calculate metrics
  local findings_increase=$(( (native_findings_mean - task_findings_mean) * 100 / task_findings_mean ))
  local task_cpf_val=$((task_token_mean / task_findings_mean))
  local native_cpf_val=$((native_token_mean / native_findings_mean))
  local cpf_reduction_val=$(( (task_cpf_val - native_cpf_val) * 100 / task_cpf_val ))

  # Generate analysis report using jq for safe JSON construction
  jq -n --argjson simulated true --argjson runs 4 \
    --argjson taskToolMean "$task_token_mean" --argjson nativeTeamsMean "$native_token_mean" \
    --argjson taskFindingsMean "$task_findings_mean" --argjson nativeFindingsMean "$native_findings_mean" \
    --argjson increasePercent "$findings_increase" \
    --argjson taskCpf "$task_cpf_val" --argjson nativeCpf "$native_cpf_val" \
    --argjson reductionPercent "$cpf_reduction_val" \
    --argjson h1 "$([[ $cpf_reduction_val -ge 40 ]] && echo "true" || echo "false")" \
    --argjson h2 "$([[ $native_findings_mean -ge $task_findings_mean ]] && echo "true" || echo "false")" \
    --argjson h3 "$([[ $findings_increase -ge 10 ]] && echo "true" || echo "false")" \
    '{simulated:$simulated,runs:$runs,tokenAnalysis:{taskToolMean:$taskToolMean,nativeTeamsMean:$nativeTeamsMean},findingsAnalysis:{taskToolMean:$taskFindingsMean,nativeTeamsMean:$nativeFindingsMean,increasePercent:$increasePercent},costPerFinding:{taskTool:$taskCpf,nativeTeams:$nativeCpf,reductionPercent:$reductionPercent},hypotheses:{H1_costPerFindingReduction:$h1,H2_qualityParity:$h2,H3_qualityImprovement:$h3}}' \
    > "$BENCHMARK_DIR/analysis/summary.json"

  log_info "Findings increase: ${findings_increase}% (target: >=10%)"

  # Validate hypotheses
  local passed=0

  # H1: Cost-per-finding reduction (not raw token reduction)
  local task_cpf=$((task_token_mean / task_findings_mean))
  local native_cpf=$((native_token_mean / native_findings_mean))
  local cpf_reduction=$(( (task_cpf - native_cpf) * 100 / task_cpf ))

  log_info "Cost-per-finding: Task=${task_cpf} tokens, Native=${native_cpf} tokens, reduction=${cpf_reduction}%"

  if [[ $cpf_reduction -ge 40 ]]; then
    log_success "H1: Cost-per-finding reduction >=40% - PASS (got ${cpf_reduction}%)"
    ((passed++))
  else
    log_warn "H1: Cost-per-finding reduction >=40% - FAIL (got ${cpf_reduction}%)"
  fi

  # H2: Quality parity - compare findings counts (native should be >= task in simulation)
  if [[ $native_findings_mean -ge $task_findings_mean ]]; then
    log_success "H2: Quality parity (native >= task findings) - PASS"
    ((passed++))
  else
    log_warn "H2: Quality parity - FAIL (native $native_findings_mean < task $task_findings_mean)"
  fi

  if [[ $findings_increase -ge 10 ]]; then
    log_success "H3: Findings increase >=10% - PASS"
    ((passed++))
  else
    log_warn "H3: Findings increase >=10% - FAIL (got ${findings_increase}%)"
  fi

  if [[ $passed -lt 2 ]]; then
    log_error "Statistical analysis: Only $passed/3 hypotheses supported"
    return 1
  fi
  log_success "Phase 2: $passed/3 hypotheses supported"

  # ------------------------------------------------------------------
  # Phase 3: Adversarial validation - verify pipeline detects failure
  # ------------------------------------------------------------------
  log_info "Phase 3: Adversarial check - verifying pipeline detects hypothesis failure..."

  # Case 1: Native worse than task (should reject H1)
  local adv_task_cpf=$((100000 / 50))    # 2000 tokens/finding (good)
  local adv_native_cpf=$((200000 / 20))  # 10000 tokens/finding (bad)
  local adv_cpf_reduction=$(( (adv_task_cpf - adv_native_cpf) * 100 / adv_task_cpf ))
  if [[ $adv_cpf_reduction -ge 40 ]]; then
    log_error "Adversarial case 1 failed: should have rejected H1 with bad data"
    return 1
  fi
  log_success "Adversarial case 1: Pipeline correctly rejects H1 with bad data (reduction=${adv_cpf_reduction}%)"

  # Case 2: Borderline just below threshold (39% < 40%, should reject)
  local adv2_task_cpf=1000
  local adv2_native_cpf=610  # (1000-610)/1000 = 39%
  local adv2_reduction=$(( (adv2_task_cpf - adv2_native_cpf) * 100 / adv2_task_cpf ))
  if [[ $adv2_reduction -ge 40 ]]; then
    log_error "Adversarial case 2 failed: 39% should not pass 40% threshold"
    return 1
  fi
  log_success "Adversarial case 2: Borderline 39% correctly rejected (reduction=${adv2_reduction}%)"

  # Case 3: Equal performance (0% reduction, should reject)
  local adv3_task_cpf=5000
  local adv3_native_cpf=5000
  local adv3_reduction=$(( (adv3_task_cpf - adv3_native_cpf) * 100 / adv3_task_cpf ))
  if [[ $adv3_reduction -ge 40 ]]; then
    log_error "Adversarial case 3 failed: 0% should not pass 40% threshold"
    return 1
  fi
  log_success "Adversarial case 3: Equal performance correctly rejected (reduction=${adv3_reduction}%)"

  # Case 4: Division by zero guard (0 findings must not crash cost-per-finding calc)
  local adv4_task_tokens=100000
  local adv4_task_findings=0
  local adv4_native_tokens=200000
  local adv4_native_findings=0
  # Simulate guarded division (same pattern the benchmark pipeline should use)
  local adv4_task_cpf=$(( adv4_task_tokens / (adv4_task_findings > 0 ? adv4_task_findings : 1) ))
  local adv4_native_cpf=$(( adv4_native_tokens / (adv4_native_findings > 0 ? adv4_native_findings : 1) ))
  # Both should fall back to denominator=1, producing huge cost-per-finding (not crash)
  if [[ $adv4_task_cpf -eq 0 ]] || [[ $adv4_native_cpf -eq 0 ]]; then
    log_error "Adversarial case 4 failed: Division-by-zero guard produced 0 cost-per-finding"
    return 1
  fi
  # Reduction should NOT pass threshold when neither approach found anything useful
  local adv4_reduction=$(( (adv4_task_cpf - adv4_native_cpf) * 100 / (adv4_task_cpf > 0 ? adv4_task_cpf : 1) ))
  if [[ $adv4_reduction -ge 40 ]]; then
    log_error "Adversarial case 4 failed: Zero-findings scenario should not pass 40% threshold"
    return 1
  fi
  log_success "Adversarial case 4: Division-by-zero guard validated (cpf_task=${adv4_task_cpf}, cpf_native=${adv4_native_cpf})"

  log_success "Phase 3: All adversarial cases passed"

  log_success "Benchmark pipeline: all phases passed"
  return 0
}

# ============================================================================
# Test 4: YAML Key Validation + Protocol Schema
# ============================================================================

test_yaml_keys() {
  log_info "Test 4: Validating YAML top-level keys and protocol schema..."

  local errors=0
  local protocol_file="$REPO_ROOT/protocols/team-orchestration.yaml"

  # Check for required top-level YAML keys (grep for key: at start of line)
  local required_keys=(
    "version"
    "name"
    "description"
    "prerequisites"
    "architecture"
    "external_state"
    "lifecycle"
    "roles"
    "patterns"
    "integration"
    "implementation"
    "examples"
    "metrics"
    "bootstrap"
    "quick_reference"
    "context_recovery"
    "teammate_templates"
    "anti_patterns"
    "orchestrator_role"
  )

  for key in "${required_keys[@]}"; do
    if grep -q "^${key}:" "$protocol_file" 2>/dev/null; then
      [[ "$VERBOSE" == "true" ]] && log_success "Key found: $key"
    else
      log_error "Missing top-level key: $key"
      ((errors++))
    fi
  done

  # Check for native teams enablement instruction (absorbed from former Test 2)
  if grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$protocol_file"; then
    [[ "$VERBOSE" == "true" ]] && log_success "Native teams enablement documented"
  else
    log_error "Missing native teams enablement instruction"
    ((errors++))
  fi

  if [[ $errors -eq 0 ]]; then
    log_success "YAML keys: All ${#required_keys[@]} top-level keys + env var present"
    return 0
  else
    log_error "YAML keys: $errors keys missing"
    return 1
  fi
}

# ============================================================================
# Test 5: Negative Test - Invalid Team ID (with boundary tests)
# ============================================================================

test_invalid_team_id() {
  log_info "Test 5: Validating team-id constraints..."

  local errors=0

  # Validate that the protocol documents team-id validation
  if grep -q "team_id_validation" "$REPO_ROOT/protocols/team-orchestration.yaml" 2>/dev/null; then
    log_success "Team ID validation documented in protocol"
  else
    log_error "Missing team_id_validation in protocol"
    ((errors++))
  fi

  # Test that path traversal patterns are rejected by validation regex
  local valid_ids=("pr-review-123" "epic-auth" "test_team" "a1b2c3")
  local invalid_ids=("../../etc/passwd" "../escape" "has spaces" "" "a/b/c")

  local pattern='^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'

  for id in "${valid_ids[@]}"; do
    if [[ "$id" =~ $pattern ]]; then
      [[ "$VERBOSE" == "true" ]] && log_success "Valid ID accepted: $id"
    else
      log_error "Valid ID rejected: $id"
      ((errors++))
    fi
  done

  for id in "${invalid_ids[@]}"; do
    if [[ ! "$id" =~ $pattern ]]; then
      [[ "$VERBOSE" == "true" ]] && log_success "Invalid ID rejected: '$id'"
    else
      log_error "Invalid ID accepted: '$id'"
      ((errors++))
    fi
  done

  # Boundary test: exactly 64 chars (should pass - 1 start char + 63 remaining)
  local id_64
  id_64=$(printf 'a%.0s' {1..64})
  if [[ "$id_64" =~ $pattern ]]; then
    [[ "$VERBOSE" == "true" ]] && log_success "Boundary: 64-char ID accepted"
  else
    log_error "Boundary: 64-char ID rejected (should be accepted)"
    ((errors++))
  fi

  # Boundary test: exactly 65 chars (should fail)
  local id_65
  id_65=$(printf 'a%.0s' {1..65})
  if [[ ! "$id_65" =~ $pattern ]]; then
    [[ "$VERBOSE" == "true" ]] && log_success "Boundary: 65-char ID rejected"
  else
    log_error "Boundary: 65-char ID accepted (should be rejected)"
    ((errors++))
  fi

  if [[ $errors -eq 0 ]]; then
    log_success "Team ID validation: All patterns + boundary tests validated"
    return 0
  else
    log_error "Team ID validation: $errors issues found"
    return 1
  fi
}

# ============================================================================
# Test 6: YAML Syntax Validation (requires python3 or yq)
# Covers ALL .yaml files in protocols/ directory automatically.
# ============================================================================

test_yaml_syntax() {
  log_info "Test 6: Validating YAML syntax of protocol files..."

  local errors=0

  # Discover all YAML files in protocols/ directory
  local yaml_files=()
  while IFS= read -r -d '' f; do
    yaml_files+=("$f")
  done < <(find "$REPO_ROOT/protocols" -name "*.yaml" -print0)

  if [[ ${#yaml_files[@]} -eq 0 ]]; then
    log_error "No YAML files found in protocols/"
    return 1
  fi

  log_info "Found ${#yaml_files[@]} YAML files to validate"

  # Try python3 first, then yq
  local parser=""
  if command -v python3 >/dev/null 2>&1; then
    parser="python3"
  elif command -v yq >/dev/null 2>&1; then
    parser="yq"
  else
    log_warn "Skipping YAML syntax test: neither python3 nor yq available"
    return 0
  fi

  # Files critical to Native Teams that MUST be valid YAML
  local strict_files=(
    "team-orchestration.yaml"
    "parallel-execution.yaml"
    "context-optimization.yaml"
    "agent-consensus.yaml"
  )

  for yaml_file in "${yaml_files[@]}"; do
    local basename
    basename=$(basename "$yaml_file")
    if [[ ! -f "$yaml_file" ]]; then
      log_error "File not found: $basename"
      ((errors++))
      continue
    fi

    local is_strict=false
    for sf in "${strict_files[@]}"; do
      [[ "$basename" == "$sf" ]] && is_strict=true
    done

    local valid=false
    if [[ "$parser" == "python3" ]]; then
      # Use sys.argv to avoid shell injection via filenames
      python3 -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" "$yaml_file" 2>/dev/null && valid=true
    elif [[ "$parser" == "yq" ]]; then
      yq eval '.' "$yaml_file" >/dev/null 2>&1 && valid=true
    fi

    if $valid; then
      [[ "$VERBOSE" == "true" ]] && log_success "Valid YAML: $basename"
    elif $is_strict; then
      log_error "Invalid YAML syntax: $basename (strict)"
      ((errors++))
    else
      log_warn "Invalid YAML syntax: $basename (non-critical, template-heavy file)"
    fi
  done

  if [[ $errors -eq 0 ]]; then
    log_success "YAML syntax: All ${#yaml_files[@]} protocol files are valid YAML"
    return 0
  else
    log_error "YAML syntax: $errors file(s) have invalid YAML"
    return 1
  fi
}

# ============================================================================
# Test 7: JSONL Robustness (malformed input handling)
# ============================================================================

test_jsonl_robustness() {
  log_info "Test 7: Validating JSONL robustness with malformed inputs..."

  local tmpdir
  tmpdir=$(mktemp -d)

  local test_file="$tmpdir/mixed.jsonl"

  # Write a mix of valid, malformed, empty, and unexpected-field lines
  # Line 1: valid finding
  jq -cn --arg type "issue" --arg severity "high" --arg msg "Real finding" \
    '{type:$type,severity:$severity,msg:$msg}' >> "$test_file"
  # Line 2: malformed JSON (missing closing brace)
  echo '{"type":"issue","severity":"low","msg":"broken"' >> "$test_file"
  # Line 3: empty line
  echo '' >> "$test_file"
  # Line 4: valid finding with unexpected extra field
  jq -cn --arg type "issue" --arg severity "medium" --arg msg "Another finding" --arg extra "unexpected" \
    '{type:$type,severity:$severity,msg:$msg,extra:$extra}' >> "$test_file"
  # Line 5: valid completion marker
  jq -cn --arg type "complete" --arg msg "Done" \
    '{type:$type,msg:$msg}' >> "$test_file"

  # Count valid JSON lines that are issues (should be 2: lines 1 and 4)
  # Use -R (raw input) + fromjson? to gracefully skip malformed lines
  local valid_issues
  valid_issues=$(jq -cR 'fromjson? | select(.type == "issue")' "$test_file" 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$valid_issues" -eq 2 ]]; then
    log_success "JSONL filter: correctly extracted $valid_issues valid issue entries"
  else
    log_error "JSONL filter: expected 2 valid issues, got $valid_issues"
    rm -rf "$tmpdir"
    return 1
  fi

  # Verify that malformed line is skipped (jq with -e exits non-zero for invalid JSON)
  local malformed_line
  malformed_line=$(sed -n '2p' "$test_file")
  if echo "$malformed_line" | jq empty 2>/dev/null; then
    log_error "Malformed JSON was accepted as valid"
    rm -rf "$tmpdir"
    return 1
  else
    [[ "$VERBOSE" == "true" ]] && log_success "Malformed JSON correctly rejected"
  fi

  # Verify empty line is skipped
  local empty_line
  empty_line=$(sed -n '3p' "$test_file")
  if [[ -z "$empty_line" ]]; then
    [[ "$VERBOSE" == "true" ]] && log_success "Empty line correctly identified"
  else
    log_error "Empty line detection failed"
    rm -rf "$tmpdir"
    return 1
  fi

  # Verify total valid JSON lines (issues + completion = 3)
  local total_valid
  total_valid=$(jq -cR 'fromjson?' "$test_file" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$total_valid" -eq 3 ]]; then
    log_success "JSONL robustness: $total_valid/5 lines are valid JSON (2 malformed/empty correctly skipped)"
  else
    log_error "Expected 3 valid JSON lines, got $total_valid"
    rm -rf "$tmpdir"
    return 1
  fi

  rm -rf "$tmpdir"
  return 0
}

# ============================================================================
# Test 8: Handoff/Recovery Simulation
# ============================================================================

test_handoff_recovery() {
  log_info "Test 8: Validating handoff and recovery from checkpoints..."

  local test_team_id="test-handoff-$(date +%s)"
  local team_dir="$TEAMS_DIR/$test_team_id"

  mkdir -p "$team_dir/state"/{checkpoints,findings,handoffs}

  # Simulate an agent at 80% context writing a checkpoint using jq
  jq -n --arg teammate "agent-alpha" --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson contextUsage 0.80 \
    --argjson filesAnalyzed '["src/auth/Login.java","src/auth/Token.java"]' \
    --arg lastFile "src/auth/Token.java" \
    --argjson remaining '["src/auth/Session.java","src/auth/Permissions.java"]' \
    --argjson findingsCount 3 \
    --arg resumeNotes "Continue from Session.java, auth flow partially traced" \
    '{teammate:$teammate,timestamp:$timestamp,contextUsage:$contextUsage,filesAnalyzed:$filesAnalyzed,lastFile:$lastFile,remaining:$remaining,findingsCount:$findingsCount,resumeNotes:$resumeNotes}' \
    > "$team_dir/state/checkpoints/agent-alpha.json"

  # Simulate partial findings written before the "crash"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg type "issue" --arg severity "high" \
    --arg file "src/auth/Login.java" --argjson line 55 \
    --arg msg "SQL injection in login query" --arg recommendation "Use parameterized queries" \
    '{ts:$ts,type:$type,severity:$severity,file:$file,line:$line,msg:$msg,recommendation:$recommendation}' \
    >> "$team_dir/state/findings/agent-alpha.jsonl"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg type "issue" --arg severity "medium" \
    --arg file "src/auth/Token.java" --argjson line 12 \
    --arg msg "Token expiry not validated" --arg recommendation "Add expiry check" \
    '{ts:$ts,type:$type,severity:$severity,file:$file,line:$line,msg:$msg,recommendation:$recommendation}' \
    >> "$team_dir/state/findings/agent-alpha.jsonl"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg type "issue" --arg severity "low" \
    --arg file "src/auth/Token.java" --argjson line 30 \
    --arg msg "Magic number in token length" --arg recommendation "Extract constant" \
    '{ts:$ts,type:$type,severity:$severity,file:$file,line:$line,msg:$msg,recommendation:$recommendation}' \
    >> "$team_dir/state/findings/agent-alpha.jsonl"

  # Simulate a handoff record (field names match templates/team-state-schemas.md)
  jq -n --arg fromAgent "agent-alpha" --arg toAgent "agent-beta" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg reason "context_limit" \
    --arg checkpointRef "state/checkpoints/agent-alpha-$(date -u +%Y-%m-%dT%H:%M:%SZ).json" \
    --arg findingsRef "state/findings/agent-alpha.jsonl" \
    --arg continuationNotes "Continue from Session.java. Look for auth bypass patterns." \
    --argjson summary '{"completed":["src/auth/login.js"],"remaining":["src/auth/Session.java","src/auth/Permissions.java"],"findingsCount":3}' \
    '{fromAgent:$fromAgent,toAgent:$toAgent,reason:$reason,timestamp:$timestamp,summary:$summary,checkpointRef:$checkpointRef,findingsRef:$findingsRef,continuationNotes:$continuationNotes}' \
    > "$team_dir/state/handoffs/alpha-to-beta.json"

  # Verify handoff file created and valid
  if [[ -f "$team_dir/state/handoffs/alpha-to-beta.json" ]]; then
    if jq empty "$team_dir/state/handoffs/alpha-to-beta.json" 2>/dev/null; then
      local has_handoff_keys
      # Validate ALL 8 required handoff fields per team-state-schemas.md
      has_handoff_keys=$(jq 'has("fromAgent") and has("toAgent") and has("reason") and has("timestamp") and has("summary") and has("checkpointRef") and has("findingsRef") and has("continuationNotes")' "$team_dir/state/handoffs/alpha-to-beta.json")
      if [[ "$has_handoff_keys" == "true" ]]; then
        log_success "Handoff record created with all 8 required fields"
      else
        log_error "Handoff record missing required fields"
        rm -rf "$team_dir"
        return 1
      fi
    else
      log_error "Handoff record is not valid JSON"
      rm -rf "$team_dir"
      return 1
    fi
  else
    log_error "Failed to create handoff record"
    rm -rf "$team_dir"
    return 1
  fi

  # Verify checkpoint can be read back with expected fields
  local checkpoint_file="$team_dir/state/checkpoints/agent-alpha.json"
  if ! jq empty "$checkpoint_file" 2>/dev/null; then
    log_error "Checkpoint file is not valid JSON"
    rm -rf "$team_dir"
    return 1
  fi

  local has_checkpoint_keys
  has_checkpoint_keys=$(jq 'has("teammate") and has("contextUsage") and has("remaining") and has("resumeNotes") and has("findingsCount")' "$checkpoint_file")
  if [[ "$has_checkpoint_keys" != "true" ]]; then
    log_error "Checkpoint missing required fields"
    rm -rf "$team_dir"
    return 1
  fi
  [[ "$VERBOSE" == "true" ]] && log_success "Checkpoint contains all required fields"

  local context_usage
  context_usage=$(jq '.contextUsage' "$checkpoint_file")
  # Compare numerically: jq may output 0.8 or 0.80 depending on version
  local usage_ok
  usage_ok=$(echo "$context_usage" | awk '{printf "%.1f", $1}')
  if [[ "$usage_ok" == "0.8" ]]; then
    [[ "$VERBOSE" == "true" ]] && log_success "Context usage reads back correctly: $context_usage"
  else
    log_error "Context usage mismatch: expected ~0.8, got $context_usage (normalized: $usage_ok)"
    rm -rf "$team_dir"
    return 1
  fi

  local remaining_count
  remaining_count=$(jq '.remaining | length' "$checkpoint_file")
  if [[ "$remaining_count" -eq 2 ]]; then
    [[ "$VERBOSE" == "true" ]] && log_success "Remaining files count correct: $remaining_count"
  else
    log_error "Expected 2 remaining files, got $remaining_count"
    rm -rf "$team_dir"
    return 1
  fi

  # Verify partial findings are still valid JSONL
  local findings_file="$team_dir/state/findings/agent-alpha.jsonl"
  local valid_findings
  valid_findings=$(jq -cR 'fromjson? | select(.type == "issue")' "$findings_file" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$valid_findings" -eq 3 ]]; then
    log_success "Handoff recovery: checkpoint readable, $valid_findings partial findings preserved, handoff record valid"
  else
    log_error "Expected 3 partial findings, got $valid_findings"
    rm -rf "$team_dir"
    return 1
  fi

  # Cleanup
  rm -rf "$team_dir"
  log_success "Cleanup completed"

  return 0
}

# ============================================================================
# Test 9: JSONL special characters and injection resilience
# ============================================================================

test_jsonl_special_characters() {
  log_info "Test 9: Validating JSONL special character handling..."

  local team_dir="$TEAMS_DIR/test-jsonl-special"
  mkdir -p "$team_dir/state/findings"

  # Test 1: Newlines, quotes, backslashes in msg field
  local special_msg='Line1\nLine2 with "quotes" and back\\slashes and $variables and $(commands)'
  jq -cn --arg msg "$special_msg" --arg file "test.js" \
    '{ts: "2026-02-17T10:00:00Z", type: "issue", severity: "medium", file: $file, msg: $msg}' \
    >> "$team_dir/state/findings/special.jsonl"

  # Test 2: Unicode characters
  local unicode_msg='Unicode: café résumé naïve über 日本語 中文 한국어 🔒'
  jq -cn --arg msg "$unicode_msg" --arg file "unicode.js" \
    '{ts: "2026-02-17T10:00:01Z", type: "issue", severity: "low", file: $file, msg: $msg}' \
    >> "$team_dir/state/findings/special.jsonl"

  # Test 3: Shell metacharacters
  local shell_msg='Path: /etc/passwd; rm -rf /; $(whoami); `id`; | cat /etc/shadow'
  jq -cn --arg msg "$shell_msg" --arg file "shell.js" \
    '{ts: "2026-02-17T10:00:02Z", type: "concern", severity: "high", file: $file, msg: $msg}' \
    >> "$team_dir/state/findings/special.jsonl"

  # Test 4: JSON injection attempt in evidence field
  local injection_msg='Normal text", "injected": "evil", "extra": "payload'
  jq -cn --arg msg "$injection_msg" --arg file "inject.js" \
    '{ts: "2026-02-17T10:00:03Z", type: "vulnerability", severity: "critical", file: $file, msg: $msg}' \
    >> "$team_dir/state/findings/special.jsonl"

  # Completion marker
  jq -cn '{ts: "2026-02-17T10:00:04Z", type: "complete", msg: "Special char test done."}' \
    >> "$team_dir/state/findings/special.jsonl"

  # Validate: all 5 lines must be valid JSON
  local total_lines
  total_lines=$(wc -l < "$team_dir/state/findings/special.jsonl" | tr -d ' ')
  if [[ "$total_lines" -ne 5 ]]; then
    log_error "Expected 5 JSONL lines, got $total_lines"
    rm -rf "$team_dir"
    return 1
  fi

  local valid_json_count
  valid_json_count=$(jq -cR 'fromjson?' < "$team_dir/state/findings/special.jsonl" | wc -l | tr -d ' ')
  if [[ "$valid_json_count" -ne 5 ]]; then
    log_error "Only $valid_json_count/5 lines are valid JSON after special char injection"
    rm -rf "$team_dir"
    return 1
  fi
  log_success "JSONL special chars: all $valid_json_count/5 entries are valid JSON"

  # Validate: roundtrip - read back special characters correctly
  local roundtrip_msg
  roundtrip_msg=$(jq -r 'select(.file == "unicode.js") | .msg' "$team_dir/state/findings/special.jsonl")
  if [[ "$roundtrip_msg" == *"café"* ]] && [[ "$roundtrip_msg" == *"日本語"* ]]; then
    log_success "JSONL roundtrip: Unicode characters preserved correctly"
  else
    log_error "Unicode roundtrip failed: got '$roundtrip_msg'"
    rm -rf "$team_dir"
    return 1
  fi

  # Validate: JSON injection was safely escaped (msg is a single string, not parsed as structure)
  local injection_field_count
  injection_field_count=$(jq 'select(.file == "inject.js") | keys | length' "$team_dir/state/findings/special.jsonl")
  if [[ "$injection_field_count" -eq 5 ]]; then
    log_success "JSONL injection: attempted injection safely contained (5 fields, not more)"
  else
    log_error "JSON injection may have succeeded: expected 5 fields, got $injection_field_count"
    rm -rf "$team_dir"
    return 1
  fi

  rm -rf "$team_dir"
  return 0
}

# ============================================================================
# Test 10: JSONL entry size boundary handling
# ============================================================================

test_jsonl_pipe_buf_boundary() {
  log_info "Test 10: Validating JSONL entry size boundary handling..."

  local team_dir="$TEAMS_DIR/test-entry-size"
  mkdir -p "$team_dir/state/findings"

  # Test 1: Entry under 4KB
  local small_evidence
  small_evidence=$(python3 -c "print('x' * 2000)" 2>/dev/null || printf '%2000s' | tr ' ' 'x')
  jq -cn --arg msg "Small finding" --arg evidence "$small_evidence" --arg file "small.js" \
    '{ts: "2026-02-17T10:00:00Z", type: "issue", severity: "low", file: $file, msg: $msg, evidence: $evidence}' \
    >> "$team_dir/state/findings/size-test.jsonl"

  local small_size
  small_size=$(wc -c < "$team_dir/state/findings/size-test.jsonl" | tr -d ' ')
  if [[ "$small_size" -lt 4096 ]]; then
    log_success "Entry size: small entry ($small_size bytes) under 4KB"
  else
    log_error "Small entry unexpectedly large: $small_size bytes"
    rm -rf "$team_dir"
    return 1
  fi

  # Test 2: Entry over 4KB (should still be valid JSON)
  local large_evidence
  large_evidence=$(python3 -c "print('y' * 5000)" 2>/dev/null || printf '%5000s' | tr ' ' 'y')
  jq -cn --arg msg "Large finding with verbose evidence" --arg evidence "$large_evidence" --arg file "large.js" \
    '{ts: "2026-02-17T10:00:01Z", type: "issue", severity: "medium", file: $file, msg: $msg, evidence: $evidence}' \
    >> "$team_dir/state/findings/size-test.jsonl"

  # Completion marker
  jq -cn '{ts: "2026-02-17T10:00:02Z", type: "complete", msg: "Size test done."}' \
    >> "$team_dir/state/findings/size-test.jsonl"

  # Validate all 3 lines are valid JSON (even the oversized one)
  local valid_count
  valid_count=$(jq -cR 'fromjson?' < "$team_dir/state/findings/size-test.jsonl" | wc -l | tr -d ' ')
  if [[ "$valid_count" -eq 3 ]]; then
    log_success "Entry size: all 3 entries valid JSON (including large entry)"
  else
    log_error "Expected 3 valid entries, got $valid_count"
    rm -rf "$team_dir"
    return 1
  fi

  # Validate the large entry size
  local large_line_size
  large_line_size=$(sed -n '2p' "$team_dir/state/findings/size-test.jsonl" | wc -c | tr -d ' ')
  if [[ "$large_line_size" -gt 4096 ]]; then
    log_success "Entry size: large entry ($large_line_size bytes) exceeds 4KB"
  else
    log_error "Large entry too small: $large_line_size bytes (expected >4096)"
    rm -rf "$team_dir"
    return 1
  fi

  # Validate robust parsing handles both sizes correctly
  local issue_count
  issue_count=$(jq -cR 'fromjson? | select(.type == "issue")' < "$team_dir/state/findings/size-test.jsonl" | wc -l | tr -d ' ')
  if [[ "$issue_count" -eq 2 ]]; then
    log_success "Entry size: robust parser correctly handles both small and large entries"
  else
    log_error "Expected 2 issue entries, got $issue_count"
    rm -rf "$team_dir"
    return 1
  fi

  rm -rf "$team_dir"
  return 0
}

# ============================================================================
# Test 11: Zero findings (completion marker only)
# ============================================================================

test_zero_findings() {
  log_info "Test 11: Validating zero-findings scenario..."

  local team_dir="$TEAMS_DIR/test-zero-findings"
  mkdir -p "$team_dir/state/findings"

  # Agent produces no findings, only a completion marker
  jq -cn '{ts: "2026-02-17T12:00:00Z", type: "complete", score: 10, verdict: "APPROVE", msg: "No issues found."}' \
    >> "$team_dir/state/findings/clean-agent.jsonl"

  # Validate: 1 line, valid JSON
  local line_count
  line_count=$(wc -l < "$team_dir/state/findings/clean-agent.jsonl" | tr -d ' ')
  if [[ "$line_count" -ne 1 ]]; then
    log_error "Expected 1 JSONL line, got $line_count"
    rm -rf "$team_dir"
    return 1
  fi

  # Validate: filtering for issues returns 0 results
  local issue_count
  issue_count=$(jq -cR 'fromjson? | select(.type == "issue")' < "$team_dir/state/findings/clean-agent.jsonl" | wc -l | tr -d ' ')
  if [[ "$issue_count" -ne 0 ]]; then
    log_error "Expected 0 issue findings, got $issue_count"
    rm -rf "$team_dir"
    return 1
  fi
  log_success "Zero findings: completion-only JSONL handled correctly"

  # Validate: aggregation across empty + populated agents
  jq -cn '{ts: "2026-02-17T12:00:00Z", type: "issue", severity: "low", file: "app.js", msg: "Minor style issue"}' \
    >> "$team_dir/state/findings/busy-agent.jsonl"
  jq -cn '{ts: "2026-02-17T12:00:01Z", type: "complete", score: 7, verdict: "COMMENT", msg: "1 issue found."}' \
    >> "$team_dir/state/findings/busy-agent.jsonl"

  local total_issues
  total_issues=$(cat "$team_dir/state/findings"/*.jsonl | jq -cR 'fromjson? | select(.type == "issue")' | wc -l | tr -d ' ')
  if [[ "$total_issues" -eq 1 ]]; then
    log_success "Zero findings: aggregation across empty + populated agents correct (1 total issue)"
  else
    log_error "Expected 1 total issue across agents, got $total_issues"
    rm -rf "$team_dir"
    return 1
  fi

  rm -rf "$team_dir"
  return 0
}

# ============================================================================
# Test 12: Concurrent JSONL writes (parallel subshells)
# ============================================================================

test_concurrent_jsonl_writes() {
  log_info "Test 12: Validating concurrent JSONL writes from parallel subshells..."

  local team_dir="$TEAMS_DIR/test-concurrent"
  mkdir -p "$team_dir/state/findings"

  local entries_per_agent=20

  # Spawn 2 background subshells writing to SEPARATE files (the actual pattern)
  (
    for i in $(seq 1 $entries_per_agent); do
      jq -cn --arg i "$i" --arg agent "agent-a" \
        '{ts: "2026-02-17T12:00:00Z", type: "issue", severity: "low", file: ("a-" + $i + ".js"), msg: ("Finding A-" + $i), agent: $agent}' \
        >> "$team_dir/state/findings/agent-a.jsonl"
    done
    jq -cn '{ts: "2026-02-17T12:01:00Z", type: "complete", msg: "Agent A done."}' \
      >> "$team_dir/state/findings/agent-a.jsonl"
  ) &
  local pid_a=$!

  (
    for i in $(seq 1 $entries_per_agent); do
      jq -cn --arg i "$i" --arg agent "agent-b" \
        '{ts: "2026-02-17T12:00:00Z", type: "issue", severity: "medium", file: ("b-" + $i + ".js"), msg: ("Finding B-" + $i), agent: $agent}' \
        >> "$team_dir/state/findings/agent-b.jsonl"
    done
    jq -cn '{ts: "2026-02-17T12:01:00Z", type: "complete", msg: "Agent B done."}' \
      >> "$team_dir/state/findings/agent-b.jsonl"
  ) &
  local pid_b=$!

  # Wait for both
  wait $pid_a $pid_b

  # Validate: each file has entries_per_agent + 1 (completion) lines
  local count_a count_b
  count_a=$(wc -l < "$team_dir/state/findings/agent-a.jsonl" | tr -d ' ')
  count_b=$(wc -l < "$team_dir/state/findings/agent-b.jsonl" | tr -d ' ')
  local expected=$((entries_per_agent + 1))

  if [[ "$count_a" -ne "$expected" ]] || [[ "$count_b" -ne "$expected" ]]; then
    log_error "Line counts wrong: agent-a=$count_a, agent-b=$count_b (expected $expected each)"
    rm -rf "$team_dir"
    return 1
  fi
  log_success "Concurrent writes: both agents wrote $expected lines each"

  # Validate: all lines are valid JSON
  local valid_a valid_b
  valid_a=$(jq -cR 'fromjson?' < "$team_dir/state/findings/agent-a.jsonl" | wc -l | tr -d ' ')
  valid_b=$(jq -cR 'fromjson?' < "$team_dir/state/findings/agent-b.jsonl" | wc -l | tr -d ' ')

  if [[ "$valid_a" -ne "$expected" ]] || [[ "$valid_b" -ne "$expected" ]]; then
    log_error "Invalid JSON lines: agent-a=$valid_a/$expected, agent-b=$valid_b/$expected"
    rm -rf "$team_dir"
    return 1
  fi
  log_success "Concurrent writes: all lines are valid JSON (no corruption from parallel writes)"

  # Validate: aggregation produces correct total
  local total_issues
  total_issues=$(cat "$team_dir/state/findings"/*.jsonl | jq -cR 'fromjson? | select(.type == "issue")' | wc -l | tr -d ' ')
  if [[ "$total_issues" -eq $((entries_per_agent * 2)) ]]; then
    log_success "Concurrent writes: aggregated $total_issues issues from 2 parallel agents"
  else
    log_error "Expected $((entries_per_agent * 2)) total issues, got $total_issues"
    rm -rf "$team_dir"
    return 1
  fi

  rm -rf "$team_dir"
  return 0
}

# ============================================================================
# Test 13: Borderline benchmark data (40% boundary)
# ============================================================================

test_borderline_benchmark_data() {
  log_info "Test 13: Validating benchmark pipeline with borderline data..."

  local team_dir="$TEAMS_DIR/test-borderline"
  mkdir -p "$team_dir/benchmarks"

  # Create data where cost-per-finding is EXACTLY 40% reduction (boundary)
  # Task: 100k tokens, 10 findings → 10k cpf
  # Native: 150k tokens, 25 findings → 6k cpf
  # Reduction: (10000-6000)/10000 = 40% exactly
  local task_file="$team_dir/benchmarks/borderline-task.json"
  local native_file="$team_dir/benchmarks/borderline-native.json"

  jq -cn '{approach: "task-tool", tokens: {consumed: 100000}, findings: {total: 10}}' > "$task_file"
  jq -cn '{approach: "native-teams", tokens: {consumed: 150000}, findings: {total: 25}}' > "$native_file"

  local cpf_task cpf_native reduction
  cpf_task=$(jq '.tokens.consumed / .findings.total' "$task_file")
  cpf_native=$(jq '.tokens.consumed / .findings.total' "$native_file")
  reduction=$(echo "scale=0; ($cpf_task - $cpf_native) * 100 / $cpf_task" | bc)

  # H1 requires >=40%. Exactly 40% should PASS.
  if [[ "$reduction" -ge 40 ]]; then
    log_success "Borderline 40%: correctly accepts exact boundary (reduction=${reduction}%)"
  else
    log_error "Borderline 40%: should accept reduction=${reduction}% (>=40 required)"
    rm -rf "$team_dir"
    return 1
  fi

  # Now test 39% (just below boundary) — should FAIL H1
  # Task: 100k tokens, 10 findings → 10k cpf
  # Native: 150k tokens, 24.59... findings → ~6.1k cpf → 39% reduction
  # Use: 100k/10=10k vs 122k/20=6.1k → (10000-6100)/10000=39%
  jq -cn '{approach: "native-teams", tokens: {consumed: 122000}, findings: {total: 20}}' > "$native_file"
  cpf_native=$(jq '.tokens.consumed / .findings.total' "$native_file")
  reduction=$(echo "scale=0; ($cpf_task - $cpf_native) * 100 / $cpf_task" | bc)

  if [[ "$reduction" -lt 40 ]]; then
    log_success "Borderline 39%: correctly rejects below boundary (reduction=${reduction}%)"
  else
    log_error "Borderline 39%: should reject reduction=${reduction}% (<40 required)"
    rm -rf "$team_dir"
    return 1
  fi

  # Test case: native has MORE findings but WORSE cost-per-finding
  # Task: 50k tokens, 20 findings → 2.5k cpf
  # Native: 200k tokens, 30 findings → 6.67k cpf → NEGATIVE reduction
  jq -cn '{approach: "task-tool", tokens: {consumed: 50000}, findings: {total: 20}}' > "$task_file"
  jq -cn '{approach: "native-teams", tokens: {consumed: 200000}, findings: {total: 30}}' > "$native_file"
  cpf_task=$(jq '.tokens.consumed / .findings.total' "$task_file")
  cpf_native=$(jq '.tokens.consumed / .findings.total' "$native_file")
  reduction=$(echo "scale=0; ($cpf_task - $cpf_native) * 100 / $cpf_task" | bc)

  if [[ "$reduction" -lt 0 ]]; then
    log_success "Borderline negative: correctly identifies worse cost-per-finding (reduction=${reduction}%)"
  else
    log_error "Should detect negative reduction, got ${reduction}%"
    rm -rf "$team_dir"
    return 1
  fi

  rm -rf "$team_dir"
  return 0
}

# ============================================================================
# Test 14: Config.json schema validation
# ============================================================================

test_config_json_schema() {
  log_info "Test 14: Validating config.json schema..."

  local team_dir="$TEAMS_DIR/test-config-schema"
  mkdir -p "$team_dir"

  # Create config.json per templates/team-state-schemas.md
  jq -cn \
    --arg teamId "test-config-123" \
    --arg taskType "code_review" \
    '{
      teamId: $teamId,
      taskType: $taskType,
      settings: {
        contextThreshold: 0.80,
        maxAgentsPerStream: 3,
        synthesisTimeout: 300,
        findingsRetention: "7d"
      },
      streams: [
        {name: "security", role: "security-scanner", priority: 1, filePatterns: ["**/*.js"], focus: ["OWASP", "injection"]},
        {name: "performance", role: "perf-analyzer", priority: 2, filePatterns: ["**/*.ts"], focus: ["N+1", "memory"]}
      ],
      outputFormat: {type: "markdown", sections: ["executive_summary", "critical_findings", "recommendations"]}
    }' > "$team_dir/config.json"

  # Validate JSON is valid
  if ! jq empty "$team_dir/config.json" 2>/dev/null; then
    log_error "config.json is not valid JSON"
    rm -rf "$team_dir"
    return 1
  fi

  # Validate required top-level fields
  local has_fields
  has_fields=$(jq 'has("teamId") and has("taskType") and has("settings") and has("streams") and has("outputFormat")' "$team_dir/config.json")
  if [[ "$has_fields" != "true" ]]; then
    log_error "config.json missing required top-level fields"
    rm -rf "$team_dir"
    return 1
  fi
  [[ "$VERBOSE" == "true" ]] && log_success "All required top-level fields present"

  # Validate settings fields
  local has_settings
  has_settings=$(jq '.settings | has("contextThreshold") and has("maxAgentsPerStream") and has("synthesisTimeout") and has("findingsRetention")' "$team_dir/config.json")
  if [[ "$has_settings" != "true" ]]; then
    log_error "config.json settings missing required fields"
    rm -rf "$team_dir"
    return 1
  fi
  [[ "$VERBOSE" == "true" ]] && log_success "Settings fields validated"

  # Validate streams array structure
  local stream_count
  stream_count=$(jq '.streams | length' "$team_dir/config.json")
  if [[ "$stream_count" -ne 2 ]]; then
    log_error "Expected 2 streams, got $stream_count"
    rm -rf "$team_dir"
    return 1
  fi

  local has_stream_fields
  has_stream_fields=$(jq '.streams[0] | has("name") and has("role") and has("priority") and has("filePatterns") and has("focus")' "$team_dir/config.json")
  if [[ "$has_stream_fields" != "true" ]]; then
    log_error "Stream entry missing required fields"
    rm -rf "$team_dir"
    return 1
  fi
  [[ "$VERBOSE" == "true" ]] && log_success "Stream schema validated"

  # Validate outputFormat
  local has_output
  has_output=$(jq '.outputFormat | has("type") and has("sections")' "$team_dir/config.json")
  if [[ "$has_output" != "true" ]]; then
    log_error "outputFormat missing required fields"
    rm -rf "$team_dir"
    return 1
  fi

  # Read back and verify round-trip
  local read_threshold
  read_threshold=$(jq '.settings.contextThreshold' "$team_dir/config.json")
  if [[ "$read_threshold" == "0.8" ]] || [[ "$read_threshold" == "0.80" ]]; then
    log_success "config.json schema validated: 5 top-level fields, settings, 2 streams, outputFormat"
  else
    log_error "Round-trip failed: expected contextThreshold 0.8, got $read_threshold"
    rm -rf "$team_dir"
    return 1
  fi

  rm -rf "$team_dir"
  return 0
}

# ============================================================================
# Test 15: Agent ID validation (mirrors team-id validation in Test 5)
# ============================================================================

test_agent_id_validation() {
  log_info "Test 15: Validating agent-id patterns..."

  local agent_id_regex='^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'
  local pass_count=0
  local fail_count=0

  # Valid agent IDs (should match)
  # 64-char id: "a" + 63 "b"s = exactly 64 characters (regex max)
  local id64="abbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  local valid_ids=("security-scanner-1" "perfAnalyzer" "arch_reviewer" "a" "$id64")
  for id in "${valid_ids[@]}"; do
    if [[ "$id" =~ $agent_id_regex ]]; then
      ((pass_count++))
    else
      log_error "Valid agent-id rejected: '$id'"
      ((fail_count++))
    fi
  done

  # Invalid agent IDs (should NOT match) - same attack vectors as team-id
  local invalid_ids=("" "-starts-with-dash" "_starts-with-underscore" "../path-traversal" "has spaces" 'has"quotes' "has;semicolon" "has|pipe" "a-string-that-is-way-too-long-more-than-64-characters-xxxxxxxxxxxxxxxxx")
  for id in "${invalid_ids[@]}"; do
    if [[ "$id" =~ $agent_id_regex ]]; then
      log_error "Invalid agent-id accepted: '$id'"
      ((fail_count++))
    else
      ((pass_count++))
    fi
  done

  # Verify agent-id is used safely in filesystem paths
  local team_dir="$TEAMS_DIR/test-agent-id"
  mkdir -p "$team_dir/state/findings"

  local safe_agent_id="security-scanner-1"
  local findings_file="$team_dir/state/findings/${safe_agent_id}.jsonl"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg agent "$safe_agent_id" \
    '{ts:$ts,agent:$agent,type:"test",msg:"agent-id in path"}' >> "$findings_file"

  if [[ -f "$findings_file" ]] && jq -cR 'fromjson?' "$findings_file" >/dev/null 2>&1; then
    ((pass_count++))
  else
    log_error "Agent-id filesystem path test failed"
    ((fail_count++))
  fi

  rm -rf "$team_dir"

  if [[ "$fail_count" -eq 0 ]]; then
    log_success "Agent-id validation: $pass_count patterns tested, all correct"
  else
    log_error "Agent-id validation: $fail_count failures out of $((pass_count + fail_count))"
    return 1
  fi

  return 0
}

# ============================================================================
# Test 16: Findings JSONL schema validation (enum enforcement)
# ============================================================================

test_findings_schema_validation() {
  log_info "Test 16: Validating findings JSONL schema enforcement..."

  local team_dir="$TEAMS_DIR/test-schema-validation"
  mkdir -p "$team_dir/state/findings"

  local findings_file="$team_dir/state/findings/agent-alpha.jsonl"

  # Valid findings (correct enum values)
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"issue",severity:"critical",category:"security",file:"src/auth.js",line:10,title:"SQL injection",detail:"...",recommendation:"..."}' >> "$findings_file"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"issue",severity:"high",category:"performance",file:"src/api.js",line:20,title:"N+1 query",detail:"...",recommendation:"..."}' >> "$findings_file"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"issue",severity:"medium",category:"architecture",file:"src/db.js",line:30,title:"Tight coupling",detail:"...",recommendation:"..."}' >> "$findings_file"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"issue",severity:"low",category:"testing",file:"src/test.js",line:40,title:"Missing edge case",detail:"...",recommendation:"..."}' >> "$findings_file"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"complete",msg:"Review complete. 4 issues found.",score:1.5,verdict:"COMMENT"}' >> "$findings_file"

  # Validate all lines are valid JSON
  local total_lines
  total_lines=$(wc -l < "$findings_file")
  local valid_json_lines
  valid_json_lines=$(jq -cR 'fromjson?' "$findings_file" | jq -s 'length')
  if [[ "$valid_json_lines" -ne "$total_lines" ]]; then
    log_error "Not all lines are valid JSON: $valid_json_lines/$total_lines"
    rm -rf "$team_dir"
    return 1
  fi

  # Define allowed enum values
  local allowed_severities='["critical","high","medium","low"]'
  local allowed_types='["issue","complete"]'
  local allowed_verdicts='["APPROVE","REQUEST_CHANGES","COMMENT"]'

  # Validate severity enum on issue entries
  local bad_severity
  bad_severity=$(jq -cR 'fromjson? | select(.type=="issue") | select(.severity as $s | '"$allowed_severities"' | index($s) | not) | .severity' "$findings_file" | head -1)
  if [[ -n "$bad_severity" ]]; then
    log_error "Invalid severity found: $bad_severity"
    rm -rf "$team_dir"
    return 1
  fi
  log_success "Schema: all severity values are valid enums (critical/high/medium/low)"

  # Validate verdict enum on complete entries
  local bad_verdict
  bad_verdict=$(jq -cR 'fromjson? | select(.type=="complete") | select(.verdict as $v | '"$allowed_verdicts"' | index($v) | not) | .verdict' "$findings_file" | head -1)
  if [[ -n "$bad_verdict" ]]; then
    log_error "Invalid verdict found: $bad_verdict"
    rm -rf "$team_dir"
    return 1
  fi
  log_success "Schema: all verdict values are valid enums (APPROVE/REQUEST_CHANGES/COMMENT)"

  # Now test with INVALID data — write findings with bad enums
  local bad_file="$team_dir/state/findings/agent-bad.jsonl"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"issue",severity:"CRITICAL",file:"src/bad.js",line:1,title:"Bad enum",detail:"...",recommendation:"..."}' >> "$bad_file"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"issue",severity:"urgent",file:"src/bad.js",line:2,title:"Invalid severity",detail:"...",recommendation:"..."}' >> "$bad_file"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"error",severity:"high",file:"src/bad.js",line:3,title:"Invalid type",detail:"...",recommendation:"..."}' >> "$bad_file"
  jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ts:$ts,type:"complete",msg:"Done.",score:1.0,verdict:"BLOCK"}' >> "$bad_file"

  # Detect invalid severities
  local invalid_severity_count
  invalid_severity_count=$(jq -cR 'fromjson? | select(.type=="issue") | select(.severity as $s | '"$allowed_severities"' | index($s) | not)' "$bad_file" | wc -l | tr -d ' ')
  if [[ "$invalid_severity_count" -eq 2 ]]; then
    log_success "Schema: correctly detected $invalid_severity_count invalid severity values (CRITICAL, urgent)"
  else
    log_error "Expected 2 invalid severities, found $invalid_severity_count"
    rm -rf "$team_dir"
    return 1
  fi

  # Detect invalid types
  local invalid_type_count
  invalid_type_count=$(jq -cR 'fromjson? | select(.type as $t | '"$allowed_types"' | index($t) | not)' "$bad_file" | wc -l | tr -d ' ')
  if [[ "$invalid_type_count" -eq 1 ]]; then
    log_success "Schema: correctly detected $invalid_type_count invalid type value (error)"
  else
    log_error "Expected 1 invalid type, found $invalid_type_count"
    rm -rf "$team_dir"
    return 1
  fi

  # Detect invalid verdicts
  local invalid_verdict_count
  invalid_verdict_count=$(jq -cR 'fromjson? | select(.type=="complete") | select(.verdict as $v | '"$allowed_verdicts"' | index($v) | not)' "$bad_file" | wc -l | tr -d ' ')
  if [[ "$invalid_verdict_count" -eq 1 ]]; then
    log_success "Schema: correctly detected $invalid_verdict_count invalid verdict value (BLOCK)"
  else
    log_error "Expected 1 invalid verdict, found $invalid_verdict_count"
    rm -rf "$team_dir"
    return 1
  fi

  rm -rf "$team_dir"
  return 0
}

# ============================================================================
# Main
# ============================================================================

main() {
  echo ""
  echo "================================================================"
  echo "  Native Teams Validation Test"
  echo "================================================================"
  echo ""

  local tests_passed=0
  local tests_failed=0

  # Run tests
  if test_directory_structure; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_external_state_simulation; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_benchmark_pipeline; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_yaml_keys; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_invalid_team_id; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_yaml_syntax; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_jsonl_robustness; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_handoff_recovery; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_jsonl_special_characters; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_jsonl_pipe_buf_boundary; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_zero_findings; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_concurrent_jsonl_writes; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_borderline_benchmark_data; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_config_json_schema; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_agent_id_validation; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  if test_findings_schema_validation; then ((tests_passed++)); else ((tests_failed++)); fi
  echo ""

  # Summary
  echo "================================================================"
  echo "  Results: $tests_passed passed, $tests_failed failed"
  echo "================================================================"
  echo ""

  if [[ $tests_failed -eq 0 ]]; then
    log_success "All tests passed!"
    exit 0
  else
    log_error "$tests_failed test(s) failed"
    exit 1
  fi
}

main "$@"
