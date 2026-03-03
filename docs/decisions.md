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