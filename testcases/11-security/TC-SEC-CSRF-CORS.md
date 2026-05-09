# TC-SEC-CSRF-CORS — CSRF, OAuth CSRF, CORS allow-list, headers, cookies, CSP

## TC-SEC-CSRF-001 — POST /auth/login from cross-origin form (no token)
- **Steps:** From `https://evil.example`, submit form to /auth/login.
- **Expected:** Browser sends request; if endpoint relied on cookies it would be CSRF-vulnerable. Doable uses Bearer tokens, so login itself doesn't matter — but verify state-changing endpoints (`/workspaces`) also require Bearer and reject cookie-only.
- **Severity:** high

## TC-SEC-CSRF-002 — State-changing API requires Authorization header (no auto-cookies)
- **Steps:** Cross-origin POST /workspaces with credentials:include.
- **Expected:** 401 — no Authorization header present.
- **Severity:** smoke

## TC-SEC-CSRF-003 — Web app does NOT set session cookies for API
- **Severity:** smoke

## TC-SEC-CSRF-004 — OAuth state CSRF: attacker-issued state on victim browser
- **Steps:** Browser A obtains state from /auth/github. Attacker tricks browser A to load /auth/github/callback?code=<attacker's code>&state=<attacker's state>.
- **Expected:** Either binding to a session cookie blocks attempt, or it succeeds (current code only checks state shape, not session). Document — file finding if no binding.
- **Severity:** high

## TC-SEC-CSRF-005 — OAuth state nonce reuse
- **Steps:** Reuse same state encoded JSON twice.
- **Expected:** Both succeed (no nonce store). File finding.
- **Severity:** high

## TC-SEC-CSRF-006 — OAuth state from prod replayed on staging
- **Severity:** medium

## TC-SEC-CSRF-007 — OAuth callback when user already logged in: account swap
- **Steps:** User logged in as A, completes OAuth as B in same browser.
- **Expected:** New tokens issued for B; old session ends. Document.
- **Severity:** high

## TC-SEC-CSRF-008 — OAuth callback returnTo poisoning blocked at sanitiser
- **Severity:** high

## TC-SEC-CSRF-009 — Form-based CSRF on PATCH /workspaces (cross-origin)
- **Severity:** smoke

## TC-SEC-CSRF-010 — Form-based CSRF on DELETE /workspaces
- **Severity:** smoke

## TC-SEC-CORS-001 — Preflight from staging.doable.me succeeds
- **Severity:** smoke

## TC-SEC-CORS-002 — Preflight from doable.me apex (or whatever wildcard) succeeds if allowed
- **Severity:** medium

## TC-SEC-CORS-003 — Preflight from evil.example denied (no ACAO header echoed)
- **Severity:** smoke

## TC-SEC-CORS-004 — Preflight from `null` Origin denied
- **Severity:** high

## TC-SEC-CORS-005 — Preflight with `Origin: https://staging-doable.me.evil.example` (suffix attack) denied
- **Severity:** high

## TC-SEC-CORS-006 — Preflight with `Origin: https://Staging.doable.me` (case) — record behavior
- **Severity:** medium

## TC-SEC-CORS-007 — Preflight with `Origin: https://staging.doable.me/` (trailing slash) — typically denied
- **Severity:** medium

## TC-SEC-CORS-008 — Allowed methods (`Access-Control-Allow-Methods`) doesn't include `PUT` if API doesn't expose any
- **Severity:** low

## TC-SEC-CORS-009 — Allowed headers includes `authorization, content-type`
- **Severity:** smoke

## TC-SEC-CORS-010 — `Access-Control-Allow-Credentials: true` only when Origin in allow-list
- **Severity:** medium

## TC-SEC-CORS-011 — Vary: Origin in responses
- **Severity:** medium

## TC-SEC-CORS-012 — `Access-Control-Max-Age` reasonable (≤ 600s)
- **Severity:** low

## TC-SEC-CORS-013 — Subdomain spoofing: `*.doable.me` allow-list rejects `evil.doable.me.attacker.com`
- **Severity:** smoke

## TC-SEC-CORS-014 — Wildcard ACAO never returned with credentials
- **Severity:** smoke

## TC-SEC-CORS-015 — CORS denies preflight for non-listed methods (e.g., TRACE)
- **Severity:** medium

## TC-SEC-HEAD-001 — Strict-Transport-Security header set
- **Steps:** Inspect any HTTPS response.
- **Expected:** `max-age >= 15552000; includeSubDomains` (or per Cloudflare).
- **Severity:** medium

## TC-SEC-HEAD-002 — X-Content-Type-Options: nosniff
- **Severity:** medium

## TC-SEC-HEAD-003 — Referrer-Policy strict
- **Severity:** medium

## TC-SEC-HEAD-004 — X-Frame-Options DENY (or CSP frame-ancestors 'none')
- **Severity:** smoke

## TC-SEC-HEAD-005 — Cross-Origin-Opener-Policy
- **Severity:** medium

## TC-SEC-HEAD-006 — Cross-Origin-Resource-Policy
- **Severity:** medium

## TC-SEC-HEAD-007 — Permissions-Policy minimal
- **Severity:** low

## TC-SEC-HEAD-008 — Server header doesn't leak version
- **Severity:** low

## TC-SEC-HEAD-009 — X-Powered-By header absent
- **Severity:** low

## TC-SEC-HEAD-010 — Cache-Control on /auth/* responses is `no-store`
- **Severity:** medium

## TC-SEC-CSP-001 — Web app has CSP header on HTML responses
- **Steps:** Inspect /login response from staging.doable.me.
- **Expected:** `Content-Security-Policy` present.
- **Severity:** smoke

## TC-SEC-CSP-002 — CSP includes `default-src 'self'`
- **Severity:** medium

## TC-SEC-CSP-003 — CSP `script-src` excludes `'unsafe-eval'`
- **Severity:** medium

## TC-SEC-CSP-004 — CSP `script-src` excludes `'unsafe-inline'` (or uses nonce)
- **Severity:** medium

## TC-SEC-CSP-005 — CSP `frame-ancestors 'none'`
- **Severity:** medium

## TC-SEC-CSP-006 — CSP `connect-src` allows api.staging.doable.me only
- **Severity:** medium

## TC-SEC-CSP-007 — CSP `img-src` allows data: but not arbitrary http
- **Severity:** medium

## TC-SEC-CSP-008 — CSP `object-src 'none'`
- **Severity:** medium

## TC-SEC-CSP-009 — CSP report-uri / report-to configured
- **Severity:** low

## TC-SEC-CSP-010 — CSP doesn't break Monaco editor
- **Steps:** Open editor.
- **Expected:** No CSP violation in console.
- **Severity:** smoke

## TC-SEC-COOKIE-001 — If any auth cookie exists, set Secure
- **Severity:** smoke

## TC-SEC-COOKIE-002 — If any auth cookie, set HttpOnly
- **Severity:** smoke

## TC-SEC-COOKIE-003 — If any auth cookie, SameSite=Lax or Strict
- **Severity:** smoke

## TC-SEC-COOKIE-004 — Domain attribute scoped to `.doable.me` (not unrelated)
- **Severity:** medium

## TC-SEC-COOKIE-005 — No cookies leaked across env (staging vs prod isolation)
- **Severity:** medium

## TC-SEC-COOKIE-006 — Path attribute restrictive when applicable
- **Severity:** low

## TC-SEC-COOKIE-007 — Cookies not set by API responses (token-only)
- **Severity:** smoke
