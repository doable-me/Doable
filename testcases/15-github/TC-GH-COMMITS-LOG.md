# TC-GH-COMMITS-LOG — github_commits log per project & commit history UI

Covers persisting commit metadata, displaying log, deep-link to GH, integrity.

---

## TC-GH-COMMITS-LOG-001
**Title:** Commits log shows all commits since connect
**Pre:** Project linked; 5 commits
**Steps:**
1. Open Git tab
**Expected:** All 5 listed in github_commits; sha, message, author, ts, branch.
**Severity:** High

## TC-GH-COMMITS-LOG-002
**Title:** Commit click opens GitHub
**Pre:** N/A
**Steps:**
1. Click sha
**Expected:** Opens https://github.com/<owner>/<repo>/commit/<sha> in new tab.
**Severity:** Low

## TC-GH-COMMITS-LOG-003
**Title:** Commits paginated
**Pre:** 100 commits
**Steps:**
1. View
**Expected:** First 25; load more.
**Severity:** Medium

## TC-GH-COMMITS-LOG-004
**Title:** Commit direction marked (in/out)
**Pre:** Mix of pushes and pulls
**Steps:**
1. Inspect
**Expected:** Each row has direction: `out` (doable→GH) or `in` (GH→doable).
**Severity:** Medium

## TC-GH-COMMITS-LOG-005
**Title:** Commit body excerpt shown
**Pre:** Multi-line message
**Steps:**
1. Hover
**Expected:** Full message shown in tooltip; first line truncated in row.
**Severity:** Low

## TC-GH-COMMITS-LOG-006
**Title:** Commit log filter by author
**Pre:** Two collaborators committing
**Steps:**
1. Filter by author
**Expected:** Filtered list.
**Severity:** Low

## TC-GH-COMMITS-LOG-007
**Title:** Commit log filter by date range
**Pre:** Many commits
**Steps:**
1. Pick range
**Expected:** Filtered.
**Severity:** Low

## TC-GH-COMMITS-LOG-008
**Title:** Commit log search by message text
**Pre:** N/A
**Steps:**
1. Search "fix"
**Expected:** Matching commits highlighted.
**Severity:** Low

## TC-GH-COMMITS-LOG-009
**Title:** Commit log preserved after disconnect
**Pre:** Disconnect repo
**Steps:**
1. Reopen Git tab
**Expected:** Historical commits visible read-only.
**Severity:** Medium

## TC-GH-COMMITS-LOG-010
**Title:** Commit row stores files_changed_count
**Pre:** Push of 5 files
**Steps:**
1. Inspect row
**Expected:** files_changed_count = 5; +/- lines if cheap to compute.
**Severity:** Low

## TC-GH-COMMITS-LOG-011
**Title:** Commit log purged after project deletion (GDPR)
**Pre:** Project hard-deleted
**Steps:**
1. After grace period
**Expected:** github_commits rows for project deleted (cascade).
**Severity:** Medium

## TC-GH-COMMITS-LOG-012
**Title:** Commit log API endpoint
**Pre:** Project P
**Steps:**
1. GET /github/commits?project_id=P
**Expected:** Returns paginated rows.
**Severity:** Medium

## TC-GH-COMMITS-LOG-013
**Title:** Commit log permission: collaborators only
**Pre:** Non-collaborator
**Steps:**
1. GET endpoint
**Expected:** 403.
**Severity:** Critical

## TC-GH-COMMITS-LOG-014
**Title:** Commit log dedup by sha+branch
**Pre:** Same commit ingested twice
**Steps:**
1. Inspect
**Expected:** Single row; not duplicated.
**Severity:** Medium

## TC-GH-COMMITS-LOG-015
**Title:** Commit log for merge commits
**Pre:** Merge commit
**Steps:**
1. View
**Expected:** Merge commit shown with parent shas; UI flags as merge.
**Severity:** Low

## TC-GH-COMMITS-LOG-016
**Title:** Commit log for force-push reflow
**Pre:** Force push rewrites history
**Steps:**
1. After force-push
**Expected:** Old commits flagged abandoned; new ones added; UI shows "history rewritten".
**Severity:** Medium

## TC-GH-COMMITS-LOG-017
**Title:** Commit author resolved against doable users (link)
**Pre:** Push by user with linked GH email
**Steps:**
1. View row
**Expected:** Doable username shown alongside GH author; clickable to profile.
**Severity:** Low

## TC-GH-COMMITS-LOG-018
**Title:** Commits log triggers no excessive GH API calls
**Pre:** N/A
**Steps:**
1. Open log
**Expected:** Server reads from local table; only refreshes on demand or via webhook. Avoids burning rate limit.
**Severity:** Medium

## TC-GH-COMMITS-LOG-019
**Title:** Commit log shows status checks (CI)
**Pre:** CI configured on repo
**Steps:**
1. View
**Expected:** Each row shows CI badge (success/failure/pending) when last polled.
**Severity:** Low

## TC-GH-COMMITS-LOG-020
**Title:** Commit log export CSV
**Pre:** N/A
**Steps:**
1. Click export
**Expected:** CSV download.
**Severity:** Low
