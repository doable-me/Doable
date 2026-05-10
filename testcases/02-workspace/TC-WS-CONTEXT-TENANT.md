# TC-WS-CONTEXT-TENANT — `/workspaces/:wid/context*` enforces workspace membership

Source: BUG-CORPUS-CTX-001 (env1, 2026-05-10).
Helper under test: `services/api/src/middleware/workspace-role.ts` →
`requireRole(minRole, paramName)` (now generalised to accept the path
param name; defaults to `"id"`, pass `"wid"` for context routes).

Mounted at top of `workspaceContextRoutes` in
`services/api/src/routes/context.ts:165-170`:

```ts
workspaceContextRoutes.use("*", authMiddleware);
workspaceContextRoutes.use("*", requireRole("viewer", "wid"));
```

Plus admin-level escalation on workspace-level write paths:

```ts
workspaceContextRoutes.put("/:filename", requireRole("admin", "wid"), …);
workspaceContextRoutes.delete("/:filename", requireRole("admin", "wid"), …);
```

Root cause: previously only `authMiddleware` ran, so any authenticated
caller could read the file list and individual context content for any
workspace — a cross-tenant info-disclosure gap. Test pass against env1
showed qa-bob, qa-admin (different ws owner), qa-viewer, qa-member all
reaching qa-owner's workspace context with HTTP 200.

After fix:
- Read paths (GET /, GET /:filename, GET /user/list, PUT /user/:filename)
  require `viewer` role on the workspace.
- Workspace-level write paths (PUT /:filename, DELETE /:filename) require
  `admin` role.
- User-level overrides (PUT /user/:filename) still go through viewer-mw
  only — any member may set their OWN context.
- Non-UUID `:wid` returns 400 (the `requireRole` middleware UUID guard).
- Non-member callers return 403 with `{"error":"Not a member of this workspace"}`.
- Members below the required role return 403 with
  `{"error":"Requires admin role or higher"}` for workspace-level writes.

---

## TC-WS-CTX-TENANT-001 — Non-member `GET /workspaces/<other-wid>/context` → 403

- **Setup:** qa-bob token (NOT a member of qa-owner's workspace).
  `WID` = qa-owner's workspace id.
- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" -H "Authorization: Bearer $BOB_TOK" \
    https://<env>-api.doable.me/workspaces/$WID/context
  ```
- **Expected:** `HTTP=403`, body `{"error":"Not a member of this workspace"}`.
  Was 200 with `{"data":{"files":[],"stats":{...}}}` — original CTX-001 repro.
- **Severity:** medium (cross-tenant info disclosure).

## TC-WS-CTX-TENANT-002 — Non-member `GET /workspaces/<other-wid>/context/:filename` → 403

- **Steps:** same setup, request `/context/strategy.md`.
- **Expected:** `HTTP=403`. Confirms per-file path is also gated.
- **Severity:** high (per-file content was the bigger leak risk).

## TC-WS-CTX-TENANT-003 — Workspace owner `GET /workspaces/:wid/context` → 200

- **Setup:** qa-owner token, qa-owner's WID.
- **Expected:** `HTTP=200`, body `{"data":{"files":[...],"stats":{...}}}`.
  Regression guard — confirms members can still read their own context.
- **Severity:** smoke

## TC-WS-CTX-TENANT-004 — Workspace member `GET /workspaces/:wid/context` → 200

- **Setup:** member-role token on qa-owner's workspace.
- **Expected:** `HTTP=200`. Members at every role ≥ viewer can read.
- **Severity:** smoke

## TC-WS-CTX-TENANT-005 — Workspace viewer `GET /workspaces/:wid/context` → 200

- **Setup:** viewer-role token on qa-owner's workspace.
- **Expected:** `HTTP=200`. Confirms `requireRole("viewer", "wid")` admits viewers.
- **Severity:** medium

## TC-WS-CTX-TENANT-006 — Anonymous `GET /workspaces/:wid/context` → 401

- **Setup:** no Authorization header.
- **Expected:** `HTTP=401`. Confirms `authMiddleware` runs first; `requireRole`
  comes after auth.
- **Severity:** medium

## TC-WS-CTX-TENANT-007 — Non-UUID `:wid` → 400

- **Steps:** `GET /workspaces/not-a-uuid/context` with valid token.
- **Expected:** `HTTP=400`, `{"error":"Invalid workspace id"}`. Confirms the
  UUID-shape check inside `requireRole`.
- **Severity:** low

## TC-WS-CTX-TENANT-008 — Non-member `PUT /workspaces/:wid/context/foo.md` → 403

- **Setup:** qa-bob token + valid body.
- **Expected:** `HTTP=403` (top-level mw fires before the admin escalation).
- **Severity:** high

## TC-WS-CTX-TENANT-009 — Workspace viewer `PUT /workspaces/:wid/context/foo.md` → 403

- **Setup:** viewer-role token. Member-level read passes the top-level mw,
  but the per-route `requireRole("admin", "wid")` rejects.
- **Expected:** `HTTP=403`, `{"error":"Requires admin role or higher"}`.
- **Severity:** high (writes must escalate beyond viewer).

## TC-WS-CTX-TENANT-010 — Workspace member `PUT /workspaces/:wid/context/foo.md` → 403

- **Setup:** member-role (not admin) token.
- **Expected:** `HTTP=403`, `{"error":"Requires admin role or higher"}`.
- **Severity:** medium

## TC-WS-CTX-TENANT-011 — Workspace admin `PUT /workspaces/:wid/context/foo.md` → 200

- **Expected:** `HTTP=200`, body `{"data": {filename, length, updatedAt, ...}}`.
- **Severity:** smoke

## TC-WS-CTX-TENANT-012 — Workspace admin `DELETE /workspaces/:wid/context/foo.md` → 200

- **Pre:** file `foo.md` exists.
- **Expected:** `HTTP=200`, `{"data":{"deleted":true}}`.
- **Severity:** smoke

## TC-WS-CTX-TENANT-013 — Workspace member `DELETE` → 403

- **Expected:** `HTTP=403`, `{"error":"Requires admin role or higher"}`.
- **Severity:** medium

## TC-WS-CTX-TENANT-014 — Workspace member `GET /user/list` (own overrides) → 200

- **Setup:** any workspace member.
- **Expected:** `HTTP=200`, body `{"data":{"files":[...]}}`. The `/user/*`
  routes still allow any member to read THEIR OWN context — viewer-level mw
  doesn't escalate to admin for these.
- **Severity:** medium

## TC-WS-CTX-TENANT-015 — Workspace member `PUT /user/own-override.md` → 200

- **Setup:** any workspace member, valid body.
- **Expected:** `HTTP=200`. Member can set their own per-user override.
- **Severity:** medium

## TC-WS-CTX-TENANT-016 — Non-member `PUT /user/own-override.md` → 403

- **Setup:** qa-bob (not a member) on qa-owner's WID.
- **Expected:** `HTTP=403`, `{"error":"Not a member of this workspace"}`.
  Confirms even per-user overrides require workspace membership — you
  cannot drop a personal override into a workspace you have no role in.
- **Severity:** high
