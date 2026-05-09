# TC-GH-CONNECT-REPO — Connect repo to project, branch selection, repo permission errors

Covers linking an existing GitHub repo to a doable project (or creating a new repo from project) and validating access scopes.

---

## TC-GH-CONNECT-REPO-001
**Title:** List user repos for selection
**Pre:** GitHub connected
**Steps:**
1. Open project → GitHub → Connect repo
**Expected:** Modal lists repos sorted by recently-updated; paginated or searchable. Includes private repos if scope `repo` granted.
**Severity:** High

## TC-GH-CONNECT-REPO-002
**Title:** Repo list filtered by name search
**Pre:** Connected
**Steps:**
1. Type in search
**Expected:** Live filter; debounced API calls.
**Severity:** Low

## TC-GH-CONNECT-REPO-003
**Title:** Connect to public repo user owns
**Pre:** Repo `me/myrepo` exists
**Steps:**
1. Select; click Connect
**Expected:** project_github_links row inserted: project_id, repo_full_name, default_branch=main, connected_by, ts.
**Severity:** Critical

## TC-GH-CONNECT-REPO-004
**Title:** Connect to private repo user has access to
**Pre:** Private repo, user is collaborator
**Steps:**
1. Select; Connect
**Expected:** Same as above; works because token has `repo` scope.
**Severity:** High

## TC-GH-CONNECT-REPO-005
**Title:** Connect to repo user has no access to (manual full_name input)
**Pre:** Connected; type `someoneelse/private`
**Steps:**
1. Click Connect
**Expected:** GitHub returns 404; UI shows "Repo not found or no access". No row created.
**Severity:** Critical

## TC-GH-CONNECT-REPO-006
**Title:** Connect to org repo user can access
**Pre:** Org grants user `repo` scope
**Steps:**
1. Connect to org/repo
**Expected:** Allowed.
**Severity:** Medium

## TC-GH-CONNECT-REPO-007
**Title:** Connect to org repo with SAML SSO required
**Pre:** SAML not authorized
**Steps:**
1. Connect
**Expected:** GitHub 403 with SSO authorization required link; UI shows "Authorize SAML SSO at <link>".
**Severity:** High

## TC-GH-CONNECT-REPO-008
**Title:** Branch selection at connect time
**Pre:** Connect modal
**Steps:**
1. Choose branch other than default
**Expected:** project_github_links.branch saved; subsequent push/pull use it.
**Severity:** High

## TC-GH-CONNECT-REPO-009
**Title:** Branch list fetched from GitHub
**Pre:** Repo with 5 branches
**Steps:**
1. Open branch picker
**Expected:** All 5 listed; default highlighted.
**Severity:** Medium

## TC-GH-CONNECT-REPO-010
**Title:** Switch branch on connected project
**Pre:** Currently on main
**Steps:**
1. Change to dev branch via Settings
**Expected:** Persists; UI confirms; next push/pull uses dev.
**Severity:** Medium

## TC-GH-CONNECT-REPO-011
**Title:** Disconnect repo from project
**Pre:** Connected
**Steps:**
1. Click Disconnect repo
**Expected:** project_github_links row removed; commits log retained for audit; UI shows "Not connected".
**Severity:** High

## TC-GH-CONNECT-REPO-012
**Title:** Reconnect different repo to project
**Pre:** Previously connected to `me/old`
**Steps:**
1. Disconnect; Connect to `me/new`
**Expected:** New row; old commits log retained but tagged old repo.
**Severity:** Medium

## TC-GH-CONNECT-REPO-013
**Title:** Create new repo from doable project
**Pre:** Connected; project not yet linked
**Steps:**
1. Click "Create new repo on GitHub"
2. Provide name + visibility (public/private)
3. Confirm
**Expected:** GitHub /repos POST creates repo; project linked; initial push of project files.
**Severity:** Critical

## TC-GH-CONNECT-REPO-014
**Title:** Create new repo — name conflict
**Pre:** Repo `me/myproject` already exists on GH
**Steps:**
1. Try to create with same name
**Expected:** UI surfaces GitHub 422 "name already exists"; suggest alt name.
**Severity:** Medium

## TC-GH-CONNECT-REPO-015
**Title:** Create repo — private requires plan
**Pre:** GitHub free user with limited private repos
**Steps:**
1. Try to create private
**Expected:** If GH rejects, surface message; allow public fallback.
**Severity:** Low

## TC-GH-CONNECT-REPO-016
**Title:** Connect repo permission: only owner/editor on doable project
**Pre:** User is viewer
**Steps:**
1. Try to connect repo
**Expected:** 403; UI button disabled.
**Severity:** Critical

## TC-GH-CONNECT-REPO-017
**Title:** Repo permission required for write actions
**Pre:** User is read-only collaborator on GH repo
**Steps:**
1. Try to push
**Expected:** GH 403; UI shows "You don't have push access to this repo".
**Severity:** High

## TC-GH-CONNECT-REPO-018
**Title:** Repo doesn't exist (deleted on GH after connect)
**Pre:** Linked then deleted on GH
**Steps:**
1. Try to pull
**Expected:** 404; UI suggests reconnect or re-create.
**Severity:** Medium

## TC-GH-CONNECT-REPO-019
**Title:** Repo renamed on GitHub
**Pre:** Linked; renamed on GH
**Steps:**
1. Push attempt
**Expected:** GH returns 301/308 with new full_name; server detects and updates link automatically; user notified.
**Severity:** Medium

## TC-GH-CONNECT-REPO-020
**Title:** Two doable projects link to same repo
**Pre:** Project A linked to repo X
**Steps:**
1. Project B tries to link to X
**Expected:** Either allowed (independent doable projects) with warning, or rejected with 409 — design decision; test the documented behavior.
**Severity:** Low

## TC-GH-CONNECT-REPO-021
**Title:** Repo full_name validation
**Pre:** Manual link form
**Steps:**
1. Enter `not-a-repo`
**Expected:** 400 "Format: owner/repo".
**Severity:** Low

## TC-GH-CONNECT-REPO-022
**Title:** Repo connection reuses cached repo metadata
**Pre:** Connected
**Steps:**
1. Page reload
**Expected:** Repo info loads from cache (TTL e.g. 5 min) before live fetch; UI fast.
**Severity:** Low

## TC-GH-CONNECT-REPO-023
**Title:** Repo connection respects rate limit
**Pre:** Many connections
**Steps:**
1. Burst connections
**Expected:** Backoff on rate-limit; never blocks the user permanently.
**Severity:** Low

## TC-GH-CONNECT-REPO-024
**Title:** Repo permissions surfaced in UI
**Pre:** Connected
**Steps:**
1. View
**Expected:** UI shows "You have push access" or "Read-only".
**Severity:** Low

## TC-GH-CONNECT-REPO-025
**Title:** Repo branches refresh button
**Pre:** New branch created on GH
**Steps:**
1. Click refresh
**Expected:** Branch list updated; new branch appears.
**Severity:** Low
