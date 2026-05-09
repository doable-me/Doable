# TC-BILLING-PLANS — Plans (free, pro, business, enterprise)

Covers GET /billing/plans, plan switch (upgrade/downgrade), trial state, plan limits, plan-driven feature gating. Stripe is bypassed in staging (STRIPE_SECRET_KEY empty) — paths must remain graceful.

## TC-BILLING-PLANS-001 — Get plans list (smoke)
- **Steps:** GET /billing/plans
- **Expected:** 200 with array of {id,name,priceCents,interval,features,limits}
- **Severity:** smoke

## TC-BILLING-PLANS-002 — Free plan present and default
- **Expected:** plans includes free with priceCents=0
- **Severity:** smoke

## TC-BILLING-PLANS-003 — Pro plan price/interval correct
- **Expected:** priceCents matches config (e.g. 2000); interval=month
- **Severity:** high

## TC-BILLING-PLANS-004 — Business plan price/interval correct
- **Severity:** medium

## TC-BILLING-PLANS-005 — Enterprise plan flagged contact_sales
- **Expected:** contactSales=true; price omitted
- **Severity:** medium

## TC-BILLING-PLANS-006 — Plans include limits payload
- **Expected:** {projectsMax, membersMax, storageMb, dailyCredits, monthlyCredits}
- **Severity:** high

## TC-BILLING-PLANS-007 — Free limit: projectsMax=3
- **Severity:** high

## TC-BILLING-PLANS-008 — Pro limit: projectsMax=20
- **Severity:** medium

## TC-BILLING-PLANS-009 — Business limit: projectsMax=100
- **Severity:** medium

## TC-BILLING-PLANS-010 — Enterprise limit: projectsMax=null (unlimited)
- **Severity:** medium

## TC-BILLING-PLANS-011 — Per-user override increases limit beyond plan
- **Pre:** admin sets override
- **Expected:** GET /billing/limits reflects override
- **Severity:** medium

## TC-BILLING-PLANS-012 — Get current subscription
- **Steps:** GET /billing/subscription
- **Expected:** {plan, status, currentPeriodEnd, cancelAtPeriodEnd}
- **Severity:** smoke

## TC-BILLING-PLANS-013 — Status active when paid
- **Severity:** high

## TC-BILLING-PLANS-014 — Status canceled hides upgrade widgets
- **Severity:** medium

## TC-BILLING-PLANS-015 — Status past_due flags warning banner
- **Severity:** high

## TC-BILLING-PLANS-016 — Status paused gates new chats
- **Steps:** send message
- **Expected:** 402
- **Severity:** high

## TC-BILLING-PLANS-017 — Status trialing shows pro features
- **Severity:** medium

## TC-BILLING-PLANS-018 — Trial expiry rolls to free
- **Severity:** high

## TC-BILLING-PLANS-019 — Free → Pro upgrade in bypass mode
- **Pre:** STRIPE_SECRET_KEY=""
- **Steps:** POST /billing/upgrade {plan:"pro"}
- **Expected:** 200; subscription row created locally; status=active; no Stripe call
- **Severity:** smoke

## TC-BILLING-PLANS-020 — Free → Pro upgrade with Stripe present
- **Pre:** Stripe configured
- **Expected:** redirect to Checkout URL; webhook completes activation
- **Severity:** smoke

## TC-BILLING-PLANS-021 — Pro → Business upgrade
- **Steps:** /billing/change-plan
- **Expected:** prorated; period_end unchanged or per Stripe behavior
- **Severity:** high

## TC-BILLING-PLANS-022 — Business → Pro downgrade keeps access until period_end
- **Steps:** /billing/change-plan {plan:"pro"}
- **Expected:** scheduled change at period_end; current quota retained
- **Severity:** high

## TC-BILLING-PLANS-023 — Cancel at period end
- **Steps:** POST /billing/cancel
- **Expected:** cancel_at_period_end=true; access until period_end
- **Severity:** smoke

## TC-BILLING-PLANS-024 — Immediate cancel
- **Steps:** POST /billing/cancel?immediate=true
- **Expected:** subscription canceled now; downgraded to free; refund handled per Stripe behavior
- **Severity:** medium

## TC-BILLING-PLANS-025 — Reactivate canceled before period_end
- **Steps:** POST /billing/reactivate
- **Expected:** cancel_at_period_end=false; status active
- **Severity:** medium

## TC-BILLING-PLANS-026 — Reactivate after period_end requires re-purchase
- **Severity:** medium

## TC-BILLING-PLANS-027 — Refund issued via /billing/refund (admin)
- **Steps:** admin POST refund
- **Expected:** Stripe refund or local synthetic refund; transaction trail
- **Severity:** medium

## TC-BILLING-PLANS-028 — Member cannot upgrade plan
- **Pre:** role=member
- **Steps:** POST /billing/upgrade
- **Expected:** 403
- **Severity:** high

## TC-BILLING-PLANS-029 — Owner can upgrade
- **Severity:** smoke

## TC-BILLING-PLANS-030 — Plan upgrade audit log
- **Severity:** medium

## TC-BILLING-PLANS-031 — Plan limits enforced in project creation
- **Pre:** at projectsMax
- **Steps:** create project
- **Expected:** 403 plan_limit_exceeded
- **Severity:** high

## TC-BILLING-PLANS-032 — Plan limits enforced in member invites
- **Severity:** high

## TC-BILLING-PLANS-033 — Storage limit enforced
- **Pre:** at storage cap
- **Steps:** upload file
- **Expected:** 413
- **Severity:** high

## TC-BILLING-PLANS-034 — Plan limit override per-workspace
- **Severity:** medium

## TC-BILLING-PLANS-035 — Plan limits surface in UI dashboard
- **Severity:** smoke

## TC-BILLING-PLANS-036 — Plan upgrade UI flow (web)
- **Steps:** click upgrade → checkout / bypass
- **Severity:** smoke

## TC-BILLING-PLANS-037 — Bypass mode banner shown
- **Pre:** Stripe disabled
- **Expected:** UI shows "Stripe disabled in this environment" banner near billing
- **Severity:** low

## TC-BILLING-PLANS-038 — Pricing displayed in user currency (if i18n)
- **Severity:** low

## TC-BILLING-PLANS-039 — Plan switch idempotent
- **Steps:** double POST same plan
- **Expected:** second is noop or 409 with current subscription returned
- **Severity:** medium

## TC-BILLING-PLANS-040 — Plan switch fails gracefully on Stripe error
- **Pre:** Stripe configured but errors
- **Expected:** 502; user error toast; no DB mutation
- **Severity:** high

## TC-BILLING-PLANS-041 — Plan switch concurrency: two tabs
- **Severity:** medium

## TC-BILLING-PLANS-042 — Free user invited to enterprise workspace inherits enterprise
- **Severity:** high

## TC-BILLING-PLANS-043 — Plan downgrade pre-warning email
- **Severity:** low

## TC-BILLING-PLANS-044 — Plan limits visible to API consumers
- **Steps:** GET /billing/limits
- **Severity:** medium

## TC-BILLING-PLANS-045 — Plan with `enabled=false` not selectable
- **Severity:** medium

## TC-BILLING-PLANS-046 — Trial countdown timer
- **Severity:** low

## TC-BILLING-PLANS-047 — End-of-trial transitions to free if no card
- **Severity:** high

## TC-BILLING-PLANS-048 — End-of-trial uses default card if available
- **Severity:** high

## TC-BILLING-PLANS-049 — Pause subscription endpoint
- **Steps:** POST /billing/pause
- **Expected:** status=paused; chat gated
- **Severity:** medium

## TC-BILLING-PLANS-050 — Resume from pause
- **Steps:** POST /billing/resume
- **Expected:** status=active
- **Severity:** medium
