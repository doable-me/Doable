# TC-BILLING-PORTAL — Stripe portal & invoices

Covers /billing/portal redirect, /billing/invoices listing, /billing/payment-methods, and graceful behavior in bypass.

## TC-BILLING-PORTAL-001 — POST /billing/portal returns redirect URL (smoke)
- **Pre:** Stripe configured
- **Steps:** POST /billing/portal
- **Expected:** 200 with `url`
- **Severity:** smoke

## TC-BILLING-PORTAL-002 — Portal redirect target on Stripe domain
- **Severity:** medium

## TC-BILLING-PORTAL-003 — Portal in bypass mode → 503 with informative json
- **Severity:** medium

## TC-BILLING-PORTAL-004 — Portal restricted to billing-admin role
- **Severity:** high

## TC-BILLING-PORTAL-005 — Portal session ttl < 1h
- **Severity:** medium

## TC-BILLING-PORTAL-006 — Portal returns to /billing on success
- **Severity:** low

## TC-BILLING-PORTAL-007 — Portal cancel returns to /billing
- **Severity:** low

## TC-BILLING-PORTAL-008 — Customer auto-created on first portal access
- **Severity:** medium

## TC-BILLING-PORTAL-009 — Multi-workspace user portal scoped by current workspace
- **Severity:** high

## TC-BILLING-PORTAL-010 — GET /billing/invoices list (smoke)
- **Severity:** smoke

## TC-BILLING-PORTAL-011 — Invoices include status, total, period, hostedInvoiceUrl
- **Severity:** high

## TC-BILLING-PORTAL-012 — Invoices ordered desc by date
- **Severity:** medium

## TC-BILLING-PORTAL-013 — Invoices paginated
- **Severity:** medium

## TC-BILLING-PORTAL-014 — Invoice download via signed URL
- **Severity:** medium

## TC-BILLING-PORTAL-015 — Invoice list empty in bypass mode
- **Severity:** low

## TC-BILLING-PORTAL-016 — Invoice list cross-tenant denied
- **Severity:** critical

## TC-BILLING-PORTAL-017 — GET /billing/payment-methods
- **Severity:** medium

## TC-BILLING-PORTAL-018 — Payment method add via portal
- **Severity:** medium

## TC-BILLING-PORTAL-019 — Default payment method change
- **Severity:** medium

## TC-BILLING-PORTAL-020 — Payment method remove blocked when last method
- **Severity:** medium

## TC-BILLING-PORTAL-021 — Tax id field set via portal
- **Severity:** low

## TC-BILLING-PORTAL-022 — Address change reflected in invoice
- **Severity:** low

## TC-BILLING-PORTAL-023 — Receipt email customizable
- **Severity:** low

## TC-BILLING-PORTAL-024 — Currency displayed correctly
- **Severity:** low

## TC-BILLING-PORTAL-025 — Failed portal call surfaces user-friendly error
- **Severity:** medium

## TC-BILLING-PORTAL-026 — Plan limits panel surfaces in admin (already exists in repo)
- **Steps:** open admin plan-limits-panel
- **Expected:** plan limits visible/editable; saves persist; audit logged
- **Severity:** smoke

## TC-BILLING-PORTAL-027 — Admin plan limits change applies workspace-wide
- **Severity:** high

## TC-BILLING-PORTAL-028 — Admin plan limit change audited
- **Severity:** high

## TC-BILLING-PORTAL-029 — Plan limit change cannot reduce below current usage
- **Severity:** medium

## TC-BILLING-PORTAL-030 — Plan limits read-only for non-admins
- **Severity:** high

## TC-BILLING-PORTAL-031 — Per-user override persists across plan changes
- **Severity:** medium

## TC-BILLING-PORTAL-032 — Plan limit override visible to user in profile
- **Severity:** low

## TC-BILLING-PORTAL-033 — Plan upgrade prompt CTA from credit exhaust toast
- **Severity:** smoke

## TC-BILLING-PORTAL-034 — Stripe session in bypass returns mock URL
- **Severity:** low

## TC-BILLING-PORTAL-035 — Network error fetching invoices retries 3x
- **Severity:** low

## TC-BILLING-PORTAL-036 — Invoices include topup line items
- **Severity:** medium

## TC-BILLING-PORTAL-037 — Invoices include subscription line items
- **Severity:** medium

## TC-BILLING-PORTAL-038 — Pro-rated invoice on upgrade visible
- **Severity:** medium

## TC-BILLING-PORTAL-039 — Refunded invoices show refunded badge
- **Severity:** medium

## TC-BILLING-PORTAL-040 — Plan limits panel error surfaces from API (recent fix)
- **Steps:** induce 500 from /admin/plan-limits
- **Expected:** UI shows graceful error; no crash
- **Severity:** medium
