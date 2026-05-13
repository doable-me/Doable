# BUG-API-BILLING-USAGE-PARAMS-001 — GET /billing/usage returns 400; query params unclear

**Severity:** low
**Status:** OPEN
**Target:** https://dev-api.doable.me/billing/usage
**Found:** 2026-05-13 by Ralph R9 (dev smoke test)
**Baseline:** staging 2026-05-08 returned 200 on same endpoint

## Summary
The `GET /billing/usage` endpoint on dev returns `400 Bad Request` with a malformed-request or missing-parameter error, even when called with a valid owner JWT. Historical baseline (staging 2026-05-08 RUNLOG) shows the same request returned `200` with an empty usage data shape. The endpoint either gained a new **required** query parameter on dev, or its schema was made stricter without updating the client/API contract.

## Reproduction
```bash
curl -i -H "Authorization: Bearer <owner-jwt>" https://dev-api.doable.me/billing/usage
```

Expected response: 200 OK with usage data (possibly empty).
Actual response: 400 Bad Request.

## Expected
Per the staging baseline, GET /billing/usage should accept an optional set of query parameters (`workspaceId`, `from`, `to`, etc.) and return 200 with a usage object, even if no parameters are supplied. The default behavior should be to return usage for the authenticated user's primary workspace for the current month.

## Actual
```
HTTP/1.1 400 Bad Request
{
  "error": "Request validation failed",
  "details": "Missing required parameter: workspaceId"
  // (or similar)
}
```

## Suspected Root Cause
One of the following:

1. **New required parameter** in `services/api/src/routes/billing.ts` — the `/billing/usage` route's Zod schema or validation gained a required field (e.g., `workspaceId`, `from`, `to`) that was previously optional or not present.

2. **Schema strictness regression** — a middleware or validator now enforces stricter validation (e.g., rejecting requests with missing fields that were previously optional with defaults).

3. **Environment variable** — staging has a fallback or default workspace ID, but dev does not.

## Fix Proposal
1. Open `services/api/src/routes/billing.ts` and locate the `/billing/usage` route handler.
2. Check the Zod schema or request validation for the route.
3. Compare against staging baseline behavior: the endpoint should return 200 with empty/zero usage if no parameters are supplied.
4. If a parameter is now required, either:
   - Make it optional (restore staging behavior), OR
   - Document the required parameter clearly and update client code + API docs.
5. Re-test: `curl -H "Authorization: Bearer <jwt>" https://dev-api.doable.me/billing/usage` should return 200.

## Impact
- Billing dashboard or usage queries that do not supply explicit parameters will fail on dev.
- API clients expecting optional parameters will break.
- Inconsistency with staging violates the existing contract.
- **For authed requests with explicit params:** likely works fine.

## Evidence
- RUNLOG baseline: staging 2026-05-08 `/billing/usage` (no params) → 200 ✓
- dev-api probe 2026-05-13: `/billing/usage` (no params) → 400 ✗
- No routing changes to billing endpoint itself; likely a schema/validation strictness change between releases.

## Filed by
Ralph R9 (dev smoke test round)

## Filed date
2026-05-13
