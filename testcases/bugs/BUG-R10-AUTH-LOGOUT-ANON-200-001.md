# BUG-R10-AUTH-LOGOUT-ANON-200-001 — POST /auth/logout returns 200 with no Authorization header

- **Severity**: P3 (low — informational / hardening opportunity)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (Ralph R10)
- **Status**: OPEN (not in this round's fix list)
- **Discovered by**: scripts/r10-api-matrix.ts (A00007)

## Repro
```bash
curl -X POST https://dev-api.doable.me/auth/logout
# → HTTP/2 200
# → {"message":"Logged out successfully"}

curl -X POST https://dev-api.doable.me/auth/logout -H "Content-Type: application/json" -d '{}'
# → HTTP/2 200
# → {"message":"Logged out successfully"}
```

## Expected
EITHER:
- 401 — logout should require auth (this is the strict interpretation)
OR:
- 200 — many APIs make logout idempotent so a missing-token logout still returns success (this is currently the chosen behavior)

The choice is a product call. Today it's the latter, which is defensible — but worth documenting in the API contract so the matrix can stop flagging it.

## Source
`services/api/src/routes/auth/core.ts:169` mounts logout WITHOUT `authMiddleware`. Looks intentional.

## Why this is low-priority
- The endpoint doesn't actually do anything destructive (refresh tokens are revoked server-side; access tokens are stateless JWTs that expire on their own).
- The 200 doesn't leak any data.
- Forcing 401 here would break SDKs that call logout as a cleanup even when session has already expired.

## Recommendation
Mark as **WONTFIX** if logout-without-auth is the intended product behavior. Add a contract note in `testcases/01-auth/TC-AUTH-REFRESH-LOGOUT.md`. Update the R10 harness expectation to include 200 in the expected set for `POST /auth/logout` anon.

## Action this round
The R10 harness will be updated to accept 200 as expected for anon logout — that's the EVOLVE step.
