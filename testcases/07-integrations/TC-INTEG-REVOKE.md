# TC-INTEG-REVOKE — Revoke / disconnect integrations

Covers DELETE /integrations/connections/:id, soft vs hard revoke, mid-flight call interruption, audit, re-auth flow.

## TC-INTEG-REVOKE-001 — Revoke connection (smoke)
- **Steps:** DELETE /integrations/connections/:id
- **Expected:** 204; row marked revoked; tokens null/zeroed; provider revoke best-effort called
- **Severity:** smoke

## TC-INTEG-REVOKE-002 — Revoke removes actions from chat registry
- **Severity:** high

## TC-INTEG-REVOKE-003 — Revoke logs audit
- **Severity:** high

## TC-INTEG-REVOKE-004 — Revoke does not delete integration_usage_log history
- **Severity:** medium

## TC-INTEG-REVOKE-005 — In-flight action when revoke fired: action completes or aborted
- **Severity:** high

## TC-INTEG-REVOKE-006 — Subsequent action call returns 401 reauth_required
- **Severity:** high

## TC-INTEG-REVOKE-007 — Reconnect button restarts OAuth, preserves connection id
- **Severity:** medium

## TC-INTEG-REVOKE-008 — Cross-tenant revoke denied
- **Severity:** critical

## TC-INTEG-REVOKE-009 — Member-level revoke (their own connection)
- **Severity:** medium

## TC-INTEG-REVOKE-010 — Owner can revoke any workspace connection
- **Severity:** high

## TC-INTEG-REVOKE-011 — Revoke twice idempotent
- **Severity:** medium

## TC-INTEG-REVOKE-012 — Revoke when provider revoke fails returns 200 (best-effort)
- **Severity:** medium

## TC-INTEG-REVOKE-013 — Revoke endpoint requires CSRF
- **Severity:** high

## TC-INTEG-REVOKE-014 — Revoke emits realtime event
- **Severity:** low

## TC-INTEG-REVOKE-015 — Revoke clears cached MCP tools
- **Severity:** medium

## TC-INTEG-REVOKE-016 — Revoke retains account label for history
- **Severity:** low

## TC-INTEG-REVOKE-017 — Revoke during chat stream signals tool failure
- **Severity:** medium

## TC-INTEG-REVOKE-018 — Revoke token zeroed via secure overwrite
- **Severity:** critical

## TC-INTEG-REVOKE-019 — Revoke expires JWT key entry for connection
- **Severity:** high

## TC-INTEG-REVOKE-020 — Revoke notifies admin via audit feed
- **Severity:** medium

## TC-INTEG-REVOKE-021 — Soft revoke vs hard delete configurable
- **Severity:** medium

## TC-INTEG-REVOKE-022 — Soft revoke retention 90d then auto purge
- **Severity:** medium

## TC-INTEG-REVOKE-023 — UI shows revoke confirmation dialog
- **Severity:** smoke

## TC-INTEG-REVOKE-024 — Revoke success toast shown
- **Severity:** smoke

## TC-INTEG-REVOKE-025 — Revoke failure toast shown
- **Severity:** medium

## TC-INTEG-REVOKE-026 — Revoke triggers webhook to subscribed listeners
- **Severity:** low

## TC-INTEG-REVOKE-027 — Revoke endpoint rate-limited
- **Severity:** low

## TC-INTEG-REVOKE-028 — Revoke when only connection: disables related project workflows
- **Severity:** medium

## TC-INTEG-REVOKE-029 — Re-auth attempt after revoke creates new connection row OR reuses
- **Severity:** medium

## TC-INTEG-REVOKE-030 — Revoke records actor user id
- **Severity:** medium

## TC-INTEG-REVOKE-031 — Revoke kept consistent if API request fails after token zero
- **Severity:** high

## TC-INTEG-REVOKE-032 — Revoke for workspace user removed: cascading revoke
- **Severity:** high

## TC-INTEG-REVOKE-033 — Revoke does not affect other workspaces' connections
- **Severity:** critical

## TC-INTEG-REVOKE-034 — Revoke reflected in /integrations/connections list within 1s
- **Severity:** medium

## TC-INTEG-REVOKE-035 — Revoke disables integrations marketplace re-list
- **Severity:** low

## TC-INTEG-REVOKE-036 — Revoke disables MCP-driven integration tools
- **Severity:** high

## TC-INTEG-REVOKE-037 — Revoke does not break running automations until completion
- **Severity:** high

## TC-INTEG-REVOKE-038 — Revoke flow logs do not contain tokens
- **Severity:** critical

## TC-INTEG-REVOKE-039 — Revoke endpoint validates connection ownership
- **Severity:** critical

## TC-INTEG-REVOKE-040 — Revoke updates last_used_at to null
- **Severity:** low
