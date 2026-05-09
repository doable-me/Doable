# TC-WS-PLAN-LIMITS — Plan info display & plan limits surface

Plan limits constants: `packages/shared/src/constants.ts:61-102`.

| plan | maxProjects | maxMembers | dailyCredits | monthlyCredits | maxFileSize | customDomains | analytics | priority |
|---|---|---|---|---|---|---|---|---|
| free | 3 | 1 | 5 | 0 | 5 MB | no | no | no |
| pro | 25 | 5 | 50 | 500 | 25 MB | yes | yes | no |
| business | 100 | 25 | 200 | 3000 | 100 MB | yes | yes | yes |
| enterprise | ∞ | ∞ | ∞ | ∞ | 500 MB | yes | yes | yes |

## TC-WS-PLAN-001 — Free plan workspace cannot exceed 1 member
- **Pre:** ws.plan="free", 1 member.
- **Steps:** POST invite.
- **Expected:** 403 with limit message.
- **Severity:** smoke

## TC-WS-PLAN-002 — Pro plan workspace caps at 5 members
- **Pre:** ws.plan="pro", 5 members.
- **Steps:** POST invite.
- **Expected:** 403.
- **Severity:** smoke

## TC-WS-PLAN-003 — Business plan caps at 25 members
- **Severity:** medium

## TC-WS-PLAN-004 — Enterprise plan accepts unlimited invites
- **Severity:** medium

## TC-WS-PLAN-005 — Plan downgrade keeps existing members but blocks new ones
- **Pre:** ws had pro with 4 members; downgrade to free.
- **Steps:** Try invite.
- **Expected:** 403 since members.length (4) > maxMembers(1).
- **Severity:** high

## TC-WS-PLAN-006 — Project creation respects maxProjects (free=3)
- **Pre:** ws.plan="free", 3 projects.
- **Steps:** POST /projects in this ws.
- **Expected:** 403 / 400 from project routes (cross-area, but listed for plan surface verification).
- **Severity:** smoke

## TC-WS-PLAN-007 — Project creation hits pro=25 limit
- **Severity:** medium

## TC-WS-PLAN-008 — Plan info appears on GET /workspaces (each ws has `plan` field)
- **Steps:** GET /workspaces.
- **Expected:** plan values in {free,pro,business,enterprise}.
- **Severity:** smoke

## TC-WS-PLAN-009 — Plan limits panel UI displays correct limits per plan
- **Steps:** Web /admin/plan-limits-panel for ws.
- **Expected:** Limits match constants.
- **Severity:** medium

## TC-WS-PLAN-010 — Per-user project limit override (recent commit `13f237c`) honoured
- **Pre:** User row has override.
- **Steps:** Create project beyond plan limit.
- **Expected:** Allowed if override raises limit.
- **Severity:** medium

## TC-WS-PLAN-011 — Daily credit limit reflects plan
- **Steps:** GET workspace credits.
- **Expected:** dailyTotal matches plan dailyCredits (free=5, pro=50, etc.).
- **Severity:** medium

## TC-WS-PLAN-012 — Monthly credit limit reflects plan
- **Severity:** medium

## TC-WS-PLAN-013 — File upload above plan limit rejected
- **Pre:** ws.plan="free" (5 MB max).
- **Steps:** Upload 6 MB file via project file route.
- **Expected:** 413 / 400. (Cross-area but plan-related.)
- **Severity:** medium

## TC-WS-PLAN-014 — Custom domains feature flag matches plan
- **Steps:** Free plan tries to add custom domain.
- **Expected:** 403 / feature-locked.
- **Severity:** medium

## TC-WS-PLAN-015 — Analytics blocked for free plan
- **Severity:** medium

## TC-WS-PLAN-016 — Priority support badge only on business+
- **Severity:** low

## TC-WS-PLAN-017 — Plan upgrade unlocks invites
- **Pre:** Free at 1 member.
- **Steps:** SQL upgrade plan to pro; POST invite.
- **Expected:** 201.
- **Severity:** smoke

## TC-WS-PLAN-018 — Plan limit message includes current plan name
- **Steps:** Trigger limit on free.
- **Expected:** Message contains `for free plan`.
- **Severity:** medium

## TC-WS-PLAN-019 — Plan limit message numeric matches PLAN_LIMITS table
- **Severity:** medium

## TC-WS-PLAN-020 — Plan defaulting: ws with NULL plan treats as free
- **Pre:** workspaces.plan=NULL (corrupted row).
- **Steps:** Invite.
- **Expected:** Falls back to PLAN_LIMITS.free per `?? PLAN_LIMITS.free`.
- **Severity:** medium

## TC-WS-PLAN-021 — Subscriptions table reflects plan
- **Pre:** Stripe-bypass: insert subscription with plan='enterprise', status='active'.
- **Steps:** GET ws.
- **Expected:** ws.plan='enterprise'. Document — plan source of truth is workspaces.plan, not subscriptions.
- **Severity:** medium

## TC-WS-PLAN-022 — Credit balance row created on workspace creation
- **Severity:** medium

## TC-WS-PLAN-023 — Daily credits roll over (or reset) per plan rules
- **Severity:** medium

## TC-WS-PLAN-024 — Plan limit on invite shows correct UI error
- **Steps:** Web UI at limit.
- **Expected:** Visible inline error.
- **Severity:** medium

## TC-WS-PLAN-025 — Workspace settings page shows current plan
- **Severity:** smoke
