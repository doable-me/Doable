# TC-NOTIF-LIST — Notifications List & CRUD

Scope: notifications table; per-user list; mark read/unread; delete; filter by type.

---

## TC-NOTIF-LIST-001
- Pre: Authenticated user with 5 notifications.
- Steps: GET /api/notifications.
- Expected: Returns notifications scoped to user; columns: id, type, title, body, link, read_at, created_at, metadata.
- Severity: P0

## TC-NOTIF-LIST-002
- Pre: Other user.
- Expected: Cannot see another user's notifications; isolated by user_id RLS.
- Severity: P0

## TC-NOTIF-LIST-003
- Pre: User filter unread.
- Expected: GET /api/notifications?read=false returns only unread.
- Severity: P0

## TC-NOTIF-LIST-004
- Pre: User filter type=mention.
- Expected: Only mention notifications.
- Severity: P1

## TC-NOTIF-LIST-005
- Pre: User combine filters: type=mention&read=false.
- Expected: AND-applied.
- Severity: P1

## TC-NOTIF-LIST-006
- Pre: Mark single notification read.
- Steps: PATCH /api/notifications/:id { read: true }.
- Expected: read_at set to now; UI reflects.
- Severity: P0

## TC-NOTIF-LIST-007
- Pre: Mark another user's notification read.
- Expected: 403; not modified.
- Severity: P0

## TC-NOTIF-LIST-008
- Pre: Mark all read.
- Steps: POST /api/notifications/mark-all-read.
- Expected: All user's unread → read; bulk update; single audit if needed.
- Severity: P1

## TC-NOTIF-LIST-009
- Pre: Mark all read with filter (only mentions).
- Expected: Optional scope filter respected.
- Severity: P2

## TC-NOTIF-LIST-010
- Pre: Delete notification.
- Expected: Soft delete (deleted_at) preferred; hidden from list.
- Severity: P1

## TC-NOTIF-LIST-011
- Pre: Delete notification owned by another user.
- Expected: 403.
- Severity: P0

## TC-NOTIF-LIST-012
- Pre: Bulk delete.
- Expected: POST /api/notifications/delete-bulk { ids: [...] }; capped at 100.
- Severity: P2

## TC-NOTIF-LIST-013
- Pre: Notification types enumerated.
- Expected: mention, build_complete, build_failed, member_invite, member_joined, plan_change, plan_downgrade, billing_failed, comment_reply, comment_resolve.
- Severity: P1

## TC-NOTIF-LIST-014
- Pre: Notification with link.
- Expected: Clicking link navigates within app; auto marks read.
- Severity: P1

## TC-NOTIF-LIST-015
- Pre: Notification preview (truncated body).
- Expected: First 200 chars; full visible on click; XSS-safe.
- Severity: P0

## TC-NOTIF-LIST-016
- Pre: Notification timestamp displayed relative.
- Expected: "5 min ago", "yesterday", absolute on hover.
- Severity: P3

## TC-NOTIF-LIST-017
- Pre: Notification badge count in header.
- Expected: Shows unread count; clamps at 99+.
- Severity: P1

## TC-NOTIF-LIST-018
- Pre: List pagination.
- Expected: 20 per page; cursor-based; oldest reachable.
- Severity: P1

## TC-NOTIF-LIST-019
- Pre: Empty state.
- Expected: Friendly copy "All caught up!".
- Severity: P3

## TC-NOTIF-LIST-020
- Pre: Sort by created_at DESC default.
- Expected: Newest first.
- Severity: P2

## TC-NOTIF-LIST-021
- Pre: Notification grouping by type+target.
- Expected: e.g., "5 new comments on Project X" grouped row; click expands.
- Severity: P2

## TC-NOTIF-LIST-022
- Pre: Notification preferences.
- Expected: Settings page lets user toggle types; honored on insert.
- Severity: P1

## TC-NOTIF-LIST-023
- Pre: User toggles email notifications off.
- Expected: In-app still appears; email not sent.
- Severity: P1

## TC-NOTIF-LIST-024
- Pre: Notification dedup.
- Expected: Same target with multiple updates collapses; e.g., 3 mentions in same thread = 1 grouped row.
- Severity: P2

## TC-NOTIF-LIST-025
- Pre: Notification retention.
- Expected: Soft-deleted purged after 90d; read but not deleted retained 365d.
- Severity: P2

## TC-NOTIF-LIST-026
- Pre: Notification with mention shows actor avatar.
- Expected: avatar rendered; falls back to initials if missing.
- Severity: P3

## TC-NOTIF-LIST-027
- Pre: Notifications listed for user are also visible during impersonation.
- Expected: Admin impersonating sees target's notifications, not admin's own.
- Severity: P1

## TC-NOTIF-LIST-028
- Pre: Verify XSS in notification body.
- Expected: All content escaped on render; CSP enforced.
- Severity: P0

## TC-NOTIF-LIST-029
- Pre: List endpoint rate limit.
- Expected: 60 req/min per user; 429 beyond.
- Severity: P2

## TC-NOTIF-LIST-030
- Pre: Notification metadata jsonb.
- Expected: target_id, source_id, source_type queryable; structured.
- Severity: P2

## TC-NOTIF-LIST-031
- Pre: Verify response time for list <300ms p95.
- Expected: index on (user_id, deleted_at, created_at) used.
- Severity: P1

## TC-NOTIF-LIST-032
- Pre: Notification with broken link target (project deleted).
- Expected: Click shows "Target no longer available"; notification still in list.
- Severity: P2

## TC-NOTIF-LIST-033
- Pre: Notification icon by type.
- Expected: Distinct icons per type; aria-label set.
- Severity: P3

## TC-NOTIF-LIST-034
- Pre: Notifications shown in chronological clusters by date.
- Expected: Today / Yesterday / This Week sections.
- Severity: P3

## TC-NOTIF-LIST-035
- Pre: Mute project notifications.
- Expected: Notifications from that project suppressed (but stored?) per setting.
- Severity: P2
