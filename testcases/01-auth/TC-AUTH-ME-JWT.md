# TC-AUTH-ME-JWT — /auth/me, JWT validation, header smuggling

API endpoint: `GET https://staging-api.doable.me/auth/me`
Source: `services/api/src/routes/auth/core.ts:121-148`, middleware `services/api/src/middleware/auth.ts`.

## TC-AUTH-ME-001 — /auth/me with valid Bearer token
- **Pre:** `accessToken` from login.
- **Steps:** GET /auth/me, header `Authorization: Bearer <accessToken>`.
- **Expected:** 200 `{user:{id,email,displayName,avatarUrl,isPlatformAdmin,platformRole,createdAt,updatedAt}}`.
- **Severity:** smoke

## TC-AUTH-ME-002 — /auth/me without Authorization header
- **Steps:** GET /auth/me.
- **Expected:** 401 `{"error":"Missing or invalid Authorization header"}`.
- **Severity:** smoke

## TC-AUTH-ME-003 — /auth/me with `Authorization: Bearer` (no token)
- **Steps:** GET with `Authorization: Bearer `.
- **Expected:** 401 (token slice is empty → verify fails → "Invalid token").
- **Severity:** high

## TC-AUTH-ME-004 — /auth/me with malformed bearer prefix `Bearertoken`
- **Steps:** GET with `Authorization: Bearertoken`.
- **Expected:** 401 `Missing or invalid Authorization header` (prefix check fails).
- **Severity:** medium

## TC-AUTH-ME-005 — /auth/me with `Authorization: Basic <base64>`
- **Steps:** GET with Basic auth header.
- **Expected:** 401 `Missing or invalid Authorization header`.
- **Severity:** medium

## TC-AUTH-ME-006 — /auth/me with lowercase `bearer`
- **Steps:** Header `Authorization: bearer <token>`.
- **Expected:** 401 — code uses `startsWith("Bearer ")` (case-sensitive). Document; record actual.
- **Severity:** medium

## TC-AUTH-ME-007 — /auth/me with two Authorization headers
- **Steps:** Send two `Authorization` headers (one valid, one invalid).
- **Expected:** Server picks first or last; record. Should not concatenate values.
- **Severity:** edge

## TC-AUTH-ME-008 — /auth/me with garbage token
- **Steps:** `Authorization: Bearer abc.def.ghi`.
- **Expected:** 401 `{"error":"Invalid token"}`.
- **Severity:** smoke

## TC-AUTH-ME-009 — /auth/me with expired token
- **Pre:** Token whose exp < now.
- **Steps:** GET.
- **Expected:** 401 `{"error":"Token expired"}` (jose throws JWTExpired which is mapped to that message).
- **Severity:** smoke

## TC-AUTH-ME-010 — /auth/me with token signed by attacker (different secret)
- **Steps:** Forge a JWT with attacker secret.
- **Expected:** 401 Invalid token.
- **Severity:** smoke

## TC-AUTH-ME-011 — /auth/me with `alg=none` token
- **Steps:** Forge token `{"alg":"none"}`, payload claims platform_admin.
- **Expected:** 401 (jose rejects `none`).
- **Severity:** smoke

## TC-AUTH-ME-012 — /auth/me with `alg=HS256` flipped to `alg=RS256` key confusion
- **Steps:** Sign HS256 token using server's HS256 secret then change header alg to RS256.
- **Expected:** 401 (signature mismatch).
- **Severity:** high

## TC-AUTH-ME-013 — /auth/me with no `sub` claim
- **Steps:** Forge HS256 token (assume secret known for test only) with empty `sub`.
- **Expected:** 401 `Invalid token payload` (per middleware check).
- **Severity:** high

## TC-AUTH-ME-014 — /auth/me with no `email` claim
- **Steps:** Forge token without email.
- **Expected:** 401 `Invalid token payload`.
- **Severity:** high

## TC-AUTH-ME-015 — /auth/me wrong issuer
- **Steps:** Sign JWT with `iss=evil`.
- **Expected:** 401 `Invalid token` (jose `issuer` check).
- **Severity:** high

## TC-AUTH-ME-016 — /auth/me with token whose user has been deleted
- **Pre:** Delete user row but token still time-valid.
- **Steps:** GET /auth/me.
- **Expected:** 200 with fallback identity from JWT claims (`core.ts:138-147`). Document — no immediate revocation. Optionally: file as finding to require user existence check.
- **Severity:** medium

## TC-AUTH-ME-017 — /auth/me triggers ensureWorkspace for new users
- **Pre:** Brand new user with no workspace yet (artificial DB state).
- **Steps:** GET /auth/me.
- **Expected:** 200; row exists in `workspaces` after call.
- **Severity:** medium

## TC-AUTH-ME-018 — /auth/me returns 200 when DB is down (JWT fallback)
- **Pre:** Simulate DB outage.
- **Steps:** GET with valid token.
- **Expected:** 200 with fallback user object containing email and a fabricated displayName.
- **Severity:** medium

## TC-AUTH-ME-019 — /auth/me does not leak password_hash
- **Steps:** Inspect response keys.
- **Expected:** No `password_hash` etc.
- **Severity:** smoke

## TC-AUTH-ME-020 — /auth/me with token containing `isPlatformAdmin:true` claim (forged)
- **Steps:** Forge token with payload that includes `isPlatformAdmin:true`.
- **Expected:** Server pulls value from DB (sanitizeUser uses `user.is_platform_admin`), so claim is ignored. Response shows the actual DB value.
- **Severity:** high

## TC-AUTH-ME-021 — /auth/me CORS preflight
- **Steps:** OPTIONS /auth/me with `Origin: https://staging.doable.me`.
- **Expected:** 200/204 with appropriate `Access-Control-Allow-*` matching CORS allow-list.
- **Severity:** medium

## TC-AUTH-ME-022 — /auth/me CORS rejects evil origin
- **Steps:** OPTIONS with `Origin: https://evil.example`.
- **Expected:** No `Access-Control-Allow-Origin: https://evil.example` echoed back.
- **Severity:** high

## TC-AUTH-ME-023 — /auth/me method not allowed (POST)
- **Steps:** POST /auth/me with valid token.
- **Expected:** 404/405. Record actual.
- **Severity:** low

## TC-AUTH-ME-024 — /auth/me with token via `?token=` query param
- **Steps:** GET /auth/me?token=<accessToken>.
- **Expected:** 401 (only Authorization header is honoured).
- **Severity:** medium

## TC-AUTH-ME-025 — /auth/me with token in body
- **Steps:** POST style with body `{token:"..."}`.
- **Expected:** 401 / 405.
- **Severity:** low

## TC-AUTH-ME-026 — /auth/me with cookie-bearing JWT
- **Steps:** GET with `Cookie: token=<jwt>`.
- **Expected:** 401 (cookie auth not supported on this endpoint).
- **Severity:** medium

## TC-AUTH-ME-027 — JWT exp claim correctly validates
- **Pre:** Generate token with exp = now + 1s, wait 2s.
- **Steps:** GET.
- **Expected:** 401 Token expired.
- **Severity:** smoke

## TC-AUTH-ME-028 — JWT iat claim in the future is rejected
- **Pre:** Token with `iat = now + 3600`.
- **Steps:** GET.
- **Expected:** 401 (jose by default rejects iat in future > clockTolerance). Record.
- **Severity:** medium

## TC-AUTH-ME-029 — JWT nbf claim respected if added
- **Pre:** Token with `nbf` in future.
- **Steps:** GET.
- **Expected:** 401.
- **Severity:** edge

## TC-AUTH-ME-030 — Cap token length (10 KB) sanity
- **Steps:** Header value 10 KB.
- **Expected:** 401 Invalid token; no 5xx.
- **Severity:** medium

## TC-AUTH-JWT-031 — Header smuggling: CR/LF in Authorization
- **Steps:** Send Authorization with `\r\nX-Bypass: 1` injected.
- **Expected:** Web server (Hono / Node) rejects with 400 or strips. Document.
- **Severity:** high

## TC-AUTH-JWT-032 — Token with NUL byte in middle
- **Steps:** Header `Authorization: Bearer abc\x00def`.
- **Expected:** Connection drop / 400 / 401. Should not crash server.
- **Severity:** edge

## TC-AUTH-JWT-033 — Verify `kid` header is ignored (HS256 server)
- **Steps:** Forge HS256 token with `kid=anything`.
- **Expected:** Verifies fine if signature matches; no JWKS fetch.
- **Severity:** medium

## TC-AUTH-JWT-034 — Verify `jku`/`x5u` header rejected
- **Steps:** Forge token with `jku: https://attacker/keys.json`.
- **Expected:** 401 (jose ignores jku for HS verify).
- **Severity:** high

## TC-AUTH-JWT-035 — Token with extra signature segment `a.b.c.d`
- **Steps:** Append extra dot.
- **Expected:** 401.
- **Severity:** medium

## TC-AUTH-JWT-036 — Token with only two segments `a.b`
- **Steps:** Strip last segment.
- **Expected:** 401.
- **Severity:** medium

## TC-AUTH-JWT-037 — Re-encoded base64url with padding
- **Steps:** Send a valid token but re-encode payload using `=` padding.
- **Expected:** 401 (canonicalization mismatch).
- **Severity:** edge

## TC-AUTH-JWT-038 — Token with very large payload (1 MB)
- **Steps:** Forge token with huge claim.
- **Expected:** 401 Invalid token; no crash.
- **Severity:** edge

## TC-AUTH-JWT-039 — JWT iss change in claims tampering
- **Steps:** Decode valid token, change `iss`, re-sign with attacker secret.
- **Expected:** 401.
- **Severity:** smoke

## TC-AUTH-JWT-040 — JWT sub change preserves signature
- **Steps:** Tamper sub claim without re-signing.
- **Expected:** 401.
- **Severity:** smoke
