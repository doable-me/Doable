# TC-BILLING-WEBHOOK — Stripe webhook handling (with bypass mode)

Covers POST /billing/webhook: signature verification, event handling (checkout.session.completed, customer.subscription.updated, invoice.paid, invoice.payment_failed, charge.refunded, customer.subscription.deleted), idempotency on replay, bypass-mode skip behavior.

## TC-BILLING-WEBHOOK-001 — Valid signature accepted (smoke)
- **Pre:** STRIPE_WEBHOOK_SECRET set
- **Steps:** POST raw body with valid Stripe-Signature
- **Expected:** 200; event processed
- **Severity:** smoke

## TC-BILLING-WEBHOOK-002 — Missing signature → 400
- **Severity:** critical

## TC-BILLING-WEBHOOK-003 — Invalid signature → 400
- **Severity:** critical

## TC-BILLING-WEBHOOK-004 — Tampered body but old signature → 400
- **Severity:** critical

## TC-BILLING-WEBHOOK-005 — Replay event same id → 200 idempotent
- **Steps:** POST same event twice
- **Expected:** processed once; second logs skip
- **Severity:** critical

## TC-BILLING-WEBHOOK-006 — Replay across DB write boundary → 200 idempotent
- **Severity:** critical

## TC-BILLING-WEBHOOK-007 — Old timestamp (>5min skew) rejected
- **Severity:** high

## TC-BILLING-WEBHOOK-008 — checkout.session.completed for subscription activates
- **Steps:** post event
- **Expected:** subscription row upsert; status=active; plan applied
- **Severity:** smoke

## TC-BILLING-WEBHOOK-009 — checkout.session.completed for topup grants credits
- **Severity:** smoke

## TC-BILLING-WEBHOOK-010 — customer.subscription.updated changes plan
- **Severity:** high

## TC-BILLING-WEBHOOK-011 — customer.subscription.updated cancel_at_period_end=true
- **Severity:** high

## TC-BILLING-WEBHOOK-012 — customer.subscription.deleted reverts to free
- **Severity:** high

## TC-BILLING-WEBHOOK-013 — invoice.paid extends period
- **Severity:** high

## TC-BILLING-WEBHOOK-014 — invoice.payment_failed sets past_due
- **Severity:** high

## TC-BILLING-WEBHOOK-015 — charge.refunded reduces topup balance
- **Severity:** high

## TC-BILLING-WEBHOOK-016 — Unknown event type ignored 200
- **Severity:** medium

## TC-BILLING-WEBHOOK-017 — Webhook 500 on internal failure → Stripe retries
- **Severity:** high

## TC-BILLING-WEBHOOK-018 — Bypass mode (STRIPE_SECRET_KEY="") returns 200 with skip
- **Steps:** post event in bypass
- **Expected:** logged; no Stripe calls made; idempotent
- **Severity:** smoke

## TC-BILLING-WEBHOOK-019 — Bypass mode does not crash on missing webhook secret
- **Severity:** high

## TC-BILLING-WEBHOOK-020 — Webhook records event id in stripe_events table
- **Severity:** high

## TC-BILLING-WEBHOOK-021 — Concurrent same-event delivery serialized
- **Severity:** critical

## TC-BILLING-WEBHOOK-022 — DB transaction rolls back on partial failure
- **Severity:** high

## TC-BILLING-WEBHOOK-023 — Webhook handler logs every event with id
- **Severity:** medium

## TC-BILLING-WEBHOOK-024 — Webhook timing < 2s
- **Severity:** medium

## TC-BILLING-WEBHOOK-025 — Webhook authenticates via raw body (no JSON re-parse)
- **Severity:** critical

## TC-BILLING-WEBHOOK-026 — customer.created upserts billing_customers
- **Severity:** medium

## TC-BILLING-WEBHOOK-027 — customer.updated updates email
- **Severity:** low

## TC-BILLING-WEBHOOK-028 — payment_method.attached records default
- **Severity:** low

## TC-BILLING-WEBHOOK-029 — invoice.upcoming previewed for UI
- **Severity:** low

## TC-BILLING-WEBHOOK-030 — Invoice listing includes paid + open
- **Steps:** GET /billing/invoices
- **Severity:** medium

## TC-BILLING-WEBHOOK-031 — Invoice download URL signed
- **Severity:** medium

## TC-BILLING-WEBHOOK-032 — Webhook race: two updates within 100ms
- **Severity:** high

## TC-BILLING-WEBHOOK-033 — Webhook handler maps Stripe sub id → workspace
- **Severity:** high

## TC-BILLING-WEBHOOK-034 — Webhook for unknown subscription logs and 200
- **Severity:** medium

## TC-BILLING-WEBHOOK-035 — Webhook with malformed JSON → 400
- **Severity:** medium

## TC-BILLING-WEBHOOK-036 — Webhook protected by IP allowlist (optional)
- **Severity:** low

## TC-BILLING-WEBHOOK-037 — Webhook event triggers email notification (e.g. past_due)
- **Severity:** medium

## TC-BILLING-WEBHOOK-038 — Webhook events archived after 90d
- **Severity:** low

## TC-BILLING-WEBHOOK-039 — Stripe portal session created
- **Steps:** POST /billing/portal
- **Expected:** redirect URL to Stripe portal
- **Severity:** smoke

## TC-BILLING-WEBHOOK-040 — Portal session in bypass mode returns informative error
- **Severity:** medium

## TC-BILLING-WEBHOOK-041 — Portal session restricted to subscription owner
- **Severity:** high

## TC-BILLING-WEBHOOK-042 — Portal session URL TTL ≤ 1h
- **Severity:** medium

## TC-BILLING-WEBHOOK-043 — Portal session reuse blocked
- **Severity:** low

## TC-BILLING-WEBHOOK-044 — Webhook race condition on concurrent message billing vs invoice settle
- **Pre:** simulate
- **Severity:** high

## TC-BILLING-WEBHOOK-045 — Webhook retry storm rate-limited at app
- **Severity:** medium
