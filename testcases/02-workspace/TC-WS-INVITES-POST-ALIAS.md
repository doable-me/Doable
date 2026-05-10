# TC-WS-INVITES-POST-ALIAS — `POST /workspaces/:id/invites` mounted (was 404)

Source: BUG-CORPUS-WS-002 (env1, 2026-05-10).
Helper under test: `services/api/src/routes/workspaces.ts` →
`inviteMemberHandler()` shared between two POST mounts:
- `POST /workspaces/:id/members/invite` (original)
- `POST /workspaces/:id/invites`        (new alias — was 404, hence the bug)

The GET counterpart (`GET /workspaces/:id/invites`) was already mounted;
only the POST under that path was missing. The TC corpus
(`testcases/02-workspace/TC-WS-INVITES.md`) had been documenting
`POST /invites` as the canonical endpoint, so adding the alias fixes the
spec drift without breaking any client that hits the older
`/members/invite` path.

Both paths require the `admin` workspace role (`requireRole("admin")`).
Same JSON body schema (`{email, role}`), same handler logic, same
validation, same plan-limit check, same email-send.

---

## TC-WS-INVITES-ALIAS-001 — `POST /workspaces/:id/invites` happy path → 201

- **Setup:** owner token, fresh workspace.
- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" -X POST \
    -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
    -d '{"email":"newinvite@doable.test","role":"member"}' \
    https://<env>-api.doable.me/workspaces/$WS_ID/invites
  ```
- **Expected:** `HTTP=201`, body `{"data": { id, workspace_id, email: "newinvite@doable.test", role: "member", token: "<32+ chars>", ... }}`.
  Was 404 before the fix — original BUG-CORPUS-WS-002 repro.
- **Severity:** high (TC corpus expected this endpoint to exist).

## TC-WS-INVITES-ALIAS-002 — `POST /workspaces/:id/members/invite` still works (regression)

- **Steps:** identical body, hit the original path
  `/workspaces/$WS_ID/members/invite`.
- **Expected:** `HTTP=201`, same body shape. Confirms the refactor
  preserves backwards compat for any client still using the old path.

## TC-WS-INVITES-ALIAS-003 — Invalid email → 400 (both paths)

- **Steps:** body `{"email":"not-an-email","role":"member"}` to BOTH paths.
- **Expected:** `HTTP=400`, body `{"error":"Validation failed", "details": {"email": [...]}}`.
  Validates the shared zod schema is applied via the shared handler.

## TC-WS-INVITES-ALIAS-004 — Invalid role → 400 (both paths)

- **Steps:** body `{"email":"valid@doable.test","role":"super-admin"}`.
- **Expected:** `HTTP=400`, body `{"error":"Validation failed", "details": {"role": [...]}}`.

## TC-WS-INVITES-ALIAS-005 — Empty body `{}` → 400 (both paths)

- **Steps:** body `{}`.
- **Expected:** `HTTP=400`, validation error on missing `email` AND `role`.

## TC-WS-INVITES-ALIAS-006 — Malformed JSON body → 400 (both paths)

- **Steps:** body `not json`, `Content-Type: application/json`.
- **Expected:** `HTTP=400`, body `{"error":"Invalid JSON body"}`. Confirms
  the explicit try/catch around `c.req.json()` added in the shared
  handler.

## TC-WS-INVITES-ALIAS-007 — Non-admin caller → 403

- **Steps:** member-role token (not admin/owner), valid body.
- **Expected:** `HTTP=403`. Confirms `requireRole("admin")` middleware
  still applies to BOTH mounts.

## TC-WS-INVITES-ALIAS-008 — Inviting an existing member → 409

- **Steps:** `email` of an already-active member, valid role.
- **Expected:** `HTTP=409`, body `{"error":"User is already a member of this workspace"}`.

## TC-WS-INVITES-ALIAS-009 — Plan member-limit exceeded → 403

- **Steps:** workspace at its plan member-limit, valid body.
- **Expected:** `HTTP=403`, body matches `Member limit reached (.*) Upgrade to invite more.`

## TC-WS-INVITES-ALIAS-010 — Non-UUID `:id` → caught by workspace-role middleware → 400

- **Steps:** `POST /workspaces/not-a-uuid/invites` valid body.
- **Expected:** `HTTP=400`, `{"error":"Invalid workspace id"}`. Confirms
  `requireRole("admin")` (which already validates UUID via
  `services/api/src/middleware/workspace-role.ts:45`) fires before the
  handler.

## TC-WS-INVITES-ALIAS-011 — `GET /workspaces/:id/invites` still works (regression)

- **Steps:** `GET` on the same path used in 001.
- **Expected:** `HTTP=200`, body `{"data": [...]}` listing pending invites.
  The bug originally observed this endpoint returning 200 — the GET path
  must remain unchanged.
