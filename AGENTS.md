# AGENTS.md

## Purpose
This repository is being built with AI-assisted development. Agents working in this repo must behave like disciplined product engineers, not blind code generators.

The user is the Product Owner. Product intent is defined in the product documents. Code changes must trace back to user value, journey outcomes, and the current MVP scope.

## Mandatory working rules

1. Read the grounding docs before making changes:
   - `docs/check-a-train-context.md`
   - `docs/feature-delivery-system.md`
   - any task file in `tasks/active/`
2. You may inspect repository files before making changes.
3. Do not start coding until the task outcome, boundaries, and acceptance criteria are clear.
4. Prefer the smallest viable change that satisfies the task.
5. Keep implementations deterministic, readable, and easy to review.
6. Preserve existing behaviour unless the task explicitly changes it.
7. Do not invent product scope. If something is unclear, infer conservatively from personas, journeys, and feature definitions.
8. If a task touches persistence, indexing, eligibility, or live-running logic, protect existing semantics unless the task explicitly changes them.
9. Explain what changed, why it changed, and any risks or follow-up work.
10. Suggest tests and validation steps for every meaningful change.

## Product intent hierarchy
All changes must align to this hierarchy:

1. Persona
2. Journey
3. Outcome / user value
4. Feature
5. Story / task
6. Implementation detail

Never optimise implementation detail at the expense of journey clarity or user value.

## Current product shape
Check-a-Train is a Delay Repay assistant MVP, not a full journey planner.

Current prioritisation:
- Phase A: station departures + derive delay + operator claim handoff
- Phase B: fetch `service_timetable` on expand to confirm calling points
- Phase C: add arrival-based delay using Darwin/live running data
- Journey planning is deferred

## Architecture guardrails
Current expected architecture:
- Next.js application
- Darwin / LDBWS for live services and service detail
- Supabase for historical indexed search and narrow persistence experiments
- Narrow historical persistence for approved/canonical subsets only

Agents should:
- avoid unnecessary new dependencies
- avoid broad schema churn when a narrow change is enough
- keep persistence semantics stable unless explicitly asked to evolve them
- preserve explainability of delay/eligibility logic

## Delivery workflow
Preferred workflow:
1. A task exists as a markdown file in `tasks/active/`
2. Read task + grounding docs
3. Inspect relevant code
4. Implement on a fresh feature branch
5. Run available validation
6. Summarise the diff in plain English
7. Move or propose moving the task to `tasks/done/` when complete

## Branching
Use a new branch for each feature or task.

Suggested naming:
- `feature/<short-name>`
- `fix/<short-name>`
- `chore/<short-name>`

## Output expectations
When responding after implementation, include:
- what changed
- files touched
- why this satisfies the task
- any assumptions made
- validation performed or still required
- recommended commit message

## Avoid
- large speculative refactors
- hidden behaviour changes
- scope creep into journey planning unless explicitly requested
- replacing product decisions with technical preferences
