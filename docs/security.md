# Security & Red-Team Plan

## Threat model (lightweight)
- Inputs: station names, dates, times
- Outputs: eligibility estimates, links to operators
- Risks: abuse of API, scraping, injection, leaking keys, storing PII

## Controls (MVP)
- Rate limiting on /api/*
- Input validation and allowlists (station codes only)
- No auth initially
- No server-side persistence
- No secrets in client bundle
- CSP headers (baseline)

## Red-team checklist
- Attempt XSS in station fields
- Attempt query param injection into /api/journeys
- Attempt open redirect via operator links
- Test API abuse (rapid calls)
- Check bundle for leaked secrets
- Check logs for PII