# TC-AUTH-MISC — CORS, content types, header smuggling, browser cases

## TC-AUTH-MISC-001 — CORS preflight allows staging.doable.me on /auth/login
- **Steps:** OPTIONS /auth/login Origin `https://staging.doable.me`, ACR-Method POST, ACR-Headers `content-type`.
- **Expected:** 200/204 with `Access-Control-Allow-Origin: https://staging.doable.me`, `Access-Control-Allow-Methods` includes POST, `Access-Control-Allow-Headers` includes content-type.
- **Severity:** smoke

## TC-AUTH-MISC-002 — CORS rejects evil.example
- **Steps:** OPTIONS Origin `https://evil.example`.
- **Expected:** No `Access-Control-Allow-Origin: https://evil.example` reflected. Either no header or echo of allowed list only.
- **Severity:** high

## TC-AUTH-MISC-003 — CORS rejects null Origin (data: scheme)
- **Steps:** OPTIONS Origin `null`.
- **Expected:** No `Access-Control-Allow-Origin: null`.
- **Severity:** high

## TC-AUTH-MISC-004 — CORS preflight on /auth/register
- **Steps:** OPTIONS /auth/register.
- **Expected:** Same allow-list behaviour.
- **Severity:** medium

## TC-AUTH-MISC-005 — Auth endpoints reject non-JSON content-types
- **Steps:** POST /auth/login Content-Type `application/x-www-form-urlencoded`.
- **Expected:** 400 (body parser fails).
- **Severity:** medium

## TC-AUTH-MISC-006 — POST /auth/login with no Content-Type
- **Steps:** Strip Content-Type header.
- **Expected:** Hono treats as JSON if body is JSON, else 400. Record.
- **Severity:** low

## TC-AUTH-MISC-007 — Body size limit
- **Steps:** POST /auth/login with 10 MB body.
- **Expected:** 413 or 400. Should not 5xx.
- **Severity:** medium

## TC-AUTH-MISC-008 — Trailing slash on URL
- **Steps:** POST /auth/login/ vs /auth/login.
- **Expected:** Both respond 200 (or one 404 — record). Should be consistent.
- **Severity:** low

## TC-AUTH-MISC-009 — Method GET on /auth/login
- **Steps:** GET /auth/login.
- **Expected:** 404 / 405.
- **Severity:** low

## TC-AUTH-MISC-010 — Hop-by-hop header smuggling: `Connection: close`
- **Steps:** Send normal POST plus `Connection: close, X-Bypass`.
- **Expected:** Server processes normally; downstream tunnel does not strip our headers in unexpected ways.
- **Severity:** medium

## TC-AUTH-MISC-011 — Host header tampering on /auth/me
- **Steps:** GET with `Host: evil.example`.
- **Expected:** 200 with valid token (Hono doesn't validate Host on its own). Document — Cloudflare tunnel binds to specific host but worth verifying.
- **Severity:** high

## TC-AUTH-MISC-012 — Host header injection in Forgot reset URL
- **Pre:** Trigger /auth/forgot-password with `Host: evil.example`.
- **Steps:** Inspect emitted reset URL.
- **Expected:** URL uses `FRONTEND_URL` env, NOT request Host. Confirms no Host-based reset URL forging.
- **Severity:** smoke

## TC-AUTH-MISC-013 — Auth response has no `Server: ...` leak
- **Steps:** Inspect headers.
- **Expected:** Either absent or generic. No exact framework version.
- **Severity:** low

## TC-AUTH-MISC-014 — Response includes `X-Content-Type-Options: nosniff`
- **Steps:** Inspect.
- **Expected:** Present.
- **Severity:** medium

## TC-AUTH-MISC-015 — Response includes `Referrer-Policy`
- **Steps:** Inspect.
- **Expected:** `strict-origin-when-cross-origin` or stricter.
- **Severity:** medium

## TC-AUTH-MISC-016 — Response on /auth/me includes no caching
- **Steps:** Inspect Cache-Control.
- **Expected:** `no-store` or `private, no-cache`.
- **Severity:** medium

## TC-AUTH-MISC-017 — Long URL (4 KB) on /auth/me
- **Steps:** Append 4 KB of query.
- **Expected:** 200 / 414. No 5xx.
- **Severity:** low

## TC-AUTH-MISC-018 — Auth call from `file://` origin
- **Steps:** Browser fetch from `file://`.
- **Expected:** CORS denies; pre-flight does not return Origin allow.
- **Severity:** medium

## TC-AUTH-MISC-019 — Auth call from non-https origin (`http://localhost:3000`)
- **Steps:** OPTIONS Origin `http://localhost:3000`.
- **Expected:** Allowed in dev; allow-list should NOT include localhost in staging. Record.
- **Severity:** high

## TC-AUTH-MISC-020 — UTF-8 BOM in JSON body
- **Steps:** POST with UTF-8 BOM prefix.
- **Expected:** 200/400; should not crash.
- **Severity:** edge

## TC-AUTH-MISC-021 — JSON containing duplicate keys
- **Steps:** POST `{"email":"a","email":"b"}` (raw bytes).
- **Expected:** Per spec, last one wins; behaviour consistent.
- **Severity:** edge

## TC-AUTH-MISC-022 — Browser localStorage usage by web app
- **Steps:** Login in browser; inspect localStorage.
- **Expected:** Document where tokens live (likely localStorage). If yes, file finding to consider httpOnly cookies.
- **Severity:** medium

## TC-AUTH-MISC-023 — Browser stores accessToken (XSS surface)
- **Steps:** Inspect.
- **Expected:** Document.
- **Severity:** medium

## TC-AUTH-MISC-024 — Refresh token never appears in URL bar after OAuth
- **Steps:** Complete OAuth, watch URL.
- **Expected:** Token only in fragment, removed by web app on consumption.
- **Severity:** high

## TC-AUTH-MISC-025 — JS console clean of credentials after login
- **Steps:** Inspect console after login.
- **Expected:** No `accessToken`, `refreshToken`, `password` substrings.
- **Severity:** medium

## TC-AUTH-MISC-026 — Logout button clears tokens from localStorage
- **Steps:** Click logout.
- **Expected:** Both tokens removed.
- **Severity:** smoke

## TC-AUTH-MISC-027 — Logout in another tab triggers re-login on subsequent action
- **Steps:** Open two tabs, logout in tab A, action in tab B.
- **Expected:** Tab B redirected to login. (Implementation detail — record actual.)
- **Severity:** medium

## TC-AUTH-MISC-028 — Time-based attack: register existing email vs new email response time
- **Steps:** Time both.
- **Expected:** Existing user returns 409 fast (skips Argon2 hash); new user returns 201 slow (hashes). Document — minor enumeration vector.
- **Severity:** medium

## TC-AUTH-MISC-029 — Server clock skew tolerance for JWT exp
- **Steps:** Generate token where exp is `now - 5s` and try /auth/me.
- **Expected:** 401 Token expired (jose default tolerance is 0).
- **Severity:** low

## TC-AUTH-MISC-030 — Duplicate slash in path `/auth//login`
- **Steps:** POST /auth//login.
- **Expected:** 404.
- **Severity:** edge

## TC-AUTH-MISC-031 — Encoded path `/%61%75%74%68/login`
- **Steps:** Send.
- **Expected:** 404 or 200 — record.
- **Severity:** edge

## TC-AUTH-MISC-032 — Header X-Original-URL spoof
- **Steps:** POST /auth/login with `X-Original-URL: /admin`.
- **Expected:** 200 (header ignored). Confirm reverse-proxy doesn't honour it.
- **Severity:** medium

## TC-AUTH-MISC-033 — Header X-Rewrite-URL spoof
- **Steps:** Same with X-Rewrite-URL.
- **Expected:** Ignored.
- **Severity:** medium

## TC-AUTH-MISC-034 — Method override `X-HTTP-Method-Override: DELETE` on /auth/me
- **Steps:** POST /auth/me with override.
- **Expected:** Ignored.
- **Severity:** medium

## TC-AUTH-MISC-035 — Body field `__proto__` doesn't pollute server objects
- **Steps:** POST /auth/login `{"email":"x","password":"y","__proto__":{"isPlatformAdmin":true}}`.
- **Expected:** 401 normal flow; no privileges granted.
- **Severity:** high

## TC-AUTH-MISC-036 — Body field `constructor.prototype` likewise
- **Severity:** high

## TC-AUTH-MISC-037 — `/auth/me` works under WS upgrade attempt? No — must be GET.
- **Steps:** GET /auth/me with `Connection: Upgrade, Upgrade: websocket`.
- **Expected:** 200 normal HTTP; no WS upgrade.
- **Severity:** edge

## TC-AUTH-MISC-038 — Compression handling: gzip request body decoded
- **Steps:** POST /auth/login with gzip body and `Content-Encoding: gzip`.
- **Expected:** 400 (Hono usually doesn't decompress request bodies). Should not 5xx.
- **Severity:** edge

## TC-AUTH-MISC-039 — TLS-only — http://staging-api.doable.me redirected
- **Steps:** Plain HTTP request.
- **Expected:** 308 to https or 400. Should not serve.
- **Severity:** smoke

## TC-AUTH-MISC-040 — HTTP/2 protocol negotiation works
- **Steps:** Negotiate h2.
- **Expected:** Endpoint works on HTTP/2.
- **Severity:** low
