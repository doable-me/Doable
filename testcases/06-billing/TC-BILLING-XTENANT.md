# TC-BILLING-XTENANT — Cross-tenant authorization on billing routes

Regression coverage for **BUG-BILLING-002** and the wider 2026-05-15 audit which
found that the original fix only covered `/billing/balance`, `/billing/credits`,
`/billing/credits/usage`, and `/billing/topup/history`, while these endpoints
still leaked plan/usage/state or accepted mutations from non-members:

- `GET  /billing/invoices?workspaceId=<other>`     — leaked existence (always 200)
- `GET  /billing/subscription?workspaceId=<other>` — leaked plan + Stripe sub status
- `GET  /billing/limits?workspaceId=<other>`       — leaked plan + quota flags
- `GET  /billing/usage?workspaceId=<other>`        — **leaked actual credit-usage rows** (Critical)
- `POST /billing/topup`     workspaceId=<other>    — accepted top-up for foreign workspace
- `POST /billing/top-up`    workspaceId=<other>    — accepted top-up for foreign workspace
- `POST /billing/subscribe` workspaceId=<other>    — created Stripe checkout for foreign workspace
- `POST /billing/portal`    workspaceId=<other>    — created Stripe portal for foreign workspace
- `POST /billing/cancel`    workspaceId=<other>    — cancelled subscription on foreign workspace

The fix introduces a single `isWorkspaceMember(workspaceId, userId)` helper in
`services/api/src/routes/billing.ts` and applies it consistently to every
endpoint that takes a `workspaceId`. All such endpoints must return **403
"Not a member of this workspace"** when the caller is not a member.

## TC-BILLING-XTENANT-001  GET /billing/balance non-member → 403
Given: qa-member token + qa-owner workspaceId
When:  `GET /billing/balance?workspaceId=<qa-owner-ws>`
Then:  HTTP 403, body contains `"Not a member of this workspace"`

## TC-BILLING-XTENANT-002  GET /billing/credits non-member → 403
Same shape as 001 against `/billing/credits`.

## TC-BILLING-XTENANT-003  GET /billing/credits/usage non-member → 403
Same shape against `/billing/credits/usage`.

## TC-BILLING-XTENANT-004  GET /billing/topup/history non-member → 403
Same shape against `/billing/topup/history`.

## TC-BILLING-XTENANT-005  GET /billing/invoices non-member → 403
Then:  HTTP 403 (was: 200 with `{data:[]}`)

## TC-BILLING-XTENANT-006  GET /billing/subscription non-member → 403
Then:  HTTP 403 (was: 200 leaking plan/status/stripeSubscriptionId)

## TC-BILLING-XTENANT-007  GET /billing/limits non-member → 403
Then:  HTTP 403 (was: 200 leaking plan + limits flags)

## TC-BILLING-XTENANT-008  GET /billing/usage non-member with explicit workspaceId → 403
Then:  HTTP 403 (was: 200 leaking the entire credit-usage history for another workspace —
critical data leak: project IDs, action types, timestamps)

## TC-BILLING-XTENANT-009  GET /billing/usage non-member with NO workspaceId → 200 own
Then:  HTTP 200, defaults to caller's own primary workspace (regression guard for
       BUG-API-BILLING-USAGE-PARAMS-001 — must not regress to 400 or 403)

## TC-BILLING-XTENANT-010  POST /billing/topup workspaceId=<other> → 403
Then:  HTTP 403; no Stripe checkout URL is returned; no credits granted in bypass mode.

## TC-BILLING-XTENANT-011  POST /billing/top-up workspaceId=<other> → 403
Same shape against `/billing/top-up` (legacy variant).

## TC-BILLING-XTENANT-012  POST /billing/subscribe workspaceId=<other>,planId=pro → 403
Then:  HTTP 403; no Stripe checkout URL.

## TC-BILLING-XTENANT-013  POST /billing/portal workspaceId=<other> → 403 (when Stripe enabled)
When STRIPE_SECRET_KEY is unset, this route returns 503 before any auth check is hit
(documented bypass behaviour). When STRIPE_SECRET_KEY is set, non-members must get 403.

## TC-BILLING-XTENANT-014  POST /billing/cancel workspaceId=<other> → 403
Then:  HTTP 403; workspace plan unchanged.

## Owner-as-self positive controls
Each XTENANT-XXX must have a paired positive test where the same call by the
workspace OWNER returns 200 (or 201/204) with the expected body. This proves
the new membership check is not over-broad.

## Evidence
Captured 2026-05-15: `testcases/evidence/dev/verify-2026-05-15/billing-marketplace/cross-tenant-retest.txt`
and `cross-tenant-mutations.txt`.
