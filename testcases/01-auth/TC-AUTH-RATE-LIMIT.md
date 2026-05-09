# TC-AUTH-RATE-LIMIT — Auth-specific rate limits & bypass attempts

Limits (`services/api/src/routes/auth/helpers.ts`):
- /auth/login → 10 / 15min
- /auth/register → 5 / 1h
- /auth/forgot-password → 3 / 1h
- /auth/reset-password → 5 / 1h

Default key: `x-forwarded-for` (then `x-real-ip` then "unknown") — `services/api/src/middleware/rate-limit.ts`.

## TC-AUTH-RATE-001 — Register 6th in 1h returns 429
- **Steps:** 6 registrations from same IP in <1h.
- **Expected:** First 5 → 201; 6th → 429.
- **Severity:** smoke

## TC-AUTH-RATE-002 — Login 11th in 15m returns 429
- **Steps:** 11 logins in <15m from same IP.
- **Expected:** 11th → 429.
- **Severity:** smoke

## TC-AUTH-RATE-003 — Forgot 4th in 1h returns 429
- **Steps:** 4 forgots same IP in <1h.
- **Expected:** 4th → 429.
- **Severity:** smoke

## TC-AUTH-RATE-004 — Reset 6th in 1h returns 429
- **Steps:** 6 reset attempts same IP in <1h.
- **Expected:** 6th → 429.
- **Severity:** smoke

## TC-AUTH-RATE-005 — Login limit window resets after 15 min
- **Pre:** Hit limit at T=0.
- **Steps:** Wait 15+ min. Try again.
- **Expected:** 200 (counter rolls over).
- **Severity:** medium

## TC-AUTH-RATE-006 — Register limit window resets after 60 min
- **Pre:** Hit limit at T=0.
- **Steps:** Wait 61 min. Try again.
- **Expected:** 201.
- **Severity:** medium

## TC-AUTH-RATE-007 — Each endpoint has its own counter
- **Steps:** From same IP, hit login 10x, then register once.
- **Expected:** Register still 201 (different bucket prefix).
- **Severity:** medium

## TC-AUTH-RATE-008 — Counter prefixes don't collide
- **Steps:** Verify in KV store keys begin with `rl:` prefix and are distinct per limiter.
- **Expected:** Distinct.
- **Severity:** low

## TC-AUTH-RATE-009 — Bypass via X-Forwarded-For rotation
- **Pre:** Hit limit.
- **Steps:** Send 5 more with rotating XFF values.
- **Expected:** All 429 if Cloudflare normalises XFF; 201/200 if it does not. Document deployment posture. (Per CLAUDE.md services bind 127.0.0.1, and Cloudflare tunnel adds CF-Connecting-IP which the limiter does NOT prefer.)
- **Severity:** high

## TC-AUTH-RATE-010 — Bypass via CF-Connecting-IP not honoured
- **Steps:** Spoof `CF-Connecting-IP` while fixed XFF; rate limit follows XFF.
- **Expected:** Limit enforced on XFF value. Note: real attacker IPs vary as XFF if Cloudflare passes them through. Document.
- **Severity:** medium

## TC-AUTH-RATE-011 — No XFF / no XRI uses key="unknown"
- **Steps:** Direct call to api with no XFF (impossible through tunnel; simulate).
- **Expected:** Counter buckets all into "unknown". 11th login → 429 even from genuinely different sources.
- **Severity:** medium

## TC-AUTH-RATE-012 — IPv6 source rate-limited correctly
- **Steps:** Use IPv6 client.
- **Expected:** Limits apply same as IPv4.
- **Severity:** low

## TC-AUTH-RATE-013 — Concurrent burst of 20 logins in <1s
- **Steps:** 20 parallel POSTs.
- **Expected:** Up to 10 succeed, rest 429. Counter is strictly enforced via KV `incr`.
- **Severity:** high

## TC-AUTH-RATE-014 — Rate-limit response includes Retry-After
- **Steps:** Trigger 429.
- **Expected:** `Retry-After` header present and numeric.
- **Severity:** medium

## TC-AUTH-RATE-015 — Rate-limit response is JSON
- **Steps:** Trigger 429.
- **Expected:** `Content-Type: application/json`; body `{"error":"Too many requests..."}`.
- **Severity:** smoke

## TC-AUTH-RATE-016 — RATE_LIMIT_MAX=0 disables limiter (operator override)
- **Steps:** With env override `max=0` (verify behaviour in lower environment), 100 requests.
- **Expected:** All allowed (per `if (max <= 0) noop`).
- **Severity:** low

## TC-AUTH-RATE-017 — Rate-limit applies before route logic (auth fails first)
- **Pre:** At limit.
- **Steps:** Send valid creds.
- **Expected:** 429, NOT 200. Confirms middleware order.
- **Severity:** high

## TC-AUTH-RATE-018 — Empty body still consumes register quota
- **Steps:** Hit /auth/register with `{}` 5 times.
- **Expected:** Counter increments; 6th → 429.
- **Severity:** medium

## TC-AUTH-RATE-019 — 429 logged to xray as `rate_limit.blocked`
- **Steps:** Trigger 429 then inspect xray spans.
- **Expected:** A span with name `rate_limit.blocked`, status `error`, attributes `path`, `method`, `count`, `max`.
- **Severity:** medium

## TC-AUTH-RATE-020 — Rate-limit headers correct on success
- **Steps:** Single login.
- **Expected:** `X-RateLimit-Limit:10`, `X-RateLimit-Remaining:9`, `X-RateLimit-Reset:900`.
- **Severity:** medium
