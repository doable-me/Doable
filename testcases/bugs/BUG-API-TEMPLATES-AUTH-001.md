# BUG-API-TEMPLATES-AUTH-001 — GET /templates returns 401; should be public

**Severity:** low
**Status:** OPEN
**Target:** https://dev-api.doable.me/templates
**Found:** 2026-05-13 by Ralph R9 (dev smoke test)
**Baseline:** staging 2026-05-08 returned 200 on same endpoint

## Summary
The `/templates` endpoint on dev returns `401 Unauthorized` for unauthenticated requests. Historical baseline (staging 2026-05-08 RUNLOG) shows the same request returned `200` with a list of available templates. This is a **regression or middleware misconfiguration**: the endpoint was previously public and should remain public.

## Reproduction
```bash
curl -i https://dev-api.doable.me/templates
```

Expected response: 200 OK with JSON list of templates.
Actual response: 401 Unauthorized.

## Expected
Per the staging baseline and UX design (templates should be discoverable before login), GET /templates should return 200 with a public list of available project/layout templates, without requiring an Authorization header.

## Actual
```
HTTP/1.1 401 Unauthorized
{
  "error": "Missing or invalid Authorization header"
}
```

## Suspected Root Cause
One of the following:

1. **Middleware order regression** in `services/api/src/app.ts` or `services/api/src/routes/index.ts`:
   - The `/templates` route registration moved to a position after a catch-all auth middleware.
   - OR a new auth middleware was added that wraps all routes globally before the public route exceptions are evaluated.

2. **Missing exception list** in auth middleware (e.g., `authMiddleware` checks a whitelist of public paths; `/templates` was never added to the list on dev).

3. **Environment variable mismatch** — e.g., dev has `AUTH_REQUIRED=true` while staging has `AUTH_REQUIRED=false` (though this is unlikely for a URL-level regression).

## Fix Proposal
1. Locate the `/templates` route definition in `services/api/src/routes/index.ts`.
2. Verify it is registered **before** or **outside** any global auth middleware.
3. If auth middleware wraps the entire app, add `/templates` to the public path exception list (alongside `/auth/login`, `/auth/signup`, etc.).
4. Re-test: `curl https://dev-api.doable.me/templates` should return 200.

## Impact
- Unauthenticated users cannot discover available templates on dev.
- Signup/onboarding flows that reference templates will fail.
- Inconsistency with staging environment violates the existing contract.
- **For authed users:** no impact; the endpoint works fine with Authorization header.

## Evidence
- RUNLOG baseline: staging 2026-05-08 `/templates` → 200 ✓
- dev-api probe 2026-05-13: `/templates` → 401 ✗
- No changes to the templates route itself; likely a middleware or ordering issue introduced between 2026-05-08 and 2026-05-13.

## Filed by
Ralph R9 (dev smoke test round)

## Filed date
2026-05-13
