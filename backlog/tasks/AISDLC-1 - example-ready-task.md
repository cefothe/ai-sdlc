---
id: AISDLC-1
title: 'docs: add a workspace quick-start section to the README'
status: To Do
assignee: []
created_date: '2026-07-17 21:00'
labels:
  - docs
priority: low
dispatchable: true
references:
  - README.md
  - spec/schemas/workspace.v1.schema.json
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a "Multi-repo workspace" section to `README.md` documenting the
`.ai-sdlc/workspace.yaml` shared-config layout: one parent folder, N repo
subfolders, a single backlog, and per-task `targetRepo`. Link to the schema.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->
- [ ] #1 `README.md` contains a section titled "Multi-repo workspace"
- [ ] #2 The section shows a `workspace.yaml` example with `spec.repos[]`
- [ ] #3 The section links to `spec/schemas/workspace.v1.schema.json`
<!-- AC:END -->
