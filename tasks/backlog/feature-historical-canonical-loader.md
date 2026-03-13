# Persist Southeastern canonical subset into historical tables

## Status
Backlog

## Related feature
Historical indexed service persistence proof

## Persona
Regular commuter

## Journey
Check a recent service

## Why
To prove the persistence path for a narrow historical subset while preserving existing semantics and validating search-row generation.

## User value
A user can reliably find relevant historic services from the approved subset, supporting the MVP goal of checking a recent train without broadening scope prematurely.

## In scope
- load `services[]` from `data/derived/darwin-timetable.southeastern-canonical.json`
- persist to existing historical tables using current semantics
- validate `searchRows[]` generation against expected structure
- document how to run the proof step

## Out of scope
- redesigning the broader historical schema
- nationwide timetable ingestion
- changing search semantics beyond the approved subset proof

## Relevant files / systems
- `data/derived/darwin-timetable.southeastern-canonical.json`
- persistence script(s)
- Supabase historical tables
- README / documentation

## Acceptance criteria
- [ ] a repeatable script exists to load the canonical subset
- [ ] the script preserves current persistence semantics
- [ ] `searchRows[]` are generated and validated in the current expected shape
- [ ] documentation explains how to run the proof step

## Validation
- run the loader against the canonical subset
- inspect inserted / upserted rows in historical tables
- verify the generated search-row shape against current expectations

## Delivery notes
- keep the proof deliberately narrow
- do not introduce schema churn unless absolutely required by the task
