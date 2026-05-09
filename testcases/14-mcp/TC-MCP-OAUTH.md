# TC-MCP-OAUTH — MCP connector OAuth flow

Covers OAuth-based MCP connectors (Supabase, GitHub, custom): start, callback, token storage, refresh, revoke, error paths, state mismatch, code reuse.

## TC-MCP-OAUTH-001 — Start OAuth for Supabase MCP connector (smoke)
- **Steps:** GET /mcp/connectors/supabase/oauth/start
- **Expected:** redirect to provider with state, code_challenge (PKCE)
- **Severity:** smoke

## TC-MCP-OAUTH-002 — OAuth callback persists tokens
- **Pre:** completed flow
- **Steps:** GET /mcp/connectors/supabase/oauth/callback
- **Expected:** tokens encrypted-at-rest in mcp_connector_tokens
- **Severity:** smoke

## TC-MCP-OAUTH-003 — State mismatch rejected
- **Steps:** callback with wrong state
- **Expected:** 400 with "state_mismatch"
- **Severity:** critical

## TC-MCP-OAUTH-004 — Code reuse rejected
- **Steps:** callback twice with same code
- **Expected:** second 400; tokens not double-issued
- **Severity:** critical

## TC-MCP-OAUTH-005 — PKCE verifier mismatch rejected
- **Severity:** critical

## TC-MCP-OAUTH-006 — Provider error returned to UI
- **Pre:** provider returns error param
- **Severity:** medium

## TC-MCP-OAUTH-007 — User denies consent
- **Severity:** medium

## TC-MCP-OAUTH-008 — Network drop mid-callback retried
- **Severity:** low

## TC-MCP-OAUTH-009 — Token refresh on expiry
- **Pre:** access token expired
- **Steps:** invoke tool
- **Expected:** refresh occurs transparently; new tokens stored
- **Severity:** high

## TC-MCP-OAUTH-010 — Refresh token revoked → reauth required
- **Severity:** high

## TC-MCP-OAUTH-011 — Refresh failure returns 401 to user; UI prompts reconnect
- **Severity:** high

## TC-MCP-OAUTH-012 — Revoke connector revokes provider tokens
- **Steps:** DELETE /mcp/connectors/:id
- **Expected:** provider revoke endpoint called best-effort; local row deleted
- **Severity:** high

## TC-MCP-OAUTH-013 — Tokens encrypted at rest with KMS key
- **Severity:** critical

## TC-MCP-OAUTH-014 — Tokens not returned in any GET endpoint
- **Severity:** critical

## TC-MCP-OAUTH-015 — Cross-tenant token access denied
- **Severity:** critical

## TC-MCP-OAUTH-016 — OAuth scope minimal
- **Severity:** high

## TC-MCP-OAUTH-017 — OAuth scope upgrade flow re-prompts user
- **Severity:** medium

## TC-MCP-OAUTH-018 — Multiple connector accounts per user
- **Severity:** medium

## TC-MCP-OAUTH-019 — Switching primary account
- **Severity:** medium

## TC-MCP-OAUTH-020 — Connector OAuth audit trail
- **Severity:** high

## TC-MCP-OAUTH-021 — Audit includes provider, account email/id, action
- **Severity:** medium

## TC-MCP-OAUTH-022 — OAuth start sets short-lived state cookie
- **Severity:** high

## TC-MCP-OAUTH-023 — State cookie SameSite=Lax + Secure
- **Severity:** high

## TC-MCP-OAUTH-024 — OAuth start blocked when feature flag off
- **Severity:** medium

## TC-MCP-OAUTH-025 — OAuth callback redirect to safe URL only (open-redirect prevention)
- **Severity:** critical

## TC-MCP-OAUTH-026 — Token rotation on every refresh (no reuse)
- **Severity:** high

## TC-MCP-OAUTH-027 — Concurrent refresh: only one wins; others reuse new
- **Severity:** medium

## TC-MCP-OAUTH-028 — Connector with revoked tokens disabled in UI
- **Severity:** medium

## TC-MCP-OAUTH-029 — Reconnect button restarts OAuth, preserves connector id
- **Severity:** medium

## TC-MCP-OAUTH-030 — OAuth flow logs do not contain code or tokens
- **Severity:** critical

## TC-MCP-OAUTH-031 — JWT signed for outbound HTTP MCP requests
- **Pre:** http connector
- **Steps:** invoke tool
- **Expected:** outbound has Authorization: Bearer <JWT> with workspace+user claims
- **Severity:** high

## TC-MCP-OAUTH-032 — JWT TTL ≤ 5 min
- **Severity:** high

## TC-MCP-OAUTH-033 — JWT signature rejected by middleware on tampering
- **Severity:** critical

## TC-MCP-OAUTH-034 — JWT replay protection via jti
- **Severity:** high

## TC-MCP-OAUTH-035 — JWT keys rotated periodically
- **Severity:** medium

## TC-MCP-OAUTH-036 — JWT key rollover honored both old+new during overlap
- **Severity:** medium

## TC-MCP-OAUTH-037 — Connector proxy auth uses JWT (cross-references 07-integrations)
- **Severity:** high

## TC-MCP-OAUTH-038 — JWT signature failure on connector proxy returns 401
- **Severity:** critical

## TC-MCP-OAUTH-039 — JWT exp expired returns 401
- **Severity:** high

## TC-MCP-OAUTH-040 — JWT clock skew tolerance ≤ 60s
- **Severity:** medium
