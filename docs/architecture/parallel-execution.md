# Parallel Execution Best Practices

## MANDATORY PARALLEL EXECUTION RULE

**CRITICAL**: Any work that CAN be done in parallel MUST be done in parallel. Sequential execution is ONLY acceptable when tasks have explicit dependencies.

---

## Execution Strategy Selection

Before parallelizing, choose the right execution mechanism:

| Agents Needed | Strategy | Tools | Best For |
|---------------|----------|-------|----------|
| 1-2 | Task tool | Single message, multiple Task calls | Quick analysis, simple reviews |
| 3+ | **Native Teams** | TeamCreate → Task(team_name) → JSONL → TeamDelete | PR reviews, epic work, multi-dimension analysis |

### Why Native Teams for 3+ agents?

Benchmark results (PR tradu/utop#296, 86 files, 9,633 additions):

| Metric | Task Tool (3 agents) | Native Teams (4 agents) |
|--------|---------------------|------------------------|
| Findings | 14 | 58 (4.1x more, N=1) |
| Wall-clock time | ~10m 34s | ~5m 08s (2.1x faster, N=1) |
| Cost per finding | ~8.4k tokens | ~3.8k tokens (55% lower, N=1) |
| Coverage | 2/4 dimensions | 4/4 dimensions |
| Accuracy | ~93% | ~91% (same errors) |

> **Note**: All metrics are preliminary (N=1). Task tool run used 3 agents (1 failed); Native Teams used 4 agents (0 failed). Agent count difference and failure rate contribute to findings gap. Pending N≥3 validation per [validation plan](../testing/omnius-teams-validation-plan.md). Source of truth: `protocols/team-orchestration.yaml` `token_comparison`.

---

## When Parallel Execution is REQUIRED (Not Optional)

You MUST spawn agents in parallel for:

1. **Creating multiple GitHub issues** - NEVER create issues sequentially
2. **Analyzing multiple files** - ALWAYS spawn file-analyzer agents simultaneously
3. **Working on independent tasks** - MUST launch parallel-worker for multi-stream work
4. **Testing multiple components** - ALWAYS run test-runner agents concurrently
5. **Generating documentation** - MUST create docs while performing other tasks
6. **Multiple searches or reads** - NEVER do sequential file reads/searches when batch is possible
7. **Independent code changes** - MUST edit different files in parallel when no conflicts

---

## Parallel Execution Pattern

### ❌ WRONG (Sequential - NEVER DO THIS):

```markdown
1. Create issue 1, wait for completion
2. Create issue 2, wait for completion
3. Create issue 3, wait for completion
```

**Problems**:
- Wastes time waiting
- Inefficient resource usage
- Unnecessary latency
- Poor user experience

### ✅ CORRECT (Parallel - ALWAYS DO THIS):

```markdown
Launch ALL agents simultaneously:
- Task 1: Create issue 1
- Task 2: Create issue 2
- Task 3: Create issue 3
```

**Benefits**:
- Maximum efficiency
- Optimal resource usage
- Minimal latency
- Better user experience

---

## Detection Rules for Parallel Opportunities

Before ANY operation, ask these questions:

### 1. Can these tasks run independently?
**YES** = MUST run in parallel

Example: Creating 5 GitHub issues with different content
- ✅ Parallel: Spawn 5 agents simultaneously
- ❌ Sequential: Create one at a time

### 2. Are there multiple similar operations?
**YES** = MUST batch in parallel

Example: Analyzing 10 log files
- ✅ Parallel: Launch 10 file-analyzer agents
- ❌ Sequential: Analyze files one by one

### 3. Can I read/analyze while writing/creating?
**YES** = MUST run simultaneously

Example: Generating documentation while creating issues
- ✅ Parallel: Docs agent + Issue agents together
- ❌ Sequential: Finish docs, then create issues

### 4. Are tasks on different files/components?
**YES** = MUST parallelize

Example: Updating 3 unrelated files
- ✅ Parallel: Edit all 3 files simultaneously
- ❌ Sequential: Edit file 1, then 2, then 3

---

## Key Parallel Agents

### parallel-worker
**REQUIRED** for multi-stream execution in git worktrees

**Use Cases**:
- Multiple independent feature implementations
- Parallel bug fixes
- Concurrent refactoring across modules

**How it Works**:
- Spawns sub-agents for each work stream
- Coordinates execution across git worktrees
- Returns consolidated summary

### code-analyzer + file-analyzer
**MUST** run simultaneously for multi-file operations

**Use Cases**:
- Analyzing multiple related files
- Understanding cross-file dependencies
- Investigating multi-file bugs

**Best Practice**: Launch multiple file-analyzer agents for individual files, plus one code-analyzer for cross-file logic tracing

### Multiple Specialist Agents
**REQUIRED** to deploy language/framework experts simultaneously

**Use Cases**:
- Multi-technology stack projects
- Parallel implementation of frontend + backend
- Concurrent security + performance reviews

**Example**: Deploy typescript-pro, java-pro, security-auditor, and performance-engineer all at once

### Native Teams (3+ agents)
**REQUIRED** for multi-agent orchestration with 3+ parallel agents

**Use Cases**:
- PR reviews (security + performance + architecture + testing + docs)
- Epic work streams (3+ parallel implementation streams)
- Multi-dimension analysis (consensus protocol with specialist agents)

**How it Works**:
1. TeamCreate with descriptive team name
2. Task with team_name parameter to spawn teammates (all in parallel)
3. Each teammate writes JSONL to external state
4. Aggregate findings from `~/.claude/teams/{team}/state/findings/*.jsonl`
5. TeamDelete to clean up

**Benefits over Task tool**:
- Independent context window per teammate (no duplication)
- External state persistence (survives crashes)
- Coordinator context stays lean (status messages only, not full results)

### Batch Operations (1-2 agents)
**MUST** use single message with multiple Task tool calls

**Critical Rule**: When launching 1-2 agents, send a SINGLE message with multiple Task tool calls, not multiple messages. For 3+ agents, use Native Teams instead.

**Why Single Message (for Task tool)?**
- Ensures true parallel execution
- Maximizes efficiency
- Avoids sequential bottlenecks

---

## Real-World Examples

### Example 1: Epic Decomposition

**Scenario**: Decompose epic into 5 tasks

❌ **Sequential Approach** (BAD):
```
1. Create task 1 → wait
2. Create task 2 → wait
3. Create task 3 → wait
4. Create task 4 → wait
5. Create task 5 → wait
Total time: 5x task creation time
```

✅ **Parallel Approach** (GOOD):
```
Launch 5 agents simultaneously:
- Agent 1: Create task 1
- Agent 2: Create task 2
- Agent 3: Create task 3
- Agent 4: Create task 4
- Agent 5: Create task 5
Total time: 1x task creation time
```

### Example 2: Multi-File Analysis

**Scenario**: Understand authentication flow across 8 files

❌ **Sequential Approach** (BAD):
```
1. Read file 1 → analyze
2. Read file 2 → analyze
3. Read file 3 → analyze
...
8. Read file 8 → analyze
Total time: 8x file analysis time
```

✅ **Parallel Approach** (GOOD):
```
Launch 8 file-analyzer agents + 1 code-analyzer:
- file-analyzer: AuthController.java
- file-analyzer: AuthService.java
- file-analyzer: UserRepository.java
- file-analyzer: JwtUtil.java
- file-analyzer: SecurityConfig.java
- file-analyzer: AuthFilter.java
- file-analyzer: TokenService.java
- file-analyzer: AuthValidator.java
- code-analyzer: Trace auth flow across all files
Total time: 1x file analysis time
```

### Example 3: Full-Stack Feature Implementation

**Scenario**: Implement user profile feature (frontend + backend + tests + docs)

❌ **Sequential Approach** (BAD):
```
1. Backend implementation → wait
2. Frontend implementation → wait
3. Tests → wait
4. Documentation → wait
Total time: 4x implementation time
```

✅ **Parallel Approach** (GOOD):
```
Launch 4 specialist agents simultaneously:
- backend-architect: API design + implementation
- frontend-developer: UI components + integration
- test-runner: Test suite implementation
- docs-architect: User and developer docs
Total time: 1x implementation time (longest agent)
```

### Example 4: PR Review with Native Teams

**Scenario**: Review PR with 5 specialist dimensions

❌ **Task Tool Approach** (SUBOPTIMAL for 5 agents):
```
Single message with 5 Task tool calls
Each agent gets duplicated context (~25k tokens each = 125k total)
Results returned inline, bloating coordinator context
```

✅ **Native Teams Approach** (CORRECT for 5 agents):
```
1. TeamCreate(team_name="pr-review-296")
2. Task × 5 with team_name="pr-review-296" (spawn teammates in parallel)
3. Each teammate writes to ~/.claude/teams/pr-review-296/state/findings/{dimension}.jsonl
4. Aggregate from JSONL
5. TeamDelete("pr-review-296")

Result: Independent context per teammate, JSONL persistence, lean coordinator
```

---

## Common Pitfalls to Avoid

### Pitfall 1: False Dependencies

**Problem**: Assuming tasks depend on each other when they don't

**Example**: "I need to create task 1 before creating task 2"
- **Question**: Does task 2 actually depend on task 1 existing?
- **Reality**: Usually no - both can be created simultaneously

**Solution**: Challenge every assumption about dependencies

### Pitfall 2: Sequential Habits

**Problem**: Defaulting to sequential execution out of habit

**Example**: Creating multiple files one at a time
- **Old Habit**: Create file 1, then file 2, then file 3
- **New Habit**: Create all files simultaneously

**Solution**: Always ask "Can this be parallelized?"

### Pitfall 3: Forgetting Single-Message Rule

**Problem**: Sending multiple messages instead of one message with multiple tool calls

**Example**:
```
Message 1: Launch agent 1
Message 2: Launch agent 2
Message 3: Launch agent 3
```

**Should be**:
```
Message 1:
  - Launch agent 1
  - Launch agent 2
  - Launch agent 3
```

**Solution**: Collect all parallel work in a single message

---

## Performance Impact

### Time Savings

| Operation | Sequential | Parallel | Savings |
|-----------|-----------|----------|---------|
| Create 5 issues | 5x | 1x | **80%** |
| Analyze 10 files | 10x | 1x | **90%** |
| Full-stack feature | 4x | 1x | **75%** |
| Epic decomposition | 8x | 1x | **87.5%** |

### Resource Efficiency

| Metric | Sequential | Parallel | Improvement |
|--------|-----------|----------|-------------|
| Wall clock time | 10 min | 2 min | **5x faster** |
| User wait time | 10 min | 2 min | **5x better UX** |
| Agent utilization | 20% | 100% | **5x efficiency** |
| Throughput | 1 task/min | 5 tasks/min | **5x throughput** |

---

## Checklist: Before Starting Any Work

Before executing ANY operation, ask yourself:

- [ ] Are there multiple independent tasks?
- [ ] Can I spawn multiple agents?
- [ ] Am I about to do things sequentially that could be parallel?
- [ ] Have I identified ALL parallelization opportunities?
- [ ] Do I need 3+ agents? → Use Native Teams (TeamCreate)
- [ ] Do I need 1-2 agents? → Use Task tool (single message, multiple calls)
- [ ] Have I eliminated false dependencies?

If you answered YES to any question, **PARALLELIZE IMMEDIATELY**.

---

## See Also

- [Agent Catalog](./agent-catalog.md) - Find the right agents for parallel work
- [Agent Protocols](./agent-protocols.md) - Context optimization protocol
- [Command Reference](../quick-reference/command-reference.md) - Commands that support parallelization
