# Isolated Context Architecture for QA Test Generation

## Overview

This document explains the isolated context architecture used by the qa-principal-engineer agent to prevent timeouts and context overflow when generating comprehensive test documentation.

## The Problem

### Context Overflow (Before Isolated Contexts)

Previously, the qa-principal-engineer agent spawned all 5 specialized agents in parallel and accumulated their results in a single context:

```
qa-principal-engineer context:
├── Spawns qa-functional-engineer
├── Spawns qa-performance-engineer
├── Spawns qa-security-engineer
├── Spawns qa-compliance-engineer
├── Spawns qa-chaos-engineer
└── Accumulates ALL results → 1.4MB+ of test documentation in single context
    ├── functional-tests: 250 KB (50+ test cases)
    ├── performance-tests: 500 KB (test specs + full Gatling project)
    ├── security-tests: 200 KB (40+ security tests)
    ├── compliance-tests: 300 KB (60+ compliance tests)
    └── chaos-tests: 150 KB (30+ chaos tests)
    = 1.4 MB total → CONTEXT OVERFLOW → TIMEOUT
```

**Issues:**
- Context overflow when accumulating 1.4MB+ of test documentation
- Timeouts waiting for all agents to complete (especially performance-engineer with Gatling code)
- No way to request specific test types (always generated all 5)
- No control over output size (all-or-nothing approach)

## The Solution: Isolated Agent Contexts

### Architecture Overview

Each specialized agent runs in its **own separate context**, completely isolated from the principal agent and other specialized agents:

```
qa-principal-engineer (Coordinator):
├── Creates execution plan
├── Exits plan mode for user approval
└── After approval: Spawns agents with isolated contexts

Agent Execution (Parallel):
├── qa-functional-engineer (Context A) → functional-tests.md
├── qa-performance-engineer (Context B) → performance-tests.md + gatling/
├── qa-security-engineer (Context C) → security-tests.md
├── qa-compliance-engineer (Context D) → compliance-tests.md
└── qa-chaos-engineer (Context E) → chaos-tests.md

Result:
Each agent saves to its own file independently.
Principal agent does NOT accumulate results.
No shared context pool.
No context overflow.
```

### Key Principles

1. **Plan-First Architecture**
   - Principal agent MUST enter plan mode before execution
   - Parse --test-types argument to determine which agents to spawn
   - Create detailed execution plan with scope for each agent
   - Exit plan mode for user approval
   - Only spawn agents after approval

2. **Isolated Context per Agent**
   - Each specialized agent gets its own separate context
   - No shared context pool between agents
   - Principal agent does NOT accumulate agent results
   - Each agent saves output to its own file

3. **No Synthesis**
   - Principal agent does NOT combine results
   - Each agent produces complete, standalone output
   - No post-processing or merging step
   - User receives separate files for each domain

4. **Comprehensive Coverage**
   - No artificial limits on test case count
   - No priority filtering (P0/P1/P2)
   - Agents generate ALL necessary scenarios
   - Complete coverage by default

5. **User Control via Test Types**
   - Mandatory --test-types argument
   - User specifies which agents to spawn:
     - `functional` → Only qa-functional-engineer
     - `performance` → Only qa-performance-engineer
     - `security` → Only qa-security-engineer
     - `compliance` → Only qa-compliance-engineer
     - `chaos` → Only qa-chaos-engineer
     - `all` → All 5 agents
     - Combinations: `functional,security,performance`

## How It Works

### Step 1: Plan Mode (Coordinator)

```yaml
User invokes: /qa:full-cycle "Feature X" --test-types=functional,security

qa-principal-engineer:
  1. Enters plan mode (read-only exploration)
  2. Parses test-types: functional, security
  3. Analyzes feature scope
  4. Creates execution plan:
     - Spawn qa-functional-engineer (functional tests)
     - Spawn qa-security-engineer (security tests)
     - Execution strategy: Parallel (isolated contexts)
     - Output destinations:
       - .claude/qa/20260114-feature-x/functional-tests.md
       - .claude/qa/20260114-feature-x/security-tests.md
  5. Writes plan to ~/.claude/plans/qa-execution-plan.md
  6. Exits plan mode using ExitPlanMode tool
  7. Waits for user approval
```

### Step 2: User Approval

```
User reviews execution plan:
- Which agents will be spawned
- What each agent will test (scope)
- Output destinations
- Execution strategy (parallel/sequential)

User approves plan → Execution begins
```

### Step 3: Parallel Agent Execution (Isolated Contexts)

```yaml
qa-principal-engineer spawns agents in parallel:

Agent A (Context A):
  subagent_type: qa-functional-engineer
  prompt: |
    Generate comprehensive functional test cases for Feature X.

    Scope: {detailed functional scope from plan}

    Requirements:
    - Generate ALL necessary test cases (no limits)
    - Follow TEST_CASE_BEST_PRACTICES.yaml
    - Save to .claude/qa/20260114-feature-x/functional-tests.md

  Execution: Agent generates 50+ functional test cases independently
  Output: Saves to functional-tests.md

Agent B (Context B):
  subagent_type: qa-security-engineer
  prompt: |
    Generate comprehensive security test cases for Feature X.

    Scope: {detailed security scope from plan}

    Requirements:
    - Generate ALL necessary security scenarios (no limits)
    - Follow TEST_CASE_BEST_PRACTICES.yaml
    - Save to .claude/qa/20260114-feature-x/security-tests.md

  Execution: Agent generates 40+ security test cases independently
  Output: Saves to security-tests.md

IMPORTANT:
- Each agent works in isolation (no shared context)
- Each agent saves output independently
- Principal agent does NOT accumulate results
- Agents can run in parallel without interfering
```

### Step 4: Completion

```
qa-principal-engineer reports completion:

✅ Test generation complete

Test documentation saved to: .claude/qa/20260114-feature-x/

Files generated:
- functional-tests.md (52 test cases)
- security-tests.md (43 test cases)

Total: 95 test cases across 2 domains
```

## Benefits

### 1. No Context Overflow

**Before (Accumulated Context):**
```
Principal agent context: 1.4 MB accumulated results
→ Context overflow
→ Timeout
```

**After (Isolated Contexts):**
```
Principal agent context: ~10 KB (coordination only)
Agent A context: 250 KB (functional tests)
Agent B context: 200 KB (security tests)
No overflow, no timeout
```

### 2. No Timeouts

**Isolated contexts allow parallel execution without waiting for accumulation:**
- Each agent completes independently
- Principal agent doesn't block waiting for results
- Agents can work simultaneously

### 3. Unlimited Test Case Generation

**No artificial limits:**
- Agents generate ALL necessary scenarios
- Complete coverage by default
- No "max 15 test cases" constraints
- No priority filtering (P0/P1/P2)

### 4. User Control

**Mandatory --test-types argument:**
- User specifies exactly which test types to generate
- Can request single type: `--test-types=functional`
- Can request multiple types: `--test-types=functional,security`
- Can request all types: `--test-types=all`
- No wasted effort on unwanted test types

### 5. Efficient Parallel Execution

**Agents work independently:**
- No shared dependencies
- No waiting for other agents
- Faster completion time
- No context interference

## Comparison

### Old Approach (Context Accumulation)

```
Problems:
❌ Context overflow (1.4MB+ in single context)
❌ Timeouts waiting for all agents
❌ No user control (always all 5 agents)
❌ Output limits to prevent overflow
❌ Priority filtering to reduce size
❌ No way to request specific test types
```

### New Approach (Isolated Contexts)

```
Solutions:
✅ No context overflow (isolated contexts)
✅ No timeouts (agents run independently)
✅ User control via --test-types argument
✅ No output limits (comprehensive coverage)
✅ No priority filtering (all scenarios)
✅ Request specific test types or all
✅ Plan-first architecture (user approval)
```

## Implementation Details

### qa-principal-engineer Responsibilities

**Plan Mode:**
1. Parse --test-types argument (mandatory)
2. Analyze feature scope
3. Create execution plan with agent scopes
4. Write plan file
5. Exit plan mode for user approval

**Execution Mode:**
1. Spawn agents with isolated contexts (parallel or sequential)
2. Provide each agent with complete scope
3. Each agent saves to its own file
4. Report completion with file list
5. **Do NOT accumulate or synthesize results**

### Specialized Agent Responsibilities

**Each specialized agent:**
1. Receives complete scope from principal agent
2. Generates comprehensive test coverage for its domain
3. No limits on test case count
4. Follows TEST_CASE_BEST_PRACTICES.yaml methodology
5. Saves output to specified file independently
6. **Works in isolation from other agents**

## Usage Examples

### Example 1: Functional Tests Only

```bash
/qa:functional-tests "Order execution flow" --test-types=functional

Result:
- qa-principal-engineer enters plan mode
- Creates plan for qa-functional-engineer only
- User approves plan
- Spawns qa-functional-engineer in isolated context
- Agent generates 50+ functional test cases
- Saves to .claude/qa/20260114-order-execution/functional-tests.md
- Principal agent reports completion (no synthesis)
```

### Example 2: Multiple Test Types

```bash
/qa:full-cycle "Trading platform" --test-types=functional,security,performance

Result:
- qa-principal-engineer enters plan mode
- Creates plan for 3 agents (functional, security, performance)
- User approves plan
- Spawns 3 agents in parallel (each with isolated context):
  - Agent A: qa-functional-engineer → functional-tests.md
  - Agent B: qa-security-engineer → security-tests.md
  - Agent C: qa-performance-engineer → performance-tests.md + gatling/
- Each agent generates comprehensive coverage independently
- Principal agent reports completion with file list (no synthesis)
```

### Example 3: All Test Types

```bash
/qa:full-cycle "Trading platform" --test-types=all

Result:
- qa-principal-engineer enters plan mode
- Creates plan for all 5 agents
- User approves plan
- Spawns 5 agents in parallel (each with isolated context)
- Each agent generates comprehensive coverage for its domain
- Results saved to 5 separate files
- Principal agent reports completion with file list (no synthesis)
- Total: 200+ test cases across all domains, no context overflow
```

## Technical Notes

### Context Isolation Mechanism

**Each Task tool invocation creates a new agent with its own context:**
```javascript
Task tool with subagent_type: qa-functional-engineer
→ New agent instance created
→ New context allocated
→ Agent executes in isolation
→ Agent saves output
→ Agent context is freed
→ Principal agent never sees accumulated results
```

### No Shared Context Pool

**Critical principle:**
- Principal agent context: Coordination only (~10 KB)
- Agent A context: Functional tests (~250 KB)
- Agent B context: Security tests (~200 KB)
- Agent C context: Performance tests (~500 KB)
- Agent D context: Compliance tests (~300 KB)
- Agent E context: Chaos tests (~150 KB)
- **Total across all contexts: 1.4 MB**
- **Principal agent context: 10 KB** ← No overflow!

### Parallel vs Sequential Execution

**Parallel (Recommended):**
- Faster completion
- No waiting for other agents
- Each agent in isolated context
- Use when: Multiple test types requested

**Sequential:**
- Slower but more controlled
- One agent at a time
- Still uses isolated contexts
- Use when: Single test type or specific ordering required

## Success Criteria

The isolated context architecture succeeds when:

1. ✅ No context overflow occurs regardless of test count
2. ✅ No timeouts occur when generating comprehensive coverage
3. ✅ Agents can generate unlimited test cases
4. ✅ User can control which test types to generate
5. ✅ Parallel execution works without interference
6. ✅ Each agent produces complete, standalone output
7. ✅ Principal agent doesn't accumulate results
8. ✅ Plan-first workflow ensures user approval before execution

## Conclusion

The isolated context architecture solves the fundamental problems of context overflow and timeouts by:
- Running each specialized agent in its own isolated context
- Eliminating result accumulation in the principal agent
- Enabling unlimited test case generation
- Providing user control via --test-types argument
- Supporting efficient parallel execution

This architecture enables comprehensive test coverage without artificial limits while maintaining fast, reliable execution.
