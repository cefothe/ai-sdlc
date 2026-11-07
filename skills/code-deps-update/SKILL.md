---
name: code-deps-update
description: Dependency update management and validation.
---

<!-- ai-sdlc:context-protocol:begin — generated from rules/context-protocol.md; edit there and run `node scripts/sync-context-protocol.js` -->
## Project context (read before acting)

1. **A SPECIFICATION / BUG FIX / SYSTEM ARCHITECTURE block in your prompt is the contract.** Work from it first.
2. **Otherwise — or when your work reaches beyond that block — consult the project's own documentation:**
   - `docs/architecture/overview.md`: components and the code each owns, the contracts that connect them, data ownership, invariants (monorepo: also `<subproject>/docs/architecture/overview.md`)
   - `docs/product/context.md`: personas, glossary, current capabilities, regulatory constraints
   - the task's PRD (`docs/prd/`), design doc (`docs/design/`) or bug report (`docs/bugs/`), and the ADRs in `.ai-sdlc/_decisions/`
3. **Use the lookup tools when you have them:** ai-sdlc-context (`architecture_lookup`, `architecture_contracts`, `product_lookup`, `spec_lookup`, `decision_lookup`) and cxpak (`cxpak_graph` trace / blast_radius, `cxpak_insight` architecture / conventions; or `cxpak overview --tokens 6k [--workspace <subproject>]` via Bash). Never use cxpak's `cxpak_context` op `context` — it ignores the token budget.
4. **Never guess** which component owns a file, how two components connect, or what a domain term means — look it up. If it is not documented, say so and flag it instead of inventing it.
5. **Change code only in the component that owns it**, connect only through declared contracts, honor every invariant and recorded ADR. If one blocks the task, stop and flag it.
<!-- ai-sdlc:context-protocol:end -->

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
