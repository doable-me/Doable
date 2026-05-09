# BUG-CORPUS-ADM-001 — Admin TC corpus refers to non-existent paths

**Severity:** low (corpus drift)
**Filed:** 2026-05-10 (env1 / zantaz)
**Status:** OPEN

## Symptom

Several TC files in `testcases/10-admin/` describe endpoints that do not exist
under `/admin/...`:

| TC referenced path | Real path on env1 |
|---|---|
| `/admin/audit` | `/admin/audit/conversations`, `.../messages`, `.../actions`, `.../stats` |
| `/admin/chat` | `/admin/chat-sessions` |
| `/admin/runtime` | `/admin/runtime/instances` |
| `/admin/trace` | `/admin/traces/search`, `/admin/traces/:traceId` |
| `/admin/projects/:id` | not implemented (use `/admin/projects?id=...` filters via `?status=` etc.) |

Live verification on env1 confirms:
- `/admin/audit/conversations` → 200 (admin), 403 (non-admin) ✓
- `/admin/audit/messages` → 400 without `?q=...` (>=2 chars) — TC should encode the required query param
- `/admin/chat-sessions` → 200 (admin), 403 (non-admin) ✓
- `/admin/runtime/instances` → 200 (admin), 403 (non-admin) ✓
- `/admin/traces/search` → 200 (admin), 403 (non-admin) ✓
- `/admin/projects/:id` → 404; only `/admin/projects` (collection w/ filters) is mounted

## Fix

Update each TC file to use the real path; add a parameter section for
`/admin/audit/messages?q=<term>` documenting the 400 on missing `q`. No
server change required.

## Evidence

See `RUN-2026-05-10` (env1 CORPUS-04-05-10-15.md) `## Re-run 10-admin ...`
table — first batch FAILed, second batch (corrected paths) PASSed.
