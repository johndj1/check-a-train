# Historical Service Datastore

## Why This Datastore Exists

Check-a-Train needs a fast historical lookup path for passengers who are checking a train after they have already travelled.

The product goal is not journey planning. It is to identify the most likely direct service, determine whether it was delayed or cancelled, and get the user to the correct Delay Repay claim page quickly.

For that flow, historical search needs to feel near-instant. The current target is sub-second lookup for direct-train matching.

## Why HSP Is Not Used For Synchronous Historical Search

Darwin HSP integration exists, but observed response times are too slow for the main historical search path. Example testing showed a TON to SEV search on 12 Mar 2026 in a 15:45 to 16:15 window taking about 22 seconds.

That makes HSP unsuitable for the user-facing synchronous search experience. The historical datastore exists so historical lookups can be served from indexed local data instead of waiting on slow upstream calls.

## Tables

### `public.historical_services`

This is the canonical record for a train service on a given service date.

It stores:

- service identity fields such as `service_key`, `train_uid`, and `rid`
- high-level operator and endpoint fields such as `toc_code`, `origin_crs`, and `destination_crs`
- scheduled and actual origin/destination timestamps
- simplified operational outcome fields such as `status`, `is_cancelled`, `is_part_cancelled`, and `delay_minutes`
- a lightweight `data_quality_score` so later ingestion can indicate confidence or completeness without changing the schema

This table is the source of truth for one service record.

### `public.historical_service_search`

This is the search-optimised lookup table for direct journey matching.

It stores the small subset of fields needed to answer the main historical search query quickly:

- service date
- origin CRS
- destination CRS
- scheduled departure and arrival timestamps
- operator code
- simplified status and delay fields

Each row points back to `historical_services.id`, so the search path can stay index-friendly without duplicating the full canonical record structure everywhere.

## Query Pattern This Schema Is Optimised For

The schema is optimised for direct-train historical search queries shaped like:

- service date is known
- origin CRS is known
- destination CRS is known
- the user knows an approximate departure time

The main indexed lookup path is:

1. filter by `service_date`
2. filter by `origin_crs` and `destination_crs`
3. narrow by scheduled departure time ordering or proximity

Supporting indexes also cover date plus origin searches and date plus destination searches, which helps with adjacent ranking and operational queries without widening the scope into full journey planning.

## What Is Intentionally Not Included Yet

This first migration deliberately does not include:

- ingestion logic
- search API routes
- live versus historical routing
- HSP fallback behaviour
- calling-point level stop data
- movement event detail
- platforms
- joins and splits
- connection or interchange modelling
- blob or object storage

Those concerns can be added later once the basic historical service store and query path are in place.

## Scope Of This Step

This is the first foundation step for the Historical Service Index feature.

It creates the minimum persistent structure needed to start loading and querying historical direct-service data in later incremental work.
