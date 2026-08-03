---
name: code-deps-update
description: Dependency update management and validation.
---


# /dev:deps-update

Validate dependency updates in current branch

## Launch Native Teams Dependency Validation

1. Create deps team:
   ```
   TeamCreate(team_name="deps-update-{timestamp}")
   ```

2. Spawn ALL agents in parallel:

   **REQUIRED** teammates:
   ```
   Task(subagent_type="security-auditor", team_name="deps-update-{timestamp}", name="vulnerability-scan")
   Task(subagent_type="general-purpose", team_name="deps-update-{timestamp}", name="regression-tests")
   Task(subagent_type="general-purpose", team_name="deps-update-{timestamp}", name="breaking-changes")
   Task(subagent_type="performance-engineer", team_name="deps-update-{timestamp}", name="perf-benchmark")
   ```

3. Each writes to `~/.claude/teams/deps-update-{timestamp}/state/findings/{name}.jsonl`

4. Aggregate findings from JSONL, produce dependency update report

5. Clean up:
   ```
   TeamDelete
   ```


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Dependency Safety Assessment

### Security Validation
- [ ] Security advisories reviewed for all updated dependencies
- [ ] No known critical vulnerabilities in new versions
- [ ] Transitive dependency security validated
- [ ] License compatibility confirmed

### Compatibility Validation
- [ ] Breaking changes identified and addressed
- [ ] Deprecated API usage updated
- [ ] Version compatibility matrix verified
- [ ] Peer dependency conflicts resolved

### Testing Requirements
- [ ] All existing tests pass with new dependencies
- [ ] Integration tests run successfully
- [ ] Performance benchmarks within acceptable range
- [ ] No new test failures introduced

## Update Safety Checklist

- [ ] **Rollback Tested**: Can downgrade safely if needed
- [ ] **Team Dependencies**: Won't conflict with other team projects
- [ ] **Production Impact**: Changes tested in staging environment
- [ ] **Documentation Updated**: Version changes documented

## Risk Assessment

- [ ] **Low Risk**: Patch versions only, well-tested dependencies
- [ ] **Medium Risk**: Minor versions with good test coverage
- [ ] **High Risk**: Major versions requiring careful validation
- [ ] **Emergency Plan**: Immediate rollback procedure documented
