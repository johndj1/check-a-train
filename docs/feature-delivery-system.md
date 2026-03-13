# Feature Delivery System

## Goal
Turn product intent into a repeatable AI-assisted delivery loop:

Persona -> Journey -> Outcome -> Feature -> Task -> Code -> Review -> Commit

This file defines how backlog items should be shaped so an agent can pick them up with minimal manual translation.

## Rule 1: Features are outcome-led
Every feature should state:
- who it is for
- what journey it supports
- what user outcome it creates
- what is in scope now
- what is explicitly out of scope

## Rule 2: Tasks are implementation-sized, not strategy-sized
A task should be small enough for one focused coding pass.
A task should not mix product discovery, major architecture redesign, and multiple unrelated changes.

## Rule 3: Task files are the contract
A task file should be sufficient for an implementation agent to:
- understand the desired change
- inspect the right repo areas
- make the change safely
- validate success

## Standard task anatomy
Each task should include:
- Title
- Why
- User value
- In scope
- Out of scope
- Relevant files / systems
- Acceptance criteria
- Validation
- Delivery notes

## Backlog flow
Use folders like this:
- `tasks/backlog/` for queued work
- `tasks/active/` for work in progress
- `tasks/done/` for completed work

Suggested flow:
1. Create feature/task markdown from product docs
2. Move one task into `tasks/active/`
3. Agent implements from that task
4. Review diff and validation
5. Commit and move task to `tasks/done/`

## AI generation rules
When generating tasks from product docs, always:
1. map back to persona and journey
2. keep the slice thin
3. avoid bundling multiple features together
4. include acceptance criteria that are testable
5. include assumptions explicitly
6. preserve current MVP boundaries

## Example feature decomposition

### Feature
Service result card with expandable details

### Possible tasks
1. Render service cards from existing search results
2. Add expandable details drawer UI shell
3. Fetch `service_timetable` on expand only
4. Render calling points within the details drawer
5. Show operator handoff CTA in the expanded state
6. Add loading/error states for on-demand expansion

That is the level of slicing agents should aim for.

## Commit discipline
Recommended pattern:
- one task -> one branch -> one commit or a very small set of commits
- avoid mixed-purpose commits

## Review discipline
Before a task is considered done, verify:
- it satisfies the acceptance criteria
- it does not expand scope accidentally
- it preserves current product framing
- it is understandable by a future agent without hidden context
