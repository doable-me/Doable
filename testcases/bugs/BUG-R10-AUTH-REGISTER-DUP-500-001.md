# BUG-R10-AUTH-REGISTER-DUP-500-001 — POST /auth/register returns 500 + leaks DB constraint name on duplicate email

- **Severity**: P0 (reliability + info-disclosure)
- **Env**: dev (dev-api.doable.me)
- **Filed**: 2026-05-14 (Ralph R10)
- **Status**: FIXED on branch `fix/register-duplicate-email-409` (commit `80988c35`)
- **Discovered by**: scripts/r10-api-matrix.ts (assertions A00019, A00020)

## Repro
```bash
# After qa-owner already exists:
curl -X POST https://dev-api.doable.me/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-owner@doable.test","password":"TestPass123!","displayName":"Anything"}'

# Actual:
HTTP/2 500
{"error":"Internal Server Error","message":"duplicate key value violates unique constraint \"users_email_key\""}
```

## Expected
- 409 Conflict (or 400) with a friendly message
- NO leak of Postgres constraint name (`users_email_key`)

## Root cause (per Opus analysis)
1. `services/api/src/routes/auth/core.ts:43` does `findUserByEmail(email)` pre-check — but the pre-check is case-sensitive while `createUser` lower-cases before INSERT. Two requests with same email differing in case race past the pre-check.
2. `services/api/src/index.ts:380` global `onError` echoes `err.message` when `NODE_ENV === "development"`. dev-api.doable.me runs with `NODE_ENV=development`, so the raw Postgres error bubbles all the way to the client.

## Fix (commit 80988c35)
- `core.ts`: wrap createUser INSERT in try/catch; map Postgres `23505` (unique_violation) to a 409 with the same envelope the pre-check uses.
- `index.ts`: harden `onError` so 5xx never echoes `err.message`. Dev hint becomes the JS error class name; for any 5-char SQLSTATE (Postgres) we strip even that.
- `scripts/test-register-dup.ts`: 12 assertions (pre-check 409, race 409, no leak of `users_email_key`/`23505`/`duplicate key`, unrelated 42P01 sanitized).

## Verification
- `pnpm --filter @doable/api exec tsc --noEmit` → 0 errors
- `pnpm exec tsx scripts/test-register-dup.ts` → 12/12 ok
- Branch pushed to origin (haiku follow-up).

## Follow-ups (future round)
- Lowercase email in the pre-check OR add a `LOWER(email)` index; surfaces case-only collisions on first round-trip.
- The probe is unit-style — a real integration probe needs throwaway Postgres or pg-mem injection on `coreAuthRoutes`.
- `/auth/logout`, `/auth/forgot-password` parse unvalidated JSON; out of scope here but worth zValidator coverage.
