# Service expansion shows calling points on demand

## Status
Backlog

## Related feature
Expandable service result details

## Persona
Stressed occasional traveller

## Journey
Confirm the correct train

## Why
Users need reassurance that they have selected the correct service before trusting any delay or claim signal.

## User value
The user can expand a result and see calling points pulled on demand, increasing confidence without overloading the initial search results view.

## In scope
- add on-demand fetch of service detail when a result is expanded
- render calling points in the expanded details state
- include loading and error handling for the expansion flow

## Out of scope
- full journey planning
- preloading service detail for every result
- redesigning the full search results layout

## Relevant files / systems
- result card UI
- service expansion component
- Darwin / LDBWS service detail integration

## Acceptance criteria
- [ ] expanding a service triggers service detail retrieval only for that service
- [ ] calling points are displayed in the expanded state when available
- [ ] loading and failure states are handled cleanly
- [ ] collapsed services do not fetch detail unnecessarily

## Validation
- manually expand a result and verify detail fetch occurs once per expansion flow
- verify calling points match returned service detail data
- verify failure state is understandable and non-breaking

## Delivery notes
- preserve existing search results performance
- keep the implementation thin and explainable
