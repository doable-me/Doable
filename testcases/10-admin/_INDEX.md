# 10-admin — Test Case Index

Platform admin dashboard, projects list, audit, trace, chat, dev servers, moderation, runtime, plan limits, feature flags, impersonation. All require `is_platform_admin = true` via `platformAdminMiddleware`.

| File | Focus | Cases |
|---|---|---|
| TC-ADMIN-DASHBOARD.md | /admin entry, guard, navigation | 35 |
| TC-ADMIN-PROJECTS.md | /admin/projects list, search/filter/sort | 40 |
| TC-ADMIN-AUDIT.md | /admin/audit, activity_events, drill-down | 41 |
| TC-ADMIN-TRACE.md | /admin/trace, OTel ingestion + waterfall | 36 |
| TC-ADMIN-CHAT.md | /admin/chat, ai_sessions, redaction | 30 |
| TC-ADMIN-DEV-SERVERS.md | /admin/dev-servers, idle eviction, capacity | 30 |
| TC-ADMIN-MODERATION.md | /admin/moderation, takedown, ban, signals | 30 |
| TC-ADMIN-RUNTIME.md | /admin/runtime, systemd start/stop/restart | 30 |
| TC-ADMIN-PLAN-LIMITS.md | platform_plan_limits + user overrides | 30 |
| TC-ADMIN-FEATURE-FLAGS.md | feature_flags, platform_config, mode_tool_config, security_findings | 35 |
| TC-ADMIN-IMPERSONATION.md | acting-as flow, audit, scope | 25 |

Cross-cutting expectations:
- platformAdminMiddleware enforces `is_platform_admin=true`; otherwise 403.
- All admin actions write `admin_audit_log`.
- Sensitive content (OAuth tokens, PII) redacted in lists; "View full" gated by reason.
- All services bind 127.0.0.1; admin endpoints accessed via Cloudflare Tunnel.
- Per-env hostnames single-level: `<env>-api.doable.me`, `<env>-ws.doable.me`.
