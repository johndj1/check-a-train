# Check-a-Train

Check-a-Train is a Delay Repay assistant built with Next.js. It fetches live or fixture-backed train running data, highlights delayed services, and routes users into the right operator claim flow.

## Local Run

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Signals To Product OS

Check-a-Train can emit product signals to Product OS from server-side code. Signals are lightweight JSON events that describe meaningful product behaviour such as:

- `delay_detected`
- `claim_started`
- `darwin_api_error`

Signal emission is handled by [`lib/productos-signal.ts`](/Users/danjohn/Projects/Code/check-a-train/lib/productos-signal.ts). The helper sends a JSON `POST` to the configured Product OS endpoint and never throws into the user flow. If Product OS is unavailable, Check-a-Train logs a warning and continues normally.

### Configuration

Set the Product OS endpoint in `.env.local`:

```bash
PRODUCT_OS_SIGNAL_ENDPOINT=http://localhost:3000/api/signals
```

The endpoint is not hardcoded. Check-a-Train reads it from `PRODUCT_OS_SIGNAL_ENDPOINT` for every emitted signal.

### Current Emission Points

- [`app/api/journeys/route.ts`](/Users/danjohn/Projects/Code/check-a-train/app/api/journeys/route.ts): emits `delay_detected` for delayed services returned by the server-side journey lookup.
- [`app/api/claim/start/route.ts`](/Users/danjohn/Projects/Code/check-a-train/app/api/claim/start/route.ts): emits `claim_started` on the server before redirecting the user to the operator claim page.
- [`lib/providers/journeys-provider.ts`](/Users/danjohn/Projects/Code/check-a-train/lib/providers/journeys-provider.ts): emits `darwin_api_error` when Darwin/HSP live lookup fails.

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
