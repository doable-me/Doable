# BUG-PUB-003 — GET /marketplace requires auth (401) — anon browse blocked

**Severity:** High
**Env:** <env>
**Date:** 2026-05-10

## Repro
```
curl https://<env>-api.doable.me/marketplace
# → HTTP 401 {"error":"Missing or invalid Authorization header"}
```

## Expected (per TC-MARKET-LIST-001)
> Anonymous user can browse marketplace … No auth wall.

`/marketplace/listings` and `/marketplace/categories` already work anonymously and return 200; the bare `/marketplace` collection should similarly be public (or, if it's the admin view, the public list endpoint must be the documented entry point and public web links should not 401).

## Workaround
Use `GET /marketplace/listings` (200, returns `{data:[],total:0}`).

## Impact
- Public discovery flow broken if anything in the web client points to `/marketplace`.
- Violates the explicit "no auth wall" critical-severity testcase.
