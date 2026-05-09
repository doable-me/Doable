# TC-MCP-CONNECTOR — MCP connector lifecycle

Covers add, configure, list, update, delete connectors via /mcp/connectors. Both stdio and HTTP transports. Auto-spawn by ConnectorManager, health checks, listTools, capability discovery, audit log.

## TC-MCP-CONNECTOR-001 — List connectors (smoke)
- **Steps:** GET `/workspaces/:wsId/connectors`  (the route is mounted under workspaces, NOT under `/mcp/`)
- **Expected:** 200 `{"data":[…]}` with builtin + user-installed connectors; each row has `transport_type`, `scope`, `server_command`/`server_url`, `created_by`.
- **Severity:** smoke
- **Evolution Log:**
  - 2026-05-10 / env1: original spec used `/mcp/connectors` and 404'd. Confirmed mount in `services/api/src/routes.ts` is `app.route("/workspaces", connectorRoutes)` and handler `GET "/:workspaceId/connectors"`. Path corrected.

## TC-MCP-CONNECTOR-002 — Built-in MCP-Apps present by default
- **Steps:** GET `/workspaces/:wsId/connectors`
- **Expected:** Includes (at minimum) the four built-in MCP Apps: Markdown Builder, PDF Builder, Presentation Builder, Spreadsheet Builder (all transport=stdio, scope=workspace, command=node, args pointing under `/opt/doable/mcp-servers/`).
- **Severity:** smoke
- **Evolution Log:**
  - 2026-05-10 / env1: was "Built-in Supabase connector present by default" — incorrect. zantaz env1 lists Markdown/PDF/Presentation/Spreadsheet Builder; no Supabase/GitHub built-ins. Supabase + GitHub are configured per workspace via the connector wizard, not seeded.

## TC-MCP-CONNECTOR-003 — *(deprecated: see CONNECTOR-002 — Supabase/GitHub are not seeded as built-ins)*
- **Severity:** smoke
- **Evolution Log:**
  - 2026-05-10 / env1: deprecated; built-ins are MCP-Apps document builders only.

## TC-MCP-CONNECTOR-004 — Add stdio connector
- **Steps:** POST `/workspaces/:wsId/connectors` `{ "name":"x","transport_type":"stdio","scope":"workspace","server_command":"node","server_args":["./mcp.js"] }`
- **Expected:** 201; row in mcp_connectors; status=initializing then active
- **Severity:** smoke
- **Evolution Log:**
  - 2026-05-10 / env1: payload schema: zod requires `scope` in `{workspace|project|user}` and `transport_type` (not `transport`). 400 returned otherwise. Path corrected from `/mcp/connectors`.

## TC-MCP-CONNECTOR-005 — Add HTTP connector
- **Steps:** POST `/workspaces/:wsId/connectors` `{ "name":"x","transport_type":"http","scope":"workspace","server_url":"https://x.example/mcp" }`
- **Expected:** 201; signed JWT registered for outbound
- **Severity:** smoke

## TC-MCP-CONNECTOR-006 — Add SSE connector (if supported)
- **Severity:** medium

## TC-MCP-CONNECTOR-007 — Add invalid command rejected
- **Steps:** POST stdio with command not on PATH
- **Expected:** 400 with friendly error
- **Severity:** medium

## TC-MCP-CONNECTOR-008 — Add HTTP with invalid URL rejected
- **Severity:** medium

## TC-MCP-CONNECTOR-009 — Add HTTP with non-https rejected (in prod)
- **Severity:** high

## TC-MCP-CONNECTOR-010 — Update connector config
- **Steps:** PATCH /mcp/connectors/:id
- **Expected:** restart connector with new config; preserve id; audit log
- **Severity:** high

## TC-MCP-CONNECTOR-011 — Update connector triggers tool re-registration
- **Severity:** high

## TC-MCP-CONNECTOR-012 — Delete connector
- **Steps:** DELETE /mcp/connectors/:id
- **Expected:** 204; child process killed; tools removed from registry
- **Severity:** smoke

## TC-MCP-CONNECTOR-013 — Delete built-in connector blocked or hidden
- **Severity:** medium

## TC-MCP-CONNECTOR-014 — Disable connector keeps row but stops process
- **Steps:** PATCH {enabled:false}
- **Severity:** high

## TC-MCP-CONNECTOR-015 — Re-enable spawns new process
- **Severity:** high

## TC-MCP-CONNECTOR-016 — Connector status transitions: spawned → ready → active
- **Severity:** medium

## TC-MCP-CONNECTOR-017 — Connector status fails to start → status=error
- **Severity:** high

## TC-MCP-CONNECTOR-018 — Connector crash auto-restarts
- **Pre:** kill child process
- **Expected:** ConnectorManager respawns within backoff
- **Severity:** high

## TC-MCP-CONNECTOR-019 — Restart backoff exponential
- **Severity:** medium

## TC-MCP-CONNECTOR-020 — Persistent crash gives up after N attempts
- **Severity:** medium

## TC-MCP-CONNECTOR-021 — Health check periodic
- **Severity:** medium

## TC-MCP-CONNECTOR-022 — listTools returns connector tools
- **Steps:** GET /mcp/connectors/:id/tools
- **Severity:** smoke

## TC-MCP-CONNECTOR-023 — listTools cached & invalidated on update
- **Severity:** medium

## TC-MCP-CONNECTOR-024 — Connector exposes resources (per MCP spec)
- **Severity:** medium

## TC-MCP-CONNECTOR-025 — Connector exposes prompts
- **Severity:** low

## TC-MCP-CONNECTOR-026 — Cross-tenant connector access denied
- **Severity:** critical

## TC-MCP-CONNECTOR-027 — Workspace-scoped connectors visible to members
- **Severity:** high

## TC-MCP-CONNECTOR-028 — Personal connectors hidden from workspace
- **Severity:** high

## TC-MCP-CONNECTOR-029 — Stdio connector stdout JSON-RPC parsed
- **Severity:** medium

## TC-MCP-CONNECTOR-030 — Stdio connector stderr captured to logs
- **Severity:** medium

## TC-MCP-CONNECTOR-031 — Stdio connector terminates on parent shutdown
- **Severity:** medium

## TC-MCP-CONNECTOR-032 — HTTP connector retries on 5xx with backoff
- **Severity:** medium

## TC-MCP-CONNECTOR-033 — HTTP connector honors timeout per call
- **Severity:** medium

## TC-MCP-CONNECTOR-034 — HTTP connector certificate verification
- **Severity:** high

## TC-MCP-CONNECTOR-035 — Invalid certificate rejected (no MITM bypass)
- **Severity:** critical

## TC-MCP-CONNECTOR-036 — Connector capability negotiation initialize handshake
- **Severity:** high

## TC-MCP-CONNECTOR-037 — Server protocolVersion mismatch rejected
- **Severity:** high

## TC-MCP-CONNECTOR-038 — initialize timeout
- **Severity:** medium

## TC-MCP-CONNECTOR-039 — Connector with hundreds of tools paginated
- **Severity:** low

## TC-MCP-CONNECTOR-040 — Connector audit log rows on each lifecycle event
- **Steps:** inspect connector_audit
- **Expected:** events: created, updated, deleted, started, stopped, errored
- **Severity:** high

## TC-MCP-CONNECTOR-041 — Audit log queryable by admin
- **Severity:** medium

## TC-MCP-CONNECTOR-042 — Audit log immutable (append-only)
- **Severity:** high

## TC-MCP-CONNECTOR-043 — Audit log export csv
- **Severity:** low

## TC-MCP-CONNECTOR-044 — Connector debug logs visible to admin
- **Steps:** GET /mcp/connectors/:id/logs?limit=200
- **Expected:** stdio stderr + RPC traffic; redact secrets
- **Severity:** medium

## TC-MCP-CONNECTOR-045 — Connector debug logs hidden from members
- **Severity:** high

## TC-MCP-CONNECTOR-046 — Per-workspace tool override (rename/disable)
- **Steps:** PATCH /mcp/tools/:id {disabled:true}
- **Expected:** tool excluded from registry but config preserved
- **Severity:** high

## TC-MCP-CONNECTOR-047 — Tool override rename effective in chat
- **Severity:** medium

## TC-MCP-CONNECTOR-048 — Tool override audited
- **Severity:** medium

## TC-MCP-CONNECTOR-049 — Connector limit per workspace (e.g. 20)
- **Severity:** low

## TC-MCP-CONNECTOR-050 — Connector limit per plan
- **Severity:** medium

## TC-MCP-CONNECTOR-051 — Connector run-as uid in sandbox correct
- **Severity:** high

## TC-MCP-CONNECTOR-052 — Connector cwd is project sandbox
- **Severity:** high

## TC-MCP-CONNECTOR-053 — Env vars passed minimal (no host secrets)
- **Severity:** critical

## TC-MCP-CONNECTOR-054 — Connector cannot access network beyond allowlist
- **Severity:** critical

## TC-MCP-CONNECTOR-055 — Connector binary verified by hash (when configured)
- **Severity:** medium
