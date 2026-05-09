# TC-GH-IMPORT — Import existing GitHub repo as a new doable project

Covers cloning a remote repo into a new project, framework auto-detection, file size caps, .git history.

---

## TC-GH-IMPORT-001
**Title:** Import flow happy path
**Pre:** GitHub connected
**Steps:**
1. Dashboard → New Project → "Import from GitHub"
2. Pick repo `me/myrepo`
3. Click Import
**Expected:** Server clones repo (or fetches files via GH API); creates new project; user redirected to /editor/<id>.
**Severity:** Critical

## TC-GH-IMPORT-002
**Title:** Import auto-detects framework
**Pre:** Repo is Next.js
**Steps:**
1. Import
**Expected:** Framework=next.js detected from package.json/next.config; project framework set; appropriate template/runner config applied.
**Severity:** High

## TC-GH-IMPORT-003
**Title:** Import sets default branch
**Pre:** Repo default = `main`
**Steps:**
1. Import
**Expected:** project_github_links.branch = `main`.
**Severity:** Medium

## TC-GH-IMPORT-004
**Title:** Import preserves file paths and contents
**Pre:** Repo with nested dirs
**Steps:**
1. Import
2. Verify a few files
**Expected:** Identical content (sha256 match) and same paths.
**Severity:** Critical

## TC-GH-IMPORT-005
**Title:** Import respects size cap (per plan)
**Pre:** Free plan 100MB cap; repo 200MB
**Steps:**
1. Import
**Expected:** 413 with reason "Repo too large for Free plan"; upgrade hint.
**Severity:** High

## TC-GH-IMPORT-006
**Title:** Import respects file count cap
**Pre:** Cap 5000 files; repo 10000
**Steps:**
1. Import
**Expected:** 413 "Too many files"; suggest .gitignore additions.
**Severity:** Medium

## TC-GH-IMPORT-007
**Title:** Import excludes .git/ history (initial)
**Pre:** Repo with long history
**Steps:**
1. Import
**Expected:** .git/ not imported; project starts as fresh repo on doable side. Re-pulls from GH for sync.
**Severity:** Medium

## TC-GH-IMPORT-008
**Title:** Import binary files preserved
**Pre:** Repo has images, fonts
**Steps:**
1. Import
**Expected:** Binary integrity preserved.
**Severity:** High

## TC-GH-IMPORT-009
**Title:** Import respects symlinks (rejects or follows safely)
**Pre:** Repo has symlinks
**Steps:**
1. Import
**Expected:** Symlinks pointing outside tree blocked; in-tree symlinks may be preserved or replaced with content.
**Severity:** Medium

## TC-GH-IMPORT-010
**Title:** Import non-default branch
**Pre:** User picks `develop`
**Steps:**
1. Import
**Expected:** Project initialized from develop; link branch=develop.
**Severity:** Medium

## TC-GH-IMPORT-011
**Title:** Import private repo (with scope)
**Pre:** `repo` scope granted
**Steps:**
1. Import private
**Expected:** Works.
**Severity:** High

## TC-GH-IMPORT-012
**Title:** Import without access fails clearly
**Pre:** Repo not accessible
**Steps:**
1. Manually enter URL
**Expected:** 404 / 403 surfaced with reason.
**Severity:** High

## TC-GH-IMPORT-013
**Title:** Import progress UI streams via SSE
**Pre:** Large repo
**Steps:**
1. Import
**Expected:** Progress events: cloning %, files imported count.
**Severity:** Medium

## TC-GH-IMPORT-014
**Title:** Import resilient to flaky network
**Pre:** Mock transient failure
**Steps:**
1. Import
**Expected:** Server retries with backoff; final success or clear error.
**Severity:** Low

## TC-GH-IMPORT-015
**Title:** Import preserves .gitignore
**Pre:** Repo has .gitignore
**Steps:**
1. Import
**Expected:** .gitignore included; respected on subsequent push.
**Severity:** Medium

## TC-GH-IMPORT-016
**Title:** Import preserves package.json scripts
**Pre:** Node project
**Steps:**
1. Import; open run config
**Expected:** Scripts available; default dev script auto-detected.
**Severity:** Medium

## TC-GH-IMPORT-017
**Title:** Import auto-installs dependencies (optional)
**Pre:** Setting "Auto-install"
**Steps:**
1. Import
**Expected:** pnpm install runs in sandbox; lockfile respected. UI shows progress.
**Severity:** Medium

## TC-GH-IMPORT-018
**Title:** Import fails — partial state cleaned up
**Pre:** Disk error mid-import
**Steps:**
1. Import
**Expected:** Project not left half-created; rollback complete.
**Severity:** High

## TC-GH-IMPORT-019
**Title:** Import sets project name from repo name
**Pre:** Repo `my-cool-app`
**Steps:**
1. Import
**Expected:** Project name "my-cool-app" (or user-supplied override).
**Severity:** Low

## TC-GH-IMPORT-020
**Title:** Import sets project_github_links row
**Pre:** N/A
**Steps:**
1. Import
**Expected:** Row points project to repo.
**Severity:** High

## TC-GH-IMPORT-021
**Title:** Import audit logged
**Pre:** N/A
**Steps:**
1. Import
**Expected:** `project_imported_from_github` event with repo, branch, actor.
**Severity:** Medium

## TC-GH-IMPORT-022
**Title:** Import respects plan project quota
**Pre:** Free plan 5/5 projects
**Steps:**
1. Import
**Expected:** 402; upgrade hint.
**Severity:** Medium

## TC-GH-IMPORT-023
**Title:** Import from URL (manual entry)
**Pre:** Connected
**Steps:**
1. Paste URL `https://github.com/org/repo`
**Expected:** Same as picker selection; URL parsed.
**Severity:** Medium

## TC-GH-IMPORT-024
**Title:** Import from non-GitHub URL refused
**Pre:** N/A
**Steps:**
1. Paste GitLab URL
**Expected:** Refused with "Only github.com supported here". Suggest GitLab integration if applicable.
**Severity:** Low

## TC-GH-IMPORT-025
**Title:** Import respects rate limit on big repos
**Pre:** N/A
**Steps:**
1. Import
**Expected:** Stay within GH /git/trees rate; uses zip download as fallback.
**Severity:** Medium

## TC-GH-IMPORT-026
**Title:** Import with template merge (rare)
**Pre:** Apply template afterwards
**Steps:**
1. Import; then apply template
**Expected:** Template files merged with conflict prompts.
**Severity:** Low

## TC-GH-IMPORT-027
**Title:** Import preserves file modes (executables)
**Pre:** Repo has shell scripts with +x
**Steps:**
1. Import
**Expected:** File mode preserved or surfaced to user; runtime can exec.
**Severity:** Low

## TC-GH-IMPORT-028
**Title:** Import preserves text encoding (UTF-8 BOM, utf-16 if any)
**Pre:** Test file
**Steps:**
1. Import
**Expected:** Encoding preserved bit-for-bit.
**Severity:** Low

## TC-GH-IMPORT-029
**Title:** Import sample/template repo for first-time user
**Pre:** New user, "Try with sample repo" link
**Steps:**
1. Click; import doable-org/starter
**Expected:** Works without OAuth (public sample).
**Severity:** Low

## TC-GH-IMPORT-030
**Title:** Import recoverable from interrupt — resume
**Pre:** Import interrupted at 50%
**Steps:**
1. User clicks Resume
**Expected:** Resumes from where it stopped using checkpoint, or restarts cleanly.
**Severity:** Low
