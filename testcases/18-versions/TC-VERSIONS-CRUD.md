# TC-VERSIONS-CRUD — Project version snapshots (git-based + legacy DB)

Endpoints (`/versions/:projectId/...`):
- `GET /versions/:projectId/versions` — list (paginated). Dual-path: git log if scaffolded + git repo, else legacy DB rows.
- `POST /versions/:projectId/versions` — create snapshot (legacy DB).
- `GET /versions/:projectId/versions/:versionId` — single version.
- `POST /versions/:projectId/versions/auto` — AI-driven auto version.
- `POST /versions/:projectId/versions/:versionId/restore` — revert to commit (git) or DB version.
- `PATCH /versions/:projectId/versions/:versionId/bookmark` — toggle bookmark.
- `GET /versions/:projectId/versions/:versionId/diff/:compareId` — diff two versions.
- `POST /versions/:projectId/versions/undo` — undo AI changes by messageId.

Version IDs:
- Git path: SHA `^[0-9a-f]{7,40}$`.
- Legacy: UUID.

All routes require auth (`/:projectId/*` middleware).

---

## TC-VERSIONS-LIST-001 — List versions for git-backed project
- **Pre:** project scaffolded; git repo with 5 commits.
- **Steps:** `GET /versions/:projectId/versions`.
- **Expected:** 200 `data` array of 5 entries with `sha`, `shortSha`, `message`, `created_at`. Pagination total=5.
- **Severity:** smoke

## TC-VERSIONS-LIST-002 — List versions for legacy DB project (no git)
- **Pre:** project not scaffolded.
- **Expected:** 200 with DB-backed version rows.
- **Severity:** medium

## TC-VERSIONS-LIST-003 — Empty list when project has no versions
- **Expected:** 200 `data:[]`.
- **Severity:** smoke

## TC-VERSIONS-LIST-004 — Pagination — page=2, pageSize=10
- **Pre:** 25 commits.
- **Expected:** data length 10; offset applied.
- **Severity:** medium

## TC-VERSIONS-LIST-005 — Default pageSize=20
- **Severity:** smoke

## TC-VERSIONS-LIST-006 — Bookmark flag set when bookmark row exists
- **Pre:** SHA "abc" bookmarked.
- **Expected:** matching entry has `bookmarked:true`.
- **Severity:** high

## TC-VERSIONS-LIST-007 — version_number monotonically increasing across pages
- **Severity:** medium

## TC-VERSIONS-LIST-008 — `filesChanged`, `insertions`, `deletions` populated
- **Severity:** medium

## TC-VERSIONS-LIST-009 — Project not scaffolded with no DB versions → 200 empty
- **Severity:** low

## TC-VERSIONS-LIST-010 — Unauthenticated → 401
- **Severity:** smoke

## TC-VERSIONS-LIST-011 — Caller without project access → behavior?
- **Notes:** authMiddleware only checks JWT, not project access. File gap.
- **Expected:** Document — currently any authed user can list any project's versions.
- **Severity:** high

## TC-VERSIONS-LIST-012 — Pagination with negative page → defaults to 1
- **Severity:** low

## TC-VERSIONS-LIST-013 — Search/filter by message text — supported?
- **Notes:** current API has no search query. File feature gap.
- **Severity:** medium

## TC-VERSIONS-LIST-014 — Filter by author/createdBy — supported?
- **Severity:** low

## TC-VERSIONS-LIST-015 — Filter by date range — supported?
- **Severity:** low

## TC-VERSIONS-LIST-016 — Filter by type (`commit`, `auto`, `manual`)
- **Severity:** low

## TC-VERSIONS-CREATE-001 — Create manual version (legacy)
- **Steps:** POST `/versions/:projectId/versions` body `{description,createdBy,projectPath}`.
- **Expected:** 201 `data:{...version}`. Activity event emitted.
- **Severity:** smoke

## TC-VERSIONS-CREATE-002 — Missing `createdBy` → 400
- **Severity:** medium

## TC-VERSIONS-CREATE-003 — Missing `projectPath` → 400
- **Severity:** medium

## TC-VERSIONS-CREATE-004 — Description optional
- **Severity:** low

## TC-VERSIONS-CREATE-005 — Caller's userId not validated against createdBy field — gap
- **Severity:** high

## TC-VERSIONS-CREATE-006 — Auto-version (POST /versions/auto) creates git commit
- **Pre:** scaffolded git project.
- **Steps:** POST `/versions/:projectId/versions/auto` body `{createdBy}`.
- **Expected:** 201; new git commit; emitActivity called.
- **Severity:** smoke

## TC-VERSIONS-CREATE-007 — Auto-version when not scaffolded → 400
- **Expected:** 400 `error:"Project not scaffolded yet"`.
- **Severity:** medium

## TC-VERSIONS-CREATE-008 — Auto-version with empty description → defaults to "AI-generated changes"
- **Severity:** low

## TC-VERSIONS-CREATE-009 — Concurrent auto-version calls — git commits serialized
- **Severity:** medium

## TC-VERSIONS-GET-001 — Get version by UUID (legacy)
- **Severity:** smoke

## TC-VERSIONS-GET-002 — Get non-existent version → 404
- **Severity:** medium

## TC-VERSIONS-GET-003 — Get by SHA — endpoint signature only handles UUID; document
- **Notes:** route uses getVersion(versionId) which is DB-backed.
- **Severity:** medium

## TC-VERSIONS-RESTORE-001 — Restore by SHA on git project
- **Steps:** POST `/versions/:projectId/versions/<sha>/restore` body `{}`.
- **Expected:** 201 `data:{id:<newSha>,sha,message,restored:true}`. New commit reverting to that SHA.
- **Severity:** smoke

## TC-VERSIONS-RESTORE-002 — Restore by SHA invalid (random hex 7-40)
- **Expected:** 500 with message; status code 500 in catch.
- **Severity:** medium

## TC-VERSIONS-RESTORE-003 — Restore by UUID on legacy DB project
- **Pre:** non-scaffolded; legacy version exists.
- **Steps:** body `{restoredBy,projectPath}`.
- **Expected:** 201 with new version row.
- **Severity:** medium

## TC-VERSIONS-RESTORE-004 — Restore on legacy without restoredBy → 400
- **Severity:** medium

## TC-VERSIONS-RESTORE-005 — Restore non-existent version → 404 (`message.includes("not found")`)
- **Severity:** medium

## TC-VERSIONS-RESTORE-006 — Restore preserves project files (creates revert commit, doesn't lose history)
- **Severity:** high

## TC-VERSIONS-RESTORE-007 — Restore broadcasts file changes to live editor (Yjs sync)
- **Severity:** high

## TC-VERSIONS-RESTORE-008 — Restore on a project not yet scaffolded uses legacy path
- **Severity:** medium

## TC-VERSIONS-RESTORE-009 — Concurrent restores produce serialized commits
- **Severity:** medium

## TC-VERSIONS-RESTORE-010 — Restore by SHA-7 (short SHA) accepted
- **Steps:** SHA prefix length 7.
- **Expected:** 201 (regex matches min 7).
- **Severity:** medium

## TC-VERSIONS-RESTORE-011 — Restore by SHA-6 → falls to legacy path → likely 404 or 400
- **Severity:** low

## TC-VERSIONS-RESTORE-012 — Restore with uppercase SHA chars works (regex `i` flag)
- **Severity:** low

## TC-VERSIONS-BOOKMARK-001 — Bookmark a SHA
- **Steps:** PATCH `/versions/:projectId/versions/<sha>/bookmark` body `{bookmarked:true}`.
- **Expected:** 200 `data:{id:<sha>,bookmarked:true}`. version_bookmarks row inserted.
- **Severity:** smoke

## TC-VERSIONS-BOOKMARK-002 — Unbookmark a SHA
- **Steps:** body `{bookmarked:false}`.
- **Expected:** 200; row removed.
- **Severity:** smoke

## TC-VERSIONS-BOOKMARK-003 — Bookmark idempotent (ON CONFLICT DO NOTHING)
- **Severity:** medium

## TC-VERSIONS-BOOKMARK-004 — Unbookmark non-bookmarked SHA → 200, no error
- **Severity:** low

## TC-VERSIONS-BOOKMARK-005 — Missing `bookmarked` field → 400
- **Severity:** medium

## TC-VERSIONS-BOOKMARK-006 — Non-boolean `bookmarked` → 400
- **Severity:** medium

## TC-VERSIONS-BOOKMARK-007 — Bookmark a UUID (legacy) — DB row updated
- **Severity:** medium

## TC-VERSIONS-BOOKMARK-008 — Bookmark non-existent UUID → 404
- **Severity:** medium

## TC-VERSIONS-BOOKMARK-009 — Bookmark survives across restarts (DB persisted)
- **Severity:** smoke

## TC-VERSIONS-BOOKMARK-010 — Bookmark scoped per project (same SHA in different projects independent)
- **Severity:** medium

## TC-VERSIONS-BOOKMARK-011 — Bookmark list includes bookmarked entries highlighted
- **Severity:** medium

## TC-VERSIONS-BOOKMARK-012 — Bookmark count visible in UI badge
- **Severity:** low

## TC-VERSIONS-DIFF-001 — Diff two SHAs (git path)
- **Steps:** GET `/versions/:projectId/versions/<sha1>/diff/<sha2>`.
- **Expected:** 200 `data` containing per-file diff.
- **Severity:** smoke

## TC-VERSIONS-DIFF-002 — Diff identical SHAs → empty diff
- **Severity:** medium

## TC-VERSIONS-DIFF-003 — Diff with one invalid SHA → 500 with message
- **Severity:** medium

## TC-VERSIONS-DIFF-004 — Diff using legacy UUIDs
- **Severity:** medium

## TC-VERSIONS-DIFF-005 — Diff first commit (no parent) handles gracefully
- **Severity:** medium

## TC-VERSIONS-DIFF-006 — Diff for binary files shows binary marker, not raw content
- **Severity:** medium

## TC-VERSIONS-DIFF-007 — Diff for very large change set returns within 5s for ~1000 line change
- **Severity:** low

## TC-VERSIONS-DIFF-008 — Diff returns insertion/deletion line counts
- **Severity:** medium

## TC-VERSIONS-DIFF-009 — Diff response includes file paths and per-file diff blocks
- **Severity:** smoke

## TC-VERSIONS-DIFF-010 — Mixed-id diff (one SHA, one UUID) — falls to legacy diff → 404
- **Severity:** low

## TC-VERSIONS-UNDO-001 — Undo AI changes by messageId
- **Steps:** POST `/versions/:projectId/versions/undo` body `{messageId}`.
- **Expected:** 200 `data:{undone:true,revertedCommit,newCommit}`.
- **Severity:** high

## TC-VERSIONS-UNDO-002 — Missing messageId → 400
- **Severity:** medium

## TC-VERSIONS-UNDO-003 — Project not scaffolded → 400
- **Severity:** medium

## TC-VERSIONS-UNDO-004 — Project not git repo → 400 `error:"Project does not have git history"`
- **Severity:** medium

## TC-VERSIONS-UNDO-005 — messageId with no matching commit → 404 `error:"No version found for this message"`
- **Severity:** medium

## TC-VERSIONS-UNDO-006 — Undo of first commit (parent doesn't exist) → 500
- **Severity:** medium

## TC-VERSIONS-UNDO-007 — Undo broadcasts changes to live editor
- **Severity:** high

## TC-VERSIONS-UNDO-008 — Undo creates a new commit (does not destroy history)
- **Severity:** high

## TC-VERSIONS-UNDO-009 — Undo + redo workflow (re-apply the undone changes)
- **Severity:** medium

## TC-VERSIONS-UNDO-010 — Undo session-id mapping uses git trailer or commit metadata
- **Severity:** medium

## TC-VERSIONS-AUTH-001 — All version routes require auth
- **Severity:** smoke

## TC-VERSIONS-AUTH-002 — No project access check on version routes — gap
- **Pre:** authed but not workspace member.
- **Expected:** Document — current code allows arbitrary access. File security gap.
- **Severity:** high

## TC-VERSIONS-EDGE-001 — Project with 10000 commits — list pagination handles
- **Severity:** medium

## TC-VERSIONS-EDGE-002 — Branch detached HEAD — list still works
- **Severity:** low

## TC-VERSIONS-EDGE-003 — Empty git repo (just init, no commits) — list returns []
- **Severity:** low

## TC-VERSIONS-EDGE-004 — Corrupt git repo → list 500
- **Severity:** medium

## TC-VERSIONS-EDGE-005 — Git LFS objects — diff for LFS file
- **Severity:** low

## TC-VERSIONS-EDGE-006 — Version per commit SHA: list groups commits 1:1 with versions
- **Severity:** smoke

## TC-VERSIONS-EDGE-007 — Search versions by description (if implemented)
- **Severity:** low

## TC-VERSIONS-EDGE-008 — Filter versions by `bookmarked=true`
- **Notes:** endpoint not present; file gap.
- **Severity:** medium
