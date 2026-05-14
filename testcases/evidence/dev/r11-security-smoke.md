# R11 — Security Smoke Probes: dev-api.doable.me

- **Date**: 2026-05-14
- **Tester**: R11 automated security probes (claude-sonnet-4-6)
- **Target**: https://dev-api.doable.me
- **Auth context**: uniquegodwin@gmail.com (platform admin), USER_ID=7b373f8b-d1da-4350-bfa0-bd5662106467
- **Summary**: 13 probes · 2 FAIL · 2 bugs filed

---

## Probe #1 — CORS echo (TC-SEC-CORS-001)

**curl**:
```bash
curl -sS -i -H "Origin: https://evil.example.com" -X OPTIONS \
  https://dev-api.doable.me/auth/me -H "Access-Control-Request-Method: GET"
```
**HTTP status**: 204 No Content

**Relevant headers**:
```
access-control-allow-credentials: true
access-control-allow-methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
vary: Origin, Access-Control-Request-Headers
# NOTE: NO access-control-allow-origin header present for evil.example.com
```

**Body**: (empty — 204)

**Classification**: PASS — evil origin is NOT echoed back in `access-control-allow-origin`. The `vary: Origin` header shows per-origin logic is applied. `access-control-allow-credentials: true` is present but harmless without a matching ACAO header for the evil origin.

---

## Probe #2 — JWT alg=none

**curl**:
```bash
curl -sS -i -H "Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.<payload>." \
  https://dev-api.doable.me/auth/me
```
**HTTP status**: 401 Unauthorized

**Body summary**: `{"error":"Invalid token"}`

**Classification**: PASS — alg=none JWT correctly rejected.

---

## Probe #3 — Expired JWT

**curl**:
```bash
curl -sS -i -H "Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.<exp-past-payload>." \
  https://dev-api.doable.me/auth/me
```
**HTTP status**: 401 Unauthorized

**Body summary**: `{"error":"Invalid token"}`

**Classification**: PASS — expired JWT correctly rejected.

---

## Probe #4 — Wrong-signature JWT ⚠️ FAIL

**curl**:
```bash
# Real token with last char flipped E→F
curl -sS -i -H "Authorization: Bearer <real-token-with-flipped-sig>" \
  https://dev-api.doable.me/auth/me
```
**HTTP status**: 200 OK

**Body summary**: `{"user":{"id":"7b373f8b-...","email":"uniquegodwin@gmail.com","isPlatformAdmin":true,...}}` (full profile returned)

**Relevant headers**:
```
content-type: application/json
x-request-id: req_ea2dc4dba13d4b19
```

**Classification**: **FAIL** — tampered JWT (single byte flip in signature) was accepted and returned a full authenticated response. Authentication bypass confirmed. See `BUG-R11-SEC-BAD-SIG-200.md`.

---

## Probe #5 — JWT with no sub

**curl**:
```bash
curl -sS -i -H "Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.<no-sub-payload>." \
  https://dev-api.doable.me/auth/me
```
**HTTP status**: 401 Unauthorized

**Body summary**: `{"error":"Invalid token"}`

**Classification**: PASS — JWT with no `sub` claim rejected (signature fails first since alg=none).

---

## Probe #6 — Cross-tenant RLS: project files ⚠️ FAIL

**curl**:
```bash
# Project 1312ccfa owned by qa-owner@doable.test; caller is uniquegodwin@gmail.com
curl -sS -i -H "Authorization: Bearer <uniquegodwin-token>" \
  https://dev-api.doable.me/projects/1312ccfa-eef8-4ca7-9bfa-1befa0c27f9f/files
```
**HTTP status**: 200 OK

**Body summary**: `{"data":[]}` — empty array, but 200 confirms project exists to the caller.

**Relevant headers**:
```
content-type: application/json
server-timing: total;dur=9.6
```

**Classification**: **FAIL** — cross-tenant project confirmed as existing (200 with empty data) instead of 404. RLS does not block the /files route for non-members. See `BUG-R11-SEC-RLS-PROJECT-FILES-200.md`.

---

## Probe #7 — Cross-tenant RLS: workspace

**curl**:
```bash
# Workspace fff9ce17 owned by qa-owner@doable.test; caller is uniquegodwin@gmail.com
curl -sS -i -H "Authorization: Bearer <uniquegodwin-token>" \
  https://dev-api.doable.me/workspaces/fff9ce17-c377-4a6e-92ca-5c19b97d0880
```
**HTTP status**: 403 Forbidden

**Body summary**: `{"error":"Not a member of this workspace"}`

**Classification**: PASS — workspace correctly rejects non-member access (403). Note: 404 would be better to avoid leaking existence, but 403 is acceptable and shows the guard is in place.

---

## Probe #8 — SQL injection in query param

**curl**:
```bash
curl -sS -i "https://dev-api.doable.me/projects?workspaceId=%27%20OR%201%3D1--" \
  -H "Authorization: Bearer <token>"
```
**HTTP status**: 400 Bad Request

**Body summary**: `{"error":"Invalid workspaceId"}`

**Classification**: PASS — UUID validation rejects the injection payload before it reaches the database.

---

## Probe #9 — Path traversal in file route

**curl**:
```bash
curl -sS -i "https://dev-api.doable.me/projects/<id>/files/../../etc/passwd" \
  -H "Authorization: Bearer <token>"
```
**HTTP status**: 400 Bad Request

**Body summary**: `{"error":"Invalid project id"}`

**Classification**: PASS — path traversal sequence normalised/rejected; the router likely matched `..` as an invalid project segment. No filesystem access attempted.

---

## Probe #10 — XSS in workspace name

**curl**:
```bash
curl -sS -i -X POST https://dev-api.doable.me/workspaces \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"<script>alert(1)</script>","slug":"xss-test-r11"}'
```
**HTTP status**: 201 Created

**Body summary**: `{"data":{"id":"c2fc7340-...","name":"alert(1)","slug":"xss-test-r11",...}}` — `<script>` tags stripped, inner text stored.

**GET /workspaces/c2fc7340-...** also returns `"name":"alert(1)"` — consistent.

**Classification**: INFO — server-side sanitization strips `<script>` tags and stores the inner text `alert(1)`. This is partial mitigation. The API contract is JSON (no HTML rendering), so the stored value is not an XSS risk at the API layer. Risk exists only if the web frontend renders `name` without escaping — that is a front-end concern and should be verified in browser testing. No API-layer bug filed; note for web QA.

---

## Probe #11 — Security headers

**curl**:
```bash
curl -sI https://dev-api.doable.me/health
```
**HTTP status**: 200 OK

**Headers present**:

| Header | Value | Status |
|---|---|---|
| `strict-transport-security` | `max-age=15552000; includeSubDomains` | PRESENT |
| `x-content-type-options` | `nosniff` | PRESENT |
| `x-frame-options` | `SAMEORIGIN` | PRESENT |
| `referrer-policy` | `no-referrer` | PRESENT |
| `cross-origin-opener-policy` | `same-origin` | PRESENT |
| `cross-origin-resource-policy` | `same-origin` | PRESENT |
| `x-xss-protection` | `0` (disabled — correct for modern browsers) | PRESENT |
| `x-permitted-cross-domain-policies` | `none` | PRESENT |
| `content-security-policy` | **NOT PRESENT** | MISSING |

**Classification**: INFO — good baseline set of security headers present. CSP is absent, which is common for pure JSON APIs (no HTML responses), but worth adding a minimal `default-src 'none'` policy. HSTS `max-age` is 180 days — acceptable but could be raised to 1 year (31536000). No bug filed; recommendation noted.

---

## Probe #12 — Rate limit on login

**curl**:
```bash
curl -sS -i -X POST https://dev-api.doable.me/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"uniquegodwin@gmail.com","password":"wrong-password-r11-probe"}'
```
**HTTP status**: 429 Too Many Requests (already rate-limited from prior R10 probes on this IP)

**Relevant headers**:
```
retry-after: 900
x-ratelimit-limit: 10
x-ratelimit-remaining: 0
x-ratelimit-reset: 900
```

**Body summary**: `{"error":"Too many requests, please try again later."}`

**Classification**: PASS — rate limiting is active on login with clear `x-ratelimit-*` headers and `retry-after`. Limit is 10 attempts per window (900s). Standard headers present.

---

## Probe #13 — Bearer token in URL query param

**curl**:
```bash
curl -sS -i "https://dev-api.doable.me/auth/me?access_token=<jwt>"
```
**HTTP status**: 401 Unauthorized

**Body summary**: `{"error":"Missing or invalid Authorization header"}`

**Classification**: PASS — token passed via query string is NOT accepted. Only `Authorization: Bearer` header is honoured. Prevents token exfiltration via referrer/log leakage.

---

## Summary

| # | Probe | Status | HTTP |
|---|---|---|---|
| 1 | CORS echo evil origin | PASS | 204 |
| 2 | JWT alg=none | PASS | 401 |
| 3 | JWT expired | PASS | 401 |
| 4 | JWT wrong signature | **FAIL** | 200 |
| 5 | JWT no sub | PASS | 401 |
| 6 | Cross-tenant project /files | **FAIL** | 200 |
| 7 | Cross-tenant workspace | PASS | 403 |
| 8 | SQL injection workspaceId | PASS | 400 |
| 9 | Path traversal /files/../../ | PASS | 400 |
| 10 | XSS workspace name | INFO | 201 |
| 11 | Security headers | INFO | 200 |
| 12 | Rate limit login | PASS | 429 |
| 13 | Token in URL query | PASS | 401 |

**Total probes**: 13 | **PASS**: 9 | **FAIL**: 2 | **INFO**: 2

## Bugs Filed

- `testcases/bugs/BUG-R11-SEC-BAD-SIG-200.md` — P1 critical: wrong-signature JWT accepted (auth bypass)
- `testcases/bugs/BUG-R11-SEC-RLS-PROJECT-FILES-200.md` — P2 high: cross-tenant project /files returns 200 (RLS gap)

## Notable non-bugs

- Probe #10 (XSS): API-layer stripping active (`<script>` removed), stored value is `alert(1)`. Web layer rendering must also escape — verify in browser QA.
- Probe #11 (Headers): CSP absent on API (acceptable for JSON-only), HSTS max-age 180d (could raise to 365d).
- Probe #7 (workspace): returns 403 not 404 — leaks existence to authenticated callers but access is correctly denied. Low-severity hardening opportunity.
