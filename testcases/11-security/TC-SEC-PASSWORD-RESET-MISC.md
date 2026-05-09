# TC-SEC-PASSWORD-RESET-MISC — Reset token reuse, expiry, leakage; misc security

## TC-SEC-RESET-001 — Reset token cannot be reused after first use
- **Severity:** smoke

## TC-SEC-RESET-002 — Reset token cannot be used past `expires_at`
- **Severity:** smoke

## TC-SEC-RESET-003 — Reset token in DB is sha256 hash, not plaintext
- **Severity:** smoke

## TC-SEC-RESET-004 — Reset URL token does not appear in API logs
- **Steps:** Inspect logs after forgot/reset.
- **Expected:** Token absent or redacted.
- **Severity:** smoke

## TC-SEC-RESET-005 — Reset URL token does not appear in xray spans
- **Severity:** smoke

## TC-SEC-RESET-006 — Reset URL token not in Referer when user clicks email link
- **Steps:** From email link, check Referer to API.
- **Expected:** Frontend uses POST so no Referer leak; document.
- **Severity:** medium

## TC-SEC-RESET-007 — Reset email cannot be redirected via Host header injection
- **Steps:** Trigger forgot with `Host: evil.example`.
- **Expected:** Reset URL based on FRONTEND_URL env var, not request Host.
- **Severity:** smoke

## TC-SEC-RESET-008 — Reset password complexity NOT enforced (drift from register schema)
- **Severity:** high

## TC-SEC-RESET-009 — Reset triggers refresh token revocation for ALL sessions
- **Severity:** smoke

## TC-SEC-RESET-010 — Reset does not affect access token (still valid until exp)
- **Severity:** medium

## TC-SEC-RESET-011 — Reset notifies user via confirmation email (recommended; check)
- **Severity:** low

## TC-SEC-RESET-012 — Reset on OAuth-only account allows password takeover via email access
- **Severity:** high

## TC-SEC-RESET-013 — Reset on disabled/banned user blocked (if such state exists)
- **Severity:** medium

## TC-SEC-RESET-014 — Reset token entropy ≥ 256 bits (32 random bytes)
- **Severity:** smoke

## TC-SEC-RESET-015 — Reset token URL not bookmarked / cached by browsers (Cache-Control)
- **Severity:** medium

## TC-SEC-MISC-001 — Bcrypt/Argon2 hash isn't logged
- **Severity:** smoke

## TC-SEC-MISC-002 — Errors don't leak stack traces in production
- **Severity:** smoke

## TC-SEC-MISC-003 — All API endpoints over HTTPS only
- **Severity:** smoke

## TC-SEC-MISC-004 — All services bind to 127.0.0.1 (per CLAUDE.md)
- **Steps:** SSH to staging, run `ss -tlnp`.
- **Expected:** No 0.0.0.0 listeners.
- **Severity:** smoke

## TC-SEC-MISC-005 — JWT_SECRET length ≥ 256 bits
- **Steps:** Inspect env (do NOT log raw value).
- **Expected:** Cryptographically strong.
- **Severity:** medium

## TC-SEC-MISC-006 — JWT_ISSUER non-default
- **Severity:** low

## TC-SEC-MISC-007 — Database password not exposed in env to frontend
- **Severity:** smoke

## TC-SEC-MISC-008 — `.env` files have permissions 600 / 640 (per dodev_security_posture memory)
- **Severity:** high

## TC-SEC-MISC-009 — Postgres `listen_addresses = 'localhost'`
- **Severity:** smoke

## TC-SEC-MISC-010 — Caddy bind 127.0.0.1
- **Severity:** smoke

## TC-SEC-MISC-011 — UFW firewall: only SSH allowed inbound publicly
- **Severity:** smoke

## TC-SEC-MISC-012 — Cloudflared tunnel only inbound for HTTP(s)
- **Severity:** medium

## TC-SEC-MISC-013 — Email content sanitized for HTML
- **Severity:** medium

## TC-SEC-MISC-014 — Outgoing email FROM matches verified domain (SPF/DKIM/DMARC pass)
- **Severity:** medium

## TC-SEC-MISC-015 — Webhooks (if any) signed with HMAC
- **Severity:** medium

## TC-SEC-MISC-016 — Connector OAuth tokens encrypted at rest
- **Severity:** smoke

## TC-SEC-MISC-017 — GitHub OAuth tokens encrypted at rest
- **Severity:** smoke

## TC-SEC-MISC-018 — User export (GDPR) endpoint authenticated and only returns own data
- **Severity:** medium

## TC-SEC-MISC-019 — Account deletion endpoint cascades cleanly (no orphan rows)
- **Severity:** medium

## TC-SEC-MISC-020 — Rate-limit on account deletion (defence against drive-by)
- **Severity:** medium

## TC-SEC-MISC-021 — Subresource Integrity (SRI) on third-party scripts
- **Severity:** low

## TC-SEC-MISC-022 — Trusted Types (CSP) where applicable
- **Severity:** low

## TC-SEC-MISC-023 — Dependency audit: no known critical CVEs in production
- **Severity:** medium

## TC-SEC-MISC-024 — `npm audit` / `pnpm audit` clean for high/critical
- **Severity:** medium

## TC-SEC-MISC-025 — Audit log records auth events (login success/failure, reset, role change)
- **Severity:** medium

## TC-SEC-MISC-026 — Audit log accessible only to platform admins
- **Severity:** smoke

## TC-SEC-MISC-027 — Admin /admin/* routes protected by `is_platform_admin`
- **Severity:** smoke

## TC-SEC-MISC-028 — Cross-site WebSocket hijacking prevented (Origin check on WS)
- **Steps:** Open WS with `Origin: https://evil.example` and stolen token.
- **Expected:** Refused.
- **Severity:** smoke

## TC-SEC-MISC-029 — WebSocket auth via token query string redacted in logs
- **Severity:** medium

## TC-SEC-MISC-030 — Server timing header doesn't leak DB latency in detail
- **Severity:** low

## TC-SEC-MISC-031 — Static asset path traversal blocked at Caddy
- **Severity:** smoke

## TC-SEC-MISC-032 — Published-site subdomain isolation (one site can't read another's cookies)
- **Severity:** smoke

## TC-SEC-MISC-033 — Published site cookies set with proper SameSite
- **Severity:** medium

## TC-SEC-MISC-034 — Published-site CSP applied
- **Severity:** medium

## TC-SEC-MISC-035 — Sandbox runtime cannot escape per dovault rules (cross-platform)
- **Severity:** smoke

## TC-SEC-MISC-036 — Vite-jail bypass mitigations (per dodev memory)
- **Severity:** high

## TC-SEC-MISC-037 — Squid egress jail rules enforced (per dodev memory)
- **Severity:** medium

## TC-SEC-MISC-038 — Per-project sandbox cannot read sibling project files
- **Severity:** smoke

## TC-SEC-MISC-039 — Sandbox cannot read .env files
- **Severity:** smoke

## TC-SEC-MISC-040 — Sandbox cannot reach 169.254.169.254 (cloud metadata)
- **Severity:** smoke

## TC-SEC-MISC-041 — Sandbox cannot reach 127.0.0.1:5432 (Postgres)
- **Severity:** smoke

## TC-SEC-MISC-042 — Sandbox cannot reach private IPs
- **Severity:** medium

## TC-SEC-MISC-043 — File upload virus scanning (if any)
- **Severity:** medium

## TC-SEC-MISC-044 — File upload size limits per plan enforced server-side
- **Severity:** smoke

## TC-SEC-MISC-045 — File upload type whitelist enforced (e.g., no .exe)
- **Severity:** medium

## TC-SEC-MISC-046 — File upload Content-Type vs sniffed type mismatched → reject
- **Severity:** medium

## TC-SEC-MISC-047 — User input length limits prevent log flooding
- **Severity:** low

## TC-SEC-MISC-048 — Trace IDs included in error responses for debugging
- **Severity:** low

## TC-SEC-MISC-049 — Trace IDs not used to enumerate resources
- **Severity:** low

## TC-SEC-MISC-050 — IP allow-list for /admin (if configured)
- **Severity:** low
