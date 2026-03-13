# Check-a-Train

Check-a-Train is a Delay Repay assistant built with Next.js. It fetches live or fixture-backed train running data, highlights delayed services, and routes users into the right operator claim flow.

## Local Run

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Historical Fixture Loader

Check-a-Train includes a tiny fixture-based historical service loader to prove the hosted Supabase datastore write path before real timetable ingestion is added.

- Canonical fixture input lives at [`data/fixtures/historical-services.sample.json`](/Users/danjohn/Projects/Code/check-a-train/data/fixtures/historical-services.sample.json).
- Loader script lives at [`scripts/load-historical-services.mjs`](/Users/danjohn/Projects/Code/check-a-train/scripts/load-historical-services.mjs).
- This is a temporary proof step. The fixture shape is an internal canonical adapter, not the long-term ingestion contract for external rail feeds.

Required environment variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Run the loader with:

```bash
node --env-file=.env.local scripts/load-historical-services.mjs
```

If the required environment variables are already exported in your shell, you can also use:

```bash
npm run load:historical-services
```

The loader is safe to rerun. It upserts `historical_services` by `service_key`, fetches the affected IDs, deletes existing `historical_service_search` rows for those services, and recreates one search row per service.

## Historical Timetable Sample Loader

Check-a-Train also includes a small timetable-shaped sample loader as the next bridge step between the internal canonical fixture and real external feed ingestion.

- Timetable-shaped sample input lives at [`data/samples/historical-timetable.sample.json`](/Users/danjohn/Projects/Code/check-a-train/data/samples/historical-timetable.sample.json).
- Mapper module lives at [`lib/historical/timetable-mapper.mjs`](/Users/danjohn/Projects/Code/check-a-train/lib/historical/timetable-mapper.mjs).
- Loader script lives at [`scripts/load-historical-timetable-sample.mjs`](/Users/danjohn/Projects/Code/check-a-train/scripts/load-historical-timetable-sample.mjs).

This proof step differs from the canonical fixture loader in one important way:

- the sample file is source-like and stop-based, with service identifiers, TOC code, service date, and ordered calling points plus booked times
- the loader maps that shape into the existing canonical historical service record before persisting it
- the underlying datastore contract is unchanged: it still writes `historical_services` plus one simple origin-to-destination search row per sample service into `historical_service_search`

Required environment variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Run the timetable-sample loader with:

```bash
node --env-file=.env.local scripts/load-historical-timetable-sample.mjs
```

If the required environment variables are already exported in your shell, you can also use:

```bash
npm run load:historical-timetable-sample
```

The timetable-sample loader is also safe to rerun. It reuses the same datastore write path as the canonical fixture loader: upsert services by `service_key`, reselect IDs, delete existing search rows for those service IDs, then recreate the search rows.

## Darwin Timetable Parser Foundation

Check-a-Train now also includes a small parser foundation for a real Darwin Push Port timetable XML artefact in `.xml.gz` form.

- Parser module: [`lib/darwin/timetable-parser.mjs`](/Users/danjohn/Projects/Code/check-a-train/lib/darwin/timetable-parser.mjs)
- Parse script: [`scripts/parse-darwin-timetable-sample.mjs`](/Users/danjohn/Projects/Code/check-a-train/scripts/parse-darwin-timetable-sample.mjs)
- Derived inspection output: [`data/derived/darwin-timetable.parsed.json`](/Users/danjohn/Projects/Code/check-a-train/data/derived/darwin-timetable.parsed.json)

This step is intentionally narrow:

- it reads and decompresses a Darwin timetable `.xml.gz` file
- it extracts a small subset of journey fields plus ordered timing points
- it filters out non-passenger services when `isPassengerSvc` is explicitly present and false
- it writes an intermediate normalized inspection model only

It does not:

- persist real Darwin timetable data to Supabase
- map directly into the canonical historical datastore model
- add movement enrichment, HSP logic, or routing changes

Run it with an explicit input path:

```bash
node scripts/parse-darwin-timetable-sample.mjs /absolute/or/relative/path/to/darwin-timetable.xml.gz
```

Or, if you prefer the npm script wrapper:

```bash
npm run parse:darwin-timetable-sample -- /absolute/or/relative/path/to/darwin-timetable.xml.gz
```

The script writes a normalized JSON inspection file to:

```text
data/derived/darwin-timetable.parsed.json
```

## Darwin Candidate-Service Extraction

Check-a-Train now also includes a small follow-on step that derives a cleaner, inspection-focused candidate-service model from the parsed Darwin timetable JSON.

- Candidate-service helper: [`lib/darwin/candidate-services.mjs`](/Users/danjohn/Projects/Code/check-a-train/lib/darwin/candidate-services.mjs)
- Extraction script: [`scripts/extract-darwin-candidate-services.mjs`](/Users/danjohn/Projects/Code/check-a-train/scripts/extract-darwin-candidate-services.mjs)
- Derived candidate-service output: [`data/derived/darwin-timetable.candidate-services.json`](/Users/danjohn/Projects/Code/check-a-train/data/derived/darwin-timetable.candidate-services.json)

This step is still intentionally narrow:

- it reads the existing Darwin parsed inspection JSON as its input contract
- it keeps only likely passenger stop timing points with kinds `OR`, `IP`, and `DT`
- it excludes operational passing points with kind `PP`
- it preserves TIPLOC values and the already-derived scheduled arrival/departure fields
- it writes a smaller candidate-service inspection model only

It still does not:

- perform CRS or TIPLOC resolution
- map into the canonical historical datastore model
- persist Darwin-derived data to Supabase

Run it with the default parsed Darwin input:

```bash
node scripts/extract-darwin-candidate-services.mjs
```

Or provide an explicit parsed Darwin JSON path:

```bash
node scripts/extract-darwin-candidate-services.mjs data/derived/darwin-timetable.parsed.json
```

If you prefer the npm script wrapper:

```bash
npm run extract:darwin-candidate-services
```

The script writes the derived candidate-service inspection file to:

```text
data/derived/darwin-timetable.candidate-services.json
```

## Darwin TIPLOC Stop Resolution

Check-a-Train now also includes a small Darwin-only TIPLOC stop-resolution proof step on top of the candidate-service JSON.

- Resolution helper: [`lib/darwin/tiploc-resolution.mjs`](/Users/danjohn/Projects/Code/check-a-train/lib/darwin/tiploc-resolution.mjs)
- Temporary mapping source: [`data/reference/tiploc-mapping.sample.json`](/Users/danjohn/Projects/Code/check-a-train/data/reference/tiploc-mapping.sample.json)
- Resolution script: [`scripts/resolve-darwin-candidate-stops.mjs`](/Users/danjohn/Projects/Code/check-a-train/scripts/resolve-darwin-candidate-stops.mjs)
- Derived resolved-stop output: [`data/derived/darwin-timetable.resolved-stops.json`](/Users/danjohn/Projects/Code/check-a-train/data/derived/darwin-timetable.resolved-stops.json)

This step is still intentionally narrow:

- it reads the existing Darwin candidate-service inspection JSON
- it applies a small explicit TIPLOC mapping for a useful proof-step subset only
- it augments each stop with `resolutionStatus`, `resolvedCrs`, and `resolvedName`
- it leaves unknown TIPLOCs unresolved rather than guessing
- it can also mark stops as ambiguous or excluded when that is explicit

It still does not:

- map Darwin stops into the canonical historical datastore model
- persist Darwin-derived data to Supabase
- add routing, HSP fallback, or journey-planning logic

Run it with the default candidate-service input:

```bash
node scripts/resolve-darwin-candidate-stops.mjs
```

Or provide an explicit candidate-service JSON path:

```bash
node scripts/resolve-darwin-candidate-stops.mjs data/derived/darwin-timetable.candidate-services.json
```

If you prefer the npm script wrapper:

```bash
npm run resolve:darwin-candidate-stops
```

The script writes the resolved-stop inspection file to:

```text
data/derived/darwin-timetable.resolved-stops.json
```

This remains an intermediate proof step only. It is a bridge from TIPLOC-only Darwin candidate services toward later canonical station mapping, not a persistence or search-path change.

## Southeastern / Kent Corridor Coverage

Check-a-Train now also includes a small corridor-focused inspection step on top of the Darwin resolved-stop output.

- Corridor report script: [`scripts/report-southeastern-corridor-coverage.mjs`](/Users/danjohn/Projects/Code/check-a-train/scripts/report-southeastern-corridor-coverage.mjs)
- Corridor subset output: [`data/derived/darwin-timetable.southeastern-corridor.json`](/Users/danjohn/Projects/Code/check-a-train/data/derived/darwin-timetable.southeastern-corridor.json)

This step is still intentionally narrow:

- it reads the existing resolved-stop inspection JSON
- it applies a small explicit Southeastern / Kent commuter corridor rule local to the report script
- it writes a corridor-focused subset that stays close to the resolved-stop structure
- it prints a concise coverage summary so the corridor can be judged for later canonical mapping work

It still does not:

- persist Darwin-derived data to Supabase
- map corridor data into the canonical historical datastore model
- add live/historical routing, HSP logic, or journey-planning behavior

Run it with the default resolved-stop input:

```bash
node scripts/report-southeastern-corridor-coverage.mjs
```

Or provide an explicit resolved-stop JSON path:

```bash
node scripts/report-southeastern-corridor-coverage.mjs data/derived/darwin-timetable.resolved-stops.json
```

If you prefer the npm script wrapper:

```bash
npm run report:southeastern-corridor-coverage
```

The script writes the corridor-focused inspection file to:

```text
data/derived/darwin-timetable.southeastern-corridor.json
```

This remains an intermediate proof step only. It is a corridor-scoped inspection aid for later canonical mapping decisions, not a persistence, search-path, or routing change.

## Historical Search Proof Path

Check-a-Train now also includes a small server-side historical search proof path that reads from the hosted Supabase datastore.

- Search module: [`lib/historical/search.mjs`](/Users/danjohn/Projects/Code/check-a-train/lib/historical/search.mjs)
- Supabase runtime helper: [`lib/supabase/rest.mjs`](/Users/danjohn/Projects/Code/check-a-train/lib/supabase/rest.mjs)
- Verification script: [`scripts/verify-historical-search.mjs`](/Users/danjohn/Projects/Code/check-a-train/scripts/verify-historical-search.mjs)

The search path:

- validates and normalizes `originCrs`, `destinationCrs`, `serviceDate`, and `approxDepartureTime`
- builds a default `±30` minute search window
- filters `public.historical_service_search` by exact date and CRS pair plus `scheduled_departure_ts` window
- ranks the filtered rows in application code by closeness to the requested departure time
- returns a compact candidate list ready for later API use

Required environment variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Run the proof query with:

```bash
node --env-file=.env.local scripts/verify-historical-search.mjs
```

Or, if those variables are already exported:

```bash
npm run verify:historical-search
```

By default the verification script runs the fixture-backed proof query:

```text
originCrs=TON
destinationCrs=SEV
serviceDate=2026-03-12
approxDepartureTime=15:45
```

You can override the query by passing the four arguments in that order.

## Darwin Live Board Setup

Check-a-Train can call the Rail Data gateway `GetArrDepBoardWithDetails/{crs}` endpoint when `DARWIN_MODE=live`.

Required env vars:

```bash
DARWIN_MODE=live
DARWIN_API_KEY=your_rail_data_gateway_api_key
DARWIN_BASE_URL=https://your-rail-data-gateway-base-url
USE_HSP=0
HSP_API_KEY=your_rail_data_hsp_api_key
HSP_BASE_URL=https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1
HSP_METRICS_TIMEOUT_MS=12000
```

You can start from [`.env.example`](/Users/danjohn/Projects/Code/check-a-train/.env.example). Keep secrets in `.env.local`, not in committed files.

### Local Verification

1. Set `DARWIN_MODE=live`, `DARWIN_API_KEY`, and `DARWIN_BASE_URL` in `.env.local`.
2. Run `npm run dev`.
3. Open a live search in the app, or call the existing route directly with a current-time query such as:

```bash
curl "http://localhost:3000/api/journeys?from=SEV&to=LBG&date=2026-03-11&time=08:30&window=30"
```

Use a live CRS such as `SEV` and a near-now time window. The route returns normalized `services`, a `source` of `darwin.gateway`, and a `note` describing the live provider.

## HSP Historical Search

When `DARWIN_MODE=live` and `USE_HSP=1`, `/api/journeys` automatically uses Darwin HSP for past-date searches and for same-day departures that are already meaningfully in the past.

- Current-day and future searches still use the live Darwin board path.
- Same-day searches switch to HSP once the requested departure time is at least 45 minutes behind the current time.
- Past-date searches return the same journey response shape, with `source: "darwin.hsp"` and a historical-source note for the UI.
- HSP `429` spike-arrest responses are handled with one short delayed retry before the existing controlled error/fallback path is used.
- HSP is only used to support the existing delay-details outcome; it does not add journey-planning or analytics features.

### Local Verification

1. Set `DARWIN_MODE=live`, `USE_HSP=1`, `HSP_API_KEY`, and `HSP_BASE_URL` in `.env.local`.
2. If same-day historical searches need a larger HSP budget, optionally set `HSP_METRICS_TIMEOUT_MS` (default `12000`).
3. Run `npm run dev`.
4. Call `/api/journeys` with a past date, for example:

```bash
curl "http://localhost:3000/api/journeys?from=SEV&to=LBG&date=2026-03-05&time=08:30&window=30"
```

Expected verification points:

- The JSON response includes `source: "darwin.hsp"`.
- `note` explains that historical HSP data was used.
- Returned `services` use the existing service card shape, with planned departure populated immediately and historical timing/detail fields left unknown until any later enrichment step is added.

For same-day historical verification, use today’s date with a departure time at least 45 minutes behind the current time so the request takes the HSP path instead of live Darwin.

### Request Contract Used In App

The app posts JSON to the Rail Data HSP gateway using:

- Path: `POST {HSP_BASE_URL}/serviceMetrics`
- Headers:
  - `Content-Type: application/json`
  - `x-apikey: {HSP_API_KEY}`
- Payload shape:

```json
{
  "from_loc": "SEV",
  "to_loc": "LBG",
  "from_date": "2026-03-05",
  "to_date": "2026-03-05",
  "from_time": "0800",
  "to_time": "0900",
  "days": "WEEKDAY"
}
```

`days` is derived from the search date with a small explicit mapping: weekdays use `WEEKDAY`, Saturdays use `SATURDAY`, and Sundays use `SUNDAY`.

## Delay Repay Operator Routing

Delay Repay claim routing is driven by the explicit mapping in [lib/operators.ts](/Users/danjohn/Projects/Code/check-a-train/lib/operators.ts).

- The helper resolves by normalized operator code first, then falls back to operator name and aliases.
- The current starter set includes Southeastern (`SE`), Thameslink (`TL`), Southern (`SN`), Gatwick Express (`GX`), Great Northern (`GN`), and South Western Railway (`SW`).
- If a service is eligible but no mapped operator claim URL exists yet, the UI shows `Claim link unavailable` instead of sending the user to the wrong place.

## Journey Matching And First-Pass Delay

`/api/journeys` now does two small extra steps after Darwin normalization:

1. It ranks services to the searched journey.
2. It derives a first-pass delay answer from the best match.

### Matching Rules

The matching helper keeps the logic deliberately small:

- Prefer a service that is confirmed to call at the requested destination CRS.
- Otherwise fall back safely when destination calling-point data is missing.
- Prefer the service whose planned departure is closest to the searched departure time.
- Use real-time departure proximity as a secondary tie-break.

The response still includes the ranked `services` array, and now also includes:

- `selectedService`: the best matched Darwin service, or `null`
- `firstPassStatus`: the derived delay answer for that matched service

Example response shape:

```json
{
  "services": [],
  "selectedService": {
    "uid": "DARWIN:202603020850",
    "status": "Delayed",
    "delayMins": 5,
    "isBestMatch": true
  },
  "firstPassStatus": {
    "status": "Delayed",
    "delayMins": 5,
    "basis": "arrival",
    "confidence": "high",
    "matchedServiceUid": "DARWIN:202603020850"
  }
}
```

### Delay Rules

The first-pass delay derivation is intentionally practical:

- Prefer arrival delay when aimed and expected arrival times are both available.
- Otherwise use departure delay when aimed and expected departure times are available.
- Treat `On time` as `0` delay.
- Treat cancelled services safely as `status=Cancelled` with no numeric delay.
- If Darwin only provides non-time text such as `Delayed`, return a safe status even when exact minutes are unknown.
- If no service can be matched, return `selectedService=null` and `firstPassStatus.status=\"Unknown\"`.

## Signals To Product OS

Check-a-Train can emit product signals to Product OS from server-side code. Signals are lightweight JSON events that describe meaningful product behaviour such as:

- `delay_detected`
- `claim_started`
- `darwin_api_error`

Signal emission is handled by [`lib/productos-signal.ts`](/Users/danjohn/Projects/Code/check-a-train/lib/productos-signal.ts). The helper sends a JSON `POST` to the configured Product OS endpoint and never throws into the user flow. If Product OS is unavailable, Check-a-Train logs a warning and continues normally.

### Configuration

Set the Product OS endpoint in `.env.local`:

```bash
PRODUCT_OS_SIGNAL_ENDPOINT=http://localhost:3000/api/signals/ingest
```

The endpoint is not hardcoded. Check-a-Train reads it from `PRODUCT_OS_SIGNAL_ENDPOINT` for every emitted signal.
Only point this at Product OS in environments where the app is handling real user flows. Keep it unset for synthetic QA or fixture-only traffic.

### Current Emission Points

- [`app/api/journeys/route.ts`](/Users/danjohn/Projects/Code/check-a-train/app/api/journeys/route.ts): emits `delay_detected` only when a live Darwin-backed search returns delayed services that the user can act on.
- [`app/api/claim/start/route.ts`](/Users/danjohn/Projects/Code/check-a-train/app/api/claim/start/route.ts): emits `claim_started` on the server before redirecting the user to the operator claim page, but only for handoffs that came from live Darwin results.
- [`lib/providers/journeys-provider.ts`](/Users/danjohn/Projects/Code/check-a-train/lib/providers/journeys-provider.ts): emits `darwin_api_error` when a real Darwin lookup fails.

### Example Payloads

`delay_detected`

```json
{
  "product_slug": "check-a-train",
  "signal_name": "delay_detected",
  "timestamp": "2026-03-08T10:15:00.000Z",
  "metadata": {
    "from": "SEV",
    "to": "LBG",
    "journey_stage": "delayed_service_presented",
    "user_outcome": "claim_opportunity_identified",
    "service_uid": "DARWIN:20260305SEV002",
    "operator_name": "Southeastern",
    "status": "Delayed",
    "delay_mins": 8
  }
}
```

`claim_started`

```json
{
  "product_slug": "check-a-train",
  "signal_name": "claim_started",
  "timestamp": "2026-03-08T10:16:00.000Z",
  "metadata": {
    "operator": "SE",
    "operator_name": "Southeastern",
    "journey_stage": "claim_handoff_started",
    "user_outcome": "operator_claim_redirect_started",
    "service_uid": "DARWIN:20260305SEV002",
    "origin_name": "Sevenoaks",
    "destination_name": "London Bridge",
    "status": "Delayed",
    "delay_mins": 8
  }
}
```

## Notes

- Signal delivery is best-effort only.
- No authentication is added yet.
- Signal failures do not block journey results or claim handoff.
- Signals are derived from existing user-driven behaviour only; Check-a-Train does not create extra Darwin/HSP requests just to feed Product OS.
