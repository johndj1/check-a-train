# Architectural Decisions

## ADR-001: Delay Repay First Strategy
We prioritise delay repay assistance over journey planning
because it provides immediate user value and differentiation.

## ADR-002: Repo-driven backlog
Backlog stored in repository instead of Jira.
Reason:
- versioned with code
- AI-readable
- lightweight workflow

## ADR-003: Mock-first development
Mock APIs used initially to enable fast UI iteration before live integration.
## ADR-004: Local git hooks for generated docs
We use a local-only post-commit hook to regenerate docs/roadmap.md
and docs/CHANGELOG.md from docs/backlog.json.

Reason:
- keeps roadmap/changelog aligned with backlog metadata
- does not require CI or shared hook tooling
- optional and local to each developer machine

Note:
- .git/hooks is not version-controlled, so this setup is local-only by design.
- Hook execution is optional and local-only by design.
- Hook runs only when docs/backlog.json or docs/product.md changed in the commit.
- Hook prints a warning on regeneration errors and never blocks the commit.
- Hook never runs git add, git commit, or git push.

## ADR-005: Commit-message driven backlog close with validation gate
Done-story transitions can be inferred from commit messages that include story IDs
in the format `(ABC-123)` (for example: `feat: add national station index (ST-001)`).

Before automatic close logic runs, validation must pass in this order:
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Rule:
- If any validation step fails, backlog automation must not modify `docs/backlog.json`.
- This behavior is local-only via git hooks and is not server-enforced.

## Decision: Commit-driven documentation and backlog automation

The repository uses a commit-driven automation workflow to keep product
documentation in sync with development work.

When docs/backlog.json is committed, a local Git hook runs several steps
to validate the repository and regenerate derived documentation.

Workflow:

commit backlog.json
↓
validate (lint + typecheck + build)
↓
close stories referenced in commit messages
↓
regenerate docs (roadmap + changelog)
↓
auto-commit generated docs

Notes:
- Validation must pass before backlog automation runs.
- Generated docs (roadmap.md and CHANGELOG.md) are committed automatically.
- Backlog edits are always committed manually.
- The hook uses a recursion guard so the docs auto-commit does not trigger itself again.

Purpose:
This workflow ensures the roadmap and changelog are always consistent with
the backlog and commit history, while keeping commits explicit and safe.
