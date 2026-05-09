# TC-GH-PUSH — Push project changes to connected GitHub repo

Covers commit creation, push, force-push refusal, github_commits log, ACL.

---

## TC-GH-PUSH-001
**Title:** First push to empty repo
**Pre:** Empty repo connected; project has files
**Steps:**
1. Click Push (with commit msg)
**Expected:** All project files committed and pushed to default branch; remote now reflects project; github_commits row created.
**Severity:** Critical

## TC-GH-PUSH-002
**Title:** Push with commit message required
**Pre:** Push dialog
**Steps:**
1. Submit empty message
**Expected:** 400 "Commit message required" or auto-generates from changes.
**Severity:** Medium

## TC-GH-PUSH-003
**Title:** Push only changed files
**Pre:** Modify 2 files of 100
**Steps:**
1. Push
**Expected:** Diff includes only those 2 files; commit reflects.
**Severity:** High

## TC-GH-PUSH-004
**Title:** Push records github_commits row
**Pre:** N/A
**Steps:**
1. Push
**Expected:** Row {project_id, sha, message, author_id, pushed_at, branch, files_changed_count}.
**Severity:** High

## TC-GH-PUSH-005
**Title:** Push to non-default branch
**Pre:** Project linked with branch=dev
**Steps:**
1. Push
**Expected:** Commit on dev; main untouched.
**Severity:** Medium

## TC-GH-PUSH-006
**Title:** Push when remote ahead — auto-prompt to pull or rebase
**Pre:** Remote has commits doable doesn't
**Steps:**
1. Click Push
**Expected:** UI detects non-fast-forward; prompts "Pull and merge first" or "Rebase". No automatic force-push.
**Severity:** High

## TC-GH-PUSH-007
**Title:** Force-push refused by default
**Pre:** Diverged history
**Steps:**
1. Try Push with force=true
**Expected:** 400 "Force push not allowed; resolve manually". Configurable per workspace by admin.
**Severity:** High

## TC-GH-PUSH-008
**Title:** Force-push allowed for admin/branch-protection-off
**Pre:** Admin override OR branch unprotected
**Steps:**
1. Force push
**Expected:** Allowed; logged with `force=true` flag in github_commits.
**Severity:** Medium

## TC-GH-PUSH-009
**Title:** Push to protected branch refused
**Pre:** GitHub branch protection enabled (no direct pushes)
**Steps:**
1. Push to main
**Expected:** GH 422; UI shows "Branch protected; create a PR instead". Suggest PR action.
**Severity:** High

## TC-GH-PUSH-010
**Title:** Create PR option for protected branch
**Pre:** Above
**Steps:**
1. Click "Create PR"
**Expected:** Server creates branch `doable-update-<n>`, pushes, opens PR via GH API.
**Severity:** Medium

## TC-GH-PUSH-011
**Title:** Push large file (>100MB) refused by GH
**Pre:** Project has 110MB binary
**Steps:**
1. Push
**Expected:** GH rejects; UI shows "File >100MB; consider git-lfs or remove". Suggest .gitignore.
**Severity:** Medium

## TC-GH-PUSH-012
**Title:** Push with binary files (images, fonts)
**Pre:** Project has png, woff2
**Steps:**
1. Push
**Expected:** Pushes successfully; binary content preserved (no base64 corruption).
**Severity:** High

## TC-GH-PUSH-013
**Title:** Push with deleted files
**Pre:** Delete file `old.js` in project
**Steps:**
1. Push
**Expected:** Commit deletes file; remote no longer has it.
**Severity:** High

## TC-GH-PUSH-014
**Title:** Push with renamed files
**Pre:** Rename `a.js` → `b.js`
**Steps:**
1. Push
**Expected:** GH detects rename if content similar; otherwise delete+add. Either acceptable.
**Severity:** Low

## TC-GH-PUSH-015
**Title:** Push respects .gitignore
**Pre:** Project has .gitignore excluding `secrets/`
**Steps:**
1. Push
**Expected:** secrets/ files not pushed.
**Severity:** High

## TC-GH-PUSH-016
**Title:** Push includes default .gitignore if none exists
**Pre:** Project has no .gitignore; uses Node project
**Steps:**
1. First push
**Expected:** Auto-generated sensible defaults: node_modules, .env, .next, dist, .DS_Store. Confirm with user.
**Severity:** Medium

## TC-GH-PUSH-017
**Title:** Push commit author details
**Pre:** N/A
**Steps:**
1. Push
**Expected:** Commit author: doable user's email or `doable-bot[bot]@users.noreply.github.com` per setting; co-author trailer optionally.
**Severity:** Low

## TC-GH-PUSH-018
**Title:** Push commit signed (GPG/SSH if configured)
**Pre:** Workspace signing config exists
**Steps:**
1. Push
**Expected:** Commits signed; verifiable on GH.
**Severity:** Low

## TC-GH-PUSH-019
**Title:** Push concurrency: two users push to same project simultaneously
**Pre:** Two collaborators
**Steps:**
1. Both push within 1s
**Expected:** Server serializes per project link; second push waits or rebases on first; no conflict from doable side. Whichever lands second may need pull.
**Severity:** Medium

## TC-GH-PUSH-020
**Title:** Push button disabled when no changes
**Pre:** No diff vs last push
**Steps:**
1. View Push button
**Expected:** Disabled with tooltip "No changes to push".
**Severity:** Low

## TC-GH-PUSH-021
**Title:** Push button shows # of files changed
**Pre:** 3 files modified
**Steps:**
1. View
**Expected:** Badge "3 changes"; click to see diff preview.
**Severity:** Low

## TC-GH-PUSH-022
**Title:** Push diff preview
**Pre:** Changes
**Steps:**
1. Click "Preview"
**Expected:** Modal shows file list with +/- counts; expand to see line diff.
**Severity:** Medium

## TC-GH-PUSH-023
**Title:** Push with subset of files
**Pre:** 5 files changed
**Steps:**
1. Select 2 to push (staging UI)
**Expected:** Only selected committed; others remain dirty.
**Severity:** Medium

## TC-GH-PUSH-024
**Title:** Push respects max commit size
**Pre:** Massive change (10K files)
**Steps:**
1. Push
**Expected:** Server warns "very large commit" but proceeds if under hard cap; uses GH /git API for trees.
**Severity:** Low

## TC-GH-PUSH-025
**Title:** Push permission: viewer cannot push
**Pre:** Viewer role on doable project
**Steps:**
1. Click Push
**Expected:** 403; UI button disabled.
**Severity:** Critical

## TC-GH-PUSH-026
**Title:** Push when GH token revoked
**Pre:** Token invalidated
**Steps:**
1. Push
**Expected:** 401 from GH; UI prompts reconnect.
**Severity:** High

## TC-GH-PUSH-027
**Title:** Push when GH down
**Pre:** GH API 5xx
**Steps:**
1. Push
**Expected:** Retries with backoff; eventually surfaces "GitHub is unreachable; try again".
**Severity:** Medium

## TC-GH-PUSH-028
**Title:** Push with secret in code detected (GH push protection)
**Pre:** File contains AWS key
**Steps:**
1. Push
**Expected:** GH push protection rejects; UI surfaces secret-scan result; user can remove or override (with audit).
**Severity:** Critical

## TC-GH-PUSH-029
**Title:** Push log persisted; user can view recent pushes
**Pre:** Multiple pushes
**Steps:**
1. Open Git tab
**Expected:** github_commits log paginated; sha, msg, author, ts; click to view on GH.
**Severity:** Medium

## TC-GH-PUSH-030
**Title:** Push triggers GH actions / status checks
**Pre:** Repo has actions
**Steps:**
1. Push
**Expected:** Actions trigger; doable polls or webhooks for status; UI shows green/yellow/red.
**Severity:** Low

## TC-GH-PUSH-031
**Title:** Push commit message body multi-line
**Pre:** Push
**Steps:**
1. Provide subject + body
**Expected:** GH commit shows correctly formatted; co-author trailer preserved.
**Severity:** Low

## TC-GH-PUSH-032
**Title:** Push when local has uncommitted hidden state (e.g., binary blob)
**Pre:** Project has hidden internal binary not in tree
**Steps:**
1. Push
**Expected:** Only files in tracked tree pushed; hidden state untouched.
**Severity:** Low

## TC-GH-PUSH-033
**Title:** Push to fork instead of upstream
**Pre:** Repo is fork of upstream
**Steps:**
1. Push
**Expected:** Pushes to fork's branch; clear that destination is fork.
**Severity:** Low

## TC-GH-PUSH-034
**Title:** Push activity audit (who/when/what)
**Pre:** N/A
**Steps:**
1. Inspect audit
**Expected:** `github_pushed` events with project, branch, sha, actor, ts.
**Severity:** Medium

## TC-GH-PUSH-035
**Title:** Push retry creates duplicate commit on success
**Pre:** Network blip mid-push
**Steps:**
1. Server retries
**Expected:** Idempotency token avoids double-commit; uses commit-by-tree-sha to detect already-pushed.
**Severity:** Medium
