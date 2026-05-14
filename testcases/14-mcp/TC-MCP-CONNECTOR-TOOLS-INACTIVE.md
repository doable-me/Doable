# TC-MCP-CONNECTOR-TOOLS-INACTIVE — listTools on inactive HTTP connector returns structured 503 (not 500)

**Owner:** MCP & Integrations area
**Related bug:** BUG-2026-05-14-MCP-008
**Severity:** high

## Pre-conditions

- Authenticated as a workspace owner / admin.
- An HTTP-based MCP connector exists with `status` ∈ {`inactive`, `error`} (e.g. its remote endpoint is unreachable).
- A separate active built-in (stdio) connector also exists so that the success path can be sanity-checked in the same suite.

## Steps

1. POST `/workspaces/:wsId/connectors` with `transportType=streamable_http` and `serverUrl=https://example.com/mcp` to create a connector that will fail to start.
2. Wait for the auto-test to mark it `inactive` / `error`.
3. GET `/workspaces/:wsId/connectors/:id/tools`.

## Expected

- HTTP status MUST be **either** `200` with `data: [...cached tools...]` **or** `503` with `data: []` — never `500`.
- The response body MUST include:
  - `data`: array of cached tools (possibly empty)
  - `status`: connector status (`"inactive"` or `"error"`)
  - `message`: human-readable explanation
- On the active stdio control connector, the same endpoint MUST return HTTP 200 with a non-empty `data` array.

## Regression rationale

Prior behavior surfaced an unhandled exception path (`Failed to list tools: …` with HTTP 500) which leaked internal error text and tripped client-side retry/back-off logic. The fix in `services/api/src/routes/connectors.ts` short-circuits when `row.status !== "active"` and wraps the live-fetch path in a structured 503 envelope.

## Verification (dev)

```bash
curl -s -w "\nHTTP:%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://dev-api.doable.me/workspaces/$WS/connectors/$BAD/tools"
# Expect: HTTP:503 + JSON {"data":[],"status":"inactive","message":"..."}
```
