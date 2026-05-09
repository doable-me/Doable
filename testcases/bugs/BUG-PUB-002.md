# BUG-PUB-002 — POST /billing/portal returns 400 instead of 503 in Stripe bypass mode

**Severity:** Medium
**Env:** zantaz (STRIPE_SECRET_KEY="")
**Date:** 2026-05-10

## Repro
```
curl -X POST -H "Authorization: Bearer $OWNER" https://zantaz-api.doable.me/billing/portal
# → HTTP 400 {"error":"Invalid JSON in request body"}
```

## Expected (per TC-BILLING-PORTAL-003)
> Portal in bypass mode → 503 with informative json

Either `503 {"error":"stripe_disabled","message":"Billing portal unavailable"}` or accept empty body and return a friendly bypass response. Returning a generic JSON-parse 400 to a request with no body is wrong: GET-style POSTs that take no body must not require a parseable JSON object.

## Impact
- The web client falls into a useless "Invalid JSON" error.
- Tests TC-BILLING-PORTAL-001..009 cannot proceed.
