# New Codex Thread Grounding Prompt

Use this when starting a fresh Codex thread for Check-a-Train.

---

Read these files before making changes:
- `AGENTS.md`
- `docs/check-a-train-context.md`
- `docs/product-sources.md`
- `docs/feature-delivery-system.md`
- the task file currently in `tasks/active/`

You may inspect repository files before making changes.

This repository is being developed using an outcome-driven product model:
Persona -> Journey -> Outcome -> Feature -> Task -> Code.

Important:
- Check-a-Train is a Delay Repay assistant MVP, not a full journey planner.
- Preserve current MVP scope.
- Respect the current phase ordering:
  - Phase A: station departures + derive delay + operator claim handoff
  - Phase B: fetch `service_timetable` on expand to confirm calling points
  - Phase C: add arrival-based delay using Darwin/live running data
- Prefer the smallest safe implementation.
- Do not introduce speculative scope.
- Protect existing persistence semantics unless the task explicitly changes them.
- If the task touches live vs historic service behaviour, be explicit about assumptions and boundaries.
- Summarise all changes clearly and recommend a commit message.

When implementing:
1. inspect the relevant repo files
2. explain your plan briefly
3. make the changes
4. run relevant validation if available
5. summarise the outcome and risks

If the task is underspecified, infer conservatively from the grounding docs rather than broadening scope.

---
