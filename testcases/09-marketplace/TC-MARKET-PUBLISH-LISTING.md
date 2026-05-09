# TC-MARKET-PUBLISH-LISTING — Create, edit, publish, unpublish a marketplace listing

Covers `My Listings` page, draft → published transition, version bump, revision history, asset upload, listing JSON validation.

---

## TC-MARKET-PUBLISH-LISTING-001
**Title:** Create new listing draft
**Pre:** User logged in
**Steps:**
1. Navigate to /marketplace/my → Click "New Listing"
2. Fill title, description, category
3. Save as draft
**Expected:** marketplace_listings row created with status=`draft`. Visible only to author.
**Severity:** Critical

## TC-MARKET-PUBLISH-LISTING-002
**Title:** Edit listing draft
**Pre:** Draft exists
**Steps:**
1. Open draft
2. Edit fields; save
**Expected:** updated_at bumped; new fields persisted.
**Severity:** High

## TC-MARKET-PUBLISH-LISTING-003
**Title:** Listing requires source project
**Pre:** New listing form
**Steps:**
1. Try to publish without selecting source project
**Expected:** Validation error: "Choose a project to package".
**Severity:** Critical

## TC-MARKET-PUBLISH-LISTING-004
**Title:** Publishing builds bundle artifact
**Pre:** Draft with project selected
**Steps:**
1. Click Publish
**Expected:** Server creates marketplace_bundle_artifacts row with version=1, sha256, size; listing status=published.
**Severity:** Critical

## TC-MARKET-PUBLISH-LISTING-005
**Title:** Publish bundle artifact stored at known path
**Pre:** N/A
**Steps:**
1. Publish; inspect storage
**Expected:** Path /root/doable/marketplace/bundles/<listing>/<version>/bundle.tar.zst (or similar). Permissions correct.
**Severity:** High

## TC-MARKET-PUBLISH-LISTING-006
**Title:** Bundle integrity hash verified at install
**Pre:** Listing published
**Steps:**
1. Manually corrupt bundle file
2. Try install
**Expected:** Install fails: "Bundle integrity check failed"; admin alerted.
**Severity:** Critical

## TC-MARKET-PUBLISH-LISTING-007
**Title:** Version bump on republish
**Pre:** Listing v1 published
**Steps:**
1. Author updates source project
2. Click "Publish update"
3. Choose semver bump (patch/minor/major)
**Expected:** New version row v1.0.1; old v1.0.0 still installable from version history.
**Severity:** High

## TC-MARKET-PUBLISH-LISTING-008
**Title:** Version semver validation
**Pre:** N/A
**Steps:**
1. Manually input version `notsemver`
**Expected:** 400 "Version must be valid semver".
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-009
**Title:** Version cannot decrement
**Pre:** Latest = v2.0.0
**Steps:**
1. Try to publish v1.5.0
**Expected:** 400 "Version must be greater than current".
**Severity:** High

## TC-MARKET-PUBLISH-LISTING-010
**Title:** Changelog required on update
**Pre:** Updating listing
**Steps:**
1. Submit without changelog
**Expected:** Validation: "Add a changelog note for this update".
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-011
**Title:** Revision history visible to author
**Pre:** Multiple versions
**Steps:**
1. Open My Listings → version history tab
**Expected:** All versions listed with changelog, install_count per version, status.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-012
**Title:** Unpublish listing
**Pre:** Published listing
**Steps:**
1. Click "Unpublish"; confirm
**Expected:** Status=unpublished; not visible publicly; existing installs unaffected.
**Severity:** High

## TC-MARKET-PUBLISH-LISTING-013
**Title:** Unpublish then re-publish
**Pre:** Unpublished listing
**Steps:**
1. Click Publish
**Expected:** Status returns to published; same slug retained.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-014
**Title:** Listing thumbnail upload (PNG/JPG)
**Pre:** New listing
**Steps:**
1. Upload thumbnail.png 500x500
**Expected:** Stored; URL referenced from listing row. Auto-resized variants generated.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-015
**Title:** Thumbnail file too large rejected
**Pre:** Limit 2MB
**Steps:**
1. Upload 5MB image
**Expected:** 413 with size hint.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-016
**Title:** Thumbnail unsupported type rejected
**Pre:** N/A
**Steps:**
1. Upload PDF
**Expected:** 415; only image/* accepted.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-017
**Title:** Multiple screenshots upload
**Pre:** New listing
**Steps:**
1. Upload 5 screenshots
**Expected:** All stored; ordered by upload sequence; reorder via drag.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-018
**Title:** Listing tags input
**Pre:** N/A
**Steps:**
1. Add tags `react`, `ui`, `widgets`
**Expected:** Stored as array; max 10 tags; each tag length ≤ 30 chars; lowercased.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-019
**Title:** Listing description rich-text/markdown stored
**Pre:** N/A
**Steps:**
1. Type with markdown
2. Save
**Expected:** Stored verbatim; rendered with sanitizer on display.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-020
**Title:** Listing JSON malformed rejected (programmatic API)
**Pre:** Direct API call
**Steps:**
1. POST /marketplace/listings with malformed JSON
**Expected:** 400 with parse error.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-021
**Title:** Listing JSON missing required fields rejected
**Pre:** Direct API
**Steps:**
1. POST without title
**Expected:** 400 listing fields needed.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-022
**Title:** My Listings page lists own listings
**Pre:** User has 5 listings
**Steps:**
1. Visit /marketplace/my
**Expected:** All 5 visible with status badges.
**Severity:** High

## TC-MARKET-PUBLISH-LISTING-023
**Title:** My Listings dashboard metrics
**Pre:** Listing has installs, reviews
**Steps:**
1. View
**Expected:** Per-listing: install_count, avg_rating, review_count, revenue (if paid), trending arrow.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-024
**Title:** Delete draft listing
**Pre:** Draft only
**Steps:**
1. Delete; confirm
**Expected:** Removed permanently; nothing public to consider.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-025
**Title:** Cannot delete published listing — must unpublish first
**Pre:** Published listing
**Steps:**
1. Try Delete
**Expected:** UI prompts unpublish first; or soft-delete with grace period.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-026
**Title:** Listing requires accepting publisher terms (first-time)
**Pre:** Author never published
**Steps:**
1. Click Publish first time
**Expected:** Modal with publisher agreement; must accept to proceed; persistence noted.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-027
**Title:** Listing license selection
**Pre:** N/A
**Steps:**
1. Choose MIT, Apache-2.0, GPL-3.0, Custom
**Expected:** License recorded on listing; shown on detail page.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-028
**Title:** Open-source-only enforcement (per CLAUDE.md)
**Pre:** Custom commercial license selected
**Steps:**
1. Try to publish
**Expected:** Reject if platform policy requires OSI license; admin override possible.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-029
**Title:** Listing slug auto-generated from title; editable once
**Pre:** Title "My Cool App"
**Steps:**
1. Slug field shows `my-cool-app`
2. Edit before first publish
**Expected:** Editable until published; locked after.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-030
**Title:** Concurrent publish-update prevented
**Pre:** Author triggers publish twice
**Steps:**
1. Two clicks within 1s
**Expected:** Second 409 "Publish in progress".
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-031
**Title:** Bundle build runs in sandbox
**Pre:** Bundle build step (zips project)
**Steps:**
1. Bundle includes hostile script attempting host access
**Expected:** Sandbox blocks; build proceeds for benign part or fails cleanly.
**Severity:** Critical

## TC-MARKET-PUBLISH-LISTING-032
**Title:** Bundle excludes secrets (.env)
**Pre:** Project has .env
**Steps:**
1. Publish
2. Inspect bundle
**Expected:** .env not in bundle. .env.example included if present.
**Severity:** Critical

## TC-MARKET-PUBLISH-LISTING-033
**Title:** Bundle size cap per plan
**Pre:** Free 10MB cap
**Steps:**
1. Bundle larger than cap
**Expected:** 413; upgrade hint.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-034
**Title:** Listing published triggers webhook for curators
**Pre:** Webhook configured
**Steps:**
1. Publish
**Expected:** POST to webhook with listing payload; reasonable retries on failure.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-035
**Title:** Search index updated on publish
**Pre:** N/A
**Steps:**
1. Publish; immediately search title
**Expected:** New listing appears within 5s (or instant if synchronous index update).
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-036
**Title:** Listing categories validated
**Pre:** N/A
**Steps:**
1. Try invalid category id
**Expected:** 400; only registered categories accepted.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-037
**Title:** Listing visibility scope (workspace-private)
**Pre:** Workspace-private listing
**Steps:**
1. Publish in workspace mode
**Expected:** Visible only to workspace members; not in public marketplace.
**Severity:** Medium

## TC-MARKET-PUBLISH-LISTING-038
**Title:** Featured bundle membership editable by author
**Pre:** N/A
**Steps:**
1. Author requests inclusion in featured bundle
**Expected:** Request queued for admin curators.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-039
**Title:** Listing soft-delete grace period
**Pre:** User opted to delete
**Steps:**
1. Delete
**Expected:** 30-day grace; recoverable from "Trash"; after, hard-delete cron runs.
**Severity:** Low

## TC-MARKET-PUBLISH-LISTING-040
**Title:** Author profile listing count updates on publish/unpublish
**Pre:** Author has 3 published
**Steps:**
1. Unpublish one
**Expected:** Count = 2 on profile.
**Severity:** Low
