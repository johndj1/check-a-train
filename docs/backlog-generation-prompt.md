# Backlog Generation Prompt

Use this prompt when you want an AI agent to turn product docs into a thin, implementation-ready backlog.

---

Read the following before generating anything:
- `AGENTS.md`
- `docs/check-a-train-context.md`
- `docs/feature-delivery-system.md`
- any persona, journey, or feature docs in the repo

You may inspect repository files before making changes.

Create a backlog of thin, implementation-ready markdown task files for Check-a-Train.

Rules:
1. Work from persona -> journey -> outcome -> feature -> task.
2. Preserve the current MVP boundaries.
3. Do not create tasks for full journey planning unless the product docs explicitly prioritise it.
4. Prefer small vertical slices that can be implemented safely in one coding pass.
5. Each task must be testable and include acceptance criteria.
6. Each task must state in-scope and out-of-scope items.
7. Each task must be written as a standalone markdown file suitable for `tasks/backlog/`.
8. Name files using a concise kebab-case pattern.
9. Where sensible, group output by feature, but keep tasks separate.
10. Avoid speculative infrastructure work unless clearly required by a feature.

Output:
- a proposed task list in dependency order
- the markdown contents for each task file
- a recommended first task to move into `tasks/active/`

---
