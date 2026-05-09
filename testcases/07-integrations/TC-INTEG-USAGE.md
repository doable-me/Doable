# TC-INTEG-USAGE — Integration usage logging & analytics

Covers integration_usage_log writes, query, retention, dashboards.

## TC-INTEG-USAGE-001 — Usage log row written per action call (smoke)
- **Severity:** smoke

## TC-INTEG-USAGE-002 — Row contains workspaceId, userId, connectionId, action, status, durationMs, ts
- **Severity:** high

## TC-INTEG-USAGE-003 — Row contains bytesIn/bytesOut
- **Severity:** medium

## TC-INTEG-USAGE-004 — Row contains http status from provider
- **Severity:** medium

## TC-INTEG-USAGE-005 — Row written even when action errors
- **Severity:** medium

## TC-INTEG-USAGE-006 — Row written on JWT verification failure
- **Severity:** medium

## TC-INTEG-USAGE-007 — Row not double-written on retry
- **Severity:** medium

## TC-INTEG-USAGE-008 — Query usage by user
- **Steps:** GET /integrations/usage?userId=
- **Severity:** medium

## TC-INTEG-USAGE-009 — Query usage by integration
- **Severity:** medium

## TC-INTEG-USAGE-010 — Query usage by date range
- **Severity:** medium

## TC-INTEG-USAGE-011 — Query usage paginated
- **Severity:** medium

## TC-INTEG-USAGE-012 — Aggregate by day
- **Severity:** medium

## TC-INTEG-USAGE-013 — Top integrations by call count
- **Severity:** low

## TC-INTEG-USAGE-014 — Top users by call count
- **Severity:** low

## TC-INTEG-USAGE-015 — Cross-tenant usage isolated
- **Severity:** critical

## TC-INTEG-USAGE-016 — Retention policy 90d
- **Severity:** medium

## TC-INTEG-USAGE-017 — Purge job runs daily
- **Severity:** low

## TC-INTEG-USAGE-018 — Purge job idempotent
- **Severity:** low

## TC-INTEG-USAGE-019 — Index on (workspaceId, ts) for query perf
- **Severity:** medium

## TC-INTEG-USAGE-020 — Usage dashboard renders charts
- **Severity:** medium

## TC-INTEG-USAGE-021 — Dashboard filter by category
- **Severity:** low

## TC-INTEG-USAGE-022 — Dashboard export CSV
- **Severity:** low

## TC-INTEG-USAGE-023 — Usage logs do not contain provider secrets
- **Severity:** critical

## TC-INTEG-USAGE-024 — Usage logs do not contain bearer tokens
- **Severity:** critical

## TC-INTEG-USAGE-025 — Usage logs redact PII per policy
- **Severity:** high

## TC-INTEG-USAGE-026 — Usage spike triggers admin alert
- **Severity:** medium

## TC-INTEG-USAGE-027 — Usage anomaly detection (sudden 10x)
- **Severity:** low

## TC-INTEG-USAGE-028 — Usage view requires admin role
- **Severity:** high

## TC-INTEG-USAGE-029 — Member sees own usage only
- **Severity:** medium

## TC-INTEG-USAGE-030 — Usage cost computed via per-action units
- **Severity:** medium

## TC-INTEG-USAGE-031 — Usage cost reflected in plan-limits panel
- **Severity:** medium

## TC-INTEG-USAGE-032 — Usage > limit triggers gating
- **Severity:** high

## TC-INTEG-USAGE-033 — Quota reset monthly
- **Severity:** medium

## TC-INTEG-USAGE-034 — Real-time usage WS event for dashboards
- **Severity:** low

## TC-INTEG-USAGE-035 — Usage dashboard time-zone aware
- **Severity:** low

## TC-INTEG-USAGE-036 — Usage list pagination
- **Severity:** medium

## TC-INTEG-USAGE-037 — Usage record includes action latency p50/p95
- **Severity:** low

## TC-INTEG-USAGE-038 — Usage record latency includes upstream + proxy parts
- **Severity:** low

## TC-INTEG-USAGE-039 — Usage record sampled vs full retention configurable
- **Severity:** low

## TC-INTEG-USAGE-040 — Bulk export streamed download
- **Severity:** low
