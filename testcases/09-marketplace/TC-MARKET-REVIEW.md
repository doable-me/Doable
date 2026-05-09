# TC-MARKET-REVIEW — Reviews on marketplace listings

Covers post review (post-install only), edit own, delete own, average rating recompute, abuse prevention.

---

## TC-MARKET-REVIEW-001
**Title:** Post review only after install
**Pre:** User has not installed listing
**Steps:**
1. Try to post a review on listing detail page
**Expected:** Review form disabled with message "Install this to post a review". API blocks: 403.
**Severity:** Critical

## TC-MARKET-REVIEW-002
**Title:** Post review after install
**Pre:** User installed listing
**Steps:**
1. Detail page → Reviews tab → write review with 5★ + 200-char text
2. Submit
**Expected:** Review appears immediately under user's own card; in DB marketplace_reviews row created.
**Severity:** Critical

## TC-MARKET-REVIEW-003
**Title:** One review per user per listing
**Pre:** User already reviewed
**Steps:**
1. Try to submit second review
**Expected:** UI prevents (form replaced with "Edit review"); API rejects 409.
**Severity:** High

## TC-MARKET-REVIEW-004
**Title:** Edit own review
**Pre:** Own review exists
**Steps:**
1. Click Edit; change text/rating
2. Save
**Expected:** Updated_at bumped; marketplace_reviews.body and rating updated. Listing avg recomputed.
**Severity:** High

## TC-MARKET-REVIEW-005
**Title:** Delete own review
**Pre:** Own review exists
**Steps:**
1. Click Delete; confirm
**Expected:** Row hard-deleted (or soft-deleted with `deleted_at`); listing avg rating + count recomputed.
**Severity:** High

## TC-MARKET-REVIEW-006
**Title:** Cannot edit/delete someone else's review
**Pre:** User B's review on listing
**Steps:**
1. User A tries DELETE /marketplace/reviews/<id>
**Expected:** 403.
**Severity:** Critical

## TC-MARKET-REVIEW-007
**Title:** Average rating recompute on insert
**Pre:** No reviews; user posts 5★
**Steps:**
1. Submit
**Expected:** Listing avg_rating = 5.0 (cached on listing row); review_count = 1.
**Severity:** High

## TC-MARKET-REVIEW-008
**Title:** Average rating recompute on update
**Pre:** Three reviews 5,4,3 → avg 4.0
**Steps:**
1. User changes their 3★ to 5★
**Expected:** New avg = 4.67. count unchanged.
**Severity:** Medium

## TC-MARKET-REVIEW-009
**Title:** Average rating recompute on delete
**Pre:** Three reviews 5,4,3
**Steps:**
1. User deletes their 3★
**Expected:** New avg = 4.5; count = 2.
**Severity:** Medium

## TC-MARKET-REVIEW-010
**Title:** Rating must be 1–5 integer
**Pre:** N/A
**Steps:**
1. Submit rating 0 → reject
2. Submit 6 → reject
3. Submit 3.5 → reject
**Expected:** All 400.
**Severity:** Medium

## TC-MARKET-REVIEW-011
**Title:** Review body length cap
**Pre:** Default cap 5000 chars
**Steps:**
1. Submit 10000-char body
**Expected:** 400 with character count info.
**Severity:** Low

## TC-MARKET-REVIEW-012
**Title:** Review body sanitized of script tags
**Pre:** N/A
**Steps:**
1. Submit body `<script>alert(1)</script>`
**Expected:** Stored as escaped text or with tags stripped; render does not execute.
**Severity:** Critical

## TC-MARKET-REVIEW-013
**Title:** Review supports markdown rendering (limited)
**Pre:** N/A
**Steps:**
1. Submit body with **bold**, *italic*, code
**Expected:** Renders bold/italic; code highlighted. No raw HTML allowed; no images; no links to non-https.
**Severity:** Medium

## TC-MARKET-REVIEW-014
**Title:** Reviews paginated
**Pre:** Listing has 100 reviews
**Steps:**
1. Open detail; scroll
**Expected:** First 20 visible; load more or paginated. Sorted newest-first.
**Severity:** Medium

## TC-MARKET-REVIEW-015
**Title:** Reviews sortable
**Pre:** N/A
**Steps:**
1. Sort: most helpful
**Expected:** Order changes; supports sort by rating asc/desc, helpful_count.
**Severity:** Low

## TC-MARKET-REVIEW-016
**Title:** Mark review as helpful (vote)
**Pre:** Other users' review
**Steps:**
1. Click thumbs-up
**Expected:** helpful_count++; vote saved (one per user per review). Re-click toggles off.
**Severity:** Low

## TC-MARKET-REVIEW-017
**Title:** Cannot vote helpful on own review
**Pre:** Own review
**Steps:**
1. Click thumbs-up
**Expected:** Disabled or 400.
**Severity:** Low

## TC-MARKET-REVIEW-018
**Title:** Author can reply to review
**Pre:** Listing author logged in
**Steps:**
1. Click "Reply" on a review
2. Submit
**Expected:** Reply nested under review; marked "Author response". One reply per review.
**Severity:** Low

## TC-MARKET-REVIEW-019
**Title:** Author edit reply
**Pre:** Reply exists
**Steps:**
1. Edit
**Expected:** Updated_at bumped; visible.
**Severity:** Low

## TC-MARKET-REVIEW-020
**Title:** Reviewer can flag/report a review
**Pre:** Inappropriate review
**Steps:**
1. Click ⋯ → Report
2. Select reason
**Expected:** marketplace_reports row created; admin queue updated.
**Severity:** Medium

## TC-MARKET-REVIEW-021
**Title:** Spam detection on review submission
**Pre:** Body matches known spam patterns
**Steps:**
1. Submit obvious spam
**Expected:** Either auto-flagged for moderation, or rate-limited if user posts many in short time.
**Severity:** Medium

## TC-MARKET-REVIEW-022
**Title:** Review rate limit
**Pre:** Default 5 reviews/hour/user
**Steps:**
1. Burst 10 reviews on different listings
**Expected:** Excess 429.
**Severity:** Low

## TC-MARKET-REVIEW-023
**Title:** Review timestamp displayed (relative)
**Pre:** Review posted 2 days ago
**Steps:**
1. Render
**Expected:** "2 days ago" with title attribute showing absolute timestamp.
**Severity:** Low

## TC-MARKET-REVIEW-024
**Title:** Review filter by rating
**Pre:** Mixed ratings
**Steps:**
1. Filter to 1★ only
**Expected:** Only 1★ shown.
**Severity:** Low

## TC-MARKET-REVIEW-025
**Title:** Review search within listing
**Pre:** Many reviews
**Steps:**
1. Search "crash"
**Expected:** Matching reviews highlighted; trigram search.
**Severity:** Low

## TC-MARKET-REVIEW-026
**Title:** Reviews preserved when listing version updates
**Pre:** Review on v1; author releases v2
**Steps:**
1. View v2 detail
**Expected:** Review still shown; tagged with `for v1` if version-specific.
**Severity:** Medium

## TC-MARKET-REVIEW-027
**Title:** Verified-installer badge on review
**Pre:** Review by user who installed
**Steps:**
1. Render
**Expected:** "Verified installer" badge shown.
**Severity:** Low

## TC-MARKET-REVIEW-028
**Title:** Anonymous cannot view reviews? — actually CAN view, just cannot post
**Pre:** Logged out
**Steps:**
1. Detail page
**Expected:** Reviews visible read-only. Post form prompts login.
**Severity:** Medium

## TC-MARKET-REVIEW-029
**Title:** Soft-deleted review hidden from public
**Pre:** Review soft-deleted by admin
**Steps:**
1. Public view
**Expected:** Not visible. Admin can still see.
**Severity:** Medium

## TC-MARKET-REVIEW-030
**Title:** Review export by author (their own listings)
**Pre:** Author dashboard
**Steps:**
1. Click Export reviews
**Expected:** CSV with all reviews on their listings.
**Severity:** Low
