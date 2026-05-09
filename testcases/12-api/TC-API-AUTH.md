# TC-API-AUTH — Auth route group HTTP coverage

Routes mounted at `/auth` (`services/api/src/routes.ts:54`). Source: `services/api/src/routes/auth/*.ts`.

Endpoints (HTTP-level only — for behavioural register flow see `01-auth/TC-AUTH-REGISTER.md`):
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/oauth/:provider`
- `GET /auth/oauth/:provider/callback`
- `POST /auth/change-password`
- `DELETE /auth/account`

Standard error envelope: `{"error":"<msg>"}` or `{error,details}`.

---

## TC-API-AUTH-001 — POST /auth/register 201 happy path
- **Steps:** POST `/auth/register` `{"email":"qa-h-001@doable.test","password":"TestPass123!"}`
- **Expected:** 201; `Content-Type: application/json`; body `{user,tokens}`.
- **Severity:** smoke

## TC-API-AUTH-002 — POST /auth/register missing email → 400
- **Steps:** POST `{"password":"TestPass123!"}`
- **Expected:** 400 `{error:"Validation failed", details:{email:[...]}}`.
- **Severity:** high

## TC-API-AUTH-003 — POST /auth/register missing password → 400
- **Steps:** POST `{"email":"a@b.com"}`
- **Expected:** 400; `details.password` present.
- **Severity:** high

## TC-API-AUTH-004 — POST /auth/register weak password → 400
- **Steps:** POST `{"email":"x@y.com","password":"short"}`
- **Expected:** 400; password rule violation echoed.
- **Severity:** high

## TC-API-AUTH-005 — POST /auth/register malformed JSON → 400
- **Steps:** Body `{not json}` with `Content-Type: application/json`.
- **Expected:** 400 `{"error":"Invalid JSON"}` (or similar) — never 500.
- **Severity:** high

## TC-API-AUTH-006 — POST /auth/register wrong Content-Type → 415
- **Steps:** POST with `Content-Type: text/plain` body `email=...&password=...`
- **Expected:** 415 or 400; body not parsed as JSON.
- **Severity:** medium

## TC-API-AUTH-007 — POST /auth/register no Content-Type → 400
- **Steps:** POST with valid JSON body but no Content-Type header.
- **Expected:** 400 (zod validator fails to parse) or auto-detected. Record.
- **Severity:** medium

## TC-API-AUTH-008 — POST /auth/register extra unknown field
- **Steps:** POST `{"email":"...","password":"...","isAdmin":true}`
- **Expected:** 201; `isAdmin` ignored — never grants privilege.
- **Severity:** smoke

## TC-API-AUTH-009 — POST /auth/register email SQL injection
- **Steps:** POST `{"email":"a@b.com'; DROP TABLE users;--","password":"TestPass123!"}`
- **Expected:** 400 (zod email rejects) — DB untouched.
- **Severity:** smoke

## TC-API-AUTH-010 — POST /auth/register Unicode email/displayName
- **Steps:** POST `{"email":"qa-uni-010@doable.test","password":"TestPass123!","displayName":"小明 🎉"}`
- **Expected:** 201; displayName persisted as-is in UTF-8.
- **Severity:** medium

## TC-API-AUTH-011 — POST /auth/register large body (5MB)
- **Steps:** POST with 5 MB padded `displayName`.
- **Expected:** 413 Payload Too Large or 400 (zod max-length). Never 500.
- **Severity:** high

## TC-API-AUTH-012 — POST /auth/register rate limit (>5/hr/IP)
- **Steps:** Send 6 register requests from same IP.
- **Expected:** 6th returns 429 with `Retry-After`.
- **Severity:** high

## TC-API-AUTH-013 — POST /auth/login 200 happy path
- **Steps:** POST `/auth/login` with valid credentials.
- **Expected:** 200; `{user,tokens}`.
- **Severity:** smoke

## TC-API-AUTH-014 — POST /auth/login wrong password → 401
- **Steps:** POST with valid email + wrong password.
- **Expected:** 401 `{error:"Invalid credentials"}` (generic msg, no leak).
- **Severity:** high

## TC-API-AUTH-015 — POST /auth/login non-existent user → 401
- **Steps:** Random unused email.
- **Expected:** 401 — same generic message as TC-014 (don't leak user existence).
- **Severity:** high

## TC-API-AUTH-016 — POST /auth/login locked account → 423 / 403
- **Pre:** 5 wrong-password attempts on the account.
- **Steps:** POST with correct password.
- **Expected:** 423 Locked or 403 — record.
- **Severity:** high

## TC-API-AUTH-017 — POST /auth/login email case-insensitive
- **Pre:** User registered with `qa-x@doable.test`.
- **Steps:** POST with `QA-X@DOABLE.TEST`.
- **Expected:** Behavior matches register; document.
- **Severity:** medium

## TC-API-AUTH-018 — POST /auth/login rate limit
- **Steps:** 11 attempts in 1 minute from same IP.
- **Expected:** 429 after threshold.
- **Severity:** high

## TC-API-AUTH-019 — GET /auth/me with valid token → 200
- **Steps:** `GET /auth/me` `Authorization: Bearer <accessToken>`
- **Expected:** 200 user profile.
- **Severity:** smoke

## TC-API-AUTH-020 — GET /auth/me missing Authorization → 401
- **Steps:** `GET /auth/me` no header.
- **Expected:** 401 `{error:"Unauthorized"}`.
- **Severity:** smoke

## TC-API-AUTH-021 — GET /auth/me with `Authorization: Bearer ` (empty)
- **Steps:** `GET /auth/me` with header value `Bearer `.
- **Expected:** 401.
- **Severity:** high

## TC-API-AUTH-022 — GET /auth/me without `Bearer ` prefix
- **Steps:** Header `Authorization: <jwt>` (no prefix).
- **Expected:** 401.
- **Severity:** medium

## TC-API-AUTH-023 — GET /auth/me with malformed JWT
- **Steps:** `Bearer not.a.jwt`.
- **Expected:** 401.
- **Severity:** high

## TC-API-AUTH-024 — GET /auth/me with expired access token
- **Pre:** Mint a token with `exp` in the past (e.g. via short TTL).
- **Steps:** `GET /auth/me` with that token.
- **Expected:** 401 `{error:"Token expired"}` or generic Unauthorized.
- **Severity:** smoke

## TC-API-AUTH-025 — GET /auth/me with token signed by different key
- **Steps:** Mint JWT with another secret.
- **Expected:** 401.
- **Severity:** smoke

## TC-API-AUTH-026 — GET /auth/me with `alg: none` JWT
- **Steps:** Craft `{alg:"none"}` JWT manually with valid claims.
- **Expected:** 401 — must reject unsigned tokens.
- **Severity:** smoke

## TC-API-AUTH-027 — GET /auth/me with token whose `sub` references deleted user
- **Pre:** User deleted but token still valid.
- **Steps:** `GET /auth/me`
- **Expected:** 401 or 404 — record.
- **Severity:** high

## TC-API-AUTH-028 — POST /auth/refresh with valid refresh token → 200
- **Steps:** POST `/auth/refresh` `{refreshToken}`.
- **Expected:** 200 with new `accessToken` (and possibly rotated refresh).
- **Severity:** smoke

## TC-API-AUTH-029 — POST /auth/refresh with revoked refresh token → 401
- **Pre:** Logout invalidated the refresh token.
- **Steps:** POST `/auth/refresh` with same token.
- **Expected:** 401.
- **Severity:** high

## TC-API-AUTH-030 — POST /auth/refresh missing body → 400
- **Steps:** POST empty body.
- **Expected:** 400.
- **Severity:** medium

## TC-API-AUTH-031 — POST /auth/logout invalidates refresh token
- **Steps:** Logout, then attempt refresh with same token.
- **Expected:** Logout 200; subsequent refresh 401.
- **Severity:** smoke

## TC-API-AUTH-032 — POST /auth/logout without token → 401
- **Steps:** POST `/auth/logout` no Authorization.
- **Expected:** 401.
- **Severity:** medium

## TC-API-AUTH-033 — POST /auth/forgot-password 200 happy path
- **Steps:** POST `{"email":"qa-owner@doable.test"}`.
- **Expected:** 200 generic `{ok:true}` regardless of whether email exists (anti-enumeration).
- **Severity:** high

## TC-API-AUTH-034 — POST /auth/forgot-password unknown email → still 200
- **Steps:** POST with random email.
- **Expected:** 200 — don't leak existence.
- **Severity:** high

## TC-API-AUTH-035 — POST /auth/forgot-password rate limit
- **Steps:** 6 requests in 1 hour from same IP.
- **Expected:** 429.
- **Severity:** high

## TC-API-AUTH-036 — POST /auth/reset-password valid token → 200
- **Pre:** Forgot-password token issued.
- **Steps:** POST `{token, newPassword:"NewPass123!"}`.
- **Expected:** 200; old password no longer works.
- **Severity:** smoke

## TC-API-AUTH-037 — POST /auth/reset-password expired token → 400
- **Steps:** Use 25-hour-old token.
- **Expected:** 400 `{error:"Token expired"}` or 401.
- **Severity:** high

## TC-API-AUTH-038 — POST /auth/reset-password reused token → 400
- **Steps:** Use same token twice.
- **Expected:** Second call fails 400/401.
- **Severity:** high

## TC-API-AUTH-039 — POST /auth/reset-password weak new password → 400
- **Steps:** Token + `newPassword:"abc"`.
- **Expected:** 400 password validation failure.
- **Severity:** high

## TC-API-AUTH-040 — POST /auth/verify-email valid token → 200
- **Steps:** POST `{token}` from verification email.
- **Expected:** 200; `users.email_verified_at` set.
- **Severity:** high

## TC-API-AUTH-041 — POST /auth/verify-email already verified → 200 idempotent
- **Steps:** POST same token twice.
- **Expected:** Second returns 200 or 400 — record.
- **Severity:** medium

## TC-API-AUTH-042 — POST /auth/resend-verification 200
- **Pre:** Logged in.
- **Steps:** POST `/auth/resend-verification`.
- **Expected:** 200; rate limited to 1/min.
- **Severity:** medium

## TC-API-AUTH-043 — POST /auth/oauth/google with bad provider → 400
- **Steps:** POST `/auth/oauth/madeup`.
- **Expected:** 400 `{error:"Unknown provider"}`.
- **Severity:** medium

## TC-API-AUTH-044 — POST /auth/oauth/google starts flow
- **Steps:** POST `/auth/oauth/google`.
- **Expected:** 200 with `redirectUrl` to Google consent screen.
- **Severity:** smoke

## TC-API-AUTH-045 — GET /auth/oauth/google/callback with state mismatch → 400
- **Steps:** GET callback with tampered `state` param.
- **Expected:** 400 — CSRF protection.
- **Severity:** smoke

## TC-API-AUTH-046 — GET /auth/oauth/google/callback with no `code` → 400
- **Steps:** GET callback missing code.
- **Expected:** 400.
- **Severity:** high

## TC-API-AUTH-047 — POST /auth/change-password 200
- **Steps:** Auth as user, POST `{oldPassword, newPassword}`.
- **Expected:** 200; old password no longer works; refresh tokens revoked.
- **Severity:** high

## TC-API-AUTH-048 — POST /auth/change-password wrong old → 400
- **Steps:** POST with wrong oldPassword.
- **Expected:** 400 or 401.
- **Severity:** high

## TC-API-AUTH-049 — DELETE /auth/account 204
- **Steps:** Auth, DELETE `/auth/account` `{password}` confirmation.
- **Expected:** 204; user soft-deleted; subsequent /me returns 401.
- **Severity:** high

## TC-API-AUTH-050 — DELETE /auth/account wrong password → 401
- **Steps:** DELETE with wrong password.
- **Expected:** 401.
- **Severity:** high

## TC-API-AUTH-051 — GET /auth/register → 405 / 404
- **Steps:** Wrong method.
- **Expected:** 404 (Hono).
- **Severity:** low

## TC-API-AUTH-052 — Header injection on Authorization
- **Steps:** `Authorization: Bearer abc\r\nX-Inject: 1`.
- **Expected:** 400 or 401; injected header stripped.
- **Severity:** smoke

## TC-API-AUTH-053 — Authorization repeated header
- **Steps:** Two `Authorization` headers with different tokens.
- **Expected:** Server picks one consistently; record behavior.
- **Severity:** medium

## TC-API-AUTH-054 — Multipart form to /auth/login
- **Steps:** POST as multipart/form-data.
- **Expected:** 415 or 400.
- **Severity:** medium

## TC-API-AUTH-055 — POST /auth/login with `null` email
- **Steps:** Body `{"email":null,"password":"TestPass123!"}`.
- **Expected:** 400.
- **Severity:** high

## TC-API-AUTH-056 — POST /auth/login with email as array
- **Steps:** Body `{"email":["a@b.com"],"password":"TestPass123!"}`.
- **Expected:** 400.
- **Severity:** high

## TC-API-AUTH-057 — POST /auth/login with deeply nested JSON
- **Steps:** Body `{"email":"a@b.com","password":"x","extra":{a:{b:{c:{d:{e:1}}}}}}`.
- **Expected:** Either 400 (extra ignored) or 200 — extra fields stripped.
- **Severity:** medium

## TC-API-AUTH-058 — Slow client 1-byte/sec body
- **Steps:** Trickle a 1KB body for 60s.
- **Expected:** Server times out within ~30s; returns 408 or closes.
- **Severity:** high

## TC-API-AUTH-059 — Path SQL injection on /auth/oauth/:provider
- **Steps:** GET `/auth/oauth/google'%20OR%201=1--/callback`.
- **Expected:** 400 or 404; never SQL error.
- **Severity:** smoke

## TC-API-AUTH-060 — UUID-shaped value in :provider path slot
- **Steps:** GET `/auth/oauth/00000000-0000-0000-0000-000000000000`.
- **Expected:** 400 unknown provider.
- **Severity:** medium

## TC-API-AUTH-061 — Very long URL on /auth/oauth/:provider
- **Steps:** Provider name 5000 chars.
- **Expected:** 414 or 400.
- **Severity:** medium

## TC-API-AUTH-062 — CORS preflight from staging.doable.me
- **Steps:** OPTIONS /auth/login `Origin: https://staging.doable.me`.
- **Expected:** 204 with `Access-Control-Allow-Origin: https://staging.doable.me`.
- **Severity:** smoke

## TC-API-AUTH-063 — CORS from disallowed origin → no allow header
- **Steps:** OPTIONS /auth/login `Origin: https://evil.com`.
- **Expected:** No allow-origin or 403.
- **Severity:** smoke

## TC-API-AUTH-064 — Server error path returns JSON not HTML
- **Pre:** Force DB error during login.
- **Steps:** POST /auth/login.
- **Expected:** 500 `{error:"Internal Server Error"}`; never HTML stack.
- **Severity:** high
