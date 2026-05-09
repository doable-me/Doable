# TC-BILLING-TOPUP — Top-up purchases

Covers POST /billing/topup, package selection, Stripe vs bypass, success, refund, and quota application.

## TC-BILLING-TOPUP-001 — List topup packages (smoke)
- **Steps:** GET /billing/topup/packages
- **Expected:** array {id,credits,priceCents,bonus}
- **Severity:** smoke

## TC-BILLING-TOPUP-002 — Buy topup small package — bypass mode
- **Pre:** STRIPE_SECRET_KEY=""
- **Steps:** POST /billing/topup {packageId:"small"}
- **Expected:** 200; balance.topup +=credits; transaction type=topup_grant_bypass
- **Severity:** smoke

## TC-BILLING-TOPUP-003 — Buy topup with Stripe enabled
- **Steps:** POST /billing/topup
- **Expected:** redirect to Checkout; webhook completes credit grant
- **Severity:** smoke

## TC-BILLING-TOPUP-004 — Topup webhook idempotent on replay
- **Severity:** critical

## TC-BILLING-TOPUP-005 — Failed Stripe charge → no credit grant
- **Severity:** high

## TC-BILLING-TOPUP-006 — Refund of topup deducts credits
- **Steps:** Stripe refund
- **Expected:** topup balance reduced by refund amount; floor at 0
- **Severity:** high

## TC-BILLING-TOPUP-007 — Refund partial reduces partial
- **Severity:** medium

## TC-BILLING-TOPUP-008 — Topup credits used after subscription quota
- **Severity:** high

## TC-BILLING-TOPUP-009 — Topup credits never expire by default
- **Severity:** medium

## TC-BILLING-TOPUP-010 — Topup with TTL package expires
- **Severity:** medium

## TC-BILLING-TOPUP-011 — Topup history visible to user
- **Steps:** GET /billing/topup/history
- **Severity:** medium

## TC-BILLING-TOPUP-012 — Member cannot purchase topup (depending on policy)
- **Severity:** medium

## TC-BILLING-TOPUP-013 — Owner can purchase topup
- **Severity:** smoke

## TC-BILLING-TOPUP-014 — Topup invalid package id rejected
- **Steps:** POST {packageId:"bogus"}
- **Expected:** 400
- **Severity:** medium

## TC-BILLING-TOPUP-015 — Topup with disabled package rejected
- **Severity:** medium

## TC-BILLING-TOPUP-016 — Topup amount mismatch with payment denied (defense in depth)
- **Severity:** high

## TC-BILLING-TOPUP-017 — Concurrent topup attempts both succeed
- **Steps:** parallel POSTs (Stripe creates two sessions)
- **Severity:** medium

## TC-BILLING-TOPUP-018 — UI shows topup CTA when 429 hit
- **Severity:** smoke

## TC-BILLING-TOPUP-019 — Topup CTA hidden for enterprise
- **Severity:** low

## TC-BILLING-TOPUP-020 — Topup logged in audit
- **Severity:** medium

## TC-BILLING-TOPUP-021 — Topup webhook signature invalid rejected
- **Severity:** critical

## TC-BILLING-TOPUP-022 — Topup webhook missing signature rejected
- **Severity:** critical

## TC-BILLING-TOPUP-023 — Topup webhook old timestamp rejected (replay protection)
- **Severity:** high

## TC-BILLING-TOPUP-024 — Bypass mode auto-credits without external call
- **Severity:** medium

## TC-BILLING-TOPUP-025 — Bypass mode topup limit per day to prevent abuse
- **Severity:** medium

## TC-BILLING-TOPUP-026 — Topup checkout redirect URL signed
- **Severity:** medium

## TC-BILLING-TOPUP-027 — Topup success page polls until grant applied
- **Severity:** low

## TC-BILLING-TOPUP-028 — Topup cancel page returns to billing
- **Severity:** low

## TC-BILLING-TOPUP-029 — Topup currency support (USD, INR, EUR)
- **Severity:** low

## TC-BILLING-TOPUP-030 — Topup tax/VAT applied per region (Stripe Tax)
- **Severity:** low

## TC-BILLING-TOPUP-031 — Topup invoice generated
- **Severity:** medium

## TC-BILLING-TOPUP-032 — Topup invoice downloadable
- **Severity:** medium

## TC-BILLING-TOPUP-033 — Topup grants credits before email confirm
- **Severity:** medium

## TC-BILLING-TOPUP-034 — Topup with promo code
- **Severity:** medium

## TC-BILLING-TOPUP-035 — Promo code invalid rejected
- **Severity:** medium

## TC-BILLING-TOPUP-036 — Promo code redeemed once per user
- **Severity:** medium

## TC-BILLING-TOPUP-037 — Topup transaction reference Stripe charge id
- **Severity:** medium

## TC-BILLING-TOPUP-038 — Topup retry from failed charge
- **Severity:** low

## TC-BILLING-TOPUP-039 — UI prevents double-click on Buy
- **Severity:** low

## TC-BILLING-TOPUP-040 — Topup applies before next chat send
- **Severity:** smoke
