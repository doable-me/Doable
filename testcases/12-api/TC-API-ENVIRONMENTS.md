# TC-API-ENVIRONMENTS — /workspaces/:wid/environments + env-vars

Mounted at `/workspaces` and `/projects` (`services/api/src/routes.ts:102-106`). Source: `routes/environments.ts`, `routes/env-vars.ts`.

Endpoints (representative):
- `GET    /workspaces/:wid/environments`
- `POST   /workspaces/:wid/environments`
- `GET    /workspaces/:wid/environments/:eid`
- `PUT    /workspaces/:wid/environments/:eid`
- `DELETE /workspaces/:wid/environments/:eid`
- `POST   /workspaces/:wid/environments/:eid/skills/attach`
- `POST   /workspaces/:wid/environments/:eid/skills/detach`
- `GET    /workspaces/:wid/env-vars`
- `POST   /workspaces/:wid/env-vars`
- `PUT    /workspaces/:wid/env-vars/:id`
- `DELETE /workspaces/:wid/env-vars/:id`
- `GET    /projects/:id/env-vars`
- `POST   /projects/:id/env-vars`
- `PUT    /projects/:id/env-vars/:vid`
- `DELETE /projects/:id/env-vars/:vid`
- `GET    /env-vars/preview`         — preview merged env

---

## TC-API-ENV-001 — GET /environments 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-ENV-002 — POST /environments 201
- **Steps:** POST `{name:"prod", description:""}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-ENV-003 — POST /environments duplicate name → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-ENV-004 — POST /environments empty name → 400
- **Expected:** 400.
- **Severity:** high

## TC-API-ENV-005 — POST /environments invalid name char → 400
- **Steps:** name "prod env".
- **Expected:** 400 (slug-style check).
- **Severity:** high

## TC-API-ENV-006 — POST environments by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-ENV-007 — GET /environments/:eid 200
- **Expected:** 200 detail.
- **Severity:** smoke

## TC-API-ENV-008 — PUT /environments/:eid 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-ENV-009 — DELETE /environments/:eid 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-ENV-010 — DELETE last environment → 400
- **Expected:** 400 if at least one required; record.
- **Severity:** medium

## TC-API-ENV-011 — POST /:eid/skills/attach 200
- **Steps:** POST `{skillId}`.
- **Expected:** 200; environment_skill_refs row created.
- **Severity:** high

## TC-API-ENV-012 — POST /attach skill from another workspace → 400/404
- **Expected:** 400/404.
- **Severity:** smoke

## TC-API-ENV-013 — POST /skills/detach 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-ENV-014 — POST /attach idempotent
- **Steps:** Attach twice.
- **Expected:** 200 both times; one row only.
- **Severity:** medium

## TC-API-ENV-015 — GET /workspaces/:wid/env-vars 200
- **Expected:** 200; values redacted unless `?reveal=true` and admin.
- **Severity:** smoke

## TC-API-ENV-016 — GET env-vars values masked by default
- **Expected:** value field is `***` for sensitive.
- **Severity:** smoke

## TC-API-ENV-017 — GET env-vars ?reveal=true admin → 200 with values
- **Expected:** 200 plaintext values.
- **Severity:** smoke

## TC-API-ENV-018 — GET env-vars ?reveal=true non-admin → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-ENV-019 — POST /workspaces/:wid/env-vars 201
- **Steps:** POST `{key:"API_KEY", value:"secret", environments:["prod"]}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-ENV-020 — POST env-var key invalid (lowercase) → 400
- **Steps:** key "apiKey".
- **Expected:** 400 (uppercase + underscore convention).
- **Severity:** high

## TC-API-ENV-021 — POST env-var key starts with digit → 400
- **Steps:** key "1KEY".
- **Expected:** 400.
- **Severity:** high

## TC-API-ENV-022 — POST env-var duplicate key in same env → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-ENV-023 — POST env-var max value length
- **Steps:** value > 64 KB.
- **Expected:** 400.
- **Severity:** medium

## TC-API-ENV-024 — POST env-var with sensitive=true encrypted
- **Steps:** sensitive:true.
- **Expected:** 201; DB row encrypted.
- **Severity:** smoke

## TC-API-ENV-025 — PUT env-var rotates value 200
- **Expected:** 200; new value encrypted.
- **Severity:** high

## TC-API-ENV-026 — DELETE env-var 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-ENV-027 — POST /projects/:id/env-vars 201 (project override)
- **Expected:** 201; overrides workspace var.
- **Severity:** medium

## TC-API-ENV-028 — GET /projects/:id/env-vars merged 200
- **Expected:** 200 includes workspace + project; project wins.
- **Severity:** smoke

## TC-API-ENV-029 — GET /env-vars/preview 200
- **Expected:** 200 with all envs merged for given project + env.
- **Severity:** medium

## TC-API-ENV-030 — POST env-var by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-ENV-031 — Path SQL injection on :eid / :id
- **Expected:** 400.
- **Severity:** smoke

## TC-API-ENV-032 — Wrong method PATCH on /environments → 405
- **Expected:** 405/404.
- **Severity:** low

## TC-API-ENV-033 — Body 5MB → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-ENV-034 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-ENV-035 — Header CRLF on env value → 400
- **Steps:** value contains `\r\n`.
- **Expected:** 400.
- **Severity:** high

## TC-API-ENV-036 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-ENV-037 — Idempotency-Key on POST env-var
- **Expected:** Single row.
- **Severity:** medium

## TC-API-ENV-038 — Filter combo (environment × sensitive × scope)
- **Expected:** Correct subsets.
- **Severity:** medium

## TC-API-ENV-039 — Server error returns JSON
- **Expected:** 500 JSON.
- **Severity:** medium

## TC-API-ENV-040 — Pagination cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium
