# Service expansion calling points on card expand

## Status
Backlog

## Parent feature
Expandable service result details

## Intended outcome
Let a user expand a result card and see calling points from `service_timetable` only when they ask for more detail, improving service confirmation without slowing the base result list.

## Persona
Stressed occasional traveller

## Journey
Confirm the correct train

## Context
Phase B is about confidence, not journey planning. The repo already has expandable service cards and a service-details route, so this task should build on that thin path rather than redesign the results model.

## Scope
- add on-demand fetch of service detail when a result is expanded
- render calling points in the expanded details state
- include loading and error handling for the expansion flow

## Constraints
- full journey planning
- preloading service detail for every result
- redesigning the full search results layout
- changing how the base results are selected or ranked

## Acceptance criteria
- [ ] expanding a service triggers service detail retrieval only for that service
- [ ] calling points are displayed in the expanded state when available
- [ ] loading and failure states are handled cleanly
- [ ] collapsed services do not fetch detail unnecessarily

## Implementation notes
- Reuse the existing card expansion flow and current service-details API route if it already provides the needed data.
- Keep fetch behaviour explainable and easy to review; avoid caching layers unless they are already present.
- If calling-point data is partial, prefer a clear fallback over guessed stops.

## Validation
- manually expand a result and verify detail fetch occurs once per expansion flow
- verify calling points match returned service detail data
- verify failure state is understandable and non-breaking
