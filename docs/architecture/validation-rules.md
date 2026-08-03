# Validation Rules

## MANDATORY: Before ANY Operation - Pre-emptive Validation

**ZERO TOLERANCE**: No operation proceeds without complete validation

---

## Core Validation Principles

### ✅ **Documentation Review FIRST**
Always check CLAUDE.md, README.md, docs/ before making assumptions

### ✅ **Pre-conditions Verified**
All dependencies, tools, environment ready

### ✅ **Build System Validated**
Documentation matches reality, commands work

### ✅ **State Checkpointed**
Current state saved for rollback

### ✅ **Success Criteria Defined**
Know exactly what "done" means

---

## PRE-EMPTIVE ERROR PREVENTION RULES

### STOP and VALIDATE before ANY:

#### 1. File Modifications
- [ ] Check write permissions
- [ ] Backup current state
- [ ] Verify target exists
- [ ] Confirm file is not read-only
- [ ] Check disk space available

#### 2. Command Execution
- [ ] Verify tool available
- [ ] Test with --help first
- [ ] Check prerequisites
- [ ] Validate command syntax
- [ ] Ensure proper environment

#### 3. Test Running
- [ ] Confirm test framework works
- [ ] Environment configured
- [ ] Previous run cleaned up
- [ ] Test data available
- [ ] Dependencies installed

#### 4. Build Operations
- [ ] Validate build system
- [ ] Check dependencies
- [ ] Ensure clean state
- [ ] Verify build files exist
- [ ] Check for conflicts

#### 5. Git Operations
- [ ] Verify repository state
- [ ] Check for conflicts
- [ ] Confirm branch
- [ ] Validate remote exists
- [ ] Ensure working tree clean (if needed)

---

## ATOMIC OPERATIONS REQUIREMENT

**EVERY CHANGE MUST BE REVERSIBLE**

### Three-Phase Pattern

#### Before: Save Current State
- Git stash changes
- File backups
- Environment snapshots
- Database backups (if applicable)
- Configuration saves

#### During: Monitor for Failures
- Check exit codes
- Monitor error output
- Track partial progress
- Abort on first error
- Log all operations

#### After: Verify Success OR Rollback Completely
- Validate success criteria
- Run smoke tests
- Check side effects
- If failure: restore from backup
- **No partial states allowed**

---

## Documentation-First Decision Making

**CRITICAL**: Before making ANY assumptions or taking ANY actions, Claude MUST:

### STEP 1: CHECK LOCAL DOCUMENTATION HIERARCHY

**REQUIRED READING ORDER** (stop at first match found):

1. **Local CLAUDE.md** (project-specific instructions) - HIGHEST PRIORITY
   - Local installation: `project/.claude/CLAUDE.md`
   - Global installation: `project/.claude/CLAUDE.md` (if exists)
   - Also check: `~/.claude/CLAUDE.md` (global rules, lower priority)
2. **README.md** (project setup and usage)
3. **docs/ directory** (any .md files with relevant context)
4. **Package files** (package.json, pom.xml, etc.) - for build/dependency info only
5. **Configuration files** (.gitignore, .env.example, etc.) - for project structure

**Installation Mode Detection**:
- Check for `~/.claude/` (global installation)
- Check for `project/.claude/` (local installation or project data)
- Both exist = Hybrid mode (local overrides global)

### STEP 2: ASK USER WHEN DOCUMENTATION IS INSUFFICIENT

**MANDATORY**: If documentation doesn't clearly answer the question, Claude MUST ask the user:

```markdown
❓ CLARIFICATION NEEDED

I've checked the following documentation:
- ✅ Local CLAUDE.md: [found/not found] - [key findings if any]
- ✅ README.md: [found/not found] - [key findings if any]
- ✅ docs/ directory: [found/not found] - [key findings if any]

I need clarification on: [specific question]

Options:
1. [Option A with rationale]
2. [Option B with rationale]
3. [Other - please specify]

Please advise which approach you prefer.
```

### STEP 3: DOCUMENT DECISIONS FOR FUTURE USE

**REQUIRED**: When user provides clarification, Claude MUST offer to document it:

```markdown
📝 DOCUMENTATION UPDATE

Based on your clarification, I can add this to your local CLAUDE.md:

[proposed addition]

Should I add this to prevent future uncertainty?
```

---

## Build System Validation

### MANDATORY: Always Comply with CLAUDE.md (Global + Local)

**CRITICAL**: When working in any project directory, agents MUST:

1. **Detect installation mode** (global/local/hybrid)
2. **Read global CLAUDE.md** if exists: `~/.claude/CLAUDE.md`
3. **Read project CLAUDE.md** if exists: `project/.claude/CLAUDE.md`
4. **Merge configurations** - project rules OVERRIDE global rules
5. **NEVER ASSUME BUILD SYSTEM** - ALWAYS CHECK DOCUMENTATION FIRST
6. **Apply ALL merged rules** - respect both global and project-specific
7. **Detect project context** from path/files and adapt behavior
8. **NEVER violate project-specific rules**
9. **When in doubt, check the CLAUDE.md files before proceeding**

**Configuration Priority** (highest to lowest):
1. Project CLAUDE.md (`project/.claude/CLAUDE.md`)
2. Global CLAUDE.md (`~/.claude/CLAUDE.md`)
3. System defaults

### Build System Rules

**MANDATORY**: Read README.md, CLAUDE.md, docs/ for build instructions
- **NEVER** assume based on file presence alone
  - `pom.xml` present ≠ automatically Maven
  - `build.gradle` present ≠ automatically Gradle
- **REQUIRED**: Look for explicit build commands in documentation
- **CRITICAL**: If documentation says Maven, use Maven (even if gradle files exist)
- **VERIFY** before every build/test command - check docs first, then files

---

## BUILD SYSTEM ENFORCEMENT - ZERO TOLERANCE POLICY

**CRITICAL VIOLATION**: Using wrong build system is an IMMEDIATE FAILURE

### Prohibited Actions

- ❌ **NEVER** use `gradle` in Maven projects (pom.xml present)
- ❌ **NEVER** use `mvn` in Gradle projects (build.gradle present)
- ❌ **NEVER** use `npm` in Maven/Gradle projects without package.json
- ❌ **NEVER** assume build system without verification

### Required Actions

- ✅ **ALWAYS** verify build files exist before using build commands
- ✅ **ALWAYS** use the build system that matches the project structure
- ✅ **ALWAYS** check documentation before file presence

---

## COMPREHENSIVE VERIFICATION PATTERN

Run this check BEFORE any build/test command:

### MANDATORY DOCUMENTATION-FIRST APPROACH

#### Step 1: READ DOCUMENTATION FIRST (Never Skip)

```bash
# ALWAYS check documentation BEFORE any build assumptions
echo "Reading project documentation for build instructions..."

# Check in priority order:
if [ -f "CLAUDE.md" ]; then
    echo "Found CLAUDE.md - checking for build system..."
    BUILD_SYSTEM=$(grep -iE "(mvn|maven|gradle|npm|yarn)" CLAUDE.md)
fi

if [ -z "$BUILD_SYSTEM" ] && [ -f "README.md" ]; then
    echo "Checking README.md for build instructions..."
    BUILD_SYSTEM=$(grep -iE "(mvn|maven|gradle|npm|yarn)" README.md)
fi

if [ -z "$BUILD_SYSTEM" ] && [ -d "docs" ]; then
    echo "Checking docs/ directory for build instructions..."
    BUILD_SYSTEM=$(find docs -name "*.md" -exec grep -l -i "build\|compile\|test" {} \;)
fi
```

#### Step 2: VALIDATE with File Structure (Secondary)

- Only AFTER reading documentation, validate file consistency
- If docs say Maven, verify we can run `mvn` commands successfully
- If docs say Gradle, verify we can run `gradle` or `./gradlew` commands

#### Step 3: ASK USER if Documentation is Unclear

```bash
if [ -z "$BUILD_SYSTEM" ]; then
    echo "ERROR: Cannot determine build system from documentation"
    echo "Please specify the correct build system for this project"
    echo "Options: mvn (Maven), gradle (Gradle), npm (Node.js)"
    exit 1
fi
```

**ABSOLUTE RULE**: Documentation trumps file presence. Always check docs first.

---

## MANDATORY: Before ANY Commit/Push

### Pre-Commit Validation Checklist

1. **Tests MUST pass** - no exceptions
2. **No merge conflicts** - resolve first
3. **Lint/typecheck MUST pass** - if commands exist
4. **Pre-validation completed** - all checks passed
5. **Rollback plan exists** - documented recovery procedure

### Validation Commands

```bash
# 1. Verify tests pass
npm test  # or mvn test, gradle test, etc.

# 2. Check for conflicts
git status
git diff --check

# 3. Run linting
npm run lint  # or equivalent

# 4. Type checking
npm run type-check  # if applicable

# 5. Build verification
npm run build  # or mvn package, gradle build, etc.
```

---

## MANDATORY: Never Consider Task Complete Until ALL Pass

### Task Completion Blockers

**CRITICAL**: A task is NEVER complete if:

- ❌ **Build fails** - Fix compilation errors immediately
- ❌ **Tests fail** - Debug and fix test failures before moving on
- ❌ **Linting fails** - Address all linting issues
- ❌ **Type errors exist** - Resolve all type checking errors
- ❌ **Pre-validation skipped** - Must complete validation checklist
- ❌ **Quality score < 8/10** - Must meet minimum quality standards

### Task Completion Requirements

**NEVER** mark a task as complete, commit changes, or move to next task until:

- ✅ **Pre-validation completed** - All prerequisites verified
- ✅ **Build succeeds** - Code compiles without errors
- ✅ **All tests pass** - No failing or broken tests
- ✅ **Lint passes** - No linting violations
- ✅ **Type check passes** - No type errors
- ✅ **Quality validated** - Meets all quality gates
- ✅ **Rollback tested** - Recovery procedure verified

---

## CRITICAL ERROR RECOVERY

### MANDATORY: Never Lose Work

#### 1. Before ANY destructive operation
- Save current state
- Create checkpoint
- Document current position
- Backup critical files

#### 2. Auto-retry transient failures
- 3 attempts with exponential backoff
- Delays: 2s, 5s, 10s
- Log each attempt
- Differentiate transient vs permanent failures

#### 3. Preserve partial progress
- Commit completed work before failing
- Save intermediate results
- Document what was completed
- Create recovery notes

---

## CRITICAL CONTEXT MANAGEMENT

### MANDATORY: Prevent Context Overflow

#### Context Usage Thresholds

- **Files >1000 lines**: MUST use file-analyzer agent
- **Multiple file reads**: MUST batch in parallel
- **At 85% context**: MUST spawn fresh agent
- **At 90% context**: WARNING - prepare handoff
- **At 95% context**: EMERGENCY - immediate handoff

#### Context Optimization Strategies

1. **Use specialized agents**
   - file-analyzer for large files
   - code-analyzer for multi-file tracing
   - test-runner for test execution

2. **Batch operations**
   - Read multiple files in parallel
   - Analyze multiple components simultaneously
   - Consolidate results efficiently

3. **Summary and handoff**
   - Create concise summaries
   - Preserve critical information
   - Hand off to fresh agent with context

---

## MANDATORY OUTPUT TEMPLATES

### DETERMINISTIC RESPONSES

All agents MUST use structured templates (paths resolved by ExecutionContext):

- ✅ **Task Completion**: Use task-completion.md format
  - Global: `~/.claude/templates/task-completion.md`
  - Local: `project/.claude/templates/task-completion.md`
- ✅ **Error Reporting**: Use error-reporting.md format
  - Global: `~/.claude/templates/error-reporting.md`
  - Local: `project/.claude/templates/error-reporting.md`
- ✅ **Validation Results**: Use validation-checklist.md format
  - Global: `~/.claude/templates/validation-checklist.md`
  - Local: `project/.claude/templates/validation-checklist.md`

**Note**: Local templates override global when both exist

### Rejected Response Types

- ❌ **Free-form responses REJECTED**: Must follow template structure
- ❌ **"Looks good" or "Done" REJECTED**: Must provide detailed completion report

---

## Validation Checklist Template

Use this for all validation operations:

```markdown
## VALIDATION REPORT

### Pre-Validation Checks
- [ ] Documentation reviewed (CLAUDE.md, README.md, docs/)
- [ ] Build system identified and verified
- [ ] Dependencies available
- [ ] Environment configured
- [ ] Pre-conditions met

### Operation Validation
- [ ] Tool availability confirmed
- [ ] Prerequisites satisfied
- [ ] Syntax validated
- [ ] Permissions verified
- [ ] State checkpointed

### Post-Validation Checks
- [ ] Success criteria met
- [ ] Side effects checked
- [ ] Integration verified
- [ ] Rollback tested
- [ ] Documentation updated

### Results
- **Status**: PASS/FAIL
- **Issues Found**: [list or "None"]
- **Actions Taken**: [list]
- **Rollback Available**: YES/NO
```

---

## See Also

- [Completion Standards](./completion-standards.md) - Task completion criteria
- [Agent Protocols](./agent-protocols.md) - Protocol compliance
- Build System Contexts - Project-specific rules (paths resolved by ExecutionContext):
  - Global: `~/.claude/contexts/`
  - Local: `project/.claude/contexts/`
- Quality Gates - Quality validation (paths resolved by ExecutionContext):
  - Global: `~/.claude/quality-gates/`
  - Local: `project/.claude/quality-gates/`
