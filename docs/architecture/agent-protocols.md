# Agent Protocols

**CRITICAL**: All agents MUST implement these protocols. See `~/.claude/protocols/README.md` for complete specifications.

## Nine Core Protocols

### 1. agent-compliance.yaml
**Mandatory compliance with CLAUDE.md rules**

**Requirements**:
- Read global + project CLAUDE.md on initialization
- Pre-execution validation checklist
- Continuous self-monitoring
- Cross-validation before completion

**Result**: Agents follow rules consistently (>95% compliance rate), no random behavior

### 2. uncertainty-handling.yaml
**Never assume, always verify or ask**

**Confidence Scoring**:
- **High (>90%)**: Proceed with documentation
- **Medium (60-90%)**: Propose with evidence
- **Low (<60%)**: MUST ask user

**Decision Rules**:
- Low confidence = MUST ask user
- Medium confidence = propose with evidence
- High confidence = proceed with documentation

**Result**: No assumptions, no fictional APIs, no made-up information

### 3. context-optimization.yaml
**Maximize token efficiency**

**Agent Selection Rules**:
- Files >1000 lines → MUST use file-analyzer
- Multi-file tracing → MUST use code-analyzer
- Test execution → MUST use test-runner

**Context Monitoring**:
- **85% usage**: Warning, prepare summary
- **90% usage**: MUST handoff to fresh agent
- **95% usage**: Emergency handoff

**Result**: No context overflow, efficient token usage

### 4. information-sources.yaml
**Source hierarchy and validation**

**Confidence Tiers**:
1. **Source code**: 100% confidence
2. **Official docs**: 95% confidence
3. **Project docs**: 90% confidence
4. **Quality 3rd-party**: 70% confidence
5. **Community Q&A**: 50% confidence
6. **Web search**: 30% confidence
7. **Ask user**: Variable confidence

**Validation Requirements**:
- Verify version matches project
- Check publication/update date
- Cross-reference multiple sources
- Document confidence level

**Result**: Reliable information, version-verified, current

### 5. simplicity-enforcement.yaml
**"As simple as possible, but no simpler"**

**Principles**:
- **Complexity budget** per change
- **Reuse before create** - search existing code first
- **Delete aggressively** - celebrate net-negative lines
- **Standard library first** - avoid unnecessary dependencies

**Decision Framework**:
1. Why is this necessary?
2. What's the simplest approach?
3. Can I reuse existing code?
4. Check complexity budget

**Result**: Simple, maintainable code without over-engineering

### 6. agent-consensus.yaml
**Multi-agent collaboration for complex decisions**

**Process**:
1. **3-4 specialist agents** analyze independently
2. **Context-manager** synthesizes findings
3. **Decision matrix**: Strong/weak/no consensus

**Consensus Thresholds**:
- **Strong consensus (80%+)**: Proceed with recommendation
- **Weak consensus (60-79%)**: Present options with analysis
- **No consensus (<60%)**: Ask user for guidance

**Result**: Better decisions through diverse perspectives

### 7. first-time-right.yaml
**Get it right the first time - no TODOs, no refactor-later**

**Zero Tolerance Policy**:
- ❌ NO TODO comments or placeholders
- ❌ NO shortcuts or incomplete implementations
- ✅ Complete planning before implementation
- ✅ Comprehensive error handling, edge cases, resource cleanup
- ✅ Tests written WITH implementation, not after

**Result**: Production-ready code on first implementation, no technical debt

### 8. output-budget-management.yaml
**Quality-first output budget management preventing token limit errors**

**Key Features**:
- Dynamic budget allocation based on agent count (max 12 parallel)
- Quality-preserving compression (never omit critical findings)
- Progressive disclosure with Task tool continuation mechanism
- Compact templates for parallel execution
- Overflow protection with batching strategies

**Result**: No "Maximum output token exceeded" errors, no truncated findings

### 9. team-orchestration.yaml (Native Teams)
**Native Teams with External State persistence**

**Architecture**:
- Native Teams with isolated context per teammate
- External state files for findings, checkpoints, handoffs
- Preliminary N=1 benchmark shows improved cost-per-finding (see `team-orchestration.yaml` `token_comparison` for data and caveats)

**External State**:
- `~/.claude/teams/{team-id}/state/findings/` - JSONL append-only logs
- `~/.claude/teams/{team-id}/state/checkpoints/` - Agent context snapshots
- `~/.claude/teams/{team-id}/state/handoffs/` - Formal transfer records

**Handoff Protocol**:
- **80% context**: Write checkpoint, spawn replacement
- Findings persist in external files (survive crashes)
- Replacement reads checkpoint + handoff for continuity

**When to Use**:
- Complex multi-dimensional tasks (PR review, epic implementation)
- Long-running tasks likely to hit context limits
- Work requiring handoff resilience
- Persistent findings across agent failures

**Result**: Efficient parallel execution with work continuity guarantees

### Supplementary Protocols

In addition to the 9 core protocols, 2 supplementary protocols provide specialized functionality:

- **parallel-execution.yaml** — Concise parallel execution reference with Native Teams benchmark summary
- **pr-verification.yaml** — PR verification protocol for strict reviews with quality gates

These are not numbered core protocols but are available in `protocols/` for specific workflows.

---

## Quick Reference Workflows

### When Agent Starts Work
```
1. Detect installation mode (global/local/hybrid)
2. Read global CLAUDE.md if exists: ~/.claude/CLAUDE.md
3. Read project CLAUDE.md if exists: project/.claude/CLAUDE.md
4. Merge configurations (project overrides global)
5. Read project/README.md (build system)
6. Detect context type (HFT/regulated/web-app/etc.)
7. Acknowledge constraints explicitly
8. Validate can proceed
```

**Installation Modes:**
- **Global**: Commands at `~/.claude/`, data at `project/.claude/`
- **Local**: Everything at `project/.claude/`
- **Hybrid**: Both exist, local commands override global

### When Gathering Information
```
1. Check source code first (if applicable)
2. Check official documentation
3. Verify version matches project
4. Score confidence (high/medium/low)
5. If low confidence → ask user
```

### When Making Changes
```
1. Ask: Why is this necessary?
2. Ask: What's the simplest approach?
3. Ask: Can I reuse existing code?
4. Check complexity budget
5. Monitor compliance continuously
```

### When Context Usage High
```
- At 85%: Warning, prepare summary
- At 90%: MUST handoff to fresh agent
- At 95%: Emergency handoff
```

### When Decision Complex
```
1. Identify need for consensus
2. Spawn 3-4 specialist agents
3. Independent analysis
4. Synthesis by context-manager
5. Proceed with consensus or ask user
```

### When Using Native Teams
```
1. Create team directory: ~/.claude/teams/{team-id}/
2. Initialize manifest with task and settings
3. Leader spawns specialists in parallel
4. Each specialist:
   - Writes findings to state/findings/{agent-id}.jsonl
   - Monitors context (checkpoint at 80%)
   - Triggers handoff if needed
5. Leader synthesizes all findings/*.jsonl
6. Archive team state after completion
```

### Before Declaring Complete
```
1. First-Time-Right validation (BLOCKING):
   - [ ] Zero TODO/FIXME comments
   - [ ] Zero placeholder implementations
   - [ ] Zero commented code
   - [ ] All error cases handled
   - [ ] All edge cases handled
   - [ ] All resources cleaned up
   - [ ] All tests written and passing

2. Self-validation checklist
3. Cross-validation by code-review-architect
4. All tests pass (100%)
5. Quality score ≥8/10
6. No compliance violations
```

---

## Integration with Existing Systems

**Note**: Paths adapt to installation mode using ExecutionContext

- **Quality Gates**: Protocols run BEFORE gates
  - Global: `~/.claude/quality-gates/`
  - Local: `project/.claude/quality-gates/`
- **Templates**: Protocols use structured outputs
  - Global: `~/.claude/templates/`
  - Local: `project/.claude/templates/`
- **Context Files**: Protocols adapt to project type
  - Global: `~/.claude/contexts/`
  - Local: `project/.claude/contexts/`
- **Rules**: Protocols enforce existing rules systematically
  - Global: `~/.claude/rules/`
  - Local: `project/.claude/rules/`

## Benefits

✅ **Compliance & Consistency**: Agents follow rules reliably (>95% rate)
✅ **Quality & Certainty**: Verify instead of assume, 100% test pass rate
✅ **Token Efficiency**: Optimal agent selection, no context overflow
✅ **Simplicity**: Celebrate code deletion, prevent over-engineering
✅ **Collaborative Intelligence**: Multi-agent consensus for complex decisions

## Monitoring

**Note**: Log locations adapt to installation mode

- **Compliance logs**:
  - Global: `project/.claude/compliance-logs/`
  - Local: `.claude/compliance-logs/`
- **Decision logs**:
  - Global: `project/.claude/decisions/`
  - Local: `.claude/decisions/`
- **Consensus logs**:
  - Global: `project/.claude/consensus-decisions/`
  - Local: `.claude/consensus-decisions/`
- **Metrics**: Compliance rate, confidence scores, context usage, quality scores

## See Also

- [Complete Protocol Specifications](../protocols/README.md)
- [Completion Standards](./completion-standards.md)
- [Validation Rules](./validation-rules.md)
- [Agent Catalog](./agent-catalog.md)
