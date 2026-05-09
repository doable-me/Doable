# TC-PROJ-LIST — Project listing, search, filtering, pagination

Endpoints:
- `GET /projects` (defaults to user's first workspace; can override via `?workspaceId=`)
- `GET /projects/starred`
- `GET /projects/shared`
- `GET /projects/recently-viewed`
- Query params: `workspaceId`, `page`, `pageSize`, `status` ∈ {creating,draft,published,error}, `search`, `folderId`.

---

## TC-PROJ-LIST-001 — Empty list when user has no workspace
- **Pre:** new user, no workspace memberships.
- **Steps:** `GET /projects`.
- **Expected:** 200 `{data:[],pagination:{total:0,page:1,pageSize:20,totalPages:0}}`.
- **Severity:** smoke

## TC-PROJ-LIST-002 — Empty list when workspace has zero projects
- **Pre:** user is owner of empty workspace.
- **Expected:** 200, `data:[]`, `total:0`.
- **Severity:** smoke

## TC-PROJ-LIST-003 — Single project listed
- **Pre:** workspace with 1 project.
- **Expected:** 200, `data.length === 1`, `total:1`.
- **Severity:** smoke

## TC-PROJ-LIST-004 — Default page size honored (20)
- **Pre:** 25 projects in workspace.
- **Steps:** `GET /projects` (no pageSize).
- **Expected:** `data.length === 20`, `total:25`, `totalPages:2`.
- **Severity:** smoke

## TC-PROJ-LIST-005 — Custom pageSize=5
- **Pre:** 25 projects.
- **Steps:** `?pageSize=5`.
- **Expected:** `data.length===5`, `totalPages:5`.
- **Severity:** medium

## TC-PROJ-LIST-006 — pageSize over MAX_PAGE_SIZE clamped
- **Steps:** `?pageSize=999999`.
- **Expected:** 200; `pagination.pageSize` clamped to `MAX_PAGE_SIZE`.
- **Severity:** medium

## TC-PROJ-LIST-007 — pageSize=0 → clamped to 1
- **Expected:** `pagination.pageSize===1`.
- **Severity:** low

## TC-PROJ-LIST-008 — pageSize=-5 → clamped to 1
- **Expected:** `pagination.pageSize===1`.
- **Severity:** low

## TC-PROJ-LIST-009 — pageSize="abc" → defaults to 20
- **Expected:** `parseInt("abc")=NaN` → fallback default; `pagination.pageSize===20`.
- **Severity:** low

## TC-PROJ-LIST-010 — page=0 clamped to 1
- **Expected:** `pagination.page===1`.
- **Severity:** low

## TC-PROJ-LIST-011 — page=-1 clamped to 1
- **Expected:** `pagination.page===1`.
- **Severity:** low

## TC-PROJ-LIST-012 — page beyond totalPages returns empty data
- **Pre:** 5 projects, pageSize=10.
- **Steps:** `?page=99`.
- **Expected:** 200, `data:[]`, `total:5`.
- **Severity:** medium

## TC-PROJ-LIST-013 — page=2 with pageSize=10 returns next slice
- **Pre:** 25 projects.
- **Steps:** `?page=2&pageSize=10`.
- **Expected:** `data.length===10`; verifies offset.
- **Severity:** smoke

## TC-PROJ-LIST-014 — Filter by status=creating
- **Pre:** projects in mixed statuses.
- **Expected:** all returned have `status==="creating"`.
- **Severity:** medium

## TC-PROJ-LIST-015 — Filter by status=draft
- **Expected:** only drafts.
- **Severity:** smoke

## TC-PROJ-LIST-016 — Filter by status=published
- **Expected:** only published.
- **Severity:** medium

## TC-PROJ-LIST-017 — Filter by status=error
- **Expected:** only errored.
- **Severity:** low

## TC-PROJ-LIST-018 — Invalid status filter → 400
- **Steps:** `?status=banana`.
- **Expected:** 400 `error:"Invalid status filter"`.
- **Severity:** medium

## TC-PROJ-LIST-019 — Empty search string ignored
- **Steps:** `?search=`.
- **Expected:** all projects returned (search is stringified to undefined when empty).
- **Severity:** low

## TC-PROJ-LIST-020 — Search by exact name match
- **Pre:** project name "Marketing Site".
- **Steps:** `?search=Marketing`.
- **Expected:** project listed.
- **Severity:** high

## TC-PROJ-LIST-021 — Search is case-insensitive
- **Steps:** `?search=marketing`.
- **Expected:** matches "Marketing Site".
- **Severity:** high

## TC-PROJ-LIST-022 — Search matches partial name
- **Steps:** `?search=mark`.
- **Expected:** matches.
- **Severity:** medium

## TC-PROJ-LIST-023 — Search matches description (verify behavior)
- **Pre:** project with description "marketing landing".
- **Steps:** `?search=landing` where no project name contains "landing".
- **Expected:** Document whether description is searched. File bug if name-only.
- **Severity:** medium

## TC-PROJ-LIST-024 — Search matches slug
- **Pre:** project slug "my-cool-app", name "Other".
- **Steps:** `?search=cool`.
- **Expected:** Document whether slug is searched.
- **Severity:** low

## TC-PROJ-LIST-025 — Search special chars handled (no SQL injection)
- **Steps:** `?search=%';DROP TABLE projects;--`.
- **Expected:** 200 with empty or harmless result; projects table still intact afterward.
- **Severity:** high

## TC-PROJ-LIST-026 — Search with unicode ("café")
- **Pre:** project named "Café Resto".
- **Steps:** `?search=café`.
- **Expected:** matches.
- **Severity:** low

## TC-PROJ-LIST-027 — Search with emoji
- **Steps:** `?search=🚀`.
- **Expected:** matches projects with emoji in name.
- **Severity:** low

## TC-PROJ-LIST-028 — Filter by folderId (existing folder with 3 projects)
- **Steps:** `?folderId=<folder>`.
- **Expected:** returns only the 3.
- **Severity:** high

## TC-PROJ-LIST-029 — Filter by folderId="root" or null behavior
- **Steps:** `?folderId=` empty.
- **Expected:** parameter ignored; full listing returned.
- **Severity:** low

## TC-PROJ-LIST-030 — Filter by non-existent folderId
- **Steps:** `?folderId=<random uuid>`.
- **Expected:** 200, empty `data`.
- **Severity:** low

## TC-PROJ-LIST-031 — explicit workspaceId for current member returns that workspace's projects
- **Pre:** user has 2 workspaces.
- **Steps:** `?workspaceId=<ws2>`.
- **Expected:** returns ws2 projects only.
- **Severity:** high

## TC-PROJ-LIST-032 — explicit workspaceId for non-member → 403
- **Steps:** `?workspaceId=<otherWs>`.
- **Expected:** 403 `error:"Access denied to this workspace"`.
- **Severity:** high

## TC-PROJ-LIST-033 — Soft-deleted projects excluded
- **Pre:** 3 projects, 1 has `deleted_at` set.
- **Expected:** returned `total:2`; deleted project not in `data`.
- **Severity:** high

## TC-PROJ-LIST-034 — Each project has `starred` flag set correctly
- **Pre:** user has starred 1 of 3 projects.
- **Expected:** exactly 1 project has `starred:true`.
- **Severity:** smoke

## TC-PROJ-LIST-035 — Combined filters (status=draft AND search=foo)
- **Expected:** logical AND applied.
- **Severity:** medium

## TC-PROJ-LIST-036 — Combined filters (folderId AND status)
- **Expected:** AND applied.
- **Severity:** medium

## TC-PROJ-LIST-037 — Unauthenticated → 401
- **Expected:** 401.
- **Severity:** smoke

## TC-PROJ-LIST-038 — `/projects/starred` returns starred only across all accessible workspaces
- **Pre:** starred 2 projects across 2 workspaces.
- **Expected:** both returned, each `starred:true`.
- **Severity:** smoke

## TC-PROJ-LIST-039 — `/projects/starred` excludes projects user lost access to
- **Pre:** starred a project then removed from workspace.
- **Expected:** project excluded from starred list.
- **Severity:** high

## TC-PROJ-LIST-040 — `/projects/starred` empty when nothing starred
- **Expected:** 200 `data:[]`.
- **Severity:** smoke

## TC-PROJ-LIST-041 — `/projects/shared` lists projects user accessed via share link
- **Pre:** user accessed public project from another workspace.
- **Expected:** appears in shared list.
- **Severity:** high

## TC-PROJ-LIST-042 — `/projects/shared` paginated
- **Steps:** `?page=2&pageSize=5`.
- **Expected:** pagination block populated correctly.
- **Severity:** medium

## TC-PROJ-LIST-043 — `/projects/shared` shows starred flag
- **Expected:** `starred` reflects whether user starred the shared project.
- **Severity:** medium

## TC-PROJ-LIST-044 — `/projects/recently-viewed` returns viewed projects in recency order
- **Pre:** user viewed projects A, B, C in that order.
- **Steps:** `GET /projects/recently-viewed`.
- **Expected:** order C, B, A (most recent first).
- **Severity:** high

## TC-PROJ-LIST-045 — `/projects/recently-viewed` scoped to workspace
- **Pre:** user viewed projects in 2 workspaces.
- **Steps:** `?workspaceId=<wsA>`.
- **Expected:** only wsA viewed projects appear.
- **Severity:** medium

## TC-PROJ-LIST-046 — `/projects/recently-viewed` empty for new user
- **Expected:** 200 `data:[]`.
- **Severity:** low

## TC-PROJ-LIST-047 — `/recently-viewed` doesn't match `/:id` route (route ordering)
- **Steps:** GET /projects/recently-viewed; project with id "recently-viewed" cannot exist (UUID), but verify path doesn't 404 thinking it's a bad id.
- **Expected:** 200 list response, not 404 project response.
- **Severity:** smoke

## TC-PROJ-LIST-048 — `/starred` doesn't match `/:id`
- **Expected:** 200 starred list, not 404 project lookup.
- **Severity:** smoke

## TC-PROJ-LIST-049 — `/shared` doesn't match `/:id`
- **Expected:** 200 shared list.
- **Severity:** smoke

## TC-PROJ-LIST-050 — Listing returns sorted (newest first)
- **Pre:** 3 projects created at different times.
- **Expected:** order by `created_at DESC` (or `updated_at DESC` — document).
- **Severity:** medium

## TC-PROJ-LIST-051 — Status filter combined with workspace switch
- **Steps:** `?workspaceId=<ws>&status=draft`.
- **Expected:** drafts in that ws only.
- **Severity:** medium
