# Historical canonical subset persistence

## Status
Backlog

## Parent feature
Historical indexed service persistence proof

## Intended outcome
Persist a narrow approved canonical subset into the existing historical tables so historical search proof work can rely on a repeatable, low-risk data load.

## Persona
Regular commuter

## Journey
Check a recent service

## Context
The repo already contains a corridor-scoped canonical inspection output and an existing persistence path. This task is about making that narrow proof reliable and clearly documented, not about widening historical ingestion.

## Scope
- load `services[]` from `data/derived/darwin-timetable.southeastern-canonical.json`
- persist to existing historical tables using current semantics
- validate `searchRows[]` generation against expected structure
- document how to run the proof step

## Constraints
- redesigning the broader historical schema
- nationwide timetable ingestion
- changing search semantics beyond the approved subset proof
- changing live versus historical routing behaviour

## Acceptance criteria
- [ ] a repeatable script exists to load the canonical subset
- [ ] the script preserves current persistence semantics
- [ ] `searchRows[]` are generated and validated in the current expected shape
- [ ] documentation explains how to run the proof step

## Implementation notes
- Primary files are the canonical subset loader, `lib/historical/persistence.mjs`, and any narrow validation helpers already in the repo.
- Keep reruns safe and deterministic.
- Prefer documentation updates over new infrastructure if the write path already exists.

## Validation
- run the loader against the canonical subset
- inspect inserted / upserted rows in historical tables
- verify the generated search-row shape against current expectations
