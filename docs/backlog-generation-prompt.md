# Backlog Generation Prompt

Use this prompt when you want an AI agent to turn product docs into a thin, implementation-ready backlog.

---

Read the following before generating anything:
- `AGENTS.md`
- `docs/check-a-train-context.md`
- `docs/product-sources.md`
- `docs/feature-delivery-system.md`
- relevant roadmap or feature docs referenced from `docs/product-sources.md`

You may inspect repository files before making changes.

Create a backlog of thin, implementation-ready markdown task files for Check-a-Train.

Rules:
1. Work from persona -> journey -> outcome -> feature -> task.
2. Preserve the current MVP boundaries.
3. Do not create tasks for full journey planning unless the product docs explicitly prioritise it.
4. Prefer small vertical slices that can be implemented safely in one coding pass.
5. Each task must be testable and include acceptance criteria.
6. Each task must include parent feature, intended outcome, context, scope, constraints, acceptance criteria, and implementation notes.
7. Each task must be written as a standalone markdown file suitable for `tasks/backlog/`.
8. Name files using the repo's existing `feature-<short-name>.md` pattern unless the repo is changed to a different convention.
9. Where sensible, group output by feature, but keep tasks separate.
10. Avoid speculative infrastructure work unless clearly required by a feature.
11. Keep tasks aligned to the Delay Repay assistant MVP: Phase A departures and claim handoff, Phase B on-demand `service_timetable` expansion, Phase C arrival-based delay strengthening.

Output:
- a proposed task list in dependency order
- the markdown contents for each task file
- a recommended first task to move into `tasks/active/`

---
