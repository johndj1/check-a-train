# Check-a-Train

Check-a-Train is a Delay Repay assistant built with Next.js. It fetches live or fixture-backed train running data, highlights delayed services, and routes users into the right operator claim flow.

## Local Run

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

When `DARWIN_MODE=live` and `USE_HSP=1`, `/api/journeys` automatically uses Darwin HSP for past-date searches.

- Current-day and future searches still use the live Darwin board path.
- Past-date searches return the same journey response shape, with `source: "darwin.hsp"` and a historical-source note for the UI.
- HSP is only used to support the existing delay-details outcome; it does not add journey-planning or analytics features.

### Local Verification

1. Set `DARWIN_MODE=live`, `USE_HSP=1`, `HSP_API_KEY`, and `HSP_BASE_URL` in `.env.local`.
2. Run `npm run dev`.
3. Call `/api/journeys` with a past date, for example:

```bash
curl "http://localhost:3000/api/journeys?from=SEV&to=LBG&date=2026-03-05&time=08:30&window=30"
```

Expected verification points:

- The JSON response includes `source: "darwin.hsp"`.
- `note` explains that historical HSP data was used.
- Returned `services` use the existing service card shape where data is available, including planned departure and, for enriched rows, actual arrival/departure timing.

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
