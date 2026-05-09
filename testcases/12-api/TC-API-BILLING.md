# TC-API-BILLING — /billing route group

Mounted at `/billing` (`services/api/src/routes.ts:82`). Source: `services/api/src/routes/billing.ts`.

Endpoints (representative):
- `GET    /billing/plans`
- `GET    /billing/subscription`
- `POST   /billing/checkout`             — start Stripe checkout
- `POST   /billing/portal`               — billing portal
- `GET    /billing/invoices`
- `POST   /billing/cancel`
- `POST   /billing/resume`
- `POST   /billing/webhook`              — Stripe webhook (no auth, signature)
- `GET    /billing/usage`                — credits used
- `GET    /billing/credits`
- `POST   /billing/credits/topup`

---

## TC-API-BILLING-001 — GET /billing/plans 200 (public)
- **Steps:** GET no auth.
- **Expected:** 200 plan list.
- **Severity:** smoke

## TC-API-BILLING-002 — GET /billing/subscription 200
- **Steps:** Auth, GET.
- **Expected:** 200 current sub.
- **Severity:** smoke

## TC-API-BILLING-003 — GET subscription 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-BILLING-004 — GET subscription cross-workspace → 403
- **Steps:** Pass workspaceId not joined.
- **Expected:** 403.
- **Severity:** high

## TC-API-BILLING-005 — POST /billing/checkout 200 with redirect URL
- **Steps:** POST `{plan:"pro", workspaceId}`.
- **Expected:** 200 `{url:"https://checkout.stripe.com/..."}`.
- **Severity:** smoke

## TC-API-BILLING-006 — POST checkout invalid plan → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-BILLING-007 — POST checkout already on plan → 409
- **Expected:** 409 or 400.
- **Severity:** medium

## TC-API-BILLING-008 — POST checkout from non-owner → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-BILLING-009 — POST /billing/portal 200
- **Expected:** 200 with portal URL.
- **Severity:** medium

## TC-API-BILLING-010 — POST portal no active subscription → 400
- **Expected:** 400.
- **Severity:** medium

## TC-API-BILLING-011 — GET /billing/invoices 200
- **Expected:** 200 list.
- **Severity:** medium

## TC-API-BILLING-012 — GET invoices pagination
- **Expected:** 200 with cursor.
- **Severity:** medium

## TC-API-BILLING-013 — POST /billing/cancel 200
- **Expected:** 200; subscription marked cancel-at-period-end.
- **Severity:** smoke

## TC-API-BILLING-014 — POST cancel already canceled → 409
- **Expected:** 409 or 200 idempotent.
- **Severity:** medium

## TC-API-BILLING-015 — POST /billing/resume 200
- **Pre:** Canceled at period end.
- **Steps:** Resume.
- **Expected:** 200.
- **Severity:** medium

## TC-API-BILLING-016 — POST /billing/webhook valid Stripe signature 200
- **Steps:** Send Stripe event with valid `Stripe-Signature`.
- **Expected:** 200; DB updated.
- **Severity:** smoke

## TC-API-BILLING-017 — POST webhook missing signature → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-BILLING-018 — POST webhook bad signature → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-BILLING-019 — POST webhook replay (same id twice)
- **Expected:** 200 idempotent; no double-credit.
- **Severity:** high

## TC-API-BILLING-020 — POST webhook unknown event type
- **Expected:** 200 acknowledged, ignored.
- **Severity:** medium

## TC-API-BILLING-021 — GET /billing/usage 200
- **Expected:** 200 `{usedCredits,total,...}`.
- **Severity:** smoke

## TC-API-BILLING-022 — GET usage by viewer 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-BILLING-023 — GET /billing/credits 200
- **Expected:** 200 `{available,reserved,...}`.
- **Severity:** medium

## TC-API-BILLING-024 — POST /billing/credits/topup 200
- **Expected:** 200 redirect.
- **Severity:** medium

## TC-API-BILLING-025 — POST topup amount < 1 → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-BILLING-026 — POST topup amount > max → 400
- **Expected:** 400 max.
- **Severity:** medium

## TC-API-BILLING-027 — POST checkout body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-BILLING-028 — Wrong content-type form-encoded → 415
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-BILLING-029 — Webhook content-type text/plain → 400
- **Expected:** 400 expected raw JSON.
- **Severity:** medium

## TC-API-BILLING-030 — Path SQL injection on workspaceId param
- **Expected:** 400.
- **Severity:** smoke

## TC-API-BILLING-031 — CORS preflight on /billing/checkout
- **Expected:** 204 with allow.
- **Severity:** smoke

## TC-API-BILLING-032 — Webhook hits even when authMiddleware mounted on app
- **Steps:** Verify the webhook route bypasses auth.
- **Expected:** 200/400 depending on signature; never 401.
- **Severity:** smoke

## TC-API-BILLING-033 — Server error returns JSON envelope
- **Pre:** Stripe SDK throws.
- **Expected:** 500 JSON `{error}`.
- **Severity:** medium

## TC-API-BILLING-034 — Idempotency-Key on POST /credits/topup
- **Expected:** Single charge.
- **Severity:** high

## TC-API-BILLING-035 — Plan downgrade with usage above new cap
- **Steps:** Downgrade.
- **Expected:** 200 with grace warning, or 400 must reduce first.
- **Severity:** high

## TC-API-BILLING-036 — Currency support (USD vs EUR)
- **Steps:** POST checkout currency=EUR if supported.
- **Expected:** 200/400 per support.
- **Severity:** medium

## TC-API-BILLING-037 — Tax-id field saved
- **Steps:** POST with tax id.
- **Expected:** 200; persisted.
- **Severity:** low

## TC-API-BILLING-038 — Header CRLF injection on Stripe-Signature
- **Expected:** 400.
- **Severity:** smoke

## TC-API-BILLING-039 — Slow webhook processing
- **Steps:** Stripe sent at 1 byte/sec.
- **Expected:** 408 or 200 within 30s.
- **Severity:** medium

## TC-API-BILLING-040 — DB down during webhook
- **Pre:** Stop DB.
- **Expected:** 500; Stripe retries; eventual 200.
- **Severity:** high
