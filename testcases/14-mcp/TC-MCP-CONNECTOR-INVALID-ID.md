# TC-MCP-CONNECTOR-INVALID-ID — Non-UUID :id returns 400 (regression for BUG-CORPUS-MCP-001)

**Source:** `services/api/src/routes/connectors.ts` — `ensureUuidParam()`
**Bug:** `testcases/bugs/BUG-CORPUS-MCP-001.md`
**Date authored:** 2026-05-10
**Severity:** medium

A malformed `:id` (not a UUID) on connector endpoints used to throw
`invalid input syntax for type uuid` from `postgres()` and surface as a
500. After the fix, every handler that takes `:id` or `:workspaceId`
validates the path param up-front and returns 400 with a clear message
BEFORE any SQL lookup runs.

## Pre-requisites

- Authenticated owner token for some workspace `W` (any valid UUID).
- env1 (zantaz) or local API.

## TC-MCP-CONNECTOR-INVALID-ID-001 — Test endpoint with bogus id

**Steps:**

```bash
curl -X POST -H "Authorization: Bearer $OWNER" \
  -H "Content-Type: application/json" -d '{}' \
  https://zantaz-api.doable.me/workspaces/<W>/connectors/notacid/test
```

**Expected (post-fix):**
- `HTTP 400`
- Body: `{"error":"Invalid id: must be a UUID"}`
- No 500, no Internal Server Error, no SQL error.
- Server logs show NO `invalid input syntax for type uuid` entry.

**Pre-fix evidence:** `testcases/evidence/env1/TC-MCP-TOOL-001.body`
returned 500.

## TC-MCP-CONNECTOR-INVALID-ID-002 — GET with bogus id

```bash
curl -H "Authorization: Bearer $OWNER" \
  https://zantaz-api.doable.me/workspaces/<W>/connectors/badbad/
```

**Expected:** 400 (UUID guard rejects before `connectors.getConnector()`).

## TC-MCP-CONNECTOR-INVALID-ID-003 — PATCH with bogus id

```bash
curl -X PATCH -H "Authorization: Bearer $OWNER" \
  -H "Content-Type: application/json" -d '{"name":"x"}' \
  https://zantaz-api.doable.me/workspaces/<W>/connectors/zzz
```

**Expected:** 400. Body validation does not run because the path
validation happens first.

## TC-MCP-CONNECTOR-INVALID-ID-004 — DELETE with bogus id

```bash
curl -X DELETE -H "Authorization: Bearer $OWNER" \
  https://zantaz-api.doable.me/workspaces/<W>/connectors/123
```

**Expected:** 400.

## TC-MCP-CONNECTOR-INVALID-ID-005 — /tools with bogus id

```bash
curl -H "Authorization: Bearer $OWNER" \
  https://zantaz-api.doable.me/workspaces/<W>/connectors/foo/tools
```

**Expected:** 400.

## TC-MCP-CONNECTOR-INVALID-ID-006 — Bogus workspaceId, valid id

```bash
curl -X POST -H "Authorization: Bearer $OWNER" -d '{}' \
  https://zantaz-api.doable.me/workspaces/notawksid/connectors/<valid-uuid>/test
```

**Expected:** 400 with `{"error":"Invalid workspaceId: must be a UUID"}`.

## TC-MCP-CONNECTOR-INVALID-ID-007 — Reserved literal segments still routable

The router uses literal segments `discover`, `mcp-oauth/authorize`, and
`connectors-effective`. The UUID guard is INLINE in handlers (not a
catch-all middleware) so these literal segments still work normally.

**Steps:**

```bash
curl -X POST -H "Authorization: Bearer $OWNER" \
  -H "Content-Type: application/json" -d '{"url":"https://example.com"}' \
  https://zantaz-api.doable.me/workspaces/<W>/connectors/discover
```

**Expected:** Either 200 (with discovery result) or 4xx from the discover
logic — but NOT a 400 saying `discover` is an invalid UUID. This guards
against a regression where a too-aggressive UUID middleware would block
literal segments.

## TC-MCP-CONNECTOR-INVALID-ID-008 — Valid UUID for nonexistent connector → 404

```bash
curl -X POST -H "Authorization: Bearer $OWNER" -d '{}' \
  https://zantaz-api.doable.me/workspaces/<W>/connectors/00000000-0000-0000-0000-000000000000/test
```

**Expected:** 404 `{"error":"Connector not found"}`. Distinguishes
"malformed id" (400) from "well-formed but absent" (404).

## Retest commands

```
pnpm --filter @doable/api type-check
# then run the curl probes above against env1
```

## Notes

- The guard is permissive about case (matches `[0-9a-f]{8}-...` with `i`
  flag) and also accepts upper-case hex, matching Postgres' UUID parsing.
- All 5 `:id` connector handlers (GET / PATCH / DELETE / POST :id/test /
  GET :id/tools) plus the workspace-only handlers (GET list, POST list)
  now go through `ensureUuidParam`.
