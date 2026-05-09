# TC-INTEG-PROXY — Connector proxy (/__doable/connector-proxy)

Covers JWT-signed proxy auth, action invocation, replay protection, expired tokens, integration_usage_log writes, error mapping, refunds.

## TC-INTEG-PROXY-001 — Action invocation via proxy (smoke)
- **Steps:** chat triggers github.listIssues
- **Expected:** outbound request to /__doable/connector-proxy with signed JWT; proxy fetches GitHub; response returned to caller; integration_usage_log row written
- **Severity:** smoke

## TC-INTEG-PROXY-002 — JWT contains workspaceId, userId, connectionId, scope, exp, jti
- **Severity:** high

## TC-INTEG-PROXY-003 — JWT signed with current key id
- **Severity:** high

## TC-INTEG-PROXY-004 — Proxy verifies signature
- **Severity:** critical

## TC-INTEG-PROXY-005 — Tampered JWT rejected with 401
- **Severity:** critical

## TC-INTEG-PROXY-006 — Expired JWT rejected with 401
- **Severity:** high

## TC-INTEG-PROXY-007 — JWT issued in future rejected
- **Severity:** medium

## TC-INTEG-PROXY-008 — Replay: same jti within window rejected
- **Severity:** critical

## TC-INTEG-PROXY-009 — Replay: same jti across windows allowed (per design) or rejected
- **Severity:** high

## TC-INTEG-PROXY-010 — Replay attack on signed proxy URL detected
- **Severity:** critical

## TC-INTEG-PROXY-011 — Action not in advertised scopes rejected
- **Severity:** high

## TC-INTEG-PROXY-012 — Action with revoked connection rejected
- **Severity:** high

## TC-INTEG-PROXY-013 — Action targeting wrong workspace rejected
- **Severity:** critical

## TC-INTEG-PROXY-014 — Refresh access token transparent on expiry
- **Severity:** high

## TC-INTEG-PROXY-015 — Refresh failure returns 401 with `reauth_required`
- **Severity:** high

## TC-INTEG-PROXY-016 — Provider 4xx surfaced with mapped status
- **Severity:** medium

## TC-INTEG-PROXY-017 — Provider 5xx returned as 502 with retryable=true
- **Severity:** medium

## TC-INTEG-PROXY-018 — Proxy timeout configurable per action
- **Severity:** medium

## TC-INTEG-PROXY-019 — Proxy enforces per-action rate limits
- **Severity:** medium

## TC-INTEG-PROXY-020 — Proxy logs request id correlated to chat session
- **Severity:** medium

## TC-INTEG-PROXY-021 — Proxy rejects calls without JWT
- **Severity:** critical

## TC-INTEG-PROXY-022 — Proxy rejects calls with old key id
- **Severity:** high

## TC-INTEG-PROXY-023 — Proxy supports key rotation overlap
- **Severity:** medium

## TC-INTEG-PROXY-024 — Proxy emits integration_usage_log row per call
- **Expected:** row with provider, action, status, durationMs, bytesIn/out
- **Severity:** high

## TC-INTEG-PROXY-025 — Usage log queryable by user
- **Severity:** medium

## TC-INTEG-PROXY-026 — Usage log used for analytics dashboard
- **Severity:** low

## TC-INTEG-PROXY-027 — Concurrent action calls multiplexed
- **Severity:** medium

## TC-INTEG-PROXY-028 — In-flight action when revoke called: completes or aborts cleanly
- **Severity:** high

## TC-INTEG-PROXY-029 — Action body size cap enforced
- **Severity:** medium

## TC-INTEG-PROXY-030 — Action result size cap enforced
- **Severity:** medium

## TC-INTEG-PROXY-031 — Action with binary response handled
- **Severity:** medium

## TC-INTEG-PROXY-032 — Action SSE/streaming proxied (where supported)
- **Severity:** medium

## TC-INTEG-PROXY-033 — Action redirects followed up to 5 hops
- **Severity:** low

## TC-INTEG-PROXY-034 — Action SSRF: target URL allowlist enforced
- **Severity:** critical

## TC-INTEG-PROXY-035 — Action SSRF: localhost target rejected
- **Severity:** critical

## TC-INTEG-PROXY-036 — Action SSRF: internal IP rejected (DNS rebind defense)
- **Severity:** critical

## TC-INTEG-PROXY-037 — Action sets User-Agent identifying Doable
- **Severity:** low

## TC-INTEG-PROXY-038 — Action error logs do not contain bearer secret
- **Severity:** critical

## TC-INTEG-PROXY-039 — Action timing attack mitigated (constant-time JWT verify)
- **Severity:** medium

## TC-INTEG-PROXY-040 — Action result returned to caller as JSON
- **Severity:** smoke

## TC-INTEG-PROXY-041 — Action invocation refunds credits on infrastructure failure (per policy)
- **Severity:** medium

## TC-INTEG-PROXY-042 — Action allows action-level disable per workspace
- **Severity:** medium

## TC-INTEG-PROXY-043 — Audit log on proxy denial
- **Severity:** medium

## TC-INTEG-PROXY-044 — Proxy honors trace headers (W3C tracecontext)
- **Severity:** low

## TC-INTEG-PROXY-045 — Proxy adds X-Forwarded headers as needed
- **Severity:** low

## TC-INTEG-PROXY-046 — Proxy 100 concurrent calls stable
- **Severity:** medium

## TC-INTEG-PROXY-047 — Proxy memory bounded under streaming
- **Severity:** medium

## TC-INTEG-PROXY-048 — Proxy handles content-encoding gzip
- **Severity:** low

## TC-INTEG-PROXY-049 — Proxy strips Set-Cookie from responses
- **Severity:** high

## TC-INTEG-PROXY-050 — Proxy adheres to provider's webhook-only surfaces (no fetching)
- **Severity:** medium
