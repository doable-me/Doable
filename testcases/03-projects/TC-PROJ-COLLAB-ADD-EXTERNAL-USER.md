# TC-PROJ-COLLAB-ADD-EXTERNAL-USER

**Bug:** BUG-CORPUS-PROJ-005 (RLS interaction)
**Endpoint:** `POST /projects/:id/collaborators`
**Filed:** 2026-05-15 (verify run)
**Owner:** workspace-projects verify lane

## Background

The handler resolves `email → user.id` via `users.findByEmail()` before
inserting into `project_collaborators`. Migration 076
(`users_workspace_visible`) installs an RLS policy on `public.users`:

```
(doable_current_user_id() IS NULL)
OR (id = doable_current_user_id())
OR doable_user_shares_workspace(id, doable_current_user_id())
```

Because the `authMiddlewareWithRls` middleware opens a transaction
that sets `doable.current_user_id` to the caller, the email lookup runs
under RLS and the invitee — who by definition is NOT yet a co-member —
is invisible. `findByEmail` returns `undefined` and the route 404s every
legitimate external add. Pre-fix behaviour:

```
HTTP=404
{"error":"User not found"}
```

## Pre-conditions

- Caller `qa-owner@doable.test` has owner role on workspace `OWN_WS`.
- A project `TEST_PROJ` exists in `OWN_WS`.
- Target invitee `qa-alice@doable.test` exists, is NOT a member of
  `OWN_WS`, and is NOT yet a collaborator on `TEST_PROJ`.

## Cases

| # | Method / Path | Body | Auth | Expected HTTP | Expected body shape |
|---|---|---|---|---|---|
| 1 | POST /projects/$TEST_PROJ/collaborators | `{"email":"qa-alice@doable.test","role":"editor"}` | qa-owner | 201 | `{data:{user_id,role:"editor",email:"qa-alice@doable.test",...}}` |
| 2 | (re-run case 1 with no other change) | same | qa-owner | 409 | `{error:"User is already a collaborator on this project"}` |
| 3 | POST /projects/$TEST_PROJ/collaborators | `{"email":"qa-owner@doable.test"}` | qa-owner | 409 | `{error:"User is already a workspace member with access to this project"}` |
| 4 | POST /projects/$TEST_PROJ/collaborators | `{"email":"never-exists@example.test"}` | qa-owner | 404 | `{error:"User not found"}` |
| 5 | POST /projects/$TEST_PROJ/collaborators | `{"email":"qa-bob@doable.test","role":"editor"}` | qa-alice (collab-only after case 1) | 403 | `{error:"Only the project owner can add collaborators"}` |
| 6 | POST /projects/$TEST_PROJ/collaborators | `{"email":"qa-bob@doable.test"}` | qa-bob (no access) | 404 | `{error:"Project not found"}` |
| 7 | POST /projects/not-a-uuid/collaborators | `{"email":"x@y.z"}` | qa-owner | 400 | `{error:"Invalid project id"}` |
| 8 | POST /projects/00000000-0000-0000-0000-000000000000/collaborators | `{...}` | qa-owner | 400 | `{error:"Invalid project id"}` |
| 9 | POST /projects/$TEST_PROJ/collaborators | `{"email":"not-an-email"}` | qa-owner | 400 | `{error:"Validation failed",...}` |
| 10 | POST /projects/$TEST_PROJ/collaborators | _malformed JSON_ | qa-owner | 400 | `{error:"Invalid JSON body"}` |

## Security guard

The fix uses `sqlRoot` (RLS-bypass) ONLY for the email→user-id lookup,
AFTER the caller has been authorised as a workspace member at
≥`member` role and the project membership has been resolved. Removing
either authz gate would turn the bypass query into an email-enumeration
probe oracle.

Negative-path guards in the file:
- Caller without project access never reaches the lookup (case 6).
- Project-collaborator-only callers (no workspace role) get 403 before
  the lookup (case 5).
- Invalid project ids are rejected by `validateProjectIdParam()` middleware
  before the route body executes (cases 7, 8).

## Repro commands (dev)

```bash
TOK_OWN=$(jq -r .tokens.accessToken < testcases/evidence/dev/verify-2026-05-15/workspace-projects/qa-owner-login.json)
OWN_WS=$(jq -r .data[0].id < testcases/evidence/dev/verify-2026-05-15/workspace-projects/OWN-workspaces.json)
TEST_PROJ=12c6f088-fa18-4f5d-b2d6-53a0b28d9089

# Case 1 — external invite (expect 201)
curl -sS -X POST -H "Authorization: Bearer $TOK_OWN" \
     -H "Content-Type: application/json" \
     -d '{"email":"qa-alice@doable.test","role":"editor"}' \
     https://dev-api.doable.me/projects/$TEST_PROJ/collaborators -w "\nHTTP=%{http_code}\n"
```

## Acceptance

All 10 cases pass. The HTTP code matches the expected column; the body
matches the documented shape (or contains the documented error string).
