# TC-INTEG-CONNECT — Connect integrations (PKCE OAuth)

Covers /integrations/enhanced-auth start + callback at /integrations/enhanced-auth/callback, PKCE, state, account selection, multi-account support, edge cases.

> **Path note (2026-05-09 corpus run):** the legacy OAuth start path is `GET /integrations/oauth/:id/authorize` (not `/integrations/oauth/:id/start`). The OAuth callback at `GET /integrations/oauth/callback` returns **302** to `<origin>/settings/integrations?error=...` when params are missing (NOT 400). Source: `services/api/src/routes/integrations-oauth.ts:33,75` and `services/api/src/routes/integrations-enhanced-auth.ts:65`. Tests must allow 302 on missing-code/state callback.

## TC-INTEG-CONNECT-001 — Start OAuth GitHub (smoke)
- **Steps:** GET /integrations/enhanced-auth/start?slug=github
- **Expected:** 302 to provider with state + code_challenge
- **Severity:** smoke

## TC-INTEG-CONNECT-002 — Start sets state cookie
- **Severity:** high

## TC-INTEG-CONNECT-003 — State cookie SameSite=Lax + Secure + httpOnly
- **Severity:** critical

## TC-INTEG-CONNECT-004 — PKCE code_verifier stored server-side
- **Severity:** critical

## TC-INTEG-CONNECT-005 — Callback exchanges code → tokens
- **Severity:** smoke

## TC-INTEG-CONNECT-006 — Callback persists to integration_connections
- **Expected:** row with userId, workspaceId, providerSlug, accountId, scopes, encrypted tokens
- **Severity:** smoke

## TC-INTEG-CONNECT-007 — State mismatch rejected
- **Severity:** critical

## TC-INTEG-CONNECT-008 — Code reuse rejected
- **Severity:** critical

## TC-INTEG-CONNECT-009 — Code expired rejected by provider
- **Severity:** medium

## TC-INTEG-CONNECT-010 — Provider error param surfaced
- **Severity:** medium

## TC-INTEG-CONNECT-011 — User denies consent
- **Severity:** medium

## TC-INTEG-CONNECT-012 — Open-redirect prevented (callback redirect to safe paths)
- **Severity:** critical

## TC-INTEG-CONNECT-013 — Multi-account support: same provider twice with distinct accounts
- **Severity:** high

## TC-INTEG-CONNECT-014 — Re-auth same account refreshes scopes only
- **Severity:** medium

## TC-INTEG-CONNECT-015 — Connect via popup with postMessage close
- **Severity:** smoke

## TC-INTEG-CONNECT-016 — Connect via redirect flow returns to /integrations
- **Severity:** smoke

## TC-INTEG-CONNECT-017 — UI shows connecting spinner then success toast
- **Severity:** smoke

## TC-INTEG-CONNECT-018 — Callback handles network drop with idempotent retry
- **Severity:** medium

## TC-INTEG-CONNECT-019 — Tokens encrypted at rest
- **Severity:** critical

## TC-INTEG-CONNECT-020 — Tokens never returned via API
- **Severity:** critical

## TC-INTEG-CONNECT-021 — Connection scoped to workspace by default
- **Severity:** high

## TC-INTEG-CONNECT-022 — Personal connection scope (when supported)
- **Severity:** medium

## TC-INTEG-CONNECT-023 — Audit log entry on connect
- **Severity:** high

## TC-INTEG-CONNECT-024 — Audit includes provider, accountId, scopes
- **Severity:** medium

## TC-INTEG-CONNECT-025 — Audit immutable
- **Severity:** high

## TC-INTEG-CONNECT-026 — Connect blocked when over plan limit
- **Severity:** medium

## TC-INTEG-CONNECT-027 — Connect blocked when feature flag disabled per workspace
- **Severity:** medium

## TC-INTEG-CONNECT-028 — Provider rate-limit handled with backoff
- **Severity:** medium

## TC-INTEG-CONNECT-029 — Provider issues short-lived token + refresh token
- **Severity:** high

## TC-INTEG-CONNECT-030 — Refresh token persisted with rotation
- **Severity:** high

## TC-INTEG-CONNECT-031 — Refresh on first action call after expiry
- **Severity:** high

## TC-INTEG-CONNECT-032 — Refresh failure surfaces "reconnect" CTA
- **Severity:** high

## TC-INTEG-CONNECT-033 — Concurrent refresh deduped
- **Severity:** medium

## TC-INTEG-CONNECT-034 — User profile fetched on connect (account email)
- **Severity:** medium

## TC-INTEG-CONNECT-035 — Account label editable post-connect
- **Severity:** low

## TC-INTEG-CONNECT-036 — Connect logs do not contain code or tokens
- **Severity:** critical

## TC-INTEG-CONNECT-037 — CSRF protection on start endpoint
- **Severity:** high

## TC-INTEG-CONNECT-038 — Callback path matches OAuth redirect URI registered
- **Severity:** critical

## TC-INTEG-CONNECT-039 — Subdomain prefix-matching trick documented & secure
- **Severity:** high

## TC-INTEG-CONNECT-040 — Callback on wrong env redirects to correct env
- **Severity:** medium

## TC-INTEG-CONNECT-041 — Connect with previously revoked account starts fresh
- **Severity:** medium

## TC-INTEG-CONNECT-042 — Connect with disabled provider returns 403
- **Severity:** medium

## TC-INTEG-CONNECT-043 — Connect on unknown slug returns 404
- **Severity:** low

## TC-INTEG-CONNECT-044 — Connect throttled by IP after 10 starts/min
- **Severity:** medium

## TC-INTEG-CONNECT-045 — Connect concurrent attempts handled
- **Severity:** medium
