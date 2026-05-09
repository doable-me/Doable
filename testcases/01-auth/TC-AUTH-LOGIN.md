# TC-AUTH-LOGIN — Login flows

API endpoint: `POST https://staging-api.doable.me/auth/login`
Source: `services/api/src/routes/auth/core.ts:57-72`.
Schema: `{ email: string(email), password: string(min 1) }`.
Rate limit: 10 per 15 min per IP.

## TC-AUTH-LOGIN-001 — Login with valid email + password (happy path)
- **Pre:** `qa-owner@doable.test` exists with password `TestPass123!`.
- **Steps:** POST /auth/login `{"email":"qa-owner@doable.test","password":"TestPass123!"}`.
- **Expected:** 200; body has `user{...}` and `tokens{accessToken, refreshToken, expiresIn:900}`. `user.id == d58e6d7c-915a-414f-ac3b-f2161c0b508d`.
- **Evidence pattern:** save response to evidence/TC-AUTH-LOGIN-001.json
- **Severity:** smoke

## TC-AUTH-LOGIN-002 — Wrong password → 401
- **Pre:** Same user.
- **Steps:** POST /auth/login `{"email":"qa-owner@doable.test","password":"WrongPass123!"}`.
- **Expected:** 401 `{"error":"Invalid email or password"}`. No tokens.
- **Severity:** smoke

## TC-AUTH-LOGIN-003 — Email not registered → 401 (no enumeration)
- **Steps:** POST /auth/login with `nobody-here-12345@doable.test` and any password.
- **Expected:** 401 with same `Invalid email or password` message — must NOT leak that user does not exist.
- **Severity:** high

## TC-AUTH-LOGIN-004 — Email enumeration timing
- **Steps:** Measure response time for valid email + bad password vs unknown email + bad password (10 samples each).
- **Expected:** Means within ~10% of each other. If "unknown email" is significantly faster (skip Argon2 verify), file as enumeration risk.
- **Severity:** medium

## TC-AUTH-LOGIN-005 — Empty password → 400 (zod min(1))
- **Steps:** POST `{"email":"qa-owner@doable.test","password":""}`.
- **Expected:** 400 with `details.password=["Password is required"]`.
- **Severity:** high

## TC-AUTH-LOGIN-006 — Missing password field → 400
- **Steps:** POST `{"email":"qa-owner@doable.test"}`.
- **Expected:** 400.
- **Severity:** high

## TC-AUTH-LOGIN-007 — Empty email → 400
- **Steps:** POST `{"email":"","password":"TestPass123!"}`.
- **Expected:** 400.
- **Severity:** high

## TC-AUTH-LOGIN-008 — Email different case (`QA-OWNER@DOABLE.TEST`)
- **Pre:** Account stored as `qa-owner@doable.test`.
- **Steps:** POST with uppercase email.
- **Expected:** Record actual; if the codebase stores raw email and `findUserByEmail` is case-sensitive, returns 401. Document so we can decide on normalisation.
- **Severity:** medium

## TC-AUTH-LOGIN-009 — Email surrounded with whitespace
- **Steps:** POST `{"email":"  qa-owner@doable.test  ","password":"..."}`.
- **Expected:** 400 (zod email).
- **Severity:** medium

## TC-AUTH-LOGIN-010 — User exists but has no password_hash (OAuth-only account)
- **Pre:** A user signed up via Google with no password set.
- **Steps:** POST /auth/login with that email + any password.
- **Expected:** 401 `Invalid email or password` (per `core.ts:65`).
- **Severity:** high

## TC-AUTH-LOGIN-011 — Account locked after multiple failures (none implemented)
- **Steps:** 9 login attempts with bad password.
- **Expected:** All return 401 (no lockout). Document for future hardening — only the IP rate limit (10 in 15m) protects the endpoint.
- **Severity:** medium

## TC-AUTH-LOGIN-012 — Rate limit: 11th attempt in 15m → 429
- **Pre:** 10 attempts already counted on this IP.
- **Steps:** POST /auth/login (any payload).
- **Expected:** 429 with `Retry-After: 900` (or close).
- **Severity:** smoke

## TC-AUTH-LOGIN-013 — Rate limit applies to wrong-password attempts
- **Steps:** Issue 11 wrong-password POSTs in a row.
- **Expected:** First 10 → 401; 11th → 429.
- **Severity:** high

## TC-AUTH-LOGIN-014 — Rate limit applies even on valid creds
- **Steps:** 11 valid logins in 15 min.
- **Expected:** 11th → 429 (rate limit fires before route handler).
- **Severity:** medium

## TC-AUTH-LOGIN-015 — Login response excludes password_hash
- **Pre:** Valid login.
- **Steps:** Inspect response JSON for any `password_hash`, `passwordHash`, or `hash` key.
- **Expected:** Absent. Only `id, email, displayName, avatarUrl, isPlatformAdmin, platformRole, createdAt, updatedAt`.
- **Severity:** smoke

## TC-AUTH-LOGIN-016 — Tokens differ across two logins for same user
- **Steps:** Login twice in quick succession.
- **Expected:** Two distinct refresh tokens; both stored in `refresh_tokens`.
- **Severity:** medium

## TC-AUTH-LOGIN-017 — Two logins do not invalidate each other (concurrent sessions)
- **Pre:** Login A then Login B both succeed.
- **Steps:** Use both refresh tokens separately to /auth/refresh.
- **Expected:** Both still valid.
- **Severity:** high

## TC-AUTH-LOGIN-018 — User row updated_at not bumped just for login
- **Steps:** Login then check `updated_at`.
- **Expected:** Unchanged from before login.
- **Severity:** low

## TC-AUTH-LOGIN-019 — Invalid JSON body → 400
- **Steps:** POST with malformed JSON.
- **Expected:** 400.
- **Severity:** medium

## TC-AUTH-LOGIN-020 — `password` containing only whitespace `"   "`
- **Steps:** POST password = "   ".
- **Expected:** 401 (passes min(1) but argon2.verify fails).
- **Severity:** low

## TC-AUTH-LOGIN-021 — Long password attempt (10 KB) doesn't crash
- **Steps:** POST password of 10 KB.
- **Expected:** 401 (argon2.verify returns false). No 5xx.
- **Severity:** medium

## TC-AUTH-LOGIN-022 — Login while DB is down → 5xx
- **Pre:** simulate DB outage.
- **Steps:** POST login.
- **Expected:** 5xx (argon2.verify cannot fetch hash). Confirm error is generic, not stack trace.
- **Severity:** medium

## TC-AUTH-LOGIN-023 — POST with `X-Forwarded-For` rotation rate-limit bypass attempt
- **Pre:** At limit.
- **Steps:** Loop with rotated XFF values.
- **Expected:** If tunnel correctly strips XFF, all blocked. If not, document. (Cross-references TC-SEC-RATELIMIT-007.)
- **Severity:** high

## TC-AUTH-LOGIN-024 — Login on deleted user → 401
- **Pre:** Soft- or hard-deleted user.
- **Steps:** POST with their email + correct old password.
- **Expected:** 401.
- **Severity:** medium

## TC-AUTH-LOGIN-025 — Login on user whose password was reset
- **Pre:** User reset password to `NewPass456!`.
- **Steps:** POST with old password.
- **Expected:** 401.
- **Severity:** smoke

## TC-AUTH-LOGIN-026 — Login on user whose password was reset, new password works
- **Pre:** Same.
- **Steps:** POST with `NewPass456!`.
- **Expected:** 200.
- **Severity:** smoke

## TC-AUTH-LOGIN-027 — Email field with `null`
- **Steps:** POST `{"email":null,"password":"TestPass123!"}`.
- **Expected:** 400.
- **Severity:** medium

## TC-AUTH-LOGIN-028 — Email field with number/non-string `123`
- **Steps:** POST `{"email":123,"password":"TestPass123!"}`.
- **Expected:** 400.
- **Severity:** medium

## TC-AUTH-LOGIN-029 — Email field with array
- **Steps:** POST `{"email":["a@b.com"],"password":"TestPass123!"}`.
- **Expected:** 400.
- **Severity:** edge

## TC-AUTH-LOGIN-030 — Login response sets no Set-Cookie header (token-only auth)
- **Steps:** Inspect headers.
- **Expected:** No `Set-Cookie` (system uses bearer tokens, not cookies for API).
- **Severity:** medium

## TC-AUTH-LOGIN-031 — Login response Cache-Control no-store
- **Steps:** Inspect headers.
- **Expected:** Either `Cache-Control: no-store` or absent (no `public`/`max-age`). If sensitive response is cacheable, file finding.
- **Severity:** medium

## TC-AUTH-LOGIN-032 — Login response includes `isPlatformAdmin:true` for platform admin
- **Pre:** `qa-owner` is platform admin.
- **Steps:** Login as qa-owner.
- **Expected:** `user.isPlatformAdmin === true`.
- **Severity:** smoke

## TC-AUTH-LOGIN-033 — Login response includes `isPlatformAdmin:false` for non-admin
- **Steps:** Login as `qa-member@doable.test`.
- **Expected:** `user.isPlatformAdmin === false`.
- **Severity:** smoke

## TC-AUTH-LOGIN-034 — Login with case-mutated stored email (data was stored with caps)
- **Pre:** A test user exists with email exactly `Mixed@Doable.Test` (manually inserted).
- **Steps:** Try login with `Mixed@Doable.Test` and `mixed@doable.test`.
- **Expected:** First works; second behaviour records casing policy.
- **Severity:** medium

## TC-AUTH-LOGIN-035 — Login with `password` of 128 chars works if account has it
- **Pre:** account password 128 chars.
- **Steps:** POST.
- **Expected:** 200.
- **Severity:** low

## TC-AUTH-LOGIN-036 — Argon2 verify timing constant-ish
- **Steps:** Time successful login (correct password) vs failed (wrong password) on same valid email; 10 samples.
- **Expected:** Means within ~20%. Constant-time hash comparison is part of argon2.verify.
- **Severity:** edge

## TC-AUTH-LOGIN-037 — Login response Content-Type is `application/json`
- **Steps:** Inspect.
- **Expected:** `application/json; charset=utf-8`.
- **Severity:** smoke

## TC-AUTH-LOGIN-038 — Login response no extraneous secrets in body (e.g., JWT secret, refresh token salt)
- **Steps:** Search response JSON keys.
- **Expected:** None.
- **Severity:** smoke

## TC-AUTH-LOGIN-039 — Bearer token issued is usable on `/auth/me`
- **Pre:** Login successful.
- **Steps:** GET /auth/me with `Authorization: Bearer <accessToken>`.
- **Expected:** 200; matching `user.id`.
- **Severity:** smoke

## TC-AUTH-LOGIN-040 — Refresh token issued is usable on `/auth/refresh`
- **Pre:** Login successful.
- **Steps:** POST /auth/refresh with returned refreshToken.
- **Expected:** 200; new pair issued.
- **Severity:** smoke
