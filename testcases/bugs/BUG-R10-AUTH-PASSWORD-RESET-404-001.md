# BUG-R10-AUTH-PASSWORD-RESET-404-001 — /auth/password-reset returns 404 on dev despite being defined in source

- **Severity**: P0 (functional — password-reset flow broken end-to-end)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (Ralph R10)
- **Status**: UNDER INVESTIGATION (Opus on `fix/password-reset-public-access`)
- **Discovered by**: scripts/r10-api-matrix.ts (A00010 — POST /auth/password-reset)

## Repro
```bash
# Without token:
curl -X POST https://dev-api.doable.me/auth/password-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-owner@doable.test"}'
# → HTTP/2 401
# → {"error":"Missing or invalid Authorization header"}

# With qa-owner token (valid JWT):
# → HTTP/2 404
# → {"error":"Not Found","path":"/auth/password-reset"}
```

## Expected
- 200 OK (or generic "If that email is registered, a reset link has been sent") regardless of whether user exists (to prevent enumeration)
- Route MUST be accessible WITHOUT auth (users locked out of accounts cannot present a JWT)
- Anon → 200 (generic message) or 429 (rate limit), NEVER 401

## Source evidence
`services/api/src/routes/auth/core.ts:267` defines:
```ts
coreAuthRoutes.post("/password-reset", forgotPasswordRateLimiter, handleForgotPassword);
```
The route IS present in HEAD. Yet the deployed dev API returns 404 with token (route not registered) AND 401 without token (auth middleware blocking).

## Hypothesis
1. Dev API on dodev.fid.pw is running stale code — deployed before commit that added `/password-reset` route.
2. OR `handleForgotPassword` import is broken at runtime → handler not bound → 404.
3. OR auth middleware is mounted globally for all `/auth/*` paths, intercepting before the route registration runs (less likely given /login + /register work anon).

## Severity rationale
- Users who forget their password CANNOT recover their account.
- Per CLAUDE.md: design for creators, designers, producers, CEOs — they will not file tickets to recover; they will churn.

## Fix in flight (Opus on fix/password-reset-public-access)
Opus #2 is determining whether the cause is (a) auth-wall ordering or (b) route not mounted, and applying the correct surgical fix.

## Follow-ups
- Verify dev API head matches origin/main commit; if stale, deploy refresh is needed (separate issue).
- Add integration test that hits /auth/password-reset anon and asserts 200/429 — never 401/404.
