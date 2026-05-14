# BUG-API-TEMPLATES-AUTH-001 — INVALID: 401 is intentional (BUG-WS-003 fix)

**Severity:** low → INVALID
**Status:** INVALID — intentional security tightening; not a regression
**Target:** https://dev-api.doable.me/templates
**Found:** 2026-05-13 by Ralph R9 (dev smoke test)
**Resolved (as INVALID):** 2026-05-13, same round, after deeper trace by opus debugger

## TL;DR — Invalid bug
The 401 on `/templates` is **intentional**, not a regression. Commit `3f99f80` (2026-05-10, "Auth gate (BUG-WS-003)") in `services/api/src/routes/templates.ts:24-25` explicitly added `templateRoutes.use("/", authMiddleware)` to close an information-disclosure vulnerability — the unauthed listing was returning full `codeFiles` (template source code) to anyone. The staging 2026-05-08 baseline that showed 200 is from BEFORE the fix and represents the vulnerable state.

If templates need to be publicly discoverable (signup/marketing flows), the correct fix is a **new, sanitized public listing endpoint** that strips `codeFiles` and returns metadata only (id, name, description, category, tags, previewImageUrl, isOfficial). Out of scope for R9. File a separate feature ticket if needed.

## Original symptom (kept for history)
The `/templates` endpoint on dev returns `401 Unauthorized` for unauthenticated requests. Historical baseline (staging 2026-05-08 RUNLOG) showed `200` — but that baseline predates the BUG-WS-003 fix.

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
