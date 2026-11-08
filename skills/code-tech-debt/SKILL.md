---
name: code-tech-debt
description: Technical debt analysis and prioritization.
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

# /code:tech-debt

Technical debt assessment and tracking

## Launch Native Teams Debt Assessment

1. Create assessment team:
   ```
   TeamCreate(team_name="tech-debt-{timestamp}")
   ```

2. Spawn ALL agents in parallel:

   **REQUIRED** teammates:
   ```
   Task(subagent_type="general-purpose", team_name="tech-debt-{timestamp}", name="code-quality")
   Task(subagent_type="security-auditor", team_name="tech-debt-{timestamp}", name="security-debt")
   Task(subagent_type="performance-engineer", team_name="tech-debt-{timestamp}", name="performance-debt")
   Task(subagent_type="general-purpose", team_name="tech-debt-{timestamp}", name="documentation-debt")
   ```

   **CONDITIONAL** teammates (based on codebase):
   ```
   Task(subagent_type="database-optimizer", team_name=..., name="database-debt")    # if database-heavy project
   Task(subagent_type="backend-architect", team_name=..., name="architecture-debt") # if architectural analysis needed
   Task(subagent_type="android-expert", team_name=..., name="android-debt")         # if Android codebase
   Task(subagent_type="ios-expert", team_name=..., name="ios-debt")                 # if iOS codebase
   ```

3. Each writes to `~/.claude/teams/tech-debt-{timestamp}/state/findings/{name}.jsonl`

4. Aggregate findings from JSONL, deduplicate, prioritize by impact

5. Clean up:
   ```
   TeamDelete
   ```

INTELLIGENT MEMORY MANAGEMENT:
- [ ] ALWAYS delegate large codebase analysis to specialized agents
- [ ] Agents process data in chunks and return summaries
- [ ] Use directory-based analysis for large projects
- [ ] Agents handle their own context optimization
- [ ] Prioritize high-impact debt over comprehensive scanning


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Technical Debt Assessment Areas

### Code Quality Debt
- [ ] **Complexity**: Functions/classes exceeding complexity thresholds
- [ ] **Code Smells**: Duplicated code, long methods, god objects
- [ ] **Naming**: Unclear or inconsistent naming patterns
- [ ] **Documentation**: Missing or outdated documentation
- [ ] **Comments**: TODO/FIXME/HACK comments in codebase

### Architecture Debt
- [ ] **Dependencies**: Circular dependencies, tight coupling
- [ ] **Patterns**: Anti-patterns, inconsistent architectural approaches
- [ ] **Separation**: Mixed concerns, business logic in wrong layers
- [ ] **Interfaces**: Poorly designed APIs, leaky abstractions
- [ ] **Modularity**: Monolithic components that should be split

### Test Debt
- [ ] **Coverage**: Low test coverage areas
- [ ] **Quality**: Brittle, flaky, or slow tests
- [ ] **Maintenance**: Outdated test fixtures and mocks
- [ ] **Strategy**: Missing integration or end-to-end tests
- [ ] **Test Code**: Duplicated test logic, complex test setup

### Performance Debt
- [ ] **Algorithms**: Inefficient algorithms and data structures
- [ ] **Resources**: Memory leaks, unclosed connections
- [ ] **Caching**: Missing or ineffective caching strategies
- [ ] **Database**: N+1 queries, missing indexes
- [ ] **Frontend**: Bundle size, rendering performance

### Security Debt
- [ ] **Vulnerabilities**: Known security issues not yet patched
- [ ] **Dependencies**: Outdated packages with security issues
- [ ] **Practices**: Insecure coding patterns
- [ ] **Authentication**: Weak or outdated auth mechanisms
- [ ] **Data**: Unencrypted sensitive data

## Debt Quantification

### Impact Assessment
- [ ] **Business Risk**: Impact on features, reliability, security
- [ ] **Development Velocity**: How much debt slows development
- [ ] **Maintenance Cost**: Time spent working around debt
- [ ] **Team Morale**: Developer frustration and turnover risk

### Effort Estimation
- [ ] **Small (1-2 days)**: Simple refactoring, documentation updates
- [ ] **Medium (3-5 days)**: Component redesign, test additions
- [ ] **Large (1-2 weeks)**: Architecture changes, major refactoring
- [ ] **Epic (1+ months)**: System redesign, technology migration

### Priority Matrix
```markdown
High Impact, Low Effort:    🟢 Quick wins - do immediately
High Impact, High Effort:   🟡 Plan for next quarter
Low Impact, Low Effort:     🟠 Backlog for slow periods
Low Impact, High Effort:    🔴 Avoid unless strategic
```

## Debt Tracking and Reporting

### Debt Inventory
- [ ] Catalog all identified technical debt items
- [ ] Assign owners and target resolution timeframes
- [ ] Link debt items to business impact metrics
- [ ] Track debt creation and resolution trends

### Debt Metrics
- [ ] **Debt Ratio**: Lines of debt code vs total code
- [ ] **Complexity Trend**: Average cyclomatic complexity over time
- [ ] **Velocity Impact**: Story points lost to debt work
- [ ] **Bug Correlation**: Bugs in high-debt vs low-debt areas

### Regular Assessment
- [ ] **Weekly**: Track new debt introduction
- [ ] **Monthly**: Review debt reduction progress
- [ ] **Quarterly**: Prioritize debt reduction initiatives
- [ ] **Annually**: Strategic debt reduction planning

## Debt Prevention Strategies

### Development Practices
- [ ] **Code Reviews**: Flag potential debt in PR reviews
- [ ] **Definition of Done**: Include debt assessment criteria
- [ ] **Refactoring**: Regular refactoring as part of feature work
- [ ] **Standards**: Enforce coding standards and best practices

### Tooling Integration
- [ ] **Static Analysis**: Automated code quality checks
- [ ] **Dependency Scanning**: Automated security vulnerability detection
- [ ] **Performance Monitoring**: Track performance regressions
- [ ] **Documentation**: Automated documentation generation and validation

## Debt Reduction Planning

### Sprint Integration
- [ ] **Debt Budget**: Allocate X% of sprint capacity to debt reduction
- [ ] **Boy Scout Rule**: Leave code cleaner than you found it
- [ ] **Opportunistic Refactoring**: Fix debt when touching related code
- [ ] **Dedicated Sprints**: Occasional sprints focused on debt reduction

### Team Coordination
- [ ] **Debt Champions**: Assign team members to own debt categories
- [ ] **Knowledge Sharing**: Regular sessions on debt patterns and solutions
- [ ] **Retrospectives**: Discuss debt creation and prevention
- [ ] **Stakeholder Communication**: Report debt impact to business

## Debt Reduction Report

Generate structured report:
```markdown
## Technical Debt Assessment

### Summary
- **Total Debt Items**: X items identified
- **Critical Issues**: X items requiring immediate attention
- **Estimated Reduction Effort**: X person-weeks
- **Business Impact**: High/Medium/Low risk areas

### Top Priority Items
1. [Security] Vulnerable dependency in payment system (2 days)
2. [Performance] N+1 query in user dashboard (3 days)
3. [Quality] God class in order processing (1 week)

### Trends
- **Debt Creation**: ↗️ Increasing / → Stable / ↘️ Decreasing
- **Team Velocity Impact**: X% of sprint capacity
- **Bug Correlation**: High-debt areas have X% more bugs

### Recommendations
1. Address critical security and performance debt immediately
2. Allocate 20% sprint capacity to debt reduction
3. Implement automated quality gates to prevent debt accumulation
```

## NEVER IGNORE IF:
- ❌ Critical security vulnerabilities identified
- ❌ Performance debt causing user-facing issues
- ❌ Debt significantly impacting development velocity
- ❌ Code quality below team standards
- ❌ Debt accumulating faster than resolution
