# BUG-CORPUS-NOT-001 — /notifications requires workspaceId; TC expects user-scoped global list

**Severity:** medium
**Env:** env1 / zantaz (`https://zantaz-api.doable.me`)
**Found by:** corpus-16-26 runner, RUN-CORPUS-16-26 (2026-05-09)

## Repro
```
GET /notifications
Authorization: Bearer <qa-owner>
```

## Actual
HTTP 400 — `{"error":"workspaceId query parameter is required"}`

## Expected (per TC-NOTIF-LIST-001)
HTTP 200 — notifications list scoped to the authenticated user across all their workspaces. Bell icon in any UI surface (not workspace-scoped) needs this. RLS on `user_id` is sufficient.

## Analysis
`services/api/src/routes/notifications.ts` lines 18-22 force-validate `workspaceId` for every list/unread-count/read-all endpoint, then re-checks workspace membership. This is over-restrictive:

- The notifications bell typically lives in the global header — caller doesn't know which workspace is "active" right now (especially across browser windows).
- TC-NOTIF-LIST-001 says: *"Returns notifications scoped to user; columns: id, type, title, body, link, read_at, created_at, metadata."* No mention of workspace filter.
- TC-NOTIF-LIST-002 says cross-user isolation is by `user_id` RLS — workspace filter is incidental, not required.

## Fix recommendation
Make `workspaceId` **optional**. When absent, return all notifications for the authenticated user across all their workspaces. Keep RLS on `user_id`. When present, additionally constrain by `workspace_id`. This matches the TC and the typical bell-icon UX.

Also: the "mark all read" path is `/notifications/read-all` (POST), not the TC's `/notifications/mark-all-read`. Update TC-NOTIF-LIST-008 to match implementation, or add an alias.

## Evidence
- `testcases/evidence/env1/TC-NOTIF-LIST-001.body`
- `testcases/evidence/env1/TC-NOTIF-LIST-003.body`
- `testcases/evidence/env1/TC-NOTIF-MARK-ALL-001.body` (404 on `/mark-all-read`)
