# BUG-CORPUS-MCP-001 — Bogus connector id on `POST /workspaces/:ws/connectors/:id/test` returns 500

- **Severity:** medium
- **Surface:** `POST https://zantaz-api.doable.me/workspaces/<ws>/connectors/<bogus-id>/test`
- **Date:** 2026-05-10

## Repro

```
curl -X POST -H "Authorization: Bearer $OWNER" \
  -H "Content-Type: application/json" -d '{}' \
  https://zantaz-api.doable.me/workspaces/<ws>/connectors/notacid/test
```

→ HTTP 500 `{"error":"Internal Server Error"}`.

## Expected

400 (invalid uuid) or 404 (not found). 500 for malformed/missing path param indicates an unhandled exception path.

## Evidence

`testcases/evidence/env1/TC-MCP-TOOL-001.body`

## Remediation

In `services/api/src/routes/connectors.ts` test handler, validate `id` is a UUID and return 400 before lookup; on lookup-miss return 404.
