# TC-SEC-RATELIMIT — Rate-limit bypass attempts & abuse

Source: `services/api/src/middleware/rate-limit.ts`. Key default = `x-forwarded-for` then `x-real-ip` then `"unknown"`.

## TC-SEC-RL-001 — Rotate X-Forwarded-For each request
- **Steps:** 20 logins each with unique `X-Forwarded-For: 1.2.3.<i>`.
- **Expected:** If the API trusts client-supplied XFF, all succeed → bypass. If Cloudflare tunnel sets XFF/X-Real-IP itself and overrides the client value, only 10 succeed. Document deployment behaviour.
- **Severity:** smoke

## TC-SEC-RL-002 — Rotate X-Real-IP
- **Severity:** high

## TC-SEC-RL-003 — Spoof CF-Connecting-IP
- **Steps:** Vary CF-Connecting-IP only.
- **Expected:** Rate limiter does NOT consult CF-Connecting-IP. Counter buckets all into the same XFF; 11th → 429.
- **Severity:** medium

## TC-SEC-RL-004 — Empty XFF and XRI
- **Steps:** Strip both headers.
- **Expected:** Bucketed under "unknown".
- **Severity:** medium

## TC-SEC-RL-005 — Send XFF with multiple values `1.2.3.4, 5.6.7.8`
- **Steps:** Use comma-separated XFF.
- **Expected:** Behaviour depends on whether limiter takes first or whole string. Document.
- **Severity:** medium

## TC-SEC-RL-006 — Use IPv6 mapped IPv4 to look like new client
- **Steps:** XFF `::ffff:1.2.3.4`.
- **Expected:** Bucketed distinctly from `1.2.3.4`. Document if collision missed.
- **Severity:** edge

## TC-SEC-RL-007 — Distributed: 10 IPs each fire 10 requests in window (cumulative 100)
- **Expected:** None blocked individually. Indicates need for global limit at edge.
- **Severity:** medium

## TC-SEC-RL-008 — Slow-rate brute force (1 attempt per minute) over 24h
- **Expected:** Not blocked (only per-window limit). Document — file finding for IP-level lockout.
- **Severity:** medium

## TC-SEC-RL-009 — Rate-limit response body should not echo input
- **Severity:** low

## TC-SEC-RL-010 — Rate-limit has no off-by-one (the 10th login succeeds, 11th fails)
- **Severity:** smoke

## TC-SEC-RL-011 — Rate-limit window resets exactly at boundary
- **Severity:** medium

## TC-SEC-RL-012 — Rate-limit state survives API restart only with REDIS_URL
- **Steps:** With REDIS_URL set, restart api process mid-window.
- **Expected:** Counter persists.
- **Severity:** medium

## TC-SEC-RL-013 — Rate-limit state lost on restart (no REDIS_URL)
- **Steps:** No REDIS_URL.
- **Expected:** Counter resets after restart. Document.
- **Severity:** medium

## TC-SEC-RL-014 — Concurrent burst exceeding limit accurately blocks excess
- **Severity:** smoke

## TC-SEC-RL-015 — Rate-limit applies even with valid auth
- **Severity:** smoke

## TC-SEC-RL-016 — Rate-limit doesn't apply to /auth/me (no limiter)
- **Steps:** 1000 calls.
- **Expected:** All 200. Document — only auth-mutation routes are limited; ws routes have no limiter.
- **Severity:** medium

## TC-SEC-RL-017 — Rate-limit doesn't apply to /workspaces (no limiter)
- **Severity:** medium

## TC-SEC-RL-018 — Multiple endpoints share window if same prefix
- **Severity:** low

## TC-SEC-RL-019 — Email enumeration mitigation: forgot rate limit can't be circumvented
- **Severity:** high

## TC-SEC-RL-020 — Account password attack: rate limit insufficient to stop online guessing across many emails (no per-account lockout)
- **Severity:** high

## TC-SEC-RL-021 — Password reset token brute force: 5/h reset attempts × 1h = 5 attempts
- **Steps:** 5 reset attempts with random 64-hex tokens.
- **Expected:** Hit 429 on 6th in 1h. Cumulative ≈ 5 token guesses/h — sha256 keyspace makes brute force infeasible.
- **Severity:** smoke

## TC-SEC-RL-022 — Invite token brute force: no specific rate limit on accept endpoint
- **Steps:** 1000 random token submissions.
- **Expected:** All 400. Document — no rate limit means timing-only defence.
- **Severity:** high

## TC-SEC-RL-023 — Workspace creation flood (no limit)
- **Steps:** 100 POST /workspaces.
- **Expected:** All 201 if quota not hit. Document — file enhancement to add per-user creation limit.
- **Severity:** medium

## TC-SEC-RL-024 — Invite flood by admin (only plan member-cap stops adds)
- **Severity:** medium

## TC-SEC-RL-025 — Forgot password flood from same IP triggers 429 at 4th
- **Severity:** smoke
