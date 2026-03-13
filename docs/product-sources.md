# Product Source Documents

This file maps the current canonical product sources that already exist in this repository. Use these paths rather than assuming separate `personas.md`, `journeys.md`, or `features.md` files exist.

## Canonical sources for current MVP work

- Product framing, personas, journeys, MVP boundaries:
  `docs/check-a-train-context.md`
- Delivery rules for turning product intent into tasks:
  `docs/feature-delivery-system.md`
- Current roadmap and phase ordering:
  `docs/roadmap.md`
- Feature-specific grounding when a task touches historical persistence:
  `docs/features/historical-service-datastore.md`
- Architectural constraints and existing proof-path context:
  `docs/check-a-train-architecture.md`
- Decisions and guardrails already taken:
  `docs/decisions.md`

## How to interpret source types

- Personas:
  use the representative users section in `docs/check-a-train-context.md`
- Journeys:
  use the key journeys section in `docs/check-a-train-context.md`
- Features:
  derive from the current phase priorities in `docs/check-a-train-context.md`, the roadmap in `docs/roadmap.md`, and feature docs under `docs/features/`
- Roadmap:
  use `docs/roadmap.md` for sequencing, but do not let it override the tighter MVP framing in `docs/check-a-train-context.md`

## Priority order when sources feel uneven

1. `docs/check-a-train-context.md`
2. `docs/feature-delivery-system.md`
3. active task file in `tasks/active/`
4. relevant feature doc in `docs/features/`
5. `docs/roadmap.md`
6. `docs/check-a-train-architecture.md`

## Notes on older or broader docs

Some older documents may describe broader journey-oriented ideas. Treat them as background unless they match the current MVP framing above.

For active implementation work, keep Check-a-Train positioned as:
- a Delay Repay assistant MVP
- focused on direct-service identification and confirmation
- centered on delay evidence plus operator claim handoff
- not a general journey planner
