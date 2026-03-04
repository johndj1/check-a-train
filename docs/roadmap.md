# Product Roadmap

## Phase 1 — Foundations
- PB-001 — Create product definition document — done
- PB-002 — Create machine-readable backlog — done
- PB-003 — Record architectural decisions — done

## Phase 2 — Journey Intelligence
- JR-001 — Introduce Journey + Leg domain model — todo
- JR-002 — Define stable Journey API contract (v1) — todo
- JR-003 — Integrate TransportAPI journey planner endpoint — todo

## Phase 3 — Delay Repay Engine
- DR-001 — Multi-leg journeys + choose delayed leg (or whole journey) — todo
- DR-002 — Delay Repay handoff by operator + copy-pack — todo
- DR-003 — Integrate live rail running data — todo
- DR-004 — Calculate Delay Repay eligibility — todo
- DR-005 — Journey cards with expandable details — done
- DR-006 — Operator Delay Repay handoff — done
- DR-007 — Service cards with expandable details drawer — done
- DR-008 — Multi-leg journey capture and delayed-leg selection — done
- DR-009 — Delay Repay handoff by operator with copy-pack — done

## Phase 4 — Security & Hardening
- SEC-001 — Validate and normalise all user inputs — todo
- SEC-002 — Prevent cross-site scripting (XSS) — todo
- SEC-003 — Add rate limiting to API routes — todo
- SEC-004 — Keep API secrets server-side only — todo
- SEC-005 — Add baseline security headers — todo
- SEC-006 — Validate outbound operator links — todo
- SEC-007 — Safe request logging without PII — todo
- SEC-008 — Run MVP red-team checklist — todo
- SEC-009 — Hide stack traces in production API responses — done
- SEC-010 — Validate station CRS codes server-side in journeys API — todo
- SEC-011 — Implement server-side input validation for date and time — todo

## Phase 5 — Infrastructure & Developer Experience
- DEV-001 — Codex commit helper (safe mode: no auto-commit until tests pass) — todo
- DEV-002 — Auto-close backlog stories from commit messages — todo
- INF-001 — Introduce CI/CD pipeline for build and deployment — todo

## Future Experiments
- EXP-001 — User accounts for saved journeys — todo
- EXP-002 — Delay alerts for saved journeys — todo
