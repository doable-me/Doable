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

---

## TC-ADMIN-MODERATION-031
**Title:** Pending listing shows correct title and publisher from database
**Pre:** Admin logged in; listing "AI Todo Helper" by publisher "bob@test.com" submitted for review
**Steps:**
1. Navigate to /admin/moderation
2. Review Queue tab
3. Find the pending listing card for "AI Todo Helper"
**Expected:** Card shows title "AI Todo Helper", publisher "bob@test.com", version matches the `version` column in `marketplace_listings` for that row; submission date is non-empty and within the last 24h; no field shows empty string, "(unknown)", or "undefined".
**Severity:** Critical

## TC-ADMIN-MODERATION-032
**Title:** Manifest summary shows actual skill/rule/connector counts from submitted package
**Pre:** Admin logged in; pending listing "AI Todo Helper" was submitted with manifest containing 3 skills, 2 rules, 1 knowledge source, 1 connector
**Steps:**
1. Navigate to /admin/moderation → Review Queue tab
2. Open the pending listing "AI Todo Helper"
3. Inspect the Manifest summary section
**Expected:** Skills count shows "3", Rules shows "2", Knowledge shows "1", Connectors shows "1". Counts match the actual manifest JSON stored in `marketplace_listings.manifest`. Permissions list enumerates each declared permission (e.g., "network:fetch", "fs:read").
**Severity:** Critical

## TC-ADMIN-MODERATION-033
**Title:** Approve and publish changes listing status to "published" in marketplace
**Pre:** Admin logged in; pending listing "AI Todo Helper" in Review Queue
**Steps:**
1. Navigate to /admin/moderation → Review Queue tab
2. Open listing "AI Todo Helper"
3. Type "Approved — meets guidelines" in decision notes textarea
4. Click "Approve & publish"
5. POST /admin/marketplace/moderation/queue/{id}/decision fires with `{ decision: "approved", notes: "Approved — meets guidelines" }`
6. Navigate to /marketplace and search for "AI Todo Helper"
**Expected:** API returns 200; listing disappears from Review Queue; `marketplace_listings.status` = "published" in DB; listing appears in public marketplace search results; publisher receives notification of approval.
**Severity:** Critical

## TC-ADMIN-MODERATION-034
**Title:** Report card shows correct reason, reporter, and listing title
**Pre:** Admin logged in; user "alice@test.com" reported listing "Sketchy Plugin" with reason "malware" and detail text "This extension sends data to unknown servers"
**Steps:**
1. Navigate to /admin/moderation → Reports tab
2. Find the report card for "Sketchy Plugin"
**Expected:** Report card displays reason badge "malware", listing title "Sketchy Plugin", reporter name "alice@test.com" (or display name), submission date within last 24h, detail text "This extension sends data to unknown servers". No fields are empty or show placeholder values.
**Severity:** Critical

## TC-ADMIN-MODERATION-035
**Title:** Dismiss report changes status to "dismissed" without affecting listing
**Pre:** Admin logged in; open report against listing "Sketchy Plugin" with reason "malware"
**Steps:**
1. Navigate to /admin/moderation → Reports tab
2. Find report for "Sketchy Plugin"
3. Click "Dismiss"
4. POST /admin/marketplace/reports/{id}/resolve fires with `{ action: "dismiss" }`
**Expected:** API returns 200; report disappears from active reports list; `marketplace_reports.status` = "dismissed" in DB; listing "Sketchy Plugin" remains published and accessible in marketplace; reporter is optionally notified of dismissal.
**Severity:** Critical

## TC-ADMIN-MODERATION-036
**Title:** Take action on report takes down listing and resolves report
**Pre:** Admin logged in; open report against listing "Sketchy Plugin" with reason "malware"
**Steps:**
1. Navigate to /admin/moderation → Reports tab
2. Find report for "Sketchy Plugin"
3. Click "Take action"
4. POST /admin/marketplace/reports/{id}/resolve fires with `{ action: "takedown" }`
5. Navigate to /marketplace and search for "Sketchy Plugin"
**Expected:** API returns 200; report status changes to "resolved" in DB; listing "Sketchy Plugin" status changes to "taken_down" in `marketplace_listings`; listing no longer appears in marketplace search; published subdomain returns 410 Gone; listing owner receives takedown notification with reason.
**Severity:** Critical

## TC-ADMIN-MODERATION-037
**Title:** Published listing with connectors appears in review queue within 10 seconds
**Pre:** Publisher "bob@test.com" logged in; creates a new listing with 2 connectors (GitHub, Slack) and submits for review
**Steps:**
1. Publisher submits listing via POST /marketplace/listings with manifest containing 2 connectors
2. Admin navigates to /admin/moderation → Review Queue tab within 10 seconds of submission
3. Refresh the queue if needed
**Expected:** New listing appears in Review Queue within 10 seconds of submission; listing card shows correct title, publisher "bob@test.com", and reason badge "new_submission"; Manifest summary shows Connectors count = 2; no manual page refresh beyond the initial navigation is needed (or auto-refresh picks it up).
**Severity:** Critical

## TC-ADMIN-MODERATION-038
**Title:** Reject with notes — publisher sees "rejected" status with rejection reason
**Pre:** Admin logged in; pending listing "Bad Extension" in Review Queue
**Steps:**
1. Navigate to /admin/moderation → Review Queue tab
2. Open listing "Bad Extension"
3. Type "Rejected — violates security policy, uses eval() in connector code" in decision notes textarea
4. Click "Reject"
5. POST /admin/marketplace/moderation/queue/{id}/decision fires with `{ decision: "rejected", notes: "Rejected — violates security policy, uses eval() in connector code" }`
6. Switch to publisher account "bob@test.com" and navigate to /marketplace/my-listings
**Expected:** API returns 200; listing disappears from Review Queue; `marketplace_listings.status` = "rejected" in DB; publisher sees listing with status "Rejected" and rejection reason "Rejected — violates security policy, uses eval() in connector code" on their my-listings page; publisher received a notification with the rejection reason.
**Severity:** Critical

## TC-ADMIN-MODERATION-039
**Title:** User-reported listing appears in Reports tab with full detail
**Pre:** Listing "Sketchy Plugin v2" is published; user "carol@test.com" submits a report with reason "copyright" and detail "This copies my plugin's code verbatim"
**Steps:**
1. User "carol@test.com" submits report via POST /marketplace/listings/{id}/report with `{ reason: "copyright", detail: "This copies my plugin's code verbatim" }`
2. Admin navigates to /admin/moderation → Reports tab
3. Find the new report
**Expected:** Report card shows reason badge "copyright", listing title "Sketchy Plugin v2", reporter "carol@test.com", date within the last minute, detail text "This copies my plugin's code verbatim". Report is in "open" status. The listing remains published until admin takes action.
**Severity:** Critical

## TC-ADMIN-MODERATION-040
**Title:** Bulk actions apply decision to all selected items in review queue
**Pre:** Admin logged in; 3 pending listings in Review Queue: "Plugin A", "Plugin B", "Plugin C"
**Steps:**
1. Navigate to /admin/moderation → Review Queue tab
2. Select all 3 listings using checkboxes or "select all"
3. Choose bulk action "Approve & publish"
4. Confirm the bulk action
5. Navigate to /marketplace and search for each plugin
**Expected:** All 3 listings are approved in a single operation; all disappear from Review Queue; all 3 have `marketplace_listings.status` = "published" in DB; all 3 appear in marketplace search results; each publisher receives an approval notification. Bulk action is limited to max 20 items to prevent accidents (per TC-030).
**Severity:** Critical
