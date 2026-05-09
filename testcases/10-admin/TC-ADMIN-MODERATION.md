# TC-ADMIN-MODERATION — Marketplace Reports Queue

Scope: `/admin/moderation`. Queue of user-submitted reports against marketplace items / templates / users. Actions: review, dismiss, takedown, ban.

---

## TC-ADMIN-MODERATION-001
- Pre: Admin; reports table seeded with 10 entries.
- Steps: GET `/admin/moderation`.
- Expected: List with: Reported item, Reporter, Reason, Submitted, Status (open/resolved/dismissed), Severity.
- Severity: P0

## TC-ADMIN-MODERATION-002
- Pre: Non-admin.
- Expected: 403.
- Severity: P0

## TC-ADMIN-MODERATION-003
- Pre: Admin.
- Steps: Filter status=open.
- Expected: Only open reports.
- Severity: P0

## TC-ADMIN-MODERATION-004
- Pre: Admin.
- Steps: Filter reason (e.g., spam, copyright, abuse, malware).
- Expected: List narrows.
- Severity: P1

## TC-ADMIN-MODERATION-005
- Pre: Admin clicks a report.
- Expected: Drill page shows reported content preview, reporter info (redacted email), report message, related signals (count of similar reports).
- Severity: P0

## TC-ADMIN-MODERATION-006
- Pre: Admin clicks "Dismiss".
- Expected: Status=dismissed; reason field captured; audit row; reporter optionally notified.
- Severity: P1

## TC-ADMIN-MODERATION-007
- Pre: Admin clicks "Takedown".
- Expected: Marketplace item soft-deleted; owner notified; published URL returns 410 Gone; audit row.
- Severity: P0

## TC-ADMIN-MODERATION-008
- Pre: Admin clicks "Ban user".
- Expected: Owner's account flagged is_banned; sessions terminated; cannot publish; existing items hidden.
- Severity: P0

## TC-ADMIN-MODERATION-009
- Pre: Admin handling false positive from same reporter (multiple reports).
- Expected: System surfaces "Reporter has N dismissed reports" warning to mitigate harassment.
- Severity: P1

## TC-ADMIN-MODERATION-010
- Pre: Admin.
- Steps: Bulk select 5 dismiss.
- Expected: Confirms with count; one audit row per item; all updated atomically.
- Severity: P2

## TC-ADMIN-MODERATION-011
- Pre: Admin.
- Steps: Sort by Submitted DESC.
- Expected: Newest first.
- Severity: P2

## TC-ADMIN-MODERATION-012
- Pre: Admin.
- Steps: Sort by Severity DESC.
- Expected: high → medium → low.
- Severity: P2

## TC-ADMIN-MODERATION-013
- Pre: Admin views report on already-deleted item.
- Expected: Item shown grayed out "(already removed)"; admin can mark dismissed.
- Severity: P1

## TC-ADMIN-MODERATION-014
- Pre: Admin sees 100+ reports for one item.
- Expected: Grouped view with single row showing report count; click expands to all.
- Severity: P1

## TC-ADMIN-MODERATION-015
- Pre: Admin tries SQL inject in reason filter.
- Expected: Sanitized; no error.
- Severity: P0

## TC-ADMIN-MODERATION-016
- Pre: Admin in detail page; image attachments.
- Expected: Images proxied through admin host; never expose raw user-uploaded URL paths that bypass auth.
- Severity: P0

## TC-ADMIN-MODERATION-017
- Pre: Admin views report flagged "malware".
- Expected: Item content auto-quarantined pending review; cannot be installed by users.
- Severity: P0

## TC-ADMIN-MODERATION-018
- Pre: Admin re-instates wrongly taken-down item.
- Expected: deleted_at cleared; audit row "moderation_restore"; owner notified.
- Severity: P1

## TC-ADMIN-MODERATION-019
- Pre: Admin views moderation history of a user.
- Expected: Cumulative count of takedowns, dismissals, current ban status.
- Severity: P1

## TC-ADMIN-MODERATION-020
- Pre: Admin.
- Steps: Time-window filter last 7d.
- Expected: Only reports within window.
- Severity: P2

## TC-ADMIN-MODERATION-021
- Pre: Admin sees no reports.
- Expected: Empty state "No open reports — nice!".
- Severity: P3

## TC-ADMIN-MODERATION-022
- Pre: Admin acts on report.
- Expected: Reporter sees status update on their submitted reports list.
- Severity: P2

## TC-ADMIN-MODERATION-023
- Pre: Admin attempts to view reporter's email plain.
- Expected: Email partially masked unless "Reveal reporter" with reason; audit row.
- Severity: P1

## TC-ADMIN-MODERATION-024
- Pre: Admin assigns report to themselves.
- Expected: assigned_to set; other admins see lock icon.
- Severity: P2

## TC-ADMIN-MODERATION-025
- Pre: Admin un-assigns.
- Expected: Cleared; reusable.
- Severity: P3

## TC-ADMIN-MODERATION-026
- Pre: Admin's moderation actions show in admin_audit_log.
- Expected: For each action, dedicated event_type with old/new state.
- Severity: P0

## TC-ADMIN-MODERATION-027
- Pre: Admin tries banned-user takedown twice.
- Expected: Idempotent; second attempt no-op with toast "already taken down".
- Severity: P2

## TC-ADMIN-MODERATION-028
- Pre: Admin views report against another admin user.
- Expected: System refuses or requires 2-admin approval for actions; audit shows both approvals.
- Severity: P0

## TC-ADMIN-MODERATION-029
- Pre: Admin takedown invokes published-site removal.
- Expected: Caddy serves 410 Gone for that subdomain; thumbnail cleared.
- Severity: P0

## TC-ADMIN-MODERATION-030
- Pre: Admin bulk takedown with reason.
- Expected: Reason stored per item; bulk action limited to N=20 to prevent accidents.
- Severity: P1
