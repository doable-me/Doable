# Bug 15 — Integrations catalog shows `connected: false` for Supabase despite an active connection

**Severity:** ❌ Invalid — test-setup error, not a product bug
**Discovered:** 2026-04-09 round-2 E2E setup probe
**Area:** `services/api/src/routes/integrations.ts:37–87` — `GET /integrations/catalog`
**Status:** **Invalidated 2026-04-09** after re-testing with the `workspaceId` query parameter attached (which the frontend's `useIntegrationCatalog` hook always sends).

## Reality check

When the frontend calls `GET /integrations/catalog?workspaceId=8c3105b4-…`, the response correctly includes `"connected": true` for Supabase (verified via curl, 2026-04-09). The original probe forgot the `workspaceId` query param, in which case the handler's `connectedIds` set is empty and every entry returns `connected: false` — the documented fallback behavior for unauthenticated catalog browsing.

No product change needed. Keeping the file as a breadcrumb for future audits.

## Symptom

With an **active** Supabase connection in `integration_connections` (id `74b9f520-883d-4c02-a664-1a75a4191b7c`, `status: "active"`, `integrationId: "supabase"`, workspace `8c3105b4-…`), the catalog entry for `supabase` returns:

```json
{
  "id": "supabase",
  "displayName": "Supabase",
  "connected": false,          // ← wrong
  "actionCount": 7,
  ...
}
```

Expected: `connected: true`.

Verified the connection exists by calling `GET /integrations/connections?workspaceId=8c3105b4-…` which returns a row with `integrationId: "supabase"` and `status: "active"`.

## Impact

- Integrations picker UI likely shows "Not connected" for Supabase, confusing the user and triggering an unnecessary re-connect flow.
- AI tool auto-mount logic that gates on this flag may skip mounting the Supabase MCP connector (544b26f) — which would silently break AI prompts that try to use Supabase.
- **Critical for this test run:** our round-2 E2E test is specifically exercising the Supabase MCP path. If this flag blocks auto-mount, we may see downstream "Supabase tool not available" errors in chat. Need to confirm auto-mount gate in `services/api/src/routes/chat.ts` doesn't use this flag.

## Likely root cause

The `GET /integrations/catalog` handler either:
- Doesn't pass a `workspaceId` query param, so it can't look up connections to compute the flag, and defaults to `false` for every entry.
- Queries `integration_connections` with the wrong column (maybe `integration_id` vs `integrationId`, or `workspace_id` vs `workspaceId`).
- Filters out connections with `scope: "user"` when computing the flag, even though user-scoped connections should count.

The Supabase connection in question has `scope: "user"` and `projectId: "4cd11cc0-…"` — possibly the catalog endpoint requires a `?projectId=` and only counts connections scoped to that project.

Need to read the handler to confirm which of the above. **TODO for fixer:** trace `GET /integrations/catalog` in `services/api/src/routes/integrations.ts`, find where `connected` is computed, fix the query.

## Reproduction

```
# Verify connection exists
curl -H "Authorization: Bearer $T" \
  "http://localhost:4000/integrations/connections?workspaceId=8c3105b4-8058-41fd-b40b-006baaa21c0c" \
  | jq '.data[] | select(.integrationId == "supabase")'
# → active connection present

# Check catalog flag
curl -H "Authorization: Bearer $T" http://localhost:4000/integrations/catalog \
  | jq '.[] | select(.id == "supabase") | {id, connected}'
# → { "id": "supabase", "connected": false }  ← wrong
```

## Recommended fix

1. Pass the workspaceId (and/or projectId) explicitly to the catalog handler.
2. Join `integration_catalog` against `integration_connections` using the correct column names.
3. Include both workspace-scoped AND user-scoped connections when computing the flag.
4. Add a unit test that asserts `catalog[].connected === true` when a matching row in `integration_connections` exists.

## Acceptance

1. `GET /integrations/catalog?workspaceId=<wid>` returns `connected: true` for Supabase.
2. Disconnecting and reconnecting Supabase flips the flag.
3. The AI chat connector auto-mount path still works (not broken by the query change).
