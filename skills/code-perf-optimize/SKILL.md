---
name: code-perf-optimize
description: Performance optimization analysis and recommendations.
---


# /code:perf-optimize

Validate performance improvements in current branch

## Launch Native Teams Performance Validation

1. Create validation team:
   ```
   TeamCreate(team_name="perf-validate-{timestamp}")
   ```

2. Spawn ALL agents in parallel:

   **REQUIRED** teammates:
   ```
   Task(subagent_type="performance-engineer", team_name="perf-validate-{timestamp}", name="benchmarks")
   Task(subagent_type="general-purpose", team_name="perf-validate-{timestamp}", name="regression-tests")
   Task(subagent_type="general-purpose", team_name="perf-validate-{timestamp}", name="anti-patterns")
   Task(subagent_type="security-auditor", team_name="perf-validate-{timestamp}", name="security-check")
   ```

   **CONDITIONAL** teammates (based on changes):
   ```
   Task(subagent_type="android-expert", team_name=..., name="android-perf")  # if Android changes
   Task(subagent_type="ios-expert", team_name=..., name="ios-perf")          # if iOS changes
   ```

3. Each writes to `~/.claude/teams/perf-validate-{timestamp}/state/findings/{name}.jsonl`

4. Aggregate findings from JSONL, verify no regressions

5. Clean up:
   ```
   TeamDelete
   ```


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Performance Baseline Requirements

- [ ] **Baseline Captured**: Metrics recorded before changes
- [ ] **Target Defined**: Specific performance goals set
- [ ] **Measurement Strategy**: Consistent benchmarking approach
- [ ] **Environment Controlled**: Testing in production-like conditions

## Performance Validation Gates

### Speed Improvements
- [ ] Response time improvements measured and verified
- [ ] Throughput increases documented
- [ ] Latency reductions confirmed (p95, p99 percentiles)
- [ ] Target performance goals achieved

### Resource Efficiency
- [ ] Memory usage within acceptable bounds
- [ ] CPU utilization optimized
- [ ] I/O operations minimized
- [ ] Network requests reduced where possible

### Scalability Impact
- [ ] Performance improvements scale with load
- [ ] No bottlenecks introduced at higher traffic
- [ ] Resource usage remains linear or better
- [ ] Concurrent user handling improved

## Quality Assurance

- [ ] **No Functional Regressions**: All tests pass
- [ ] **Production Monitoring**: Metrics updated for new optimizations
- [ ] **Rollback Plan**: Can revert optimizations if needed
- [ ] **Documentation Updated**: Performance characteristics documented
