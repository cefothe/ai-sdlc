# Human in the loop — PRD approval and PR merge

The framework never merges its own work. Humans stay in the loop at **two
enforced checkpoints**: once on the *plan* (the PRD) and once on the *code* (the
PR). This document is the runbook for wiring the enforced side.

## Checkpoint 1 — PRD approval (upstream, on the plan)

Every PRD (`docs/prd/<slug>.md`) starts `status: draft`. A task that links a
draft or structurally-invalid PRD is **refused DoR admission** (gate 8), so no
worktree is created and no PR is ever opened on an unvetted plan.

- Author flow: `/ai-sdlc:new` runs the product panel, writes the PRD as `draft`,
  and validates its structure (`prd-gate.js`). It will **not** self-approve.
- Human flow: review the PRD, then set `status: approved` in its frontmatter.
- Verify anytime: `npm run validate-prd -- docs/prd/<slug>.md`
  (exit 0 = structurally valid **and** approved; exit 2 = not ready, with reasons).

What gate 8 enforces (objective): all canonical sections present + non-empty, no
placeholder markers, `status: approved`. Quality (measurable metrics, thin
sections, unresolved questions) is reported as **advisory** — it never blocks.

## Checkpoint 2 — PR merge (downstream, on the code)

`/ai-sdlc:execute` opens the PR and requests a reviewer; it stops there. Make the
merge a hard human gate with GitHub branch protection.

### One-time setup (repo admin)

1. **CODEOWNERS** — edit `.github/CODEOWNERS`, replace `@OWNER` with real
   GitHub users/teams.

2. **Branch protection** on the default branch (`gh` example):
   ```bash
   gh api -X PUT repos/cefothe/ai-sdlc/branches/main/protection \
     -H "Accept: application/vnd.github+json" \
     -f 'required_pull_request_reviews[required_approving_review_count]=1' \
     -F 'required_pull_request_reviews[require_code_owner_reviews]=true' \
     -F 'enforce_admins=true' \
     -F 'required_status_checks[strict]=true' \
     -F 'restrictions='
   ```
   This requires ≥1 approving review from a Code Owner and forbids self-merge —
   the framework's "a human merges" rule becomes enforced, not convention.

3. (Optional) add CI status checks (tests, `validate-schemas`, `validate-prd`)
   to `required_status_checks` so a PR can't merge red.

### Result

| Checkpoint | Enforced by | Blocks |
|---|---|---|
| PRD approved | DoR gate 8 (`prd-gate.js`) | task admission → no PR on a draft plan |
| Design approved | DoR gate 9 (`design-gate.js`) | task admission → no PR on an un-architected feature |
| PR reviewed | GitHub branch protection + CODEOWNERS | merge without a human approver |
