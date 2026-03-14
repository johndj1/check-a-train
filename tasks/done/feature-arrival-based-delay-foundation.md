# Arrival-based delay foundation

## Status
Backlog

## Parent feature
Arrival-based delay strengthening

## Intended outcome
Strengthen the delay basis so services can prefer arrival-driven evidence when it is available, while preserving a clear fallback to existing status derivation.

## Persona
Claimant who only cares about action

## Journey
Check a recent service

## Context
Phase C improves trust in the delay signal by leaning on stronger arrival evidence from Darwin or equivalent live-running data. The repo already has delay-derivation helpers and service models that expose status basis, so this task should tighten the foundation rather than redesign the full eligibility flow.

## Scope
- review the current delay-derivation path for live service results
- make arrival-based delay the preferred basis when reliable arrival fields are present
- preserve explicit fallback behaviour when arrival data is absent
- surface or document the chosen status basis clearly enough for later UI and API work

## Constraints
- no full eligibility-engine redesign
- no broad historical-datastore changes
- no speculative multi-leg journey modelling
- preserve current output shape unless a narrow additive field is required

## Acceptance criteria
- [ ] delay derivation prefers arrival timing when reliable arrival fields are available
- [ ] services without usable arrival fields still receive the current safe fallback behaviour
- [ ] the selected status basis remains explainable in code and exposed outputs
- [ ] validation covers at least one arrival-led and one fallback case

## Implementation notes
- Likely touchpoints include `lib/status/deriveDelayAndStatus.ts`, Darwin adapters, and any route or component that already exposes `statusBasis`.
- Keep the change thin: foundation first, broader UI polish later.
- If upstream arrival fields are inconsistent, prefer explicit guards over guesswork.

## Validation
- run the existing validation script that covers delay derivation
- add or update a fixture-backed case for arrival-led behaviour
- manually inspect one result path to confirm the exposed basis matches the computed delay
