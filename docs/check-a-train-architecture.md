# Check-a-Train – Architecture & Product Grounding

## Product Overview

**Check-a-Train** is a Delay Repay assistant designed to help rail passengers quickly determine whether they are eligible for compensation after a delayed or cancelled journey.

The application allows a user to search for a train they travelled on, identify the specific service, determine whether it was delayed or cancelled, and link directly to the relevant train operator’s Delay Repay claim page.

Check-a-Train is **not intended to be a full journey planner**. The product focuses specifically on the **after-the-event claim journey**.

---

# Core User Journey

Primary use case:

1. User opens the app after completing a train journey
2. User enters:
   - origin station
   - destination station
   - approximate departure time
   - journey date
3. The system identifies the most likely direct service
4. The system determines whether the service was:
   - on time
   - delayed
   - cancelled
5. The system displays Delay Repay eligibility
6. The user is linked directly to the correct train operator claim page

The goal is to **reduce friction and time spent identifying the correct service and claim form**.

---

# Technology Stack

Current implementation:

- **Next.js** web application
- **Node.js API routes**
- Hosted on **Vercel (initial MVP deployment)**

External data sources:

- **Darwin / LDBWS** – live train services
- **HSP (Historical Service Performance)** – historical delay metrics
- **Hosted Supabase Postgres** – local historical service datastore for indexed search

---

# Key Technical Discovery

Testing showed that the **HSP API is too slow for synchronous search queries**.

Example test:

Route  
TON → SEV

Date  
12 Mar 2026

Time window  
15:45 – 16:15

Observed response time  
~22 seconds

Conclusion:

HSP cannot be used as the **primary data source for user searches**.

---

# Architectural Direction

The application will use **different data sources depending on journey timing**.

## Live or Future Journeys

Query:

Darwin / LDBWS

Used for:

- live services
- services that have not yet completed

---

## Historical Journeys

Query:

Local indexed historical service database

This database will contain:

- train services
- schedules
- movement data
- cancellation information

Data will be sourced from **Network Rail Open Data feeds (TRUST / movement feeds)**.

The first datastore migration has already been applied to the hosted Supabase project, creating:

- `public.historical_services`
- `public.historical_service_search`

---

## HSP Usage

HSP will not be used for search.

Instead it may be used for:

- secondary validation
- enrichment
- delay confirmation when viewing a specific service

---

# Search Behaviour

When a user performs a search:

1. The system determines whether the journey is **live or historical**
2. If the journey is **live**:
   - query Darwin
3. If the journey is **historical**:
   - query the local historical service index
4. The application identifies the most likely direct service between the two stations
5. The application calculates delay or cancellation status

---

# Product Constraints

For the MVP:

- Only **direct trains** will be supported
- No full journey planner functionality
- Focus on **speed and reliability** of search
- Delay Repay determination is the core value

Future enhancements may include:

- saved journeys
- claim reminders
- push notifications
- account features

---

# Current Development Focus

The current milestone is establishing the first **Historical Service Index read and write proof paths** in small steps.

Completed foundation work:

- a separate hosted Supabase project exists for Check-a-Train
- the first historical datastore migration is live
- the database now contains `public.historical_services` and `public.historical_service_search`
- a small fixture-based loader exists as a temporary proof step for canonical model mapping and database writes
- a small timetable-shaped sample loader now maps source-like stop records into the same canonical historical model and persists them into the existing Supabase tables
- a small server-side historical search proof path now queries `public.historical_service_search` by exact date, origin CRS, destination CRS, and a buffered scheduled departure window
- the current proof query ranks candidates in application code by closeness to the requested departure time after indexed database filtering
- a small Darwin Push Port timetable parser foundation now reads a real `.xml.gz` timetable artefact, extracts a small passenger-service subset into an intermediate normalized JSON inspection model, and deliberately stops before canonical mapping or persistence
- a small Darwin candidate-service extraction step now reads that parsed JSON inspection output, filters out operational passing points, and writes a cleaner passenger-stop candidate-service JSON model for inspection only
- a small Darwin TIPLOC stop-resolution foundation now reads the candidate-service JSON, resolves a small explicit subset of TIPLOCs to station-level CRS/name values, and marks unresolved or ambiguous stops explicitly in a further derived inspection file
- a small Southeastern / Kent corridor TIPLOC mapping expansion now exists within that temporary mapping source for a corridor-scoped proof subset only
- a small corridor coverage step now reads the Darwin resolved-stop inspection JSON, writes a corridor-focused resolved subset, and reports resolved versus unresolved corridor stop counts for later canonical-mapping assessment only

Next work remains:

- deciding how the Darwin resolved-stop model should later map into the canonical historical datastore shape
- replacing the temporary sample loaders with real timetable or movement-feed ingestion
- implementing live versus historical routing

The historical proof query currently accepts:

- `originCrs`
- `destinationCrs`
- `serviceDate`
- `approxDepartureTime`

It uses a simple default `±30` minute window and returns a compact candidate list suitable for reuse in a later API route.

The current timetable-sample proof remains deliberately narrow:

- sample input is source-like rather than canonical
- mapping into the canonical historical datastore model happens in a small adapter module
- persistence still targets the existing `historical_services` and `historical_service_search` tables only
- search row generation is intentionally limited to one origin-to-destination row per service, not full stop-pair expansion

The current Darwin timetable parser proof is also deliberately narrow:

- input is a real Darwin Push Port timetable `.xml.gz` artefact
- the parser extracts a small inspection-focused subset of journey fields plus ordered timing points
- passenger-service filtering is explicit and local to the normalization step
- output is an intermediate Darwin-normalized JSON file for inspection only
- no Supabase persistence or canonical historical datastore mapping happens in this step

The current Darwin candidate-service extraction proof is deliberately narrow as well:

- input is the existing Darwin-normalized JSON inspection file
- it keeps only likely passenger stop kinds: `OR`, `IP`, and `DT`
- it excludes operational passing points with kind `PP`
- it preserves TIPLOCs and preferred scheduled arrival/departure fields as-is
- output is a second intermediate candidate-service JSON file for inspection only
- no CRS mapping, canonical datastore mapping, or Supabase persistence happens in this step

The current Darwin TIPLOC stop-resolution proof is deliberately narrow too:

- input is the existing Darwin candidate-service inspection JSON
- resolution uses a small explicit temporary TIPLOC mapping source for a proof-step subset only
- the current temporary mapping now includes a small Southeastern / Kent commuter corridor subset to improve inspection coverage in a known corridor
- unknown TIPLOCs remain unresolved rather than being guessed
- ambiguous station-area TIPLOCs can be marked explicitly
- output is a further derived Darwin inspection JSON file with stop-level `resolutionStatus`, `resolvedCrs`, and `resolvedName`
- no canonical datastore mapping or Supabase persistence happens in this step

The current Southeastern / Kent corridor coverage proof is deliberately narrow as well:

- input is the existing Darwin resolved-stop inspection JSON
- corridor matching uses a small explicit local rule set based on known corridor TIPLOCs and resolved station names
- output is a corridor-focused derived inspection JSON plus a concise JSON coverage summary
- this is still inspection-only and does not perform canonical datastore mapping or Supabase persistence

---

# Design Principle

Check-a-Train prioritises:

**Speed → clarity → user value**

The system should favour **fast, simple answers** over complex journey planning logic.

The primary goal is helping the user **quickly determine whether they are owed compensation**.

---

# How to Use This Document

This document serves as the **grounding context** for development discussions, AI coding assistance, and architectural decisions.

When starting new development sessions or AI threads, this document can be provided as the **context prompt** to ensure consistent understanding of the system.
