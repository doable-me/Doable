# TC-PROJ-ARCHIVE-UNARCHIVE

**Bug:** BUG-API-005 (regression after 2026-05-14 deploy a172e882)
**Endpoint:** `POST /projects/:id/archive` and `/unarchive`
**Filed:** 2026-05-15 (verify run)

## Background

`POST /projects/:id/archive` was returning **HTTP 500 Internal Server
Error** in dev. Root cause: the handler ran
`SET status = 'archived'::project_status` but the enum was defined in
migration 001 as `{creating, draft, published, error}` — `'archived'` is
not a member, so postgres.js throws `invalid input value for enum`.
The route also set `deleted_at = now()` which conflicts with the soft-
delete contract (rows with deleted_at IS NOT NULL are hidden from list
endpoints, so archived projects vanished instead of moving to an
archived pane).

## Fix

- Migration 084 adds `'archived'` to `project_status` (idempotent).
- Archive handler no longer touches `deleted_at`. Status alone signals
  archived. Unarchive moves the project back to `'draft'`.
- Both updates now require `deleted_at IS NULL` so a soft-deleted row
  can't be silently revived by an archive/unarchive call.

## Pre-conditions

- Caller `qa-owner@doable.test` has admin/owner role on workspace.
- `TEST_PROJ` exists, status=draft, deleted_at IS NULL.

## Cases

| # | Method / Path | Auth | Expected HTTP | Expected body |
|---|---|---|---|---|
| 1 | POST /projects/$TEST_PROJ/archive | qa-owner | 200 | `{data:{id,status:"archived"}}` |
| 2 | POST /projects/$TEST_PROJ/unarchive | qa-owner | 200 | `{data:{id,status:"draft"}}` |
| 3 | POST /projects/$TEST_PROJ/archive | qa-member (viewer of OWN_WS) | 403 | `{error:"Only workspace owners and admins can archive projects"}` |
| 4 | POST /projects/$TEST_PROJ/archive | qa-bob (no access) | 404 | `{error:"Project not found"}` |
| 5 | POST /projects/not-a-uuid/archive | qa-owner | 400 | `{error:"Invalid project id"}` |
| 6 | POST /projects/$TEST_PROJ/unarchive (when deleted_at IS NOT NULL) | qa-owner | 404 | `{error:"Project not found"}` |

## Acceptance

All 6 cases pass. After case 1 the project's `status` is `'archived'`
AND `deleted_at IS NULL` in postgres (verifiable via direct SQL).
