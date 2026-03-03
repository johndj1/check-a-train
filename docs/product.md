# Product: Check-a-Train

## Vision
Check-a-Train is the fastest way for UK rail passengers to understand whether a delayed journey is likely eligible for Delay Repay and to act on it immediately. The product should turn confusing rail operational data into a clear, trusted, journey-level decision in seconds.

## Problem Statement
Delay Repay is widely available but under-claimed because the process is fragmented and hard to interpret. Passengers must piece together planned vs actual times, identify the right operator, and find the correct claim route.

Most existing tools focus on individual train departures, but Delay Repay is assessed against the passenger's end-to-end trip. For multi-leg itineraries, this creates uncertainty and friction.

Check-a-Train solves this by using a journey-based model and an eligibility engine that evaluates the whole itinerary, then provides a direct path to claim.

## Target Users / Personas
### Occasional Travellers
- Infrequent rail users with low process knowledge.
- Need a simple yes/no style answer and a clear next step.

### Commuters
- Regular travellers with repeated delay exposure.
- Need fast checks, consistent logic, and low-friction claim handoff.

### Business Travellers
- Time-constrained users who prioritise certainty and speed.
- Need reliable eligibility guidance and operator deep links with minimal manual effort.

## Solution Overview
Check-a-Train provides a journey-first experience:
- User searches by origin, destination, and departure time.
- System returns candidate itineraries (including changes/legs) around the requested time.
- Live and planned rail data are combined to compute journey-level delay.
- Eligibility engine applies Delay Repay rules to the final journey outcome (including cancellations).
- UI presents clear status and deep link(s) to the relevant operator claim page.

## MVP Scope
MVP includes:
- Journey search and itinerary results around the requested departure window.
- Live operational data enrichment for each itinerary.
- Eligibility engine output per journey (e.g., likely eligible, not eligible, unknown).
- Claim deep links to operator Delay Repay pages.
- Mobile-friendly journey cards with key evidence (planned vs expected/actual arrival, delay minutes, operator).

MVP excludes:
- Ticket purchase or fare management.
- Full national journey planning beyond Delay Repay use case.
- Account system, payment processing, or claim submission on behalf of users.

## Architecture Overview
High-level architecture:
- Server API layer: Handles validated journey queries, orchestrates upstream data providers, normalises responses, and enforces rate limits.
- Journey domain model: Canonical itinerary representation with one or more legs, planned/actual timings, operators, and computed journey delay.
- Eligibility engine: Rule layer that converts journey outcomes into Delay Repay eligibility states and reasons.
- UI layer: Journey cards that summarise eligibility and delay, with expandable leg details and operator claim handoff.

Design principles:
- Journey-based truth over single-train snapshots.
- Deterministic, explainable eligibility decisions.
- Clear separation between data ingestion, eligibility logic, and presentation.

## Success Metrics
MVP success is measured by:
- Time to answer: median time from search submit to eligibility result under 10 seconds.
- Reliability: at least 99% successful journey result responses for valid requests (excluding upstream provider outages).
- Decision clarity: at least 90% of sampled results include explicit eligibility state plus delay evidence.
- Handoff effectiveness: at least 70% of sessions with “likely eligible” result click through to a claim link.
- User confidence signal: reduction in support/feedback indicating confusion about eligibility logic.

## Non-Functional Requirements (Security / Performance / Reliability)
Security:
- No unnecessary personal data storage in MVP.
- Secrets remain server-side in environment configuration.
- Input validation and output encoding applied across API and UI.
- Operator link routing constrained to trusted allowlisted destinations.

Performance:
- Fast first result for common journeys; API and UI tuned for low-latency interactions.
- Efficient caching of static reference data (stations/operators).
- Graceful degradation when upstream data is slow.

Reliability:
- Clear fallback states when live data is unavailable.
- Deterministic error responses for invalid inputs.
- Basic observability for request success/failure and eligibility computation errors.

## Future Roadmap (beyond MVP)
- Personalisation for frequent routes and recent searches.
- Optional accounts with saved journeys and delay alerts.
- Smarter claim prefill support where operators permit structured handoff.
- Expanded rule coverage for operator-specific nuances and edge cases.
- Historical analytics to help users understand delay patterns and claim outcomes.
