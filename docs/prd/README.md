# Product Requirement Documents (PRDs)

PRDs describe **features** — the idea → contract half of the funnel. They live
here (or in a front-of-funnel tool like GitHub Spec Kit / Notion / Confluence);
ai-sdlc owns contract → shipped. The two meet at a backlog task's `specRef`.

## How a PRD becomes work

1. Write the PRD as `docs/prd/<feature-slug>.md` (use `_template.md`).
2. Decompose it into backlog tasks (`backlog/tasks/<ID> - slug.md`).
3. Each task links back to the PRD via frontmatter:

   ```yaml
   references:
     - docs/prd/<feature-slug>.md        # the feature description
   specRef:
     source: adopter-rfc                  # or spec-kit / notion / linear
     featureId: <feature-slug>
     artifactPath: docs/prd/<feature-slug>.md
   ```

4. The **DoR gate resolves `specRef.artifactPath` and every `references[]`
   entry** (`decision-engine/dor-gate.js`, gate 3). A task pointing at a PRD
   that doesn't exist is refused admission — the link cannot rot silently.

## Relationship to ADRs

- **PRD** = *what* and *why* (product). Stored here, linked via `specRef`.
- **ADR** = *how* / architectural choice. Stored as `Decision` records in
  `.ai-sdlc/_decisions/` (`decision-engine/decisions.js`), linked from a task's
  `references[]`. See `DEC-0001` for an example.

Both are load-bearing: the DoR gate enforces that the links resolve before any
task is dispatched.
