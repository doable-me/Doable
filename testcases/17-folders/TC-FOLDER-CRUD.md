# TC-FOLDER-CRUD — Folders create/list/get/update/delete

Endpoints: under `/folders` mounted in API.
- `GET /folders?workspaceId=<ws>` — list (member required)
- `POST /folders` — create (member required)
- `GET /folders/:id` — get + children (no role guard in current code — note as gap)
- `PATCH /folders/:id` — update (no explicit role check in current code — gap)
- `DELETE /folders/:id` — delete (no explicit role check — gap)

Schema:
- `name` 1..100 chars
- `parentId` UUID optional (nested folder)
- `position` int ≥ 0 optional

Migration `001_initial_schema.sql` defines folders {id, workspace_id, name, parent_id, position}. `color` field not in current schema — note as gap.

---

## TC-FOLDER-CREATE-001 — Create root folder (no parentId)
- **Steps:** POST /folders body `{"workspaceId":<ws>,"name":"Marketing"}`.
- **Expected:** 201 `data:{id,workspace_id,name:"Marketing",parent_id:null,position:0}`.
- **Severity:** smoke

## TC-FOLDER-CREATE-002 — Create folder with explicit position
- **Steps:** body adds `"position":5`.
- **Expected:** 201; position=5.
- **Severity:** medium

## TC-FOLDER-CREATE-003 — Create nested folder (parentId)
- **Pre:** root folder F exists.
- **Steps:** body `{"workspaceId":<ws>,"name":"Sub","parentId":<F>}`.
- **Expected:** 201; `parent_id` = F.
- **Severity:** smoke

## TC-FOLDER-CREATE-004 — Deeply nested: 5-level tree
- **Steps:** create F1, then F2 under F1, F3 under F2, etc., to 5 levels.
- **Expected:** all 201; tree retrievable.
- **Severity:** medium

## TC-FOLDER-CREATE-005 — Empty name rejected
- **Steps:** body `{"workspaceId":<ws>,"name":""}`.
- **Expected:** 400 `details.name`.
- **Severity:** high

## TC-FOLDER-CREATE-006 — Single-char name accepted
- **Expected:** 201.
- **Severity:** medium

## TC-FOLDER-CREATE-007 — 100-char name accepted
- **Expected:** 201.
- **Severity:** medium

## TC-FOLDER-CREATE-008 — 101-char name rejected
- **Expected:** 400.
- **Severity:** medium

## TC-FOLDER-CREATE-009 — Unicode name preserved
- **Steps:** name="📁 Études café".
- **Expected:** 201; persisted as-is.
- **Severity:** low

## TC-FOLDER-CREATE-010 — RTL name preserved
- **Steps:** name="مجلد المشاريع".
- **Severity:** low

## TC-FOLDER-CREATE-011 — Whitespace-only name (zod.min(1) lets through)
- **Steps:** name="   ".
- **Expected:** Document — likely 201; file gap if expected to reject.
- **Severity:** low

## TC-FOLDER-CREATE-012 — workspaceId missing → 400
- **Steps:** body `{"name":"X"}`.
- **Expected:** 400 `details.workspaceId`.
- **Severity:** high

## TC-FOLDER-CREATE-013 — workspaceId malformed → 400
- **Severity:** medium

## TC-FOLDER-CREATE-014 — workspaceId user is not member of → 403
- **Expected:** 403 `error:"Not a member of this workspace"`.
- **Severity:** high

## TC-FOLDER-CREATE-015 — workspaceId for soft-deleted/non-existent ws → 403 (membership returns null)
- **Severity:** medium

## TC-FOLDER-CREATE-016 — parentId belongs to different workspace → ?
- **Pre:** parent F belongs to ws-B; user creates child in ws-A with that parentId.
- **Expected:** Document — current code does not validate parent ws match. File gap.
- **Severity:** high

## TC-FOLDER-CREATE-017 — parentId malformed → 400
- **Severity:** medium

## TC-FOLDER-CREATE-018 — parentId non-existent → ?
- **Expected:** Document — likely 201 with broken FK or DB constraint violation.
- **Severity:** medium

## TC-FOLDER-CREATE-019 — position negative → 400
- **Steps:** position=-1.
- **Expected:** 400 (zod.int().min(0)).
- **Severity:** medium

## TC-FOLDER-CREATE-020 — position non-integer (3.5) → 400
- **Severity:** low

## TC-FOLDER-CREATE-021 — Two folders with same name allowed in same workspace
- **Steps:** create "Inbox" twice.
- **Expected:** both 201 (no uniqueness constraint by default).
- **Severity:** low

## TC-FOLDER-CREATE-022 — Same name allowed across different workspaces
- **Severity:** low

## TC-FOLDER-CREATE-023 — Body not JSON → 400
- **Severity:** medium

## TC-FOLDER-CREATE-024 — Unauthenticated → 401
- **Severity:** smoke

## TC-FOLDER-CREATE-025 — Member role can create
- **Severity:** smoke

## TC-FOLDER-CREATE-026 — Viewer cannot create (workspace role check is `if (!role)` — viewers pass!)
- **Notes:** code checks only `if (!role)`, so any role including viewer passes. File security gap.
- **Severity:** high

## TC-FOLDER-LIST-001 — List folders for workspace
- **Steps:** GET /folders?workspaceId=<ws>.
- **Expected:** 200 `data:[]` or array of folders.
- **Severity:** smoke

## TC-FOLDER-LIST-002 — List requires workspaceId query
- **Steps:** GET /folders.
- **Expected:** 400 `error:"workspaceId query parameter is required"`.
- **Severity:** medium

## TC-FOLDER-LIST-003 — List for non-member ws → 403
- **Severity:** high

## TC-FOLDER-LIST-004 — List returns folders sorted by position then name
- **Severity:** medium

## TC-FOLDER-LIST-005 — List includes nested folders flat (or as tree?)
- **Notes:** `listByWorkspace` likely returns flat. Document.
- **Severity:** medium

## TC-FOLDER-LIST-006 — Empty list when no folders
- **Severity:** smoke

## TC-FOLDER-LIST-007 — List excludes deleted folders (if soft-delete supported)
- **Severity:** low

## TC-FOLDER-LIST-008 — List returns 50+ folders without pagination (current API has no pagination)
- **Severity:** low

## TC-FOLDER-GET-001 — Get folder by id with children
- **Steps:** GET /folders/:id.
- **Expected:** 200 `data:{...folder, children:[...]}`.
- **Severity:** smoke

## TC-FOLDER-GET-002 — Get non-existent folder → 404
- **Severity:** medium

## TC-FOLDER-GET-003 — Get folder with no children returns `children:[]`
- **Severity:** low

## TC-FOLDER-GET-004 — Get folder NOT scoped to caller's workspace — security gap?
- **Pre:** folder belongs to a workspace user is not member of.
- **Expected:** Document — current code does NOT check workspace membership. File gap.
- **Severity:** high

## TC-FOLDER-GET-005 — Get malformed UUID → 404 or 500
- **Severity:** low

## TC-FOLDER-UPDATE-001 — Rename folder
- **Steps:** PATCH /folders/:id `{"name":"Renamed"}`.
- **Expected:** 200; name updated.
- **Severity:** smoke

## TC-FOLDER-UPDATE-002 — Move folder under new parent (set parentId)
- **Steps:** PATCH `{"parentId":<other>}`.
- **Expected:** 200; tree reflects new hierarchy.
- **Severity:** high

## TC-FOLDER-UPDATE-003 — Move to root (parentId=null)
- **Steps:** PATCH `{"parentId":null}`.
- **Expected:** 200; parent_id NULL.
- **Severity:** medium

## TC-FOLDER-UPDATE-004 — Update position
- **Severity:** medium

## TC-FOLDER-UPDATE-005 — PATCH with no fields → 200 noop
- **Severity:** low

## TC-FOLDER-UPDATE-006 — PATCH name to "" → 400
- **Severity:** medium

## TC-FOLDER-UPDATE-007 — PATCH name 101 chars → 400
- **Severity:** medium

## TC-FOLDER-UPDATE-008 — PATCH parentId to itself → cycle attempt → ?
- **Steps:** PATCH F's parentId=F.
- **Expected:** Document — should reject; current code has no cycle detection.
- **Severity:** high

## TC-FOLDER-UPDATE-009 — PATCH parentId to descendant → cycle → ?
- **Severity:** high

## TC-FOLDER-UPDATE-010 — PATCH parentId in different workspace
- **Severity:** high

## TC-FOLDER-UPDATE-011 — PATCH non-existent folder → 404
- **Severity:** medium

## TC-FOLDER-UPDATE-012 — PATCH from non-member of workspace — current code lacks check (gap)
- **Severity:** high

## TC-FOLDER-DELETE-001 — Delete leaf folder
- **Steps:** DELETE /folders/:id.
- **Expected:** 200 `data:{id,deleted:true}`.
- **Severity:** smoke

## TC-FOLDER-DELETE-002 — Delete non-existent → 404
- **Severity:** medium

## TC-FOLDER-DELETE-003 — Delete folder with children — cascade per ON DELETE CASCADE in schema
- **Pre:** F has subfolders.
- **Expected:** all descendant folders cascaded.
- **Severity:** high

## TC-FOLDER-DELETE-004 — Delete folder with projects inside — projects' folder_id NULL'd or deleted?
- **Notes:** depends on FK on `projects.folder_id` (typically `ON DELETE SET NULL`). Document.
- **Severity:** high

## TC-FOLDER-DELETE-005 — Delete from non-member of workspace — current code lacks check (gap)
- **Severity:** high

## TC-FOLDER-DELETE-006 — Delete idempotent: second DELETE → 404
- **Severity:** medium

## TC-FOLDER-DELETE-007 — Delete cascade preserves projects when fk is SET NULL
- **Severity:** high

## TC-FOLDER-MOVE-001 — Move project between folders via PATCH /projects/:id `{folderId:<other>}`
- **Severity:** smoke

## TC-FOLDER-MOVE-002 — Move project to root (folderId=null)
- **Severity:** smoke

## TC-FOLDER-MOVE-003 — Move project to non-existent folder
- **Expected:** Document.
- **Severity:** medium

## TC-FOLDER-MOVE-004 — Move project across workspaces via folder
- **Pre:** folder in another ws.
- **Expected:** should reject; document.
- **Severity:** high

## TC-FOLDER-COLOR-001 — Color tagging — set folder.color
- **Notes:** schema does NOT include color column in 001_initial_schema.sql. File gap if UI shows colors.
- **Severity:** medium

## TC-FOLDER-COLOR-002 — Color values supported (e.g. blue, red, hex)
- **Severity:** low

## TC-FOLDER-COLOR-003 — Color persists across reload
- **Severity:** low

## TC-FOLDER-COLOR-004 — Color resets to default when cleared
- **Severity:** low

## TC-FOLDER-COLOR-005 — Color shown in UI badge next to folder
- **Severity:** low

## TC-FOLDER-AUTH-001 — All endpoints require auth
- **Expected:** 401 without JWT on each.
- **Severity:** smoke

## TC-FOLDER-AUTH-002 — Expired JWT → 401
- **Severity:** medium

## TC-FOLDER-EDGE-001 — Tree with 1000 folders — list response time <2s
- **Severity:** medium

## TC-FOLDER-EDGE-002 — Tree depth 50 levels — no stack overflow on tree build
- **Severity:** medium

## TC-FOLDER-EDGE-003 — Concurrent creates with same name — both succeed (no unique constraint)
- **Severity:** low

## TC-FOLDER-EDGE-004 — Concurrent delete + create child → race results in either child success or 404
- **Severity:** medium
