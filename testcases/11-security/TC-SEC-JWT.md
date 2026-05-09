# TC-SEC-JWT — JWT tampering, key confusion, expiry, replay

Source: `services/api/src/lib/jwt.ts`, middleware `auth.ts`. Algorithm: HS256.

## TC-SEC-JWT-001 — JWT with `alg=none` rejected
- **Steps:** Forge `{"alg":"none","typ":"JWT"}.<payload>.` with empty signature.
- **Expected:** 401 on /auth/me.
- **Severity:** smoke

## TC-SEC-JWT-002 — JWT with `alg=NONE` (uppercase) rejected
- **Severity:** medium

## TC-SEC-JWT-003 — JWT with no signature (`a.b.`) rejected
- **Severity:** smoke

## TC-SEC-JWT-004 — JWT with `alg=HS256` but signed with empty key rejected
- **Severity:** smoke

## TC-SEC-JWT-005 — JWT with `alg=HS512` (mismatch) rejected
- **Severity:** smoke

## TC-SEC-JWT-006 — JWT key confusion: RS256 token with HS256 server's public key as HMAC secret
- **Steps:** Acquire pseudo "public key" (here HS256 has none), forge an RS256 token claiming to use server's secret as RSA public key.
- **Expected:** 401 (jose enforces configured algorithm).
- **Severity:** high

## TC-SEC-JWT-007 — JWT signature replay across environments
- **Steps:** Sign in on staging, send token to dev API.
- **Expected:** 401 if secrets differ.
- **Severity:** smoke

## TC-SEC-JWT-008 — Modify `sub` claim, original signature
- **Steps:** Decode, change sub, re-encode.
- **Expected:** 401 (signature now invalid).
- **Severity:** smoke

## TC-SEC-JWT-009 — Modify `email` claim, original signature
- **Severity:** smoke

## TC-SEC-JWT-010 — Modify `exp` claim to extend lifetime
- **Severity:** smoke

## TC-SEC-JWT-011 — Modify `iss` claim
- **Severity:** smoke

## TC-SEC-JWT-012 — Token replay after logout
- **Severity:** smoke

## TC-SEC-JWT-013 — Token replay after password reset
- **Severity:** smoke

## TC-SEC-JWT-014 — Token replay across users (UUID swap) requires re-sign — not possible without secret
- **Severity:** edge

## TC-SEC-JWT-015 — Token replay from old refresh token after rotation → 401
- **Severity:** smoke

## TC-SEC-JWT-016 — Inserting `kid` header doesn't enable JWKS fetch
- **Severity:** high

## TC-SEC-JWT-017 — Inserting `jku` header doesn't enable remote key fetch
- **Severity:** high

## TC-SEC-JWT-018 — Inserting `x5u` header doesn't enable cert fetch
- **Severity:** high

## TC-SEC-JWT-019 — Token with `iat` in future (clock skew attack)
- **Severity:** medium

## TC-SEC-JWT-020 — Token with `nbf` in future
- **Severity:** medium

## TC-SEC-JWT-021 — Token with `crit` header containing unsupported claim
- **Steps:** Add `{"crit":["http://x"]}`.
- **Expected:** 401 (jose rejects unsupported critical headers).
- **Severity:** high

## TC-SEC-JWT-022 — Token with `typ=JWT+x` (custom)
- **Severity:** edge

## TC-SEC-JWT-023 — Whitespace inside JWT segments
- **Severity:** medium

## TC-SEC-JWT-024 — Trailing slash on token doesn't bypass
- **Severity:** edge

## TC-SEC-JWT-025 — JWT signed with weak secret (if secret rotated)
- **Severity:** medium

## TC-SEC-JWT-026 — JWT `exp` 1 second past now → 401
- **Severity:** smoke

## TC-SEC-JWT-027 — JWT `exp` exactly now (boundary)
- **Severity:** medium

## TC-SEC-JWT-028 — JWT issued by previous secret no longer valid after rotation
- **Severity:** high

## TC-SEC-JWT-029 — JWT used on unrelated route bypasses RLS check? No — middleware applies
- **Severity:** smoke

## TC-SEC-JWT-030 — Refresh token used as access token (Bearer to /auth/me)
- **Steps:** Use refresh token in Authorization header.
- **Expected:** 401 — refresh tokens have no `email` claim, fail middleware payload check.
- **Severity:** high

## TC-SEC-JWT-031 — Access token used as refresh token (POST /auth/refresh)
- **Steps:** POST /auth/refresh with accessToken value.
- **Expected:** 401 (lookup in refresh_tokens table fails — access token's hash isn't stored).
- **Severity:** high

## TC-SEC-JWT-032 — Token tampering: change algorithm in URL-encoded form
- **Severity:** medium

## TC-SEC-JWT-033 — Token with empty `sub` string
- **Severity:** high

## TC-SEC-JWT-034 — Token with `sub: "anonymous"`
- **Steps:** Forge.
- **Expected:** 401 (signature won't match) but document optional middleware sets userId to "anonymous" — check it doesn't bypass paid features.
- **Severity:** high

## TC-SEC-JWT-035 — Token mid-path leak via Referer header to 3rd party
- **Steps:** Click external link from app.
- **Expected:** Token not in URL bar; Referer-Policy strict.
- **Severity:** high

## TC-SEC-JWT-036 — Token in browser history (URL fragment after OAuth)
- **Steps:** Inspect.
- **Expected:** Web app strips token from URL on consume; back button does not re-show.
- **Severity:** medium

## TC-SEC-JWT-037 — Token in xray spans must be redacted
- **Severity:** smoke

## TC-SEC-JWT-038 — Token in error logs redacted
- **Severity:** smoke

## TC-SEC-JWT-039 — Multiple Authorization headers concatenated by proxy
- **Severity:** edge

## TC-SEC-JWT-040 — Token uniqueness between two users
- **Steps:** Compare two tokens; signatures distinct.
- **Severity:** smoke
