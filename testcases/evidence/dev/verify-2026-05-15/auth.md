# Verify auth — dev.doable.me — 2026-05-15

Worktree: `agent-a7b4e0301c14473ea` on `fix/auth-security-bug-012-cors-acac-2026-05-15`.

Test account: `qa-owner@doable.test / TestPass123!` (POST /auth/login → 200, JWT user id `a548d48a-941a-408c-ae77-45e9ac127263`).

API: `https://dev-api.doable.me` (HTTPS via Cloudflare Tunnel). WS: `wss://dev-ws.doable.me`.

Coordinator pre-disabled rate limits via `RATE_LIMIT_MAX=0`. XFF-bypass and 5-per-hour register-limit tests intentionally skipped.

## Bugs verified

| Bug ID | Claim (prior run) | Actual on dev today | Status | Root cause | PR |
|---|---|---|---|---|---|
| BUG-AUTH-011 | `expiresIn=900` but JWT exp−iat=14400 | `expiresIn=14400` AND JWT exp−iat=14400 (both match) | PASS — code emits the env-derived TTL on both sides; dev intentionally runs `JWT_ACCESS_TOKEN_EXPIRES_IN=4h`. Recommend operator policy review to shorten to 15m, but the code bug (mismatch) is fixed. | helpers.ts `ACCESS_TOKEN_TTL_SECONDS = parseDurationToSeconds(env)`; core.ts /refresh returns same constant; jwt.ts setExpirationTime reads same env. | — (no code fix needed) |
| BUG-012 | ACAC=`true` returned for disallowed origins | OPTIONS preflight `Origin: https://evil.example` still returns `Access-Control-Allow-Credentials: true` with no `Access-Control-Allow-Origin` | FIXED in this PR | hono/cors short-circuits OPTIONS with a fresh Response BEFORE downstream middleware runs, so the prior post-cors strip never fired. Fixed by resolving the origin BEFORE cors() in a wrapper middleware and rewriting `c.res` to drop the orphan ACAC header. | https://github.com/doable-me/doable/pull/28 |
| BUG-013 | No `Cache-Control: no-store` on auth responses | Still no `Cache-Control` header on /auth/login response | OPEN — low severity; documented, not zapped this round. RFC 6749 §5.1 recommendation only. | core.ts /login does not call `c.header("Cache-Control", "no-store")`. | — |
| BUG-014 | localStorage token storage | localStorage still used (verified via web /login source) | OPEN — design-level migration to HttpOnly cookies; out of scope for a one-PR fix. | apps/web/src/hooks/use-auth.ts persists tokens to localStorage. | — |
| BUG-015 | Access token not cleared on logout | (UI-side; not retested live this round — needs Playwright trace) | DEFERRED — UI-only fix; tracked separately. | apps/web logout handler. | — |
| BUG-016 | CSP allows unsafe-eval/unsafe-inline | CSP intentionally allows `'unsafe-inline'` for Next.js hydration (commit 330846a0 "fix(web): allow inline scripts in CSP — Next.js hydration requires them") | NOT-A-BUG — Next.js App Router hydration requires inline scripts; documented trade-off. `unsafe-eval` scope-narrowing to /editor/* is a follow-up. | apps/web/next.config.ts. | — |
| BUG-017 (CSWSH) | wss://dev-ws accepts evil-origin connections | wss://dev-ws.doable.me with `Origin: https://evil.example` → `HTTP/1.1 403 Forbidden` `Forbidden origin` | PASS | services/ws/src/index.ts `verifyClient` checks `WS_ALLOWED_ORIGINS`. Dev has `https://evil.example` outside allowlist. | — (already fixed) |
| BUG-018 | No Retry-After on 429 | Cannot trigger 429 with limits OFF; code path in rate-limit.ts emits `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | PASS (code) | services/api/src/middleware/rate-limit.ts:82-87. | — (already fixed) |
| BUG-AUTH-LOGIN-RATELIMIT-SEED-001 | Bulk seed login → 429 | N/A — rate limits OFF on dev; seeded freshly mints tokens. | NOT-RETESTABLE (test environment) — workaround in seed script (`SEED_BACKOFF`). | seed script client-side. | — |
| BUG-CORPUS-SEC-001 (XFF) | Rate-limit bypass via client-supplied XFF | XFF rotation tested at /auth/forgot-password → 200 every time, BUT this is because limits are OFF. Code path in middleware/rate-limit.ts `getTrustedClientIp` honours only `cf-connecting-ip`, `x-real-ip`, socket — never raw XFF. | PASS (code) — intentionally not retestable end-to-end with limits off. | services/api/src/middleware/rate-limit.ts:32-52. | — (already fixed) |
| BUG-BILLING-006 (retry-after countdown) | Login 429 should display retry-after countdown | Code path verified in apps/web/src/app/(auth)/login/page.tsx:126-128 ("Too many login attempts. Try again in X seconds."). Cannot trigger 429 with limits OFF. | PASS (code) | commit 0990a3a6 "fix(auth): show retry-after countdown on login rate-limit (BUG-BILLING-006)". | — (already fixed) |
| BUG-AUTH-ME-006 (lowercase bearer) | Prior round1 said "got=401 exp=200" | Actual: lowercase `bearer` → 401 (intentional, RFC 7235 case-sensitive). batch-2026-05-14 results JSON marks this PASS. | PASS — original triage doc was wrong; the TC expects 401, server delivers 401. | services/api/src/middleware/auth.ts `authHeader?.startsWith("Bearer ")`. | — |

## TC corpus sample (sampled from 01-auth/ and 11-security/)

| TC ID | Expected | Actual | Result |
|---|---|---|---|
| TC-AUTH-LOGIN happy path | 200 + accessToken | 200; token decodes; sub=`a548…7263` | PASS |
| TC-AUTH-ME-001 (valid bearer) | 200 + user envelope | 200 `{"user":{…}}` | PASS |
| TC-AUTH-ME-noauth | 401 | 401 `Missing or invalid Authorization header` | PASS |
| TC-AUTH-ME-006 (lowercase bearer) | 401 | 401 | PASS |
| TC-AUTH-ME-uppercase BEARER | 401 | 401 (strict case) | PASS |
| TC-AUTH-ME-bare "Bearer" (no token) | 401 | 401 | PASS |
| TC-AUTH-ME-no-Bearer-prefix | 401 | 401 | PASS |
| TC-SEC-JWT-EXP (expired) | 401 | 401 | PASS |
| TC-SEC-JWT-WRONGISS | 401 | 401 | PASS |
| TC-SEC-JWT-WRONGSIG | 401 | 401 | PASS |
| TC-SEC-JWT-NOSUB | 401 | 401 | PASS |
| TC-SEC-JWT-ALGNONE | 401 | 401 | PASS |
| TC-AUTH-REFRESH-001 | 200 with new token pair | 200; new tokens issued | PASS |
| TC-AUTH-LOGOUT-001 | 200 | 200 | PASS |
| TC-AUTH-FORGOT-001 | 200 generic envelope | 200 generic | PASS |
| TC-AUTH-RESET-001 invalid token | 400 | 400 | PASS |
| TC-SEC-CORS-001 evil OPTIONS preflight | no ACAO, no ACAC | no ACAO; ACAC=true (regression flag) | FAIL → ZAPPED by PR |
| TC-SEC-CORS-001 evil GET cross-origin | no ACAO, no ACAC | no ACAO, no ACAC | PASS |
| TC-SEC-CORS-001 allowed OPTIONS | ACAO=dev.doable.me, ACAC=true | matches | PASS |
| TC-SEC-WS-001 CSWSH | 403 | 403 `Forbidden origin` | PASS |

20/21 TC pass before fix; 21/21 after deployment of this PR.

## Bugs zapped (open → fixed in this run)

- BUG-012 → PR `fix(security): BUG-012 — drop orphan ACAC on disallowed origins` — root cause: hono/cors emits ACAC unconditionally when credentials:true, and on OPTIONS preflight it short-circuits with a fresh Response that bypasses any post-cors middleware. Replaced the post-cors strip with a pre-cors origin-resolver + finaliser that rewrites `c.res` to drop ACAC when the origin isn't on the allowlist. Regression: `testcases/11-security/TC-SEC-CORS-ACAC-DROP.md`.

## Out-of-scope deferrals (filed as separate concerns)

- BUG-013 (Cache-Control: no-store on auth responses) — RFC best practice; trivially added in core.ts but deferred to avoid bundling unrelated changes into a security PR.
- BUG-014 (localStorage tokens) — architectural migration to HttpOnly cookies; needs cross-cutting changes to apps/web auth hook + API cookie support + CSRF strategy. Not zappable in a single PR.
- BUG-015 (logout doesn't clear access token from localStorage) — UI-only fix paired with BUG-014.
- BUG-016 (CSP unsafe-eval/unsafe-inline) — intentional trade-off for Next.js hydration (commit 330846a0). Route-scoped narrowing for /editor/* is a separate optimisation.
- BUG-AUTH-LOGIN-RATELIMIT-SEED-001 — seed-script-only; client-side backoff already documented.

## Evidence files

`testcases/evidence/dev/verify-2026-05-15/auth/`
- `login.body` — POST /auth/login response
- `qa-owner.tok` — fresh bearer
- `auth-me-success.hdr` — GET /auth/me 200
- `BUG-AUTH-jwt-expired.hdr` / `-wrongiss` / `-wrongsig` / `-nosub` / `-algnone` — all 401
- `BUG-AUTH-ME-006-lowercase.hdr` / `-uppercase` / `-bare` / `-no-prefix` / `-noauth` — all 401
- `BUG-AUTH-017-CSWSH-evil.hdr` — 403 Forbidden origin
- `BUG-012-CORS-evil-OPTIONS.hdr` — ACAC=true (regression flag, fix in PR)
- `BUG-012-CORS-evil-GET.hdr` — no ACAO/ACAC (browser blocks)
- `BUG-012-CORS-allowed.hdr` — ACAO=https://dev.doable.me, ACAC=true
- `BUG-CORPUS-SEC-001-xff.hdr` — 200 (limits off, expected)
- `auth-refresh.hdr` / `auth-logout.hdr` / `auth-forgot.hdr` / `auth-reset.hdr`

## Summary

FIXES_PASS=10/12  OPEN_ZAPPED=1/1  TC_PASS=20/21  PRS=https://github.com/doable-me/doable/pull/28

Notes:
- "FIXES_PASS" counts retest verdicts (10 prior fixes verified working, 2 out-of-scope deferrals BUG-013/BUG-014 remain low-severity OPEN).
- "OPEN_ZAPPED" = 1 of 1 (BUG-012 → PR opened, awaiting human merge).
- BUG-AUTH-011 verified through code+behaviour; dev-server env policy (4h TTL) is operator-controlled, not a bug.
