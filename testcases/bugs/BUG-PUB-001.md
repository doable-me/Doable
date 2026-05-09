# BUG-PUB-001 — Billing endpoints /balance, /topup/*, /invoices return 404 on zantaz

**Severity:** High
**Env:** zantaz (https://zantaz-api.doable.me)
**Date:** 2026-05-10

## Repro
```
TOKEN=<qa-owner JWT>
curl -H "Authorization: Bearer $TOKEN" https://zantaz-api.doable.me/billing/balance
# → 404 {"error":"Not Found","path":"/billing/balance"}
curl -H "Authorization: Bearer $TOKEN" https://zantaz-api.doable.me/billing/topup/packages
# → 404
curl -H "Authorization: Bearer $TOKEN" https://zantaz-api.doable.me/billing/invoices
# → 404
curl -X POST -H "Authorization: Bearer $TOKEN" https://zantaz-api.doable.me/billing/topup
# → 404
```

## Expected
Per testcases/06-billing/ (TC-BILLING-CREDITS-001, TC-BILLING-TOPUP-001, TC-BILLING-PORTAL-010):
- `GET /billing/balance` 200 with `{dailyRemaining, dailyMax, monthlyRemaining, monthlyMax, topupRemaining, planUnlimited}`.
- `GET /billing/topup/packages` 200 with package array.
- `GET /billing/invoices` 200 with invoices array (empty in bypass mode is fine, NOT 404).
- `POST /billing/topup` 200 in bypass mode granting bypass topup credits.

## Actual
404 Not Found from API for all four endpoints. Only `/billing/plans` and `/billing/webhook` exist; the credits/topup/invoices/portal-list surface is missing.

## Impact
Billing UI (sidebar Upgrade button → /billing) cannot render balances or buy topups; tests in TC-BILLING-CREDITS-* and TC-BILLING-TOPUP-* are wholly unrunnable on zantaz.
