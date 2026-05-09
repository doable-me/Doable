# TC-MARKET-MODERATION — Listing moderation, reports, DMCA, admin actions

Covers user reports, admin (platform-admin role) review queue, approve/reject/takedown actions, and DMCA flow.

---

## TC-MARKET-MODERATION-001
**Title:** Report a listing
**Pre:** Logged-in user; listing visible
**Steps:**
1. Click ⋯ → Report listing
2. Choose reason ("Inappropriate", "Spam", "Copyright", "Security", "Other")
3. Add note + submit
**Expected:** marketplace_reports row created with reporter, listing_id, reason, note, ts. UI confirms "Thanks for reporting".
**Severity:** Critical

## TC-MARKET-MODERATION-002
**Title:** Anonymous user prompted to log in to report
**Pre:** Logged out
**Steps:**
1. Click report
**Expected:** Login modal; after login, returns to report flow.
**Severity:** Medium

## TC-MARKET-MODERATION-003
**Title:** Cannot report own listing
**Pre:** Author logged in
**Steps:**
1. Try to report own listing
**Expected:** UI hides Report button; API rejects.
**Severity:** Low

## TC-MARKET-MODERATION-004
**Title:** Duplicate report by same user blocked
**Pre:** Already reported once
**Steps:**
1. Try again
**Expected:** 409 "Already reported"; UI shows status.
**Severity:** Low

## TC-MARKET-MODERATION-005
**Title:** Report increments listing report_count
**Pre:** count = 0
**Steps:**
1. Three different users report
**Expected:** report_count = 3.
**Severity:** Medium

## TC-MARKET-MODERATION-006
**Title:** Report threshold auto-flags for moderation
**Pre:** Threshold = 5
**Steps:**
1. 5 reports submitted
**Expected:** Listing status auto changes to `pending_review`; hidden from public; admin notified.
**Severity:** High

## TC-MARKET-MODERATION-007
**Title:** Admin review queue lists pending reports
**Pre:** Admin user; reports exist
**Steps:**
1. Open /admin/marketplace/queue
**Expected:** marketplace_moderation_queue rows listed sorted by oldest. Each shows listing snapshot + report count + reasons.
**Severity:** Critical

## TC-MARKET-MODERATION-008
**Title:** Admin only — non-admins blocked from moderation pages
**Pre:** Non-admin user
**Steps:**
1. Navigate to /admin/marketplace/queue
**Expected:** 403; redirect to /. UI hides nav entry.
**Severity:** Critical

## TC-MARKET-MODERATION-009
**Title:** Admin approves listing → returns to public
**Pre:** Listing pending_review
**Steps:**
1. Click Approve
**Expected:** Listing status `published`; visible in marketplace; audit `marketplace_admin_actions` row created.
**Severity:** High

## TC-MARKET-MODERATION-010
**Title:** Admin rejects listing with reason
**Pre:** Listing pending_review
**Steps:**
1. Click Reject; provide reason
**Expected:** Listing status `rejected`; author notified by email + in-app; admin action recorded with reason.
**Severity:** High

## TC-MARKET-MODERATION-011
**Title:** Admin takedown (force-remove published listing)
**Pre:** Listing currently published
**Steps:**
1. Click Takedown; reason selected
**Expected:** Listing status `taken_down`; bundle artifact frozen (not deleted); install attempts blocked; author notified.
**Severity:** Critical

## TC-MARKET-MODERATION-012
**Title:** Admin restore taken-down listing
**Pre:** Taken_down listing
**Steps:**
1. Click Restore
**Expected:** Status returns to published; audit log.
**Severity:** Medium

## TC-MARKET-MODERATION-013
**Title:** DMCA takedown form
**Pre:** /marketplace/dmca form
**Steps:**
1. Submit DMCA notice with all required fields (claimant info, signature, sworn statement)
**Expected:** Form stored in DB and queued; admin notified; auto-acknowledgement email sent.
**Severity:** Critical

## TC-MARKET-MODERATION-014
**Title:** DMCA missing required fields rejected
**Pre:** Form
**Steps:**
1. Submit incomplete
**Expected:** 400 listing missing fields; non-conforming notices not actioned.
**Severity:** Medium

## TC-MARKET-MODERATION-015
**Title:** DMCA admin reviews and actions
**Pre:** Notice in queue
**Steps:**
1. Admin reviews; takes down listing
**Expected:** Listing taken_down; reason "DMCA"; entry in admin_actions; claimant emailed confirmation; author emailed counter-notice instructions.
**Severity:** High

## TC-MARKET-MODERATION-016
**Title:** DMCA counter-notice flow
**Pre:** Listing taken_down DMCA
**Steps:**
1. Author submits counter-notice
**Expected:** Counter recorded; if claimant doesn't sue within 14 days, listing auto-restored. Process documented in legal page.
**Severity:** Medium

## TC-MARKET-MODERATION-017
**Title:** Repeat infringer policy
**Pre:** Author has 3 confirmed DMCA takedowns
**Steps:**
1. Admin views author profile
**Expected:** Flag "repeat_infringer"; admin can suspend account.
**Severity:** Medium

## TC-MARKET-MODERATION-018
**Title:** Moderation actions logged
**Pre:** Any admin action
**Steps:**
1. After action, inspect marketplace_admin_actions
**Expected:** Row {actor, listing_id, action, reason, ts, ip, ua} immutable.
**Severity:** High

## TC-MARKET-MODERATION-019
**Title:** Reporting-spam blocking
**Pre:** User reports same listing 5 times in 1 hour with different accounts (likely brigading)
**Steps:**
1. Detect pattern
**Expected:** Heuristic flags brigading; admin can dismiss reports en masse.
**Severity:** Medium

## TC-MARKET-MODERATION-020
**Title:** Moderation queue filtering
**Pre:** Many entries
**Steps:**
1. Filter by reason / status / date
**Expected:** Filters work; URL stateful.
**Severity:** Low

## TC-MARKET-MODERATION-021
**Title:** Admin can hide reviewer's review
**Pre:** Inappropriate review
**Steps:**
1. From queue, hide review
**Expected:** Review soft-deleted; admin action logged.
**Severity:** Medium

## TC-MARKET-MODERATION-022
**Title:** Admin can ban a user from posting reviews
**Pre:** Repeat offender
**Steps:**
1. Ban user from reviews
**Expected:** Their reviews hidden; new review attempts 403.
**Severity:** Medium

## TC-MARKET-MODERATION-023
**Title:** Notification to author on moderation action
**Pre:** Listing rejected
**Steps:**
1. Author logs in
**Expected:** In-app notification + email with reason and appeal link.
**Severity:** Medium

## TC-MARKET-MODERATION-024
**Title:** Appeal flow
**Pre:** Author received rejection
**Steps:**
1. Click Appeal; submit text
**Expected:** marketplace_appeals row; admin queue gets appeal; can approve/deny.
**Severity:** Low

## TC-MARKET-MODERATION-025
**Title:** Audit trail visible to admin (read-only)
**Pre:** Admin
**Steps:**
1. Open listing → Audit
**Expected:** Full chronological actions on this listing.
**Severity:** Medium

## TC-MARKET-MODERATION-026
**Title:** Hidden review still counted in old data exports? (handle correctly)
**Pre:** Admin export
**Steps:**
1. Export reviews
**Expected:** Hidden reviews excluded from public export, included in admin export with status flag.
**Severity:** Low

## TC-MARKET-MODERATION-027
**Title:** Author-facing taken-down state shown
**Pre:** Listing taken_down
**Steps:**
1. Author views listing in their dashboard
**Expected:** Status badge red "Taken down — see notice"; reason visible.
**Severity:** Medium

## TC-MARKET-MODERATION-028
**Title:** Non-platform-admin terminology used (per CLAUDE.md)
**Pre:** N/A
**Steps:**
1. Inspect UI strings
**Expected:** "Platform admin" — not "god mode"; consistent throughout.
**Severity:** Low

## TC-MARKET-MODERATION-029
**Title:** Moderation does not delete bundle artifact
**Pre:** Takedown
**Steps:**
1. Inspect storage
**Expected:** Bundle preserved (frozen) for legal/audit; only metadata flagged. Restore possible.
**Severity:** Medium

## TC-MARKET-MODERATION-030
**Title:** Bulk moderation action
**Pre:** 10 listings flagged
**Steps:**
1. Select all; approve all
**Expected:** Bulk action with single audit entry per listing.
**Severity:** Low

## TC-MARKET-MODERATION-031
**Title:** Reporting threshold configurable per category
**Pre:** Admin settings
**Steps:**
1. Set threshold for "AI" category higher
**Expected:** Threshold respected per-category; default fallback otherwise.
**Severity:** Low

## TC-MARKET-MODERATION-032
**Title:** Auto-detection of malicious bundle (static scan)
**Pre:** Bundle includes obvious eval'd remote script
**Steps:**
1. Author publishes
**Expected:** Auto-flagged for review before being public; admin sees red flag.
**Severity:** Medium
