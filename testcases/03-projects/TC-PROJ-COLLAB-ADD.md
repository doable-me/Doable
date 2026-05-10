# TC-PROJ-COLLAB-ADD — `POST /projects/:id/collaborators` adds a user (was 404)

Source: BUG-CORPUS-PROJ-005 (env1, 2026-05-10).
Helper under test: `services/api/src/routes/projects/item-routes.ts:413` →
`addCollaboratorSchema` + `POST /:id/collaborators` handler.

Companion to: existing `GET /:id/collaborators` (line 384) and
`DELETE /:id/collaborators/:userId` (line ~514, was ~412 before this patch).
The POST mount fills the long-standing gap documented in
`testcases/03-projects/TC-PROJ-COLLAB.md` TC-PROJ-COLLAB-021..024.

Contract:
- Caller must hold at least workspace `member` role on the project's
  workspace (collab-only callers cannot grant access — same rule as DELETE).
- Body schema: `{ email: string (RFC 5321 email), role?: "owner"|"admin"|"editor"|"viewer" (default "editor") }`.
- 404 if `email` doesn't resolve to an existing user.
- 409 if the user is already a workspace member (they already have access).
- 409 if the user is already a project_collaborator (idempotent on
  `(project_id, user_id)`).
- 201 with `{user_id, role, added_at, email, display_name, avatar_url}` on
  successful insert (matches the GET row shape).
- 400 on malformed JSON or schema validation failure.
- Project access is gated by the existing `requireProjectAccess` so
  callers without project access get 404 first.

---

## TC-PROJ-COLLABA-001 — Workspace owner adds new user → 201

- **Setup:** owner token, project in owner's workspace, target user `qa-bob`
  has an account but is NOT a member of this workspace.
- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" -X POST \
    -H "Authorization: Bearer $OWNER_TOK" -H "Content-Type: application/json" \
    -d '{"email":"qa-bob@doable.test","role":"editor"}' \
    https://<env>-api.doable.me/projects/$PID/collaborators
  ```
- **Expected:** `HTTP=201`, body `{"data": { user_id, role: "editor", added_at, email: "qa-bob@doable.test", display_name, avatar_url }}`.
  Subsequent `GET /projects/$PID/collaborators` shows qa-bob in the list.
- **Severity:** smoke (the original BUG-CORPUS-PROJ-005 repro).

## TC-PROJ-COLLABA-002 — Default role is `editor` when omitted

- **Steps:** body `{"email":"qa-bob@doable.test"}` (no `role`).
- **Expected:** `HTTP=201`, body `data.role === "editor"`.
- **Severity:** medium

## TC-PROJ-COLLABA-003 — Non-existent email → 404

- **Steps:** body `{"email":"nobody@nowhere.test","role":"editor"}`.
- **Expected:** `HTTP=404`, `{"error":"User not found"}`.
- **Severity:** medium (TC-PROJ-COLLAB-022 documented this case).

## TC-PROJ-COLLABA-004 — User is already a workspace member → 409

- **Setup:** target user is already a member/admin/owner of this workspace.
- **Expected:** `HTTP=409`, `{"error":"User is already a workspace member with access to this project"}`.
- **Severity:** medium (TC-PROJ-COLLAB-023 documented this case as
  "noop or 409").

## TC-PROJ-COLLABA-005 — Duplicate add → 409

- **Setup:** repeat TC-001 a second time with the same email.
- **Expected:** `HTTP=409`, `{"error":"User is already a collaborator on this project"}`.
  Confirms the `ON CONFLICT DO NOTHING` path returns the canonical 409
  rather than 201 with a duplicate row.
- **Severity:** medium

## TC-PROJ-COLLABA-006 — Invalid role → 400

- **Steps:** body `{"email":"qa-bob@doable.test","role":"super-admin"}`.
- **Expected:** `HTTP=400`, `{"error":"Validation failed", "details": {"role": [...]}}`.
- **Severity:** medium (TC-PROJ-COLLAB-024 documented this case).

## TC-PROJ-COLLABA-007 — Invalid email → 400

- **Steps:** body `{"email":"not-an-email","role":"editor"}`.
- **Expected:** `HTTP=400`, `{"error":"Validation failed", "details": {"email": [...]}}`.

## TC-PROJ-COLLABA-008 — Empty body `{}` → 400 (was 404 — route missing was the only failure mode)

- **Steps:** body `{}`.
- **Expected:** `HTTP=400`, validation errors on missing `email`.

## TC-PROJ-COLLABA-009 — Malformed JSON → 400

- **Steps:** body `not json`, `Content-Type: application/json`.
- **Expected:** `HTTP=400`, `{"error":"Invalid JSON body"}`.

## TC-PROJ-COLLABA-010 — Caller is workspace viewer → 403

- **Setup:** caller has workspace role `viewer` on this workspace.
- **Steps:** valid body.
- **Expected:** `HTTP=403`, `{"error":"Viewers cannot add collaborators"}`.
  Confirms `isRoleAtLeast(wsRole, "member")` gate.
- **Severity:** high

## TC-PROJ-COLLABA-011 — Caller is project_collaborator only → 403

- **Setup:** caller is a project_collaborator (not a workspace member).
- **Steps:** valid body.
- **Expected:** `HTTP=403`, `{"error":"Only the project owner can add collaborators"}`.
  Mirrors the DELETE handler's same-rule enforcement.
- **Severity:** high

## TC-PROJ-COLLABA-012 — Caller has no access to project → 404

- **Setup:** caller is not a workspace member, not a collaborator, and the
  project is private.
- **Expected:** `HTTP=404`, `{"error":"Project not found"}` — existence-hiding.
- **Severity:** high

## TC-PROJ-COLLABA-013 — Non-UUID :id → 400

- **Steps:** `POST /projects/not-a-uuid/collaborators`.
- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Confirms the
  `validateProjectIdParam` middleware applied at the router top still
  fires (BUG-CORPUS-PROJ-002 regression guard).
- **Severity:** low

## TC-PROJ-COLLABA-014 — Auto-join (public project) is unaffected

- **Pre:** project is `visibility=public`. New caller hits `GET /projects/$PID`
  for the first time.
- **Expected:** auto-join still inserts row `role='editor'` via the existing
  `requireProjectAccess` flow. POST handler is untouched. Confirms the new
  POST didn't accidentally break the auto-join path.
- **Severity:** medium
