# TC-ADMIN-FEATURE-FLAGS — Feature Flags & Mode Tool Config

Scope: feature_flags toggle UI, user_feature_overrides, platform_config, mode_tool_config, security_findings dismiss.

---

## TC-ADMIN-FF-001
- Pre: Admin.
- Steps: GET feature flags page.
- Expected: Lists all flags with description, default value, current value, scope (platform/workspace/user). 403 for non-admin.
- Severity: P0

## TC-ADMIN-FF-002
- Pre: Admin toggles platform-wide flag `tracing_enabled`.
- Expected: feature_flags row updated; effect within 30s for new requests; audit row.
- Severity: P0

## TC-ADMIN-FF-003
- Pre: Admin reverts flag.
- Expected: Returns to previous value; audit row.
- Severity: P0

## TC-ADMIN-FF-004
- Pre: Admin sets workspace-scoped flag.
- Expected: Only that workspace affected; users in other workspaces unaffected.
- Severity: P1

## TC-ADMIN-FF-005
- Pre: Admin adds user_feature_overrides for user X enabling beta flag.
- Expected: User X sees feature; others don't.
- Severity: P0

## TC-ADMIN-FF-006
- Pre: Admin removes user override.
- Expected: User reverts to platform default.
- Severity: P0

## TC-ADMIN-FF-007
- Pre: Admin sets percentage rollout for flag (e.g., 10%).
- Expected: Stable bucketing per user_id; same user always in same bucket; ~10% receive.
- Severity: P1

## TC-ADMIN-FF-008
- Pre: Admin sets schedule (start at T+1h).
- Expected: Flag flips at scheduled time; no manual action needed; audit captures both schedule and flip.
- Severity: P1

## TC-ADMIN-FF-009
- Pre: Admin under flag with deprecated flag still referenced in code.
- Expected: UI marks flag deprecated with sunset date; warning before delete.
- Severity: P2

## TC-ADMIN-FF-010
- Pre: Admin deletes a flag.
- Expected: Confirms; cascade-clears user overrides; audit row.
- Severity: P1

## TC-ADMIN-FF-011
- Pre: Admin views platform_config table via UI.
- Expected: Read-only display of system-wide config keys; sensitive values redacted.
- Severity: P0

## TC-ADMIN-FF-012
- Pre: Admin updates platform_config key (e.g., `default_plan=free`).
- Expected: Value persists; effects new sign-ups; audit row.
- Severity: P0

## TC-ADMIN-FF-013
- Pre: Admin updates platform_config to invalid value (wrong type).
- Expected: Validation; not saved; UI shows error.
- Severity: P1

## TC-ADMIN-FF-014
- Pre: Admin views mode_tool_config.
- Expected: Per-mode (chat/edit/agent) tool allowlist visible; toggle per tool.
- Severity: P1

## TC-ADMIN-FF-015
- Pre: Admin disables a tool in chat mode.
- Expected: Subsequent sessions in chat mode lack that tool; existing sessions complete with current toolset; audit row.
- Severity: P1

## TC-ADMIN-FF-016
- Pre: Admin re-enables tool.
- Expected: Available again to new sessions.
- Severity: P1

## TC-ADMIN-FF-017
- Pre: Admin views security_findings list.
- Expected: Open findings with severity, source, created, evidence link.
- Severity: P0

## TC-ADMIN-FF-018
- Pre: Admin clicks "Dismiss" on a finding.
- Expected: Modal asks for justification; on submit, finding marked dismissed; audit row with reason; reopen possible.
- Severity: P0

## TC-ADMIN-FF-019
- Pre: Admin reopens dismissed finding.
- Expected: Status open; audit row.
- Severity: P1

## TC-ADMIN-FF-020
- Pre: Admin filters findings by severity=high.
- Expected: Only critical/high.
- Severity: P1

## TC-ADMIN-FF-021
- Pre: Admin clicks finding source link.
- Expected: Drill to evidence (e.g., trace, audit event, log span).
- Severity: P1

## TC-ADMIN-FF-022
- Pre: Admin tries to delete finding.
- Expected: Not allowed; can only dismiss to preserve audit history.
- Severity: P0

## TC-ADMIN-FF-023
- Pre: Admin verifies all dismiss actions show in admin_audit_log.
- Expected: Each dismiss has actor, finding_id, reason.
- Severity: P0

## TC-ADMIN-FF-024
- Pre: Admin under stress: 100 findings open.
- Expected: Pagination; bulk dismiss (with warning) limited to 10.
- Severity: P2

## TC-ADMIN-FF-025
- Pre: Admin views feature_flags JSON export.
- Expected: Snapshot exported; import path documented.
- Severity: P3

## TC-ADMIN-FF-026
- Pre: Admin attempts CSRF: cross-site POST to /api/admin/flags.
- Expected: 403/401; CSRF token required.
- Severity: P0

## TC-ADMIN-FF-027
- Pre: Admin saves flag with description >2KB.
- Expected: Validation truncate or reject.
- Severity: P3

## TC-ADMIN-FF-028
- Pre: Admin verifies flag changes propagate via cache invalidation broadcast.
- Expected: Multi-instance API workers all see new value within 30s.
- Severity: P1

## TC-ADMIN-FF-029
- Pre: Admin sets dependent flag (B requires A).
- Expected: Disabling A cascades disables B with confirmation; or warns dependency.
- Severity: P2

## TC-ADMIN-FF-030
- Pre: Admin under impersonation views flags.
- Expected: Sees flags effective for impersonated user, not admin's own.
- Severity: P1

## TC-ADMIN-FF-031
- Pre: Admin checks platform_config key for `DOABLE_HARDENING`.
- Expected: Visible read-only; cannot change to off in production env via UI.
- Severity: P0

## TC-ADMIN-FF-032
- Pre: Admin checks `DOVAULT_BACKEND` config.
- Expected: Read-only; matches OS-appropriate backend; switching disabled at runtime.
- Severity: P0

## TC-ADMIN-FF-033
- Pre: Admin updates `MAX_CONCURRENT_ENGINES` via platform_config.
- Expected: Effective immediately for new server spawns; existing servers unaffected.
- Severity: P1

## TC-ADMIN-FF-034
- Pre: Admin updates `DEV_SERVER_IDLE_MS`.
- Expected: New eviction timers use new value; existing timers reschedule on next heartbeat.
- Severity: P1

## TC-ADMIN-FF-035
- Pre: Admin updates `PUBLISH_SUBDOMAIN_PREFIX`.
- Expected: New publishes use new prefix; existing published sites continue at old subdomains.
- Severity: P1
