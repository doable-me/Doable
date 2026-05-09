# BUG-WS-001 — GET /workspaces/:id with malformed UUID returns 500 Internal Server Error

**Severity:** medium
**Filed by:** workspace-shard executor
**Date:** 2026-05-10
**Test:** TC-WS-CRUD-032 on https://<env>-api.doable.me

## Steps to reproduce
```
TOK=<qa-owner access token>
curl -i -H "Authorization: Bearer $TOK" \
  https://<env>-api.doable.me/workspaces/not-a-uuid
```

## Actual
HTTP 500 `{"error":"Internal Server Error"}`

## Expected
4xx (400 invalid UUID, 404 not found, or 403 not-a-member). The handler should validate the path param shape before issuing a SQL query that the driver/zod will reject with an unhandled error.

## Impact
Internal-error responses on user-supplied path values are noisy in logs and can mask real failures. Low security risk — error message is generic — but signals missing input validation in `/workspaces/:id` lookup chain.

## Repro evidence
- Body file: `testcases/evidence/<env>-ws/TC-WS-CRUD-032.body`
- Header file: `testcases/evidence/<env>-ws/TC-WS-CRUD-032.hdr`

## Suggested fix
Add UUID validation at the route boundary (zod path param) and return 400 `{"error":"Invalid workspace id"}`.
