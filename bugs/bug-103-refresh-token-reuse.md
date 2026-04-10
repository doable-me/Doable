# BUG-103: Refresh Token Rotation Broken — Old Tokens Reusable

**Severity:** CRITICAL SECURITY
**Status:** FIXED (2026-04-09)
**Found:** 2026-04-09 (E2E API testing)
**Component:** services/api/src/routes/auth.ts

## Summary

After refreshing a token, the old refresh token can still be used to obtain new token pairs. Token rotation is not enforced — old tokens are not invalidated.

## Repro Steps

1. Login, get refresh token R1
2. POST /auth/refresh with R1 → get new tokens (R2)
3. POST /auth/refresh with R1 again → succeeds, gets R3

## Evidence

```
--- Token refresh ---
REFRESH OK: True
NEW_EXPIRY: 900
--- Reuse old refresh token ---
{"user":{...},"tokens":{"accessToken":"...","refreshToken":"...","expiresIn":900}}
```

## Root Cause

The refresh endpoint likely stores a new token but doesn't delete/invalidate the old one. The `hashToken` function (base64 truncation, not SHA256) may also cause hash collisions, making invalidation unreliable.

## Impact

- If a refresh token is leaked, it can be used indefinitely (for 7 days)
- Invalidation via logout doesn't work reliably
- Violates OWASP refresh token rotation guidelines

## Additional Issue

`hashToken` uses `Buffer.from(token).toString("base64url").slice(0, 64)` — this is reversible base64, not a cryptographic hash. Should use SHA256.
