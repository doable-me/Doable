# BUG-WSI-002 — /integrations/connections requires workspaceId; test corpus does not document it

## Environment
- <env>: https://<env>-api.doable.me
- 2026-05-10 ~18:58Z
- qa-owner JWT (200 OK on /projects)

## Reproduction
```bash
curl -H "Authorization: Bearer $OWNER" https://<env>-api.doable.me/integrations/connections
# 400 {"error":"workspaceId query parameter is required"}

curl -H "Authorization: Bearer $OWNER" "https://<env>-api.doable.me/integrations/connections?workspaceId=<wsid>"
# 200
```

## Test corpus mismatch
`testcases/07-integrations/TC-INTEG-LIST.md` TC-INTEG-LIST-026 says:
> GET /integrations/connections — array with status, account label, last used

No mention of mandatory `workspaceId` query param.

## Recommended action
Update corpus to require `workspaceId`, OR have the API default to "all workspaces user belongs to" (more user-friendly). Cross-tenant isolation must remain (TC-INTEG-LIST-027).

## Severity
low — API is consistent with workspace-scoped integrations (matches `/workspaces/:wid/skills`, `/workspaces/:wid/...` pattern). Just doc/test gap.

## Source ref
`services/api/src/routes/integrations-connections.ts:46`
