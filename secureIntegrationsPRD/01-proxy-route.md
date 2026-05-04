# Proxy Route Specification

## Endpoint

```
POST /__doable/connector-proxy/:integrationId/:actionName
```

This route is **served by the preview-proxy handler** (same process that serves preview iframes). It intercepts requests to `/__doable/connector-proxy/*` before forwarding to the dev server.

For deployed apps, this route is served by the **runtime proxy** (Caddy → API server fallback for `/__doable/*` paths).

## Request Format

```http
POST /__doable/connector-proxy/slack/send_channel_message HTTP/1.1
Content-Type: application/json
Authorization: Bearer <jwt-or-api-key>

{
  "props": {
    "channel": "#general",
    "text": "Hello from my app!"
  }
}
```

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <token>` — either a short-lived JWT (preview mode) or a project API key (deployed mode) |
| `Content-Type` | Yes | Must be `application/json` |
| `X-Doable-Project-Id` | Conditional | Required only when using a project API key (JWT already embeds project ID) |

### Body Schema

```typescript
interface ConnectorProxyRequest {
  /** Action input parameters — matches the Activepieces action props schema */
  props: Record<string, unknown>;
  
  /** Optional: override which connection to use (for projects with multiple
   *  connections to the same integration, e.g., multiple Slack workspaces) */
  connectionId?: string;
}
```

## Response Format

### Success (200)

```json
{
  "success": true,
  "data": { /* action output — varies by integration/action */ },
  "meta": {
    "integrationId": "slack",
    "actionName": "send_channel_message",
    "durationMs": 342
  }
}
```

### Client Error (4xx)

```json
{
  "success": false,
  "error": {
    "code": "INTEGRATION_NOT_CONNECTED",
    "message": "Slack is not connected for this project. Connect it in Settings → Integrations."
  }
}
```

### Error Codes

| HTTP | Code | When |
|------|------|------|
| 400 | `INVALID_REQUEST` | Missing/malformed body, invalid integration/action name |
| 401 | `UNAUTHORIZED` | Missing, expired, or invalid token |
| 403 | `INTEGRATION_NOT_CONNECTED` | Integration not connected in vault for this project's workspace |
| 403 | `ACTION_NOT_FOUND` | The integration exists but doesn't have the requested action |
| 404 | `PROJECT_NOT_FOUND` | Project ID doesn't exist or was deleted |
| 429 | `RATE_LIMITED` | Too many requests for this project+integration combo |
| 500 | `EXECUTION_FAILED` | Action ran but threw an error (external API failure, etc.) |
| 502 | `UPSTREAM_ERROR` | External API returned non-2xx (pass through status info) |

## Authentication Flow

### Mode 1: Preview JWT (editor is open)

```
Editor Host                         Preview Iframe                     API Server
    │                                    │                                │
    │── postMessage(token) ─────────────▶│                                │
    │                                    │── POST /__doable/connector-proxy/slack/send
    │                                    │   Authorization: Bearer <jwt>  │
    │                                    │───────────────────────────────▶│
    │                                    │                                │── validate JWT
    │                                    │                                │── extract projectId, userId
    │                                    │                                │── run action
    │                                    │◀───────────────────────────────│
    │                                    │   { success: true, data: ... } │
```

**JWT claims:**
```typescript
{
  sub: userId,
  pid: projectId,
  wid: workspaceId,
  kind: "connector-proxy",
  iat: number,
  exp: number  // iat + 15 minutes
}
```

### Mode 2: Project API Key (deployed apps)

For apps that are **published/deployed** (no editor iframe parent), a long-lived project API key authenticates requests.

```
Published App (browser or server)           API Server
    │                                           │
    │── POST /__doable/connector-proxy/...      │
    │   Authorization: Bearer dpk_abc123...     │
    │   X-Doable-Project-Id: <uuid>            │
    │──────────────────────────────────────────▶│
    │                                           │── validate API key
    │                                           │── resolve project, workspace, owner
    │                                           │── run action
    │◀──────────────────────────────────────────│
    │   { success: true, data: ... }           │
```

**API Key format:** `dpk_<32-char-random>` (doable project key)

**Storage:** API keys are stored hashed (SHA-256) in the `project_api_keys` table. The plaintext is shown only once at creation time.

## Route Handler Pseudocode

```typescript
connectorProxyRoute.post("/:integrationId/:actionName", async (c) => {
  // ─── 1. Parse & Validate ─────────────────────────────────
  const { integrationId, actionName } = c.req.param();
  const body = await c.req.json<ConnectorProxyRequest>();
  
  if (!body?.props || typeof body.props !== "object") {
    return c.json({ success: false, error: { code: "INVALID_REQUEST", message: "Missing props object" } }, 400);
  }

  // ─── 2. Authenticate ─────────────────────────────────────
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing authorization" } }, 401);
  }
  
  const token = authHeader.slice(7);
  let projectId: string, workspaceId: string, userId: string;
  
  if (token.startsWith("dpk_")) {
    // Project API Key mode
    const apiKey = await resolveProjectApiKey(token, c.req.header("x-doable-project-id"));
    if (!apiKey) return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
    ({ projectId, workspaceId, userId } = apiKey);
  } else {
    // JWT mode
    const claims = await verifyProjectJwt(token, PROJECT_JWT_SECRET);
    if (!claims || claims.kind !== "connector-proxy") {
      return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } }, 401);
    }
    ({ pid: projectId, wid: workspaceId, sub: userId } = claims);
  }

  // ─── 3. Verify Integration Connected ─────────────────────
  const connection = await credentialVault.get(userId, integrationId, workspaceId, projectId);
  if (!connection) {
    return c.json({
      success: false,
      error: { code: "INTEGRATION_NOT_CONNECTED", message: `${integrationId} is not connected.` }
    }, 403);
  }

  // ─── 4. Rate Limit ───────────────────────────────────────
  const rlKey = `cp:${projectId}:${integrationId}`;
  const count = await kv.incr(rlKey, RATE_LIMIT_WINDOW_MS);
  if (count > RATE_LIMIT_MAX_PER_WINDOW) {
    return c.json({ success: false, error: { code: "RATE_LIMITED" } }, 429);
  }

  // ─── 5. Execute Action ────────────────────────────────────
  const result = await runAction({
    integrationId,
    actionName,
    props: body.props,
    userId,
    workspaceId,
    projectId,
  });

  // ─── 6. Audit Log ────────────────────────────────────────
  auditLog.emit("connector-proxy.call", {
    projectId, workspaceId, userId,
    integrationId, actionName,
    success: result.success,
    durationMs: result.durationMs,
  });

  // ─── 7. Return Result ────────────────────────────────────
  if (!result.success) {
    return c.json({
      success: false,
      error: { code: "EXECUTION_FAILED", message: result.error }
    }, 500);
  }

  return c.json({
    success: true,
    data: result.output,
    meta: { integrationId, actionName, durationMs: result.durationMs },
  });
});
```

## Rate Limits

| Scope | Window | Max Requests | Purpose |
|-------|--------|------|---------|
| Per project + integration | 1 minute | 60 | Prevent runaway loops |
| Per project (all integrations) | 1 minute | 200 | Protect API server resources |
| Per workspace (all projects) | 1 hour | 5000 | Fair-use cap |

Rate limits are configurable via env vars: `CONNECTOR_PROXY_RPM`, `CONNECTOR_PROXY_RPM_PROJECT`, `CONNECTOR_PROXY_RPH_WORKSPACE`.

## CORS

The proxy responds to `OPTIONS` preflight with:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: content-type, authorization, x-doable-project-id
Access-Control-Max-Age: 86400
```

This is safe because:
- Authentication is via `Authorization` header (not cookies)
- No ambient auth that CORS attacks could exploit
- The token must be explicitly provided by the app code

## Discovery Endpoint

```
GET /__doable/connector-proxy/available
Authorization: Bearer <token>
```

Returns the list of integrations + actions available for this project:

```json
{
  "integrations": [
    {
      "id": "slack",
      "displayName": "Slack",
      "actions": [
        { "name": "send_channel_message", "displayName": "Send Channel Message", "description": "..." },
        { "name": "list_channels", "displayName": "List Channels", "description": "..." }
      ]
    }
  ]
}
```

This enables runtime discovery — the app can show "available integrations" UI without hardcoding.
