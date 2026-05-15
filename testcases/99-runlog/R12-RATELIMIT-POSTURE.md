# R12 — dodev Security Posture Verification
**Date:** 2026-05-15  
**Target:** dodev.fid.pw (DEV server — NOT prod)  
**Branch tested against:** fix/cors-disallowed-origin-short-circuit  
**Tester:** QA posture agent (read-only — no changes applied)

---

## Rate-Limit Posture

| Variable | Value in .env | Status |
|---|---|---|
| `RATE_LIMIT_DISABLED` | **NOT SET** | RATE LIMITS ARE ON (default) |
| `RATELIMIT_*` | NOT SET | — |
| `DISABLE_RATE_*` | NOT SET | — |

**Observed behaviour:** 6 rapid bogus POST `/auth/login` requests all returned HTTP 401 (never 429). This is consistent with rate limiting being disabled OR the threshold being higher than 6 attempts in the test window.

**Operator action required:** Add `RATE_LIMIT_DISABLED=true` to `/root/doable/.env` on dodev to explicitly disable rate limiting for QA campaigns. Do NOT apply without operator approval.

---

## Network Binding (ss -tlnp)

| Service | Bind Address | Status |
|---|---|---|
| Caddy (8080) | 127.0.0.1 | PASS |
| PostgreSQL (5432) | 127.0.0.1 | PASS |
| API (4000) | 127.0.0.1 | PASS |
| WS (4001) | 127.0.0.1 | PASS |
| Next.js (3000) | 127.0.0.1 | PASS |
| Caddy admin (2019) | 127.0.0.1 | PASS |
| cloudflared (20241) | 127.0.0.1 | PASS |
| Squid proxy (3128) | 127.0.0.1 | PASS |
| sshd (22) | 0.0.0.0 + [::] | EXPECTED (SSH must be public) |
| systemd-resolved (53) | 127.0.0.53, 127.0.0.54 | EXPECTED (loopback DNS) |

**Result: PASS** — No application service binds to 0.0.0.0. Only sshd on :22 is public, which is correct and expected.

---

## Infrastructure Services

| Check | Result | Status |
|---|---|---|
| cloudflared systemd | active (running) since 2026-05-12 | PASS |
| doable.service systemd | active (running) since 2026-05-15 05:36 | PASS |
| tmux session `doable` windows | api, web, ws processes confirmed via ps (api=pid 789784 on :4000, ws=pid 789778 on :4001, web=pid 681379 on :3000) | PASS |
| tmux `list-windows` CLI | CANNOT VERIFY — tmux socket inaccessible from root SSH session (server runs as user `doable`; socket at /tmp/tmux-5000/default is stale) | WARN |

**Note on tmux:** The `doable.service` systemd unit spawns tmux as user `doable` (uid 5000). When SSHed as root, `tmux list-windows` fails because the socket is owned by `doable`. However all three processes (api, ws, web) are confirmed running via `ps aux` and ports are bound correctly. This is a socket-permission quirk, not a service failure.

**Cloudflared error log note:** cloudflared showed repeated `connection refused` errors to 127.0.0.1:4000 around 05:32–05:36 CEST. The doable.service restarted at 05:36 and the API is now listening on :4000. The errors are historical from before the restart.

---

## Security Feature Scoreboard

| # | Feature | Test | Expected | Actual | Status |
|---|---|---|---|---|---|
| 1 | CORS — evil origin blocked | OPTIONS `https://dev-api.doable.me/auth/login` with `Origin: https://evil.example.com` | No `Access-Control-Allow-Origin` header | No ACAO header in response | PASS |
| 2 | CORS — legit origin allowed | OPTIONS with `Origin: https://dev.doable.me` | `Access-Control-Allow-Origin: https://dev.doable.me` | `access-control-allow-origin: https://dev.doable.me` | PASS |
| 3 | Cookie flags | POST `/auth/login` inspect Set-Cookie | Secure + HttpOnly + SameSite | Auth is token-in-body (`tokens.accessToken`), no Set-Cookie header issued | N/A — token-based auth, not cookie-based |
| 4 | CSP header | GET `https://dev.doable.me` | Content-Security-Policy present and restrictive | Present: `default-src 'self'; script-src 'self' 'unsafe-inline' ...` | PASS (note: `unsafe-inline` on script-src is a known weak point but non-critical for dev) |
| 5 | HSTS | curl -I `https://dev.doable.me` | Strict-Transport-Security present | `strict-transport-security: max-age=31536000; includeSubDomains; preload` | PASS |
| 6 | MFA endpoint | GET `/auth/mfa/status` with valid JWT | HTTP 200, not 500 | `{"enabled":false}` HTTP 200 | PASS |
| 7 | JWT rejection | GET `/me` with forged JWT | HTTP 401 | HTTP 401 | PASS |
| 8 | RLS — cross-tenant isolation | GET `/projects/<user1-project>` with user2 JWT | HTTP 403 or 404 | HTTP 404 | PASS |
| 9 | No 0.0.0.0 binding | ss -tlnp | All app services on 127.0.0.1 | All app services on 127.0.0.1 | PASS |
| 10 | Security response headers | curl -I dev-api.doable.me | x-frame-options, x-content-type-options, HSTS, referrer-policy | All present on API responses | PASS |

**Security score: 9/9 applicable checks PASS** (cookie check N/A — token-in-body auth pattern).

---

## ENV Summary (security-relevant, non-secret)

```
NODE_ENV=development
API_HOST=127.0.0.1
WS_HOST=127.0.0.1
CORS_ORIGINS=https://dev.doable.me
JWT_ACCESS_TOKEN_EXPIRES_IN=4h
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
# RATE_LIMIT_DISABLED — NOT SET (rate limits are ON by default)
```

---

## Operator Action Items

| Priority | Item | Action |
|---|---|---|
| HIGH | Rate limit not explicitly disabled on dodev | Add `RATE_LIMIT_DISABLED=true` to `/root/doable/.env` on dodev.fid.pw for QA campaigns. Restore (remove or set false) after QA. |
| LOW | `unsafe-inline` in script-src CSP | Acceptable for dev; track for tightening in prod. |
| INFO | tmux socket not accessible from root SSH | No action needed — services confirmed running. Consider adding `tmux list-windows` to a health-check script that runs as user `doable`. |
| INFO | cloudflared logged :4000 refused before 05:36 restart | Historical; resolved. No action. |

---

## Summary

- **Rate-limit posture:** ON (no RATE_LIMIT_DISABLED var set) — RECOMMEND adding `RATE_LIMIT_DISABLED=true` for QA
- **Security features:** 9/9 PASS
- **Network binding:** PASS (no 0.0.0.0 exposure except sshd)
- **Infrastructure:** PASS (cloudflared active, doable.service active, all 3 services running)
