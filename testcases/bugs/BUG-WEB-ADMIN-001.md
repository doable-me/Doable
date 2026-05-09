# BUG-WEB-ADMIN-001 — /admin/audit page stuck on "Loading..." (no error surfaced when API returns 404)

**Severity:** medium (UX / observability)
**Found:** 2026-05-10 by lead via Chrome MCP on https://<env>.doable.me
**Test:** TC-WEB-ADMIN-AUDIT-LOAD-001 (new — evolved during run)

## Reproduction
1. Login as qa-owner (platform admin).
2. Navigate to https://<env>.doable.me/admin/audit.
3. Wait > 10s.

## Actual
Page renders shell `<h1>Audit</h1>` but body shows only `Loading...` indefinitely. No table, no error message, no retry button. Network: the page calls `GET /admin/audit` which returns **404 `{"error":"Not Found","path":"/admin/audit"}`** (confirmed by qa-admin shard's TC-ADMIN-AUDIT-001 log).

## Expected
When the underlying API returns 404, the admin/audit page should render either:
- An empty-state message ("Audit log is empty" or "Audit log is not yet enabled on this platform"), or
- A clear error banner ("Audit endpoint is unavailable") with the HTTP status — AND a retry button.

## Suggested fix
- Frontend: handle non-2xx in the admin/audit data hook; show an error/empty-state component instead of an indefinite spinner.
- Backend (separate work): either implement `/admin/audit` (the test corpus expects it) or remove the link from `/admin` so users don't see a dead destination.

## Cross-page impact
Same pattern likely affects `/admin/audit`, `/admin/chat` (works — shows Chat Sessions (4) — so this one is OK), `/admin/moderation` (untested here), `/admin/dev-servers` proxy. Audit-only confirmed for now.
