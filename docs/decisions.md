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

## ADR-004 — Automated backlog-driven documentation

### Context
The repository uses a machine-readable backlog (`docs/backlog.json`) as the source of truth for product work.

Previously, documentation such as the roadmap and changelog had to be manually updated when backlog items changed.

### Decision
Commits that modify `docs/backlog.json` trigger automated validation and documentation regeneration.

The workflow is:

commit backlog.json  
↓  
validate backlog structure  
↓  
close stories referenced in commit messages  
↓  
regenerate documentation (roadmap + changelog)  
↓  
auto-commit updated docs

### Rationale
This ensures:

- The backlog remains the **single source of truth**
- Roadmap and changelog stay **synchronised automatically**
- Documentation drift is prevented
- The repo behaves like a lightweight product management system

### Consequences
Pros:
- Reduced manual documentation maintenance
- Improved traceability between commits, stories, and roadmap

Cons:
- Git hooks introduce additional automation that must be maintained

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

## ADR-006: Local Station Dataset + Monthly Refresh

### Context
Station typeahead is a high-frequency interaction. Calling paid/free-tier upstream APIs
for every station query risks exhausting daily limits and can degrade UX when the network is slow.

### Decision
- `/api/stations` uses a checked-in local station dataset (`data/stations.uk.json`) as its source.
- Station search is fully local and does not call TransportAPI.
- Dataset refresh is manual monthly for now via `node scripts/refresh-stations.mjs` using local source input (`data/stations.json`).

### Rationale
- Keeps station lookup fast and reliable.
- Avoids burning TransportAPI free-plan calls for typeahead.
- Keeps data reasonably current with low operational overhead.

### Consequences
Pros:
- Predictable station-search performance and zero runtime dependency on upstream station lookup.
- Auditable dataset updates via PR history.

Cons:
- Dataset can be stale between refreshes.
- Requires manual monthly refresh discipline until a stable automated source is adopted.
