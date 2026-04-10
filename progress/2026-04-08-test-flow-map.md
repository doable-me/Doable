# Doable Test Flow Map — 2026-04-08

Source of truth for the 16-agent test session. All drivers and test discovery agents should read this before acting.

## 1. Local service endpoints

| Service | URL | Port |
|---|---|---|
| Web (Next.js 15) | http://127.0.0.1:3000 | 3000 |
| API (Hono) | http://127.0.0.1:4000 | 4000 |
| WebSocket (Hono+Yjs) | ws://127.0.0.1:4001 | 4001 |

Env: `NEXT_PUBLIC_API_URL=http://localhost:4000`, `NEXT_PUBLIC_WS_URL=ws://localhost:4001`.
Auth: JWT 15m access / 7d refresh. `localStorage` keys: `doable_access_token`, `doable_refresh_token`, `doable_auth_user`.

## 2. UI flows — priority ordered

### T0 CRITICAL
| Flow | Route | What it does | API hit | Key files |
|---|---|---|---|---|
| Auth: Login | POST /auth/login | Authenticate, get JWT | POST /auth/login | services/api/src/routes/auth.ts:131 |
| Auth: Me | GET /auth/me | Fetch user + auto-ensure workspace | GET /auth/me | services/api/src/routes/auth.ts:182 |
| Workspace Selection | / or /dashboard | Pick workspace, list projects | GET /workspaces/, GET /projects/ | services/api/src/routes/workspaces.ts:134 |
| Chat: Send | /projects/[id]/editor | Stream AI response (SSE) | POST /projects/:id/chat | services/api/src/routes/chat.ts:686-709 |
| Chat: Heartbeat/Timer | SSE stream | Escalating heartbeats every 3s (75a9674) | POST /projects/:id/chat SSE | chat.ts:713-715 |
| Chat: Tool calls | SSE stream | file edit / run build / search tool events | POST /projects/:id/chat | chat.ts:686-2090 |
| Chat: Abort | Button | Stop in-flight (45s timeout default) | POST /projects/:id/chat/abort | chat.ts:2249 |
| Editor: Open doc | /editor/[projectId] | File tree + Yjs sync | GET /projects/:id/files | services/api/src/routes/editor.ts:95 |
| Editor: Read file | Click file | Load content | GET /projects/:id/files/* | editor.ts:104 |
| Editor: Save/type | Typing | PUT or WS yjs:update | PUT /projects/:id/files/* + WS | editor.ts:133 |
| Editor: Yjs sync | Multi-client | Real-time CRDT | WS /projects/:id + /internal/yjs/write | services/ws/src/index.ts:248 |
| Publish: Deploy | Deploy button | Build project | POST /deploy/:projectId | services/api/src/routes/deploy.ts:28 |
| Publish: Preview | Preview btn | Temp preview URL | POST /deploy/:projectId/publish/preview | deploy.ts:219 |
| Publish: Custom Domain | Domain UI | Associate domain (membership enforced a62ea3f) | POST /domains/project/:projectId | services/api/src/routes/custom-domains.ts:6 |

### T1 IMPORTANT
| Flow | API hit | Key files |
|---|---|---|
| AI Settings: Copilot accounts | GET/POST/PATCH/DELETE /workspaces/:id/ai-settings/copilot-accounts | services/api/src/routes/ai-settings.ts |
| AI Settings: Model selection | GET /ai/models | chat.ts:2426 |
| AI Settings: Provider discovery | POST /workspaces/:wid/ai-settings/providers/:id/discover-models | services/api/src/routes/provider-bridge.ts:12 |
| Integrations: Catalog | GET /integrations/catalog, /catalog/:id, /catalog/:id/actions | services/api/src/routes/integrations.ts |
| Integrations: Connections | GET/POST/DELETE /integrations/connections | integrations.ts:123 |
| Integrations: OAuth | GET /integrations/oauth/:id/authorize, /oauth/callback | integrations.ts:407 |
| Integrations: Enhanced auth | GET /integrations/enhanced-auth/:id/authorize, /callback, /resources | integrations.ts:562 |
| Workspace members | PATCH /workspaces/:id | workspaces.ts:156 |
| GitHub connect | GET /github/connect, /github/repo/callback, /github/status | services/api/src/routes/github.ts:10 |
| Custom domains verify | POST /domains/:domainId/verify | custom-domains.ts |
| Connectors / MCP | GET/POST/PATCH/DELETE /workspaces/:id/connectors | |

### T2 SECONDARY
- Admin: GET/PATCH /admin/features, /admin/features/:key, /admin/status, /admin/copilot-sessions
- Analytics: POST /analytics/track, GET /analytics/script.js, /projects/:id/overview, /timeseries
- Usage: GET /workspaces/:id/usage/me, /history, /tokens
- Billing: GET /billing/plans, /credits, /usage; POST /billing/webhook
- Thumbnails: GET /thumbnails/:filename, POST /thumbnails/:projectId/regenerate
- Marketplace: GET /marketplace/categories, /listings, /listings/:slug; POST /listings/:id/install

## 3. WebSocket routes & message types

Connect: `ws://127.0.0.1:4001?token=<JWT>`.
On connect: `{type: "connected", userId, resumeToken}` (services/ws/src/index.ts:212)

Client → Server:
- `room:join {projectId}` → response: Yjs state + presence
- `room:leave`
- `cursor:move {line, column}` (throttled 50ms)
- `selection:update {start, end}`
- `awareness:update {state}`
- `yjs:update {data}` (base64 Yjs state)

Server → Client:
- `connected`, `room:joined`, `yjs:update`, `presence:update`, `awareness:update`, `error`, `keep_alive`

Internal HTTP (API → WS, `X-Internal-Secret`):
- POST /internal/broadcast — push to room
- POST /internal/yjs/write — AI writes via Yjs (ops: `write`, `edit` with `replaceAll`)
- GET /internal/collab-active/:projectId
- GET /internal/presence/:projectId

## 4. Known fragile areas (recent commits)

| Commit | Area | Watch for |
|---|---|---|
| 75a9674 | Chat heartbeat/timer | SSE keep_alive every 3s; 45s abort timeout; escalating messages; non-terminal timeout behavior; dedup of tool_calls |
| ed4cac5 | API malformed JSON | POST malformed body → expect **400** not 500; also proper HTTP status on WS upgrade fail |
| a62ea3f | Custom domains | Workspace membership enforced on all /domains routes |
| 544b26f | MCP/Supabase connector | @supabase/mcp-server-supabase auto-mounts in chat tools |
| cfc0704, 711c117 | Supabase edge fn deploy | Multipart shape |

## 5. Heartbeat implementation (corrected 2026-04-08 by ui-backend-mon from live code read)

Two intervals in `services/api/src/routes/chat.ts` around the SSE handler:

1. **`keep_alive` every 10_000ms** (chat.ts:713-717) — anti-proxy-timeout, pre-dates 75a9674. Purpose: keep SSE channel warm through Caddy/Cloudflare idle timeouts.
2. **`status` with `phase:"thinking"` every 3_000ms** (chat.ts:728-751) — THIS is the "responsive heartbeat" added in 75a9674. Payload includes escalating "Thinking…" / "Still thinking…" / "Working…" / "This one's taking…" messages by elapsed time.

**Test harness note:** filtering SSE events by `type==="keep_alive"` will miss the 3s heartbeat. Filter by `type==="status"` (or by _any_ event type) when verifying cadence.

The earlier one-interval snippet in this file was fabricated by the flow-mapper and has been removed.

## 6. Driver quick-start

**UI Driver (Chrome on 3000):**
1. Check `tabs_context_mcp` for existing tab; reuse if user has one open, else open 127.0.0.1:3000
2. Verify logged in via `javascript_tool` reading `localStorage.doable_auth_user`
3. If not: STOP and report — don't try to log in
4. Otherwise navigate workflows per T0→T1→T2

**API Driver (on 4000):**
1. Read tokens from localStorage via a quick Chrome js call, OR POST /auth/login with test creds
2. Set `Authorization: Bearer <token>` on all requests
3. Walk the route inventory T0→T1→T2

**Verify services up first:**
- curl http://127.0.0.1:3000/ (web 200)
- curl http://127.0.0.1:4000/admin/status (api health)
- ws handshake on 4001
