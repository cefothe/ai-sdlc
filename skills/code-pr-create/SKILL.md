---
name: code-pr-create
description: Automated PR creation with template filling, validation, and reviewer assignment.
---

# /dev:pr-create

Automated PR creation with template filling and validation

MANDATORY PARALLEL EXECUTION WITH MEMORY SAFEGUARDS:
Launch maximum 4 bash commands simultaneously (single message, multiple tool calls):
- Run `git status` to see current branch and changes
- Run `git log --oneline main..HEAD` to see commits for PR
- Run `git diff main...HEAD` (use file-analyzer if large diff)
- Check remote branch status and PR template

MEMORY MANAGEMENT SAFEGUARDS:
- [ ] Use file-analyzer if git diff output >1000 lines
- [ ] Limit to 4 concurrent bash commands maximum
- [ ] Stream large diff outputs instead of accumulating
- [ ] Process large PRs in file batches


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Pre-PR Creation Validation

- [ ] Current branch is not main/master
- [ ] Branch has commits to include in PR
- [ ] All changes committed (clean working directory)
- [ ] Remote branch exists and is pushed
- [ ] No merge conflicts with target branch

## PR Content Generation

### Title Generation
- [ ] Generate clear, descriptive title from commits
- [ ] Follow conventional commit format if applicable
- [ ] Include ticket/issue reference if available
- [ ] Keep under 72 characters for readability

### Description Template
- [ ] Use project PR template if it exists
- [ ] Include "Summary" section with bullet points
- [ ] Add "Test plan" with validation steps
- [ ] Reference related issues/tickets
- [ ] Include breaking change notifications if needed
- [ ] If PR was reviewed using Native Teams, include team findings summary from JSONL

### Automated Linking
- [ ] Parse commit messages for issue references
- [ ] Link to relevant documentation
- [ ] Reference related PRs if applicable
- [ ] Add appropriate labels based on changes

## PR Metadata Setup

### Reviewers Assignment
- [ ] Auto-assign code owners if CODEOWNERS file exists
- [ ] Suggest reviewers based on changed files
- [ ] Include domain experts for specialized changes
- [ ] Ensure minimum reviewer count per team policy

### Labels and Milestones
- [ ] Auto-apply labels based on file changes
- [ ] Set milestone if linked to epic/release
- [ ] Mark as draft if WIP or incomplete
- [ ] Add size/complexity indicators

## Quality Gates Before Creation

- [ ] **Build Status**: Latest commit builds successfully
- [ ] **Test Status**: All tests pass on current branch
- [ ] **Lint Status**: No linting violations
- [ ] **Security**: No obvious security concerns
- [ ] **Documentation**: Updated if API/behavior changes

## PR Creation Process

1. **Generate PR Content**
   ```markdown
   ## Summary
   - Brief description of changes
   - Why this change is needed
   - Impact on existing functionality

   ## Test Plan
   - [ ] Unit tests added/updated
   - [ ] Integration tests pass
   - [ ] Manual testing completed
   - [ ] Edge cases verified

   ## Documentation
   - [ ] API docs updated (if applicable)
   - [ ] README updated (if applicable)
   - [ ] Migration guide provided (if breaking)
   ```

2. **Execute Creation**
   - [ ] Use `gh pr create` with generated content
   - [ ] Set appropriate base branch (usually main)
   - [ ] Apply labels, reviewers, milestone
   - [ ] Enable auto-merge if appropriate

3. **Post-Creation Validation**
   - [ ] PR appears correctly in GitHub
   - [ ] CI/CD triggers successfully
   - [ ] Reviewers notified appropriately
   - [ ] Links and references work correctly

## NEVER CREATE PR IF:
- ❌ Working directory has uncommitted changes
- ❌ Branch has no new commits vs target
- ❌ Build or tests failing
- ❌ Contains debugging code or secrets
- ❌ Missing required approvals (if pre-merge validation)
- ❌ Title or description is generic/unclear
