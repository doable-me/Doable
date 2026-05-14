# BUG-011: Access token lifetime mismatch — expiresIn:900 but JWT exp-iat=14400

**TC-ID:** TC-AUTH-LOGIN-049 / TC-AUTH-REGISTER-057  
**Severity:** medium  
**Date:** 2026-05-14  
**Environment:** dev (dev-api.doable.me)

## Steps to Reproduce

1. POST /auth/login with valid credentials
2. Inspect response body `tokens.expiresIn` field
3. Decode the returned `accessToken` JWT payload
4. Compare `exp - iat` with `expiresIn`

## Expected

`tokens.expiresIn = 900` AND `JWT exp - iat = 900` (15 minutes)

## Actual

```
Response body: {"tokens": {"expiresIn": 900, ...}}
JWT decoded payload: iat=1778779824 exp=1778794224
JWT exp - iat = 14400 seconds (4 hours / 240 minutes)
```

Confirmed across multiple login sessions. Token remains valid 45+ minutes after issuance (well past 15-minute window).

## Impact

- Access tokens are valid for 4 hours instead of 15 minutes
- If an access token is stolen, attacker has 4h window instead of 15min
- `expiresIn` field returned to clients is incorrect, causing client-side session management bugs
- TC-AUTH-ME-009 (expired token test) cannot be triggered within normal testing window

## Evidence

Two tokens decoded:
- Token 1: iat=1778779824 exp=1778794224 diff=14400s
- Token 2: iat=1778779861 exp=1778794261 diff=14400s
- Pre-gen token: iat=1778780927 exp=1778795327 diff=14400s

## Fix Suggestion

Check `JWT_ACCESS_TOKEN_TTL` env var on dev server. Should be `900` (seconds). Currently appears to be `14400`.
