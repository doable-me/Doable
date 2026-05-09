# TC-GH-PULL — Pull from connected GitHub repo, merge, conflict resolution

Covers fetching changes from remote, applying them, conflict UX.

---

## TC-GH-PULL-001
**Title:** Pull when no remote changes
**Pre:** Up to date
**Steps:**
1. Click Pull
**Expected:** No-op; UI shows "Already up to date".
**Severity:** Low

## TC-GH-PULL-002
**Title:** Pull when remote ahead — fast-forward
**Pre:** Remote has 1 new commit; local clean
**Steps:**
1. Click Pull
**Expected:** Files updated to remote HEAD; UI shows new commits in log; project auto-saved.
**Severity:** Critical

## TC-GH-PULL-003
**Title:** Pull when local has uncommitted changes — warn
**Pre:** Local modified `index.html`
**Steps:**
1. Click Pull
**Expected:** Warning "You have unsaved changes; pulling may overwrite. Save first?". Options: Save & Pull, Discard & Pull, Cancel.
**Severity:** High

## TC-GH-PULL-004
**Title:** Pull merge — non-conflicting
**Pre:** Local has commit A; remote has different commit B
**Steps:**
1. Click Pull
**Expected:** Merge commit created; both A and B in history; project files reflect merge.
**Severity:** High

## TC-GH-PULL-005
**Title:** Pull merge with conflict — UI shows conflict files
**Pre:** Both A and B modify `index.html` differently
**Steps:**
1. Click Pull
**Expected:** UI shows "Conflicts in 1 file"; conflict markers inserted; user routed to resolution view.
**Severity:** Critical

## TC-GH-PULL-006
**Title:** Conflict resolution: pick "ours" / "theirs" / merge
**Pre:** Conflict in conflict view
**Steps:**
1. For each hunk, choose ours/theirs/edit
**Expected:** Resolved file produced; markers cleared; commit on resolve.
**Severity:** Critical

## TC-GH-PULL-007
**Title:** Cancel mid-conflict resolution
**Pre:** Conflict pending
**Steps:**
1. Click Cancel
**Expected:** Pull aborted; local restored to pre-pull state.
**Severity:** High

## TC-GH-PULL-008
**Title:** Pull with rebase option
**Pre:** Setting rebase=true
**Steps:**
1. Pull
**Expected:** Rebase rather than merge; linear history. Conflicts handled per-commit.
**Severity:** Medium

## TC-GH-PULL-009
**Title:** Pull from non-default branch
**Pre:** Project linked to `dev` branch
**Steps:**
1. Pull
**Expected:** Pulls dev only; main untouched.
**Severity:** Medium

## TC-GH-PULL-010
**Title:** Pull respects .gitignore (don't write ignored files)
**Pre:** Remote has ignored file inadvertently committed
**Steps:**
1. Pull
**Expected:** File not surfaced in editor; metadata only fetched.
**Severity:** Low

## TC-GH-PULL-011
**Title:** Pull adds new files
**Pre:** Remote has new file
**Steps:**
1. Pull
**Expected:** New file appears in editor.
**Severity:** High

## TC-GH-PULL-012
**Title:** Pull deletes locally-removed-on-remote files
**Pre:** Remote deleted `old.js`
**Steps:**
1. Pull
**Expected:** Local file removed; user warned via summary.
**Severity:** Medium

## TC-GH-PULL-013
**Title:** Pull renamed file
**Pre:** Remote renamed
**Steps:**
1. Pull
**Expected:** Local file renamed accordingly.
**Severity:** Low

## TC-GH-PULL-014
**Title:** Pull updates github_commits log
**Pre:** N/A
**Steps:**
1. Pull
**Expected:** Pulled commits appended to log with `direction=in`.
**Severity:** Medium

## TC-GH-PULL-015
**Title:** Pull when GH down
**Pre:** GH 5xx
**Steps:**
1. Pull
**Expected:** Retries; surfaces error; no partial state.
**Severity:** Medium

## TC-GH-PULL-016
**Title:** Pull when GH token revoked
**Pre:** Revoked
**Steps:**
1. Pull
**Expected:** 401; reconnect prompt.
**Severity:** High

## TC-GH-PULL-017
**Title:** Pull large repo (1000 files)
**Pre:** Repo big
**Steps:**
1. Pull
**Expected:** Streams files; progress UI; memory usage bounded.
**Severity:** Medium

## TC-GH-PULL-018
**Title:** Pull permission: viewer can pull (read-only flow)
**Pre:** Viewer role
**Steps:**
1. Pull
**Expected:** Allowed (read-only doesn't push); fetches changes for read.
**Severity:** Medium

## TC-GH-PULL-019
**Title:** Pull preserves Yjs editor state where possible
**Pre:** Active editing session
**Steps:**
1. Pull
**Expected:** Yjs doc updated with merged content; collaborators notified.
**Severity:** Medium

## TC-GH-PULL-020
**Title:** Pull respects branch protection on remote (read still allowed)
**Pre:** Protected branch
**Steps:**
1. Pull
**Expected:** Read works regardless of protection.
**Severity:** Low

## TC-GH-PULL-021
**Title:** Pull diff summary after success
**Pre:** Changes pulled
**Steps:**
1. View result
**Expected:** Summary modal: "Pulled 3 commits, 5 files changed (+120 −40)".
**Severity:** Low

## TC-GH-PULL-022
**Title:** Pull repeatedly idempotent
**Pre:** Up to date
**Steps:**
1. Pull twice
**Expected:** Both no-ops; no spurious merge commits.
**Severity:** Low

## TC-GH-PULL-023
**Title:** Pull with shallow clone fallback for very large repos
**Pre:** Repo with 100K+ commits
**Steps:**
1. Pull
**Expected:** Server uses shallow fetch (depth=1) for first pull; deep history not required for code editing.
**Severity:** Low

## TC-GH-PULL-024
**Title:** Pull merge commit message customizable
**Pre:** Merge required
**Steps:**
1. User edits merge commit msg
**Expected:** Stored in merge commit on remote when pushed.
**Severity:** Low

## TC-GH-PULL-025
**Title:** Pull does not happen if upstream URL changed
**Pre:** Linked to repo X but somehow upstream now Y
**Steps:**
1. Pull
**Expected:** Detected mismatch; user prompted.
**Severity:** Low

## TC-GH-PULL-026
**Title:** Pull cancel button mid-fetch
**Pre:** Slow large pull
**Steps:**
1. Click Cancel
**Expected:** Fetch aborted; local state intact; UI returns to clean.
**Severity:** Medium

## TC-GH-PULL-027
**Title:** Pull notification on collaborator's pull
**Pre:** Other collaborator pulls
**Steps:**
1. User refreshes
**Expected:** Notification "Bob synced from GitHub"; project content updated.
**Severity:** Low

## TC-GH-PULL-028
**Title:** Pull stale lock detection
**Pre:** Pull in progress; UI tab closed mid-flight
**Steps:**
1. Reopen
**Expected:** Stale lock cleared after 5 min; user can retry.
**Severity:** Low

## TC-GH-PULL-029
**Title:** Pull conflict marker text format
**Pre:** Conflict
**Steps:**
1. Inspect file content during conflict
**Expected:** Standard Git markers `<<<<<<<`, `=======`, `>>>>>>>` plus branch labels. Editor highlights.
**Severity:** Medium

## TC-GH-PULL-030
**Title:** Pull conflict three-way auto-merge attempt
**Pre:** Non-overlapping changes in same file
**Steps:**
1. Pull
**Expected:** Auto-merged without conflict UI.
**Severity:** Medium
