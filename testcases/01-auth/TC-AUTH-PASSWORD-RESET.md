# TC-AUTH-PASSWORD-RESET — Forgot/reset password flows

API endpoints:
- `POST https://staging-api.doable.me/auth/forgot-password`
- `POST https://staging-api.doable.me/auth/reset-password`

Source: `services/api/src/routes/auth/core.ts:151-223`.
Reset token: 32 random bytes hex, expires 1h, hashed in DB.
Rate limits: forgot 3/h, reset 5/h.

## TC-AUTH-FORGOT-001 — Forgot with existing email
- **Pre:** `qa-owner@doable.test` exists.
- **Steps:** POST /auth/forgot-password `{"email":"qa-owner@doable.test"}`.
- **Expected:** 200 `{"message":"If an account with that email exists, a reset link has been sent."}`. New row in `password_reset_tokens` with `expires_at = now + 1h`.
- **Severity:** smoke

## TC-AUTH-FORGOT-002 — Forgot with unknown email returns same message
- **Steps:** POST `{"email":"nobody-here@doable.test"}`.
- **Expected:** 200 with same message; NO row inserted.
- **Severity:** smoke

## TC-AUTH-FORGOT-003 — Email enumeration timing
- **Steps:** Time forgot for existing vs unknown email (10 samples each).
- **Expected:** Means within ~50ms of each other (unknown email skips DB writes — small variance acceptable; document).
- **Severity:** medium

## TC-AUTH-FORGOT-004 — Missing email field → 400
- **Steps:** POST `{}`.
- **Expected:** 400 `{"error":"Email is required"}`.
- **Severity:** high

## TC-AUTH-FORGOT-005 — Email field empty string → 400
- **Steps:** POST `{"email":""}`.
- **Expected:** 400 `{"error":"Email is required"}` (handler checks `!email`).
- **Severity:** high

## TC-AUTH-FORGOT-006 — Email field non-string → 400 / 500
- **Steps:** POST `{"email":["a@b.com"]}`.
- **Expected:** 400. (Note: handler does not zod-validate; behaviour may vary.)
- **Severity:** medium

## TC-AUTH-FORGOT-007 — Forgot rate limit: 4th call/h → 429
- **Pre:** 3 calls in last hour from same IP.
- **Steps:** 4th POST.
- **Expected:** 429.
- **Severity:** smoke

## TC-AUTH-FORGOT-008 — Forgot for OAuth-only account (no password_hash)
- **Steps:** POST forgot with Google-only user's email.
- **Expected:** 200 with same message; reset token created. Subsequent reset will set a password — document this enables password takeover only with email access.
- **Severity:** medium

## TC-AUTH-FORGOT-009 — Forgot delivers reset URL to user's email
- **Pre:** Test SMTP / email capture configured.
- **Steps:** Trigger forgot, capture email body.
- **Expected:** Email contains `https://staging.doable.me/reset-password?token=<64-hex>`. Token length 64 (32 bytes hex).
- **Severity:** smoke

## TC-AUTH-FORGOT-010 — Reset URL points to FRONTEND_URL exactly
- **Steps:** Inspect URL.
- **Expected:** Hostname matches `process.env.NEXT_PUBLIC_APP_URL` (no fallback to localhost in staging).
- **Severity:** high

## TC-AUTH-FORGOT-011 — Reset email contains userName from displayName
- **Pre:** User has `display_name = "Casey"`.
- **Steps:** Trigger forgot.
- **Expected:** Email greeting uses "Casey".
- **Severity:** low

## TC-AUTH-FORGOT-012 — Reset email greeting falls back to email prefix
- **Pre:** User has no display_name.
- **Steps:** Trigger forgot.
- **Expected:** Greeting uses email prefix.
- **Severity:** low

## TC-AUTH-FORGOT-013 — Multiple forgot calls create multiple tokens (no replacement)
- **Steps:** POST forgot twice.
- **Expected:** Two rows in `password_reset_tokens` for that user. Both valid until 1h.
- **Severity:** medium

## TC-AUTH-FORGOT-014 — Rate-limit headers exposed
- **Steps:** Inspect response headers.
- **Expected:** `X-RateLimit-Limit: 3`, `X-RateLimit-Remaining: 2`, `X-RateLimit-Reset: 3600`.
- **Severity:** low

## TC-AUTH-FORGOT-015 — Forgot does not leak DB errors
- **Pre:** Simulate DB error during token insert.
- **Steps:** POST forgot.
- **Expected:** 200 with same generic message — no stack trace or 5xx.
- **Severity:** medium

## TC-AUTH-FORGOT-016 — Forgot with RFC-violating email returns 200 (handler accepts any string)
- **Steps:** POST `{"email":"not-an-email"}`.
- **Expected:** 200 (no zod schema applied here; user not found → generic success).
- **Severity:** low

## TC-AUTH-FORGOT-017 — Forgot with very long email (10 KB)
- **Steps:** POST email of 10 KB.
- **Expected:** 200 or 413 if a body-size limit is in place. No 500.
- **Severity:** edge

## TC-AUTH-RESET-001 — Reset with valid token (happy path)
- **Pre:** Token issued via forgot.
- **Steps:** POST /auth/reset-password `{"token":"<raw>","password":"NewPass456!"}`.
- **Expected:** 200 `{"message":"Password has been reset successfully"}`. `users.password_hash` updated. Token marked used. All refresh tokens for user deleted.
- **Severity:** smoke

## TC-AUTH-RESET-002 — Reset with already-used token → 400
- **Pre:** TC-AUTH-RESET-001.
- **Steps:** POST again with same token.
- **Expected:** 400 `{"error":"Invalid or expired reset token"}`.
- **Severity:** smoke

## TC-AUTH-RESET-003 — Reset with expired token → 400
- **Pre:** Token `expires_at < now`.
- **Steps:** POST.
- **Expected:** 400.
- **Severity:** smoke

## TC-AUTH-RESET-004 — Reset with garbage token → 400
- **Steps:** POST `{"token":"not-real","password":"NewPass456!"}`.
- **Expected:** 400.
- **Severity:** high

## TC-AUTH-RESET-005 — Reset with token whose hash doesn't match → 400
- **Steps:** Provide raw token that hashes to non-existent value.
- **Expected:** 400.
- **Severity:** high

## TC-AUTH-RESET-006 — Reset password missing → 400
- **Steps:** POST `{"token":"<raw>"}`.
- **Expected:** 400 with `details.password`.
- **Severity:** high

## TC-AUTH-RESET-007 — Reset password too short (<8) → 400
- **Steps:** POST password length 7.
- **Expected:** 400.
- **Severity:** high

## TC-AUTH-RESET-008 — Reset password too long (>128) → 400
- **Steps:** POST password length 129.
- **Expected:** 400.
- **Severity:** medium

## TC-AUTH-RESET-009 — Reset password missing complexity (no uppercase)
- **Pre:** Look at schema — `resetPasswordSchema` is `min(8).max(128)` only, NOT regex. Document drift from register schema.
- **Steps:** POST `password = "alllower1"`.
- **Expected:** 200 (reset accepts any 8+ char password). FILE FINDING: complexity not enforced on reset.
- **Severity:** high

## TC-AUTH-RESET-010 — Reset rate limit: 6th call → 429
- **Pre:** 5 attempts in last hour.
- **Steps:** POST.
- **Expected:** 429.
- **Severity:** medium

## TC-AUTH-RESET-011 — Reset deletes ALL refresh tokens for user
- **Pre:** User has 3 active refresh tokens.
- **Steps:** Reset password.
- **Expected:** All 3 rows removed. Subsequent /auth/refresh with any → 401.
- **Severity:** smoke

## TC-AUTH-RESET-012 — Old password no longer authenticates
- **Pre:** Reset to `NewPass456!`.
- **Steps:** POST /auth/login with old password.
- **Expected:** 401.
- **Severity:** smoke

## TC-AUTH-RESET-013 — New password authenticates
- **Steps:** POST /auth/login with `NewPass456!`.
- **Expected:** 200.
- **Severity:** smoke

## TC-AUTH-RESET-014 — Reset with token of another user (mismatched user_id) — n/a
- **Note:** Token includes user_id linkage server-side; impossible to send "another user's" raw token without stealing it. Listed for completeness — verify token storage uses sha256(token).
- **Severity:** edge

## TC-AUTH-RESET-015 — Reset with token re-used after expiry
- **Pre:** Mark token expired.
- **Steps:** Reset.
- **Expected:** 400.
- **Severity:** medium

## TC-AUTH-RESET-016 — Reset with very long password (10 KB)
- **Steps:** POST password 10 KB.
- **Expected:** 400 (max 128).
- **Severity:** edge

## TC-AUTH-RESET-017 — Reset with NUL byte in password
- **Steps:** POST password with embedded NUL.
- **Expected:** 200 if 8+ chars, 400 otherwise; ensure subsequent login works.
- **Severity:** edge

## TC-AUTH-RESET-018 — Reset response is generic on DB error
- **Pre:** DB connection drop mid-reset.
- **Steps:** POST.
- **Expected:** 400 `Invalid or expired reset token` (catch all in core.ts:218-222). No stack trace.
- **Severity:** medium

## TC-AUTH-RESET-019 — Concurrent reset with same token (race)
- **Steps:** Fire two simultaneous resets with same token.
- **Expected:** Exactly one 200 and one 400.
- **Severity:** high

## TC-AUTH-RESET-020 — Reset token reuse after partial failure
- **Pre:** Reset attempt where DB save succeeds but `markResetTokenUsed` fails (rare).
- **Steps:** Reset twice.
- **Expected:** Document — if `markResetTokenUsed` is non-transactional, reuse may be possible. File finding if reproducible.
- **Severity:** high

## TC-AUTH-RESET-021 — Reset token is 64-hex characters
- **Steps:** Inspect raw token in URL.
- **Expected:** Matches `^[0-9a-f]{64}$`.
- **Severity:** medium

## TC-AUTH-RESET-022 — Reset token in DB is hashed (sha256), not raw
- **Steps:** SELECT token_hash FROM password_reset_tokens.
- **Expected:** 64-hex sha256, NOT the raw token.
- **Severity:** smoke

## TC-AUTH-RESET-023 — Reset accepts case-sensitive token
- **Steps:** Submit token with case flipped.
- **Expected:** 400 (sha256 of altered token doesn't match stored hash).
- **Severity:** medium

## TC-AUTH-RESET-024 — Reset with whitespace around token
- **Steps:** Submit token with leading/trailing space.
- **Expected:** 400 (no trim in handler).
- **Severity:** medium

## TC-AUTH-RESET-025 — Reset cleans up no other unrelated rows
- **Pre:** Snapshot table sizes.
- **Steps:** Reset.
- **Expected:** Only that user's refresh tokens removed; other users' rows untouched.
- **Severity:** high

## TC-AUTH-RESET-026 — User receives reset confirmation email (if implemented)
- **Steps:** Inspect email log after reset.
- **Expected:** Documented either way. (Currently no confirmation — file enhancement.)
- **Severity:** low
