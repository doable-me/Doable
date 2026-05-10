# TC-PROJ-NIL-UUID — All-zeros UUID is rejected; PATCH/DELETE return 400 not 200

Source: BUG-CORPUS-PROJ-004 (env1, 2026-05-10).
Helper under test: `services/api/src/routes/projects/helpers.ts` →
`NIL_UUID` constant + `validateProjectIdParam()` rejection of
`00000000-0000-0000-0000-000000000000` (RFC 4122 §4.1.7 nil UUID).

Root cause: a previous run minted a placeholder row keyed on the nil UUID
via `POST /projects/00000000-…/chat` with `createIfMissing: true`. After
that, PATCH/DELETE `/projects/00000000-…` operated on the stub row and
returned **200** instead of the expected 404. The fix has two layers:

1. **Validator-level rejection.** The shared `validateProjectIdParam()`
   middleware now rejects the nil UUID with `400 {"error":"Invalid project id"}`
   alongside its existing UUID-shape check. Applied to all sub-routers
   that capture `:id` / `:projectId` (item-routes, api-keys, versions,
   security, env-vars, project-files).
2. **Mint-time block.** The chat handler's `createIfMissing` branch
   (`services/api/src/routes/chat/send-handler.ts:127`) now refuses to
   INSERT a row when `projectId === NIL_UUID`, so the placeholder can't
   be re-minted by a future call.

Existing nil-UUID rows in the DB are now unreachable through the API
(any path that requires `:id` is gated by the validator), even though
they remain in the table.

---

## TC-PROJ-NILUUID-001 — `GET /projects/00000000-0000-0000-0000-000000000000` → 400

- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" -H "Authorization: Bearer $TOK" \
    https://<env>-api.doable.me/projects/00000000-0000-0000-0000-000000000000
  ```
- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Was 200 with
  the placeholder row's stub data.
- **Severity:** medium (original PROJ-004 repro, fetch path).

## TC-PROJ-NILUUID-002 — `PATCH /projects/00000000-…000` body `{"name":"X"}` → 400

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Was 200 with
  silent mutation of the stub row.
- **Severity:** medium (original PROJ-004 repro, mutation path).

## TC-PROJ-NILUUID-003 — `DELETE /projects/00000000-…000` → 400

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Was 200 with
  `{deleted: true}` on the stub row.
- **Severity:** medium (original PROJ-004 repro, delete path).

## TC-PROJ-NILUUID-004 — `POST /projects/00000000-…000/chat` `{createIfMissing:true}` → 404 (mint-time block)

- **Steps:**
  ```bash
  curl -sS -o - -w "\nHTTP=%{http_code}\n" -X POST \
    -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
    -d '{"content":"hi","createIfMissing":true}' \
    https://<env>-api.doable.me/projects/00000000-0000-0000-0000-000000000000/chat
  ```
- **Expected:** `HTTP=404`, `{"error":"Project not found"}`. Confirms the
  chat handler skips the auto-scaffold INSERT for the nil UUID, so a
  fresh placeholder cannot be minted post-fix. NOTE: this is the chat
  endpoint, NOT covered by `validateProjectIdParam`, so the 404 must come
  from the explicit `if (uuidRegex.test(projectId) && projectId !== NIL_UUID)`
  guard added in send-handler.ts.
- **Severity:** high (closes the mint-side hole).

## TC-PROJ-NILUUID-005 — Uppercase nil UUID also rejected

- **Steps:** `GET /projects/00000000-0000-0000-0000-000000000000` (already
  lowercase) — but Postgres is case-insensitive on UUIDs, so verify the
  validator's `.toLowerCase()` normalisation by trying mixed-case nil:
  `00000000-0000-0000-0000-00000000000A` is NOT nil (last char "A");
  `00000000-0000-0000-0000-000000000000` is nil regardless of case.
  Send `00000000-0000-0000-0000-000000000000` → expect 400.
- **Expected:** `HTTP=400`. Confirms the rejection isn't case-sensitive.

## TC-PROJ-NILUUID-006 — Other zero-heavy UUIDs (not nil) still pass middleware

- **Steps:** `GET /projects/00000001-0000-0000-0000-000000000000` (one
  non-zero hex). Expect to pass the validator and then 404 from the
  handler (no row exists).
- **Expected:** `HTTP=404`, `{"error":"Project not found"}`. Confirms
  ONLY the canonical nil UUID is rejected, not similar-looking ones.

## TC-PROJ-NILUUID-007 — `GET /projects/00000000-…000/files` → 400 (project-files router)

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`. Confirms
  the project-files router's defense-in-depth guard also catches nil.

## TC-PROJ-NILUUID-008 — `GET /projects/00000000-…000/versions` → 400 (versions router)

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`.

## TC-PROJ-NILUUID-009 — `GET /projects/00000000-…000/env-vars` → 400 (env-vars router)

- **Expected:** `HTTP=400`, `{"error":"Invalid project id"}`.
