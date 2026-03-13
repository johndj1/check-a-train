# Check-a-Train Context

## Product summary
Check-a-Train is being built as a Delay Repay assistant MVP. Its purpose is to help a user quickly understand whether a train service was delayed and hand them off cleanly to the correct operator claim path.

It is not currently intended to be a full journey planner.

## Core user problem
Users often know roughly which train they took, but they do not want to manually piece together live running, historic service data, operator ownership, and Delay Repay eligibility rules. The app should reduce friction from “what happened to my train?” to “I know whether I can claim, and where to go next.”

## MVP outcome
A user should be able to:
1. search for a relevant service
2. inspect enough service detail to confirm they have the right train
3. see delay status / likely eligibility signal
4. be handed off to the right operator claim path

## Current phase priorities

### Phase A
- station departures
- derive delay from available running data
- operator claim handoff

### Phase B
- fetch `service_timetable` on demand when the user expands a service
- use calling points to improve user confidence that they selected the correct service

### Phase C
- add stronger arrival-based delay using Darwin / live running information

### Deferred for later
- full journey planning
- broad account / profile complexity beyond lightweight value-add
- expansive nationwide historic persistence before the narrow proof is validated

## Product principles
- reduce cognitive load
- make the service choice obvious
- prefer confidence-building detail over unnecessary complexity
- keep the UI clean and fast
- preserve explainability: users should understand why the app thinks a service was delayed or claimable

## Representative users

### Persona 1: regular commuter
- often travels the same routes
- wants a fast answer with minimal effort
- values saved journeys and future alerts later, but can live without them in MVP

### Persona 2: stressed occasional traveller
- does not know rail data language
- needs reassurance that they picked the right service
- benefits from clear operator and delay guidance

### Persona 3: claimant who only cares about action
- wants the shortest path to “can I claim?”
- does not want deep timetable complexity
- values operator handoff over rail enthusiast detail

## Key journeys

### Journey 1: check a recent service
User searches by station / service context, finds the relevant service, and sees whether it appears delayed.

### Journey 2: confirm the correct train
User expands a service and checks timing / calling points to confirm identity.

### Journey 3: move to claim
User sees operator ownership and is handed off to the right claim destination.

## Architectural baseline
- Next.js app
- Darwin / LDBWS for live services and service details
- Supabase for indexed historical search
- historical data kept deliberately narrow where proof-of-value is still being established

## Current historical-data direction
The app continues to use its existing shape:
- live service data from Darwin / LDBWS
- hosted Supabase for historical indexed search
- narrow persistence proof for already-mapped canonical subsets

One active example is persisting `services[]` from:
- `data/derived/darwin-timetable.southeastern-canonical.json`

This persistence work should validate `searchRows[]` while preserving current persistence semantics.

## Non-goals
- becoming a generic train planning app in MVP
- building broad rail operations tooling for power users
- introducing heavy architecture before user value is proven

## What “good” looks like
- user can identify the right train quickly
- app gives a credible delay / claim signal
- handoff to claim is obvious
- product scope remains disciplined
- each new feature clearly maps to persona, journey, and user outcome
