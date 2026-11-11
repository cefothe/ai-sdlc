---
name: code-perf-optimize
description: Performance optimization analysis and recommendations.
---

<!-- ai-sdlc:context-protocol:begin — generated from rules/context-protocol.md; edit there and run `node scripts/sync-context-protocol.js` -->
## Project context (read before acting)

1. **A SPECIFICATION / BUG FIX / SYSTEM ARCHITECTURE block in your prompt is the contract.** Work from it first.
2. **Otherwise — or when your work reaches beyond that block — consult the project's own documentation:**
   - `docs/architecture/overview.md`: components and the code each owns, the contracts that connect them, data ownership, invariants (monorepo: also `<subproject>/docs/architecture/overview.md`)
   - `docs/architecture/features/<feature>.md`: one feature / user journey across every component it touches — participants, end-to-end interactions, contracts, data ownership (`architecture_lookup` with `feature`)
   - `docs/product/context.md`: personas, glossary, current capabilities, regulatory constraints
   - the task's PRD (`docs/prd/`), design doc (`docs/design/`) or bug report (`docs/bugs/`), and the ADRs in `.ai-sdlc/_decisions/`
3. **Use the lookup tools when you have them:** ai-sdlc-context (`architecture_lookup`, `architecture_contracts`, `product_lookup`, `spec_lookup`, `decision_lookup`) and cxpak (`cxpak_graph` trace / blast_radius, `cxpak_insight` architecture / conventions; or `cxpak overview --tokens 6k [--workspace <subproject>]` via Bash). Never use cxpak's `cxpak_context` op `context` — it ignores the token budget.
4. **Never guess** which component owns a file, how two components connect, or what a domain term means — look it up. If it is not documented, say so and flag it instead of inventing it.
5. **Change code only in the component that owns it**, connect only through declared contracts, honor every invariant and recorded ADR. If one blocks the task, stop and flag it.
<!-- ai-sdlc:context-protocol:end -->

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
