# TC-COMMENTS-RESOLVE — Resolve / Reopen Workflow

Scope: Resolve, reopen, hide-from-default-view, audit trail.

---

## TC-COMMENTS-RESOLVE-001
- Pre: Open comment.
- Steps: PATCH /api/design-comments/:id/resolve.
- Expected: 200; status=resolved; resolved_at, resolved_by set; notification to participants.
- Severity: P0

## TC-COMMENTS-RESOLVE-002
- Pre: Non-member.
- Expected: 403.
- Severity: P0

## TC-COMMENTS-RESOLVE-003
- Pre: Resolve already resolved.
- Expected: 409 or no-op idempotent.
- Severity: P2

## TC-COMMENTS-RESOLVE-004
- Pre: Reopen resolved comment.
- Steps: PATCH /api/design-comments/:id/reopen.
- Expected: status=open; reopened_at; notification to participants.
- Severity: P1

## TC-COMMENTS-RESOLVE-005
- Pre: Default list filter excludes resolved.
- Expected: GET /api/design-comments returns only open by default.
- Severity: P0

## TC-COMMENTS-RESOLVE-006
- Pre: Filter to show resolved.
- Expected: GET ?include_resolved=true returns both.
- Severity: P1

## TC-COMMENTS-RESOLVE-007
- Pre: Resolve creates activity_events.
- Expected: comment_resolve event with actor, comment_id.
- Severity: P1

## TC-COMMENTS-RESOLVE-008
- Pre: Reply on resolved comment.
- Expected: Auto-reopens? Or rejected? Per design — document and assert behavior.
- Severity: P1

## TC-COMMENTS-RESOLVE-009
- Pre: Resolved comment counts excluded from "open count" badge.
- Expected: Confirmed.
- Severity: P2

## TC-COMMENTS-RESOLVE-010
- Pre: Bulk resolve.
- Expected: Member with permission can resolve multiple at once; capped at 50.
- Severity: P2

## TC-COMMENTS-RESOLVE-011
- Pre: Resolve as workspace admin.
- Expected: Allowed even if not author/participant; audit row.
- Severity: P1

## TC-COMMENTS-RESOLVE-012
- Pre: Resolved comment in deleted project.
- Expected: Behavior consistent (project deletion soft-deletes comments).
- Severity: P2

## TC-COMMENTS-RESOLVE-013
- Pre: Resolved status visible to all members.
- Expected: WS broadcast updates list immediately.
- Severity: P1

## TC-COMMENTS-RESOLVE-014
- Pre: Resolve adds notification to participants.
- Expected: type=comment_resolve.
- Severity: P1

## TC-COMMENTS-RESOLVE-015
- Pre: Resolve when no participants other than self.
- Expected: No notification; still resolved.
- Severity: P2

## TC-COMMENTS-RESOLVE-016
- Pre: Reopen by original commenter.
- Expected: Allowed; new notification.
- Severity: P2

## TC-COMMENTS-RESOLVE-017
- Pre: Resolve thread with N replies.
- Expected: Resolves the thread root; replies inherit "resolved"; UI hides whole thread by default.
- Severity: P1

## TC-COMMENTS-RESOLVE-018
- Pre: Resolve mid-edit.
- Expected: Conflict detection; user prompted to refresh.
- Severity: P2

## TC-COMMENTS-RESOLVE-019
- Pre: Resolve audit trail.
- Expected: actor, timestamp, prior status; immutable.
- Severity: P0

## TC-COMMENTS-RESOLVE-020
- Pre: Statistic "% resolved this week".
- Expected: Available in workspace owner analytics.
- Severity: P3

## TC-COMMENTS-RESOLVE-021
- Pre: Resolve via WS message (real-time UI action).
- Expected: WS reflects to all clients within 200ms.
- Severity: P1

## TC-COMMENTS-RESOLVE-022
- Pre: Stale browser sees comment as open after another user resolved.
- Expected: WS event reconciles; UI updates without refresh.
- Severity: P1

## TC-COMMENTS-RESOLVE-023
- Pre: Reopen after long-resolved (>30d).
- Expected: Allowed if not hard-deleted; otherwise 410.
- Severity: P2

## TC-COMMENTS-RESOLVE-024
- Pre: Resolve API rate limit.
- Expected: 60/min/user; 429 beyond.
- Severity: P2

## TC-COMMENTS-RESOLVE-025
- Pre: Verify resolved=true comments appear in admin /admin/projects/:id detail.
- Expected: Counts open/resolved separately.
- Severity: P3
