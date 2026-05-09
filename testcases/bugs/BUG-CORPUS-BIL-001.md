# BUG-CORPUS-BIL-001 — POST /billing/subscribe lacks role check and bypass-mode short-circuit

**Severity:** high
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus runner, CORPUS-06-07-08-09 (TC-BILLING-PLANS-028, -028r2)

## Repro
```
POST /billing/subscribe
Authorization: Bearer <qa-viewer> # user with NO admin role on the workspace
Content-Type: application/json
Body: {"planId":"pro","workspaceId":"<owner workspace id>"}
```

## Actual
HTTP 400 — `{"error":"Price not configured for this plan"}`

The route reaches the Stripe-price lookup before performing any role/permission check, and the price-config branch leaks the bypass-mode state to non-admin callers as a generic 400. Side effects observed:
- A non-admin can probe whether a plan price is configured (info disclosure).
- In bypass mode (`STRIPE_SECRET_KEY=""`) every authenticated user lands in this 400 branch — the path NEVER reaches the role check that should reject them.

## Expected
1. **Role gate first.** A viewer/member must receive HTTP 403 before any plan/price processing.
2. **Bypass-mode short-circuit** matching `/billing/portal` (which returns `503 stripe_disabled` when `!process.env.STRIPE_SECRET_KEY`). The contract should be the same: bypass mode returns a documented `stripe_disabled` envelope, not a confusing 400.

## Analysis
`services/api/src/routes/billing.ts` lines 358–399 — handler order:
1. Body validation (zod)
2. `getPlanById` lookup → 404 if missing
3. `priceId` lookup → 400 "Price not configured" *(triggers in bypass mode for everyone)*
4. Customer + checkout session creation

Steps 2/3 should follow a workspace role check (admin-or-owner-only) and a bypass-mode early return.

## Fix recommendation
- Insert `requireWorkspaceRole(workspaceId, ["owner","admin"])` immediately after parsing.
- Insert bypass-mode block before step 3, mirroring `/billing/portal`:
  ```ts
  if (!process.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "stripe_disabled", message: "Subscriptions unavailable in bypass mode" }, 503);
  }
  ```

## Evidence
- `testcases/evidence/env1/TC-BILLING-PLANS-028r.body`
- `testcases/evidence/env1/TC-BILLING-PLANS-028r2.body`
