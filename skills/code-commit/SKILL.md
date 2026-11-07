---
name: code-commit
description: Clean commit with comprehensive validation including build, tests, and code quality checks.
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

# /code:commit

Clean commit with comprehensive validation.

MANDATORY: Execute ALL validation steps before committing


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Pre-Commit Validation (PARALLEL execution required)

PARALLEL EXECUTION WITH MEMORY SAFEGUARDS:
Launch maximum 4 bash commands simultaneously (single message, multiple tool calls):
- Run `git status` to see all untracked files and changes
- Run `git diff --staged` and `git diff` to review changes (use file-analyzer if large)
- Run `git log --oneline -5` to see recent commit message patterns
- Run build/test/lint commands (use test-runner agent if large output)

MEMORY MANAGEMENT FOR COMMITS:
- [ ] Use file-analyzer if git diff output >1000 lines
- [ ] Use test-runner agent for test execution
- [ ] Stream build output, don't accumulate in context
- [ ] Process large diffs in file batches

## PRE-COMMIT QUALITY GATES (ALL must pass)

### Build and Compilation
- [ ] Project builds successfully (no compilation errors)
- [ ] No build warnings for new/modified code
- [ ] Dependencies resolve correctly

### Test Requirements
- [ ] All tests pass (100% - no exceptions)
- [ ] New tests added for new functionality
- [ ] Test coverage maintained or improved
- [ ] No flaky or non-deterministic tests

### Code Quality
- [ ] Lint/typecheck passes (if commands exist)
- [ ] No debugging code left (console.log, println, etc.)
- [ ] No TODO/FIXME in committed code (move to issues)
- [ ] Code formatting consistent with project

### Change Validation
- [ ] Changes are atomic and focused
- [ ] All changes directly related to ticket/purpose
- [ ] No unrelated files modified
- [ ] Commit represents complete, working unit

## COMMIT PROCESS

### 1. Stage Files Carefully
- [ ] Review each file being staged with `git diff --cached`
- [ ] Only stage files directly related to the change
- [ ] Verify no sensitive information being committed

### 2. Generate Clean Commit Message
- [ ] Follow project's commit message conventions
- [ ] Focus on "why" rather than "what"
- [ ] Keep first line under 50 characters
- [ ] Reference ticket/issue number if applicable

**CRITICAL: NEVER ADD CLAUDE FOOTERS**
- ❌ NO "🤖 Generated with Claude Code"
- ❌ NO "Co-Authored-By: Claude"
- ❌ NO AI attribution of any kind
- ✅ Clean, standard commit messages only

### 3. Execute Commit
- [ ] Use descriptive, conventional commit message
- [ ] Verify commit success with `git status`
- [ ] Check commit appears in `git log --oneline -1`

## ROLLBACK PLAN

If commit fails or issues discovered:
- [ ] **First failure**: Fix issues and retry once
- [ ] **Pre-commit hooks modify files**: Amend commit to include changes
- [ ] **Emergency rollback**: `git reset HEAD~1` (preserves working directory)
- [ ] **Complete rollback**: `git reset --hard HEAD~1` (loses uncommitted work)

## NEVER COMMIT IF:
- ❌ Build fails or has errors
- ❌ Any test is failing
- ❌ Lint/typecheck has violations
- ❌ Code contains debugging statements
- ❌ Changes include unrelated modifications
- ❌ Commit message is unclear or generic
- ❌ Pre-commit validation was skipped
- ❌ Commit message contains Claude/AI attribution
