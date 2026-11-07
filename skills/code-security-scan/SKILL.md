---
name: code-security-scan
description: Comprehensive security vulnerability assessment using Native Teams.
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

# /code:security-scan

Comprehensive security vulnerability assessment

## Launch Native Teams Security Scan

1. Create scan team:
   ```
   TeamCreate(team_name="security-scan-{timestamp}")
   ```

2. Spawn ALL agents in parallel:

   **REQUIRED** teammates:
   ```
   Task(subagent_type="security-auditor", team_name="security-scan-{timestamp}", name="security")
   Task(subagent_type="backend-security-coder", team_name="security-scan-{timestamp}", name="backend-security")
   Task(subagent_type="general-purpose", team_name="security-scan-{timestamp}", name="pattern-analysis")
   ```

   **CONDITIONAL** teammates (based on codebase):
   ```
   Task(subagent_type="frontend-security-coder", team_name=..., name="frontend-security")  # if frontend code present
   Task(subagent_type="mobile-security-coder", team_name=..., name="mobile-security")      # if Android/iOS code present
   ```

3. Each writes to `~/.claude/teams/security-scan-{timestamp}/state/findings/{name}.jsonl`

4. Aggregate findings from JSONL, deduplicate, sort by severity

5. Clean up:
   ```
   TeamDelete
   ```


## Path Resolution

**See**: `templates/execution-context.md` for ExecutionContext usage.
## Security Assessment Areas

### Authentication & Authorization
- [ ] Proper authentication mechanisms implemented
- [ ] Authorization checks in place for all endpoints
- [ ] Session management secure
- [ ] JWT/token handling follows best practices

### Input Validation & Sanitization
- [ ] All user inputs validated and sanitized
- [ ] SQL injection prevention implemented
- [ ] XSS prevention measures in place
- [ ] CSRF protection enabled

### Data Protection
- [ ] Sensitive data properly encrypted
- [ ] Secrets not hardcoded or logged
- [ ] Database connections secured
- [ ] API keys and credentials protected

### Infrastructure Security
- [ ] HTTPS enforcement
- [ ] Security headers implemented
- [ ] Error handling doesn't leak information
- [ ] Dependencies up-to-date and vulnerability-free

## Critical Security Gates

- [ ] **No Critical Vulnerabilities**: CVSS score <7.0 for all findings
- [ ] **Authentication Required**: All protected resources require auth
- [ ] **Input Sanitized**: All user inputs validated
- [ ] **Secrets Protected**: No credentials in code or logs
- [ ] **Dependencies Secure**: All packages vulnerability-free
