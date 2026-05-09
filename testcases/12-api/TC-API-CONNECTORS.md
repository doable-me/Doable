# TC-API-CONNECTORS — /workspaces/:wid/connectors + MCP OAuth

Mounted at `/workspaces` and `/` for OAuth callback (`services/api/src/routes.ts:97-98`). Source: `services/api/src/routes/connectors.ts`.

Endpoints:
- `GET    /workspaces/:wid/connectors`
- `POST   /workspaces/:wid/connectors`               — connect MCP server
- `GET    /workspaces/:wid/connectors/:cid`
- `PUT    /workspaces/:wid/connectors/:cid`
- `DELETE /workspaces/:wid/connectors/:cid`
- `POST   /workspaces/:wid/connectors/:cid/test`
- `GET    /workspaces/:wid/connectors/:cid/tools`
- `POST   /workspaces/:wid/connectors/:cid/oauth/start`
- `GET    /mcp/oauth/callback`                       — global MCP OAuth callback

---

## TC-API-CONN-001 — GET /workspaces/:wid/connectors 200
- **Expected:** 200 list.
- **Severity:** smoke

## TC-API-CONN-002 — GET 401 no auth
- **Expected:** 401.
- **Severity:** smoke

## TC-API-CONN-003 — GET non-member → 403
- **Expected:** 403.
- **Severity:** smoke

## TC-API-CONN-004 — POST /connectors 201 (HTTP)
- **Steps:** POST `{name:"GitHub", url:"https://mcp.example.com/sse", auth:{type:"bearer", token}}`.
- **Expected:** 201.
- **Severity:** smoke

## TC-API-CONN-005 — POST connectors invalid url → 400
- **Steps:** url "not-a-url".
- **Expected:** 400.
- **Severity:** high

## TC-API-CONN-006 — POST connectors localhost url blocked → 400
- **Steps:** url `http://localhost:3000/mcp` from non-admin.
- **Expected:** 400 SSRF guard.
- **Severity:** smoke

## TC-API-CONN-007 — POST connectors 169.254.x.x url blocked
- **Steps:** url to AWS metadata.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CONN-008 — POST connectors private 10.x url blocked
- **Steps:** url `http://10.0.0.1`.
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CONN-009 — POST connectors http (non-https) → 400
- **Steps:** url `http://...`.
- **Expected:** 400 require HTTPS (unless explicitly allowed).
- **Severity:** high

## TC-API-CONN-010 — POST connectors over plan limit → 403/422
- **Expected:** 403/422.
- **Severity:** medium

## TC-API-CONN-011 — POST connectors duplicate name → 409
- **Expected:** 409.
- **Severity:** medium

## TC-API-CONN-012 — POST connectors by viewer → 403
- **Expected:** 403.
- **Severity:** high

## TC-API-CONN-013 — GET /:cid 200
- **Expected:** 200; secret token redacted.
- **Severity:** smoke

## TC-API-CONN-014 — GET /:cid never returns plaintext token
- **Expected:** Token field absent or `***`.
- **Severity:** smoke

## TC-API-CONN-015 — PUT /:cid 200
- **Expected:** 200.
- **Severity:** medium

## TC-API-CONN-016 — DELETE /:cid 204
- **Expected:** 204.
- **Severity:** medium

## TC-API-CONN-017 — POST /:cid/test 200
- **Expected:** 200 with reachable=true.
- **Severity:** smoke

## TC-API-CONN-018 — POST /:cid/test unreachable → 502
- **Pre:** Bring down MCP host.
- **Expected:** 502 or 200 with reachable=false.
- **Severity:** high

## TC-API-CONN-019 — GET /:cid/tools 200
- **Expected:** 200 list of tool names exposed.
- **Severity:** smoke

## TC-API-CONN-020 — POST /:cid/oauth/start 200
- **Expected:** 200 redirect URL.
- **Severity:** medium

## TC-API-CONN-021 — GET /mcp/oauth/callback state mismatch → 400
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CONN-022 — GET /mcp/oauth/callback 302 success
- **Expected:** 302.
- **Severity:** smoke

## TC-API-CONN-023 — Path SQL injection :wid / :cid
- **Expected:** 400.
- **Severity:** smoke

## TC-API-CONN-024 — Wrong method PATCH on /connectors → 405/404
- **Expected:** 405/404.
- **Severity:** low

## TC-API-CONN-025 — Body 5MB POST → 413
- **Expected:** 413.
- **Severity:** medium

## TC-API-CONN-026 — Wrong content-type → 415/400
- **Expected:** 415/400.
- **Severity:** medium

## TC-API-CONN-027 — Header CRLF injection on Authorization
- **Expected:** 400.
- **Severity:** medium

## TC-API-CONN-028 — CORS preflight allow staging
- **Expected:** 204.
- **Severity:** smoke

## TC-API-CONN-029 — Idempotency-Key on POST connect
- **Expected:** Single row created.
- **Severity:** medium

## TC-API-CONN-030 — Filter ?status=active|errored
- **Expected:** 200 filtered.
- **Severity:** medium

## TC-API-CONN-031 — Unicode in connector name
- **Expected:** 201.
- **Severity:** low

## TC-API-CONN-032 — Server error during /test → 502 JSON
- **Expected:** 502 JSON.
- **Severity:** medium

## TC-API-CONN-033 — Connector secret rotation
- **Steps:** PUT new token.
- **Expected:** 200; old token revoked from cache.
- **Severity:** high

## TC-API-CONN-034 — DELETE during in-flight tool call
- **Expected:** 204; in-flight call may 502 or finish; document.
- **Severity:** high

## TC-API-CONN-035 — Long URL on /mcp/oauth/callback
- **Expected:** 414/400.
- **Severity:** medium

## TC-API-CONN-036 — Pagination cursor edges
- **Expected:** Empty/end correct.
- **Severity:** medium
