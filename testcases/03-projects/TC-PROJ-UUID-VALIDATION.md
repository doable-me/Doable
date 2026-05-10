# TC-PROJ-UUID-VALIDATION — Reject non-UUID `:id` with 400, not 500

Source: BUG-CORPUS-PROJ-002 (env1 / zantaz, filed 2026-05-10).
Helper under test: `services/api/src/routes/projects/helpers.ts` →
`validateProjectIdParam` middleware.

Mounted via:
- `projectItemRoutes.use("/:id",   validateProjectIdParam)`
- `projectItemRoutes.use("/:id/*", validateProjectIdParam)`
- `projectApiKeyRoutes.use("/:id/*", validateProjectIdParam)`

Routes covered (any method/handler whose path begins `/projects/:id...` and
is owned by `projectItemRoutes` or `projectApiKeyRoutes`):
- `GET    /projects/:id`
- `PATCH  /projects/:id`
- `PUT    /projects/:id`
- `DELETE /projects/:id`
- `POST   /projects/:id/view`
- `POST   /projects/:id/connector-proxy-token`
- `GET    /projects/:id/share-stats`
- `POST   /projects/:id/duplicate`
- `POST   /projects/:id/star`
- `POST   /projects/:id/move`
- `GET    /projects/:id/collaborators`
- `DELETE /projects/:id/collaborators/:userId`
- `GET    /projects/:id/connector-settings`
- `PUT    /projects/:id/connector-settings`
- `GET    /projects/:id/api-keys`
- `POST   /projects/:id/api-keys`
- `DELETE /projects/:id/api-keys/:keyId`

A non-UUID `:id` MUST respond `400 {"error":"Invalid project id"}` BEFORE
postgres.js sees the value (which would otherwise raise
`invalid input syntax for type uuid` and surface as 500 — the original bug).

The non-`:id` paths in `projectListRoutes` (`/`, `/starred`, `/shared`,
`/recently-viewed`) MUST keep working unchanged.

---

## TC-PROJ-UUID-001 — `GET /projects/not-a-uuid` → 400

- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" \
    -H "Authorization: Bearer $TOK" \
    https://<env>-api.doable.me/projects/not-a-uuid
  ```
- **Expected:** `HTTP=400`, body `{"error":"Invalid project id"}`.
- **Severity:** medium (DOS-amplifier / observability noise; original bug).

## TC-PROJ-UUID-002 — `PATCH /projects/abc` → 400

- **Steps:** `PATCH /projects/abc` with body `{"name":"x"}` and bearer.
- **Expected:** `HTTP=400`, body `{"error":"Invalid project id"}`.
- **Severity:** low

## TC-PROJ-UUID-003 — `DELETE /projects/123` → 400

- **Steps:** `DELETE /projects/123` with bearer.
- **Expected:** `HTTP=400`, body `{"error":"Invalid project id"}`.
- **Severity:** low

## TC-PROJ-UUID-004 — `POST /projects/foo/star` → 400

- **Steps:** `POST /projects/foo/star` with bearer (no body).
- **Expected:** `HTTP=400`, body `{"error":"Invalid project id"}`.
- **Severity:** low

## TC-PROJ-UUID-005 — `GET /projects/<truncated-uuid>` → 400

- **Steps:** drop one hex char from a real UUID (e.g.
  `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa`) and request
  `GET /projects/<truncated>`.
- **Expected:** `HTTP=400`, body `{"error":"Invalid project id"}`. Validates
  the regex requires the full 8-4-4-4-12 layout.
- **Severity:** low

## TC-PROJ-UUID-006 — Real UUID for nonexistent project → 404 (NOT 400)

- **Steps:**
  ```bash
  NONCE=$(python3 -c "import uuid; print(uuid.uuid4())")
  curl -sS -o - -w "\nHTTP=%{http_code}\n" \
    -H "Authorization: Bearer $TOK" \
    https://<env>-api.doable.me/projects/$NONCE
  ```
- **Expected:** `HTTP=404`, body `{"error":"Project not found"}`. Confirms the
  guard is UUID-shape-only and does NOT mask the existing access checks.
- **Severity:** medium (regression guard against over-rejection).

## TC-PROJ-UUID-007 — `GET /projects/starred` keeps working

- **Steps:** `GET /projects/starred` with bearer.
- **Expected:** `HTTP=200`, body `{"data":[...]}`. Confirms the middleware is
  scoped to `projectItemRoutes` only and does NOT eclipse the literal
  `/starred` route registered earlier in `projectListRoutes`.
- **Severity:** high (regression guard against breaking project list UI).

## TC-PROJ-UUID-008 — `GET /projects/shared` keeps working

- **Steps:** `GET /projects/shared` with bearer.
- **Expected:** `HTTP=200`, body `{"data":[...]}`. Same rationale as 007.
- **Severity:** high

## TC-PROJ-UUID-009 — `GET /projects/recently-viewed` keeps working

- **Steps:** `GET /projects/recently-viewed` with bearer.
- **Expected:** `HTTP=200`. Same rationale as 007.
- **Severity:** medium

## TC-PROJ-UUID-010 — `GET /projects/abc/api-keys` → 400

- **Steps:** `GET /projects/abc/api-keys` with bearer.
- **Expected:** `HTTP=400`, body `{"error":"Invalid project id"}`. Confirms
  the api-keys sub-router is also guarded.
- **Severity:** low
