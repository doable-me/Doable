# TC-AUTH-REFRESH-LOGOUT — Refresh, logout, and session lifecycle

API endpoints:
- `POST https://staging-api.doable.me/auth/refresh`
- `POST https://staging-api.doable.me/auth/logout`

Source: `services/api/src/routes/auth/core.ts:75-118`.

## TC-AUTH-REFRESH-001 — Refresh with valid token (happy path)
- **Pre:** Logged in user, fresh `refreshToken` from /auth/login.
- **Steps:** POST /auth/refresh `{"refreshToken":"<rt>"}`.
- **Expected:** 200; body `{user{...}, tokens{accessToken,refreshToken,expiresIn:900}}`. New tokens differ from previous.
- **Severity:** smoke

## TC-AUTH-REFRESH-002 — Old refresh token rejected after rotation
- **Pre:** TC-AUTH-REFRESH-001 succeeded.
- **Steps:** POST /auth/refresh with the original refreshToken (already rotated).
- **Expected:** 401 `{"error":"Refresh token has been revoked"}` (lookup misses since DELETE+INSERT in transaction removed the row).
- **Severity:** smoke

## TC-AUTH-REFRESH-003 — Newly issued refresh token is usable
- **Pre:** TC-AUTH-REFRESH-001.
- **Steps:** POST /auth/refresh with the new token.
- **Expected:** 200.
- **Severity:** smoke

## TC-AUTH-REFRESH-004 — Missing token field → 400
- **Steps:** POST /auth/refresh `{}`.
- **Expected:** 400 `{"error":"Refresh token is required"}`.
- **Severity:** high

## TC-AUTH-REFRESH-005 — Empty token string → 400
- **Steps:** POST `{"refreshToken":""}`.
- **Expected:** 400.
- **Severity:** high

## TC-AUTH-REFRESH-006 — Garbage token → 401
- **Steps:** POST `{"refreshToken":"not-a-jwt"}`.
- **Expected:** 401 `{"error":"Invalid or expired refresh token"}`.
- **Severity:** high

## TC-AUTH-REFRESH-007 — Refresh token signed with wrong secret → 401
- **Steps:** Forge a JWT with same payload but different HS256 secret.
- **Expected:** 401.
- **Severity:** smoke

## TC-AUTH-REFRESH-008 — Refresh token with `alg=none` → 401
- **Steps:** Forge `{"alg":"none","typ":"JWT"}.<payload>.` with empty signature.
- **Expected:** 401 (jose rejects).
- **Severity:** smoke

## TC-AUTH-REFRESH-009 — Refresh token with `alg=RS256` while server uses HS256 → 401
- **Steps:** Forge an RS256 token claiming server's public key (commonly via key confusion).
- **Expected:** 401 (jose only accepts the configured HS256 secret).
- **Severity:** high

## TC-AUTH-REFRESH-010 — Expired refresh token (synthetically) → 401
- **Steps:** Sign a refresh token (with shared HS256 secret if available) where `exp < now`.
- **Expected:** 401.
- **Severity:** medium

## TC-AUTH-REFRESH-011 — Refresh token after user deletion
- **Pre:** User row deleted.
- **Steps:** POST /auth/refresh with their token.
- **Expected:** 401 `{"error":"User not found"}` or `Invalid or expired` — record actual.
- **Severity:** high

## TC-AUTH-REFRESH-012 — Refresh token issuer mismatch
- **Steps:** Sign refresh token with `iss=other`.
- **Expected:** 401 (verify enforces `issuer: JWT_ISSUER`).
- **Severity:** high

## TC-AUTH-REFRESH-013 — Refresh token with `sub` of another user
- **Steps:** Sign refresh token where `sub` doesn't match any DB row (random UUID).
- **Expected:** 401 (refresh_tokens lookup by hash fails).
- **Severity:** smoke

## TC-AUTH-REFRESH-014 — Replay rotated token immediately is rejected
- **Pre:** Token rotated.
- **Steps:** POST /auth/refresh with old token within 1 second.
- **Expected:** 401 (atomic transaction in core.ts:96-99).
- **Severity:** smoke

## TC-AUTH-REFRESH-015 — Concurrent refresh with same token (race)
- **Steps:** Fire two simultaneous refresh requests with same refreshToken.
- **Expected:** Exactly one returns 200 with new pair; the other returns 401. No duplicate tokens.
- **Severity:** high

## TC-AUTH-REFRESH-016 — Refresh response carries no `Set-Cookie`
- **Steps:** Inspect headers.
- **Expected:** None.
- **Severity:** medium

## TC-AUTH-REFRESH-017 — Refresh after password reset
- **Pre:** User reset password (which calls `deleteAllRefreshTokensForUser`).
- **Steps:** POST /auth/refresh with token issued before reset.
- **Expected:** 401.
- **Severity:** smoke

## TC-AUTH-REFRESH-018 — Refresh after explicit /auth/logout
- **Pre:** Logout called with that refreshToken.
- **Steps:** POST /auth/refresh same token.
- **Expected:** 401.
- **Severity:** smoke

## TC-AUTH-REFRESH-019 — Old access token still usable until exp (refresh does not invalidate it)
- **Pre:** After /auth/refresh.
- **Steps:** Use original accessToken on /auth/me.
- **Expected:** 200 (until natural expiry). Document — there is no allowlist for access tokens.
- **Severity:** medium

## TC-AUTH-REFRESH-020 — Refresh response sanitizes user (no password_hash)
- **Steps:** Inspect.
- **Expected:** Same shape as login response.
- **Severity:** smoke

## TC-AUTH-REFRESH-021 — Refresh works after multi-day gap (within 7d)
- **Pre:** Token issued ~6 days ago.
- **Steps:** POST.
- **Expected:** 200.
- **Severity:** medium

## TC-AUTH-REFRESH-022 — Refresh after 7d (past exp) → 401
- **Pre:** Token issued >7d ago.
- **Steps:** POST.
- **Expected:** 401.
- **Severity:** medium

## TC-AUTH-REFRESH-023 — Refresh stores new token hash atomically
- **Pre:** Capture refresh_tokens row count for the user.
- **Steps:** /auth/refresh once.
- **Expected:** Row count unchanged (DELETE+INSERT in tx).
- **Severity:** medium

## TC-AUTH-REFRESH-024 — Refresh body content-type text/plain → 400
- **Steps:** POST with `Content-Type: text/plain` body `{"refreshToken":"..."}`.
- **Expected:** 400 (body parsing fails).
- **Severity:** edge

## TC-AUTH-REFRESH-025 — Refresh while DB unavailable
- **Steps:** Simulate DB down, POST.
- **Expected:** 401 `Invalid or expired` (caught by outer try/catch). Confirm no stack trace leaks.
- **Severity:** medium

## TC-AUTH-LOGOUT-001 — Logout with valid refreshToken
- **Pre:** Active refresh token in DB.
- **Steps:** POST /auth/logout `{"refreshToken":"<rt>"}`.
- **Expected:** 200 `{"message":"Logged out successfully"}`. Row removed from `refresh_tokens`.
- **Severity:** smoke

## TC-AUTH-LOGOUT-002 — Logout without body
- **Steps:** POST /auth/logout (no body or `{}`).
- **Expected:** 200 `{"message":"Logged out successfully"}` (graceful no-op).
- **Severity:** medium

## TC-AUTH-LOGOUT-003 — Logout with non-existent refreshToken
- **Steps:** POST `{"refreshToken":"random-junk"}`.
- **Expected:** 200 (per `core.ts:114-116`, deletion is best-effort, no error to client).
- **Severity:** medium

## TC-AUTH-LOGOUT-004 — Logout twice with same token
- **Steps:** POST /auth/logout once → 200; second time → 200.
- **Expected:** Idempotent.
- **Severity:** medium

## TC-AUTH-LOGOUT-005 — Logout does NOT invalidate access token
- **Pre:** Access token issued.
- **Steps:** Logout with refreshToken; immediately call /auth/me with old accessToken.
- **Expected:** 200 (access token still valid until exp). Document — known limitation.
- **Severity:** medium

## TC-AUTH-LOGOUT-006 — Logout removes only the specified token, not other sessions
- **Pre:** User has 3 refresh tokens (3 sessions).
- **Steps:** Logout with one of them.
- **Expected:** Other 2 still usable on /auth/refresh.
- **Severity:** high

## TC-AUTH-LOGOUT-007 — Logout response does not require auth header
- **Steps:** POST without `Authorization` header.
- **Expected:** 200 (logout is unauthenticated by design — only needs the refresh token).
- **Severity:** medium

## TC-AUTH-LOGOUT-008 — Logout with garbage JSON body
- **Steps:** POST with body `{not-json`.
- **Expected:** 200 (try/catch swallows parse error; no token to delete).
- **Severity:** edge

## TC-AUTH-LOGOUT-009 — Logout invalidates exactly one token
- **Pre:** Capture count of refresh_tokens for user.
- **Steps:** Logout with one token.
- **Expected:** Count decremented by exactly 1.
- **Severity:** high

## TC-AUTH-LOGOUT-010 — Logout with refreshToken belonging to another user
- **Steps:** Capture userA's refreshToken, login as userB, POST logout with userA's token.
- **Expected:** 200 — and userA's token row IS deleted (handler doesn't bind to caller). Document — anyone with a refresh token can revoke that session, which is fine since possessing it means they could also use it.
- **Severity:** medium
