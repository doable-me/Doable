# TC-16: MCP Servers — Deep Test Suite

> **Goal-oriented**: Users want to extend the AI's capabilities by connecting external tool servers (databases, APIs, file systems) so the AI can perform real-world actions beyond just generating code.

## Test MCP Server

For testing, use the **official MCP test server**:
- **Package**: `@modelcontextprotocol/server-everything`
- **Transports**: stdio, SSE (`sse`), Streamable HTTP (`streamableHttp`)
- **Tools provided**: `echo`, `add`, `longRunningOperation`, `printEnv`, `getTinyImage`, `sampleLLM`, `annotatedMessage`, `getResourceReference`, `structuredContent`

**Stdio config**:
```
Command: npx
Args: -y, @modelcontextprotocol/server-everything
```

**SSE config** (runs on port 3001 by default):
```
Command: npx
Args: -y, @modelcontextprotocol/server-everything, sse
URL: http://localhost:3001/sse
```

**Streamable HTTP config** (port 3001):
```
URL: http://localhost:3001/mcp
```

## Human Goals Mapped

| Goal | User Story | Test Area |
|------|-----------|-----------|
| G1 | "I want to connect a database MCP server so AI can query my DB" | Add connector (stdio) |
| G2 | "I want the AI to use a remote API tool server" | Add connector (HTTP) |
| G3 | "I want to see which tools the MCP server provides" | Test/discover tools |
| G4 | "I want only certain MCP servers available per project" | Scope & environment filtering |
| G5 | "I want to troubleshoot why my MCP server isn't working" | Status, error states, test button |
| G6 | "I want to securely pass credentials to my MCP server" | Auth types, encrypted credentials |
| G7 | "I want the AI to actually call MCP tools in chat" | AI chat + MCP tool invocation |

---

## 16.1 Navigation & Panel Access (P0)

### TC-16.1.1 — Open MCP Servers tab from Workspace Settings
- **Steps**: Navigate to `/workspace-settings?tab=mcp`.
- **Expected**: MCP Servers panel loads. Header: "MCP Servers". Subtext about connecting MCP servers for custom tools.

### TC-16.1.2 — Tab persistence across reload
- **Steps**: Click MCP Servers tab → reload page.
- **Expected**: URL retains `?tab=mcp`. Same tab active.

### TC-16.1.3 — Empty state
- **Steps**: View MCP Servers tab with no connectors configured.
- **Expected**: Empty state with icon, message about no MCP servers, and "Add MCP Server" button.

### TC-16.1.4 — Loading state
- **Steps**: Open MCP Servers tab (observe during load).
- **Expected**: Loading indicator (spinner or "Loading MCP servers...") shown briefly while fetching.

---

## 16.2 Add MCP Server — Stdio Transport (P0)

### TC-16.2.1 — Open add server form
- **Steps**: Click "Add MCP Server" button.
- **Expected**: Form appears with fields: Name, Description, Transport Type dropdown, Scope dropdown, auth options.

### TC-16.2.2 — Add stdio server: official test server
- **Steps**: Fill form:
  - Name: "Everything Test Server"
  - Transport: "stdio"
  - Command: `npx`
  - Args: `-y, @modelcontextprotocol/server-everything`
  - Auth: None
  - Scope: Workspace
  → Submit.
- **Expected**: Server created. Card appears in list with status "inactive". Name and transport type shown.

### TC-16.2.3 — Stdio form shows command/args fields
- **Steps**: Select transport "stdio" in form.
- **Expected**: Shows "Command" text field and "Arguments" text field (comma-separated). Hides URL field.

### TC-16.2.4 — Stdio server with environment variables
- **Steps**: Add stdio server with env vars:
  - Command: `npx`
  - Args: `-y, @modelcontextprotocol/server-everything`
  - Environment Variables: `NODE_ENV=test, DEBUG=true`
  → Submit.
- **Expected**: Server created. Env vars encrypted and stored. Not visible in plain text via API list.

### TC-16.2.5 — Name is required validation
- **Steps**: Try submitting form without name.
- **Expected**: Validation error. Form does not submit.

### TC-16.2.6 — Command is required for stdio
- **Steps**: Select stdio transport → leave command empty → submit.
- **Expected**: Validation error on command field.

---

## 16.3 Add MCP Server — HTTP Transports (P0)

### TC-16.3.1 — Add Streamable HTTP server
- **Steps**: Fill form:
  - Name: "Everything HTTP"
  - Transport: "streamable_http"
  - URL: `http://localhost:3001/mcp`
  - Auth: None
  - Scope: Workspace
  → Submit.
- **Expected**: Server created with transport type "streamable_http". Card shows URL.

### TC-16.3.2 — Add SSE server
- **Steps**: Fill form:
  - Name: "Everything SSE"
  - Transport: "http_sse"
  - URL: `http://localhost:3001/sse`
  - Auth: None
  → Submit.
- **Expected**: Server created with transport type "http_sse".

### TC-16.3.3 — HTTP form shows URL field
- **Steps**: Select transport "streamable_http" or "http_sse".
- **Expected**: URL field visible. Command/args fields hidden.

### TC-16.3.4 — URL required for HTTP transports
- **Steps**: Select HTTP transport → leave URL empty → submit.
- **Expected**: Validation error on URL field.

### TC-16.3.5 — Invalid URL format
- **Steps**: Enter URL "not-a-url" or "ftp://something" → submit.
- **Expected**: Validation error or warning about URL format.

### TC-16.3.6 — Add server with custom headers
- **Steps**: Add HTTP server with custom headers (if UI supports it).
- **Expected**: Headers stored and sent with requests.

---

## 16.4 Authentication Types (P1)

### TC-16.4.1 — Auth type: None
- **Steps**: Add server with Auth Type = "None".
- **Expected**: No credential fields shown. Server connects without auth.

### TC-16.4.2 — Auth type: Bearer Token
- **Steps**: Add server with Auth Type = "Bearer Token" → enter token "my-secret-token".
- **Expected**: Token field shown. Value encrypted when stored. Server sends `Authorization: Bearer my-secret-token`.

### TC-16.4.3 — Auth type: API Key
- **Steps**: Add server with Auth Type = "API Key" → enter key "my-api-key" → optional custom header name.
- **Expected**: API key stored encrypted. Server sends `X-API-Key: my-api-key` (or custom header).

### TC-16.4.4 — Auth type: OAuth2
- **Steps**: Add server with Auth Type = "OAuth2" → enter access token.
- **Expected**: OAuth2 credentials stored encrypted. `Authorization: Bearer {access_token}` sent.

### TC-16.4.5 — Credentials not visible in API list response
- **Steps**: After adding server with credentials, call `GET /workspaces/{wid}/connectors`.
- **Expected**: Credentials field is null/omitted in response. Only encrypted in DB.

### TC-16.4.6 — Update credentials on existing server
- **Steps**: Edit server → change bearer token → save.
- **Expected**: New credentials stored. Old credentials overwritten (not appended).

---

## 16.5 Scope Configuration (P1)

### TC-16.5.1 — Workspace scope
- **Steps**: Add server with scope "workspace".
- **Expected**: Server available to all projects in workspace. Listed in workspace settings.

### TC-16.5.2 — Project scope
- **Steps**: Add server with scope "project" and specify a project.
- **Expected**: Server only available in the specified project. Not visible in other projects.

### TC-16.5.3 — User scope
- **Steps**: Add server with scope "user".
- **Expected**: Server only available to the creating user. Other workspace members don't see it.

### TC-16.5.4 — Effective connectors merge scopes
- **Steps**: Add workspace connector A and project connector B. Open project.
- **Expected**: AI has access to tools from both A (workspace) and B (project). Both listed in effective connectors.

---

## 16.6 Test & Discover Tools (P0)

### TC-16.6.1 — Test stdio server connection
- **Steps**: After adding "Everything Test Server" (stdio) → click "Test" button on card.
- **Expected**: Server spawns process, connects, discovers tools. Result: `{success: true, toolCount: 9+, tools: ["echo", "add", "longRunningOperation", ...]}`. Status updates to "active". `last_connected_at` set.

### TC-16.6.2 — Test HTTP server connection
- **Steps**: Start `npx @modelcontextprotocol/server-everything streamableHttp` on dev server → click Test on the HTTP connector.
- **Expected**: Server connects via HTTP. Tools discovered. Status "active".

### TC-16.6.3 — Test with bad command (stdio)
- **Steps**: Add stdio server with command "nonexistent_command" → click Test.
- **Expected**: Test fails. Status set to "error". Error message: "spawn nonexistent_command ENOENT" or similar. `error_message` stored in DB.

### TC-16.6.4 — Test with unreachable URL (HTTP)
- **Steps**: Add HTTP server with URL "http://localhost:99999/mcp" → click Test.
- **Expected**: Test fails. Status "error". Error message about connection refused.

### TC-16.6.5 — View discovered tools list
- **Steps**: After successful test → click to view tools OR call `GET /workspaces/{wid}/connectors/{id}/tools`.
- **Expected**: Full list of tools displayed with names and descriptions: echo, add, longRunningOperation, printEnv, etc.

### TC-16.6.6 — Tools cached after test
- **Steps**: Test server → disconnect/stop it → view tools again.
- **Expected**: Tools still shown from `capabilities_cache`. Cache populated during test.

### TC-16.6.7 — Re-test after server update
- **Steps**: Test → modify server config (change URL or args) → re-test.
- **Expected**: New test overwrites cached tools. Updated tool list shown.

### TC-16.6.8 — Test shows tool count in card
- **Steps**: After successful test, view the connector card.
- **Expected**: Card shows tool count (e.g., "9 tools") and status "active" with last connected timestamp.

---

## 16.7 Connector Card Operations (P0)

### TC-16.7.1 — View connector card details
- **Steps**: View a connector card in the list.
- **Expected**: Card shows: name, transport type (badge), status (active/inactive/error), tool count, last connected time, description.

### TC-16.7.2 — Status indicator colors
- **Steps**: Check cards with different statuses.
- **Expected**: Active = green indicator, Inactive = gray, Error = red, Connecting = yellow/pulsing.

### TC-16.7.3 — Edit connector (name/description)
- **Steps**: Click edit on connector → change name and description → save.
- **Expected**: Card updates. Changes persisted. Status remains unchanged (if only name/desc changed).

### TC-16.7.4 — Edit connector (transport/auth)
- **Steps**: Change transport type or auth config → save.
- **Expected**: Status resets to "inactive" (requires re-test). Config updated.

### TC-16.7.5 — Delete connector
- **Steps**: Click delete on connector → confirm.
- **Expected**: Connector removed from list and DB. Runtime connection pool cleaned up. AI no longer has access to tools.

### TC-16.7.6 — Refresh connectors list
- **Steps**: Click "Refresh" in header.
- **Expected**: List re-fetched. Loading indicator shown briefly.

---

## 16.8 AI Chat + MCP Tool Invocation (P0)

### TC-16.8.1 — AI sees tools from active MCP connector
- **Steps**:
  1. Add "Everything Test Server" (stdio) to workspace.
  2. Test it (status → active).
  3. Open a project → AI chat.
  4. Ask: "What tools do you have access to from MCP servers?"
- **Expected**: AI lists MCP tools including `mcp_everything_test_server_echo`, `mcp_everything_test_server_add`, etc.

### TC-16.8.2 — AI invokes `echo` tool
- **Steps**: In project chat, send: "Use the echo MCP tool to echo back the message 'Hello from Doable!'"
- **Expected**: AI calls `mcp_everything_test_server_echo` with `{message: "Hello from Doable!"}`. Tool call shown in UI. Response: "Hello from Doable!".

### TC-16.8.3 — AI invokes `add` tool
- **Steps**: Send: "Use the MCP add tool to add 42 and 58".
- **Expected**: AI calls `mcp_everything_test_server_add` with `{a: 42, b: 58}`. Response: "100".

### TC-16.8.4 — AI invokes `printEnv` tool
- **Steps**: Send: "Use the printEnv MCP tool to show environment variables".
- **Expected**: AI calls `mcp_everything_test_server_printenv`. Response: JSON of environment variables from the MCP server process.

### TC-16.8.5 — AI invokes `getTinyImage` tool
- **Steps**: Send: "Use the getTinyImage MCP tool to get a test image".
- **Expected**: AI calls tool. Response includes base64 PNG image data. Displayed or referenced in response.

### TC-16.8.6 — MCP tool call shown in chat UI
- **Steps**: Trigger any MCP tool call via chat.
- **Expected**: Chat shows tool call indicator with: tool name (prefixed `mcp_`), arguments, result. Similar to built-in tool calls.

### TC-16.8.7 — MCP tool call traced
- **Steps**: Trigger MCP tool call → check traces (admin panel or API).
- **Expected**: MCP_CALL and MCP_RESULT events logged with: connector name, tool name, args, response, duration.

### TC-16.8.8 — MCP tool call error handling
- **Steps**: Stop the MCP server process → ask AI to use an MCP tool.
- **Expected**: Tool call fails gracefully. AI reports error. MCP_ERROR trace logged. Chat doesn't crash.

### TC-16.8.9 — AI uses MCP tool alongside built-in tools
- **Steps**: Send: "Use the MCP echo tool to say 'test' and then create a file called output.txt with the result".
- **Expected**: AI calls MCP echo tool AND built-in create_file tool. Both results shown. File created with echo output.

### TC-16.8.10 — Multiple MCP connectors, AI uses correct one
- **Steps**: Add two different connectors with different names. Ask AI to use a tool from a specific connector.
- **Expected**: AI calls the tool from the correct connector (distinguished by `mcp_{connectorName}_{toolName}` naming).

---

## 16.9 Connection Pooling & Lifecycle (P1)

### TC-16.9.1 — Lazy connection on first tool use
- **Steps**: Add and test connector → restart API → chat and trigger MCP tool.
- **Expected**: Connection created on demand (lazy). First call takes slightly longer. Subsequent calls reuse connection.

### TC-16.9.2 — Connection reused across chat turns
- **Steps**: Send 3 consecutive messages using MCP tools.
- **Expected**: Same connection used for all 3 (no reconnection per call). Logs show reuse.

### TC-16.9.3 — Idle connection cleanup (30 min)
- **Steps**: Use MCP tool → wait 30+ minutes → use MCP tool again.
- **Expected**: Old connection cleaned up after idle timeout. New connection created transparently.

### TC-16.9.4 — Pool limit (max 50 connectors)
- **Steps**: Configure more than 50 connectors. Trigger tools from all.
- **Expected**: LRU eviction kicks in. Least recently used connection evicted to make room. No crash.

---

## 16.10 Server Environment Variables for Stdio (P1)

### TC-16.10.1 — Set server env vars
- **Steps**: Add stdio connector with env vars: `CUSTOM_VAR=test_value`.
- **Expected**: Env vars passed to spawned process. Connector card may show env var count.

### TC-16.10.2 — Env vars encrypted at rest
- **Steps**: Add server with env vars. Check that `server_env_encrypted` is stored (not plaintext).
- **Expected**: API list response doesn't include raw env var values. DB uses `pgp_sym_encrypt()`.

### TC-16.10.3 — `printEnv` tool reveals server env vars
- **Steps**: Add server with env var `TEST_KEY=secret123`. Test it. Ask AI: "Use printEnv tool".
- **Expected**: AI calls printEnv. Result includes `TEST_KEY: secret123`. (Note: env vars are visible to the MCP server process.)

### TC-16.10.4 — Update server env vars
- **Steps**: Edit connector → change env vars → save → re-test.
- **Expected**: New env vars passed to process on next connection. Old vars not persisted.

---

## 16.11 Virtual/Preset Connectors (P2)

### TC-16.11.1 — Supabase virtual connector auto-created
- **Steps**: Connect Supabase integration to workspace. Check MCP connectors.
- **Expected**: Virtual "Supabase MCP" connector appears automatically. Tools like `execute_sql` available.

### TC-16.11.2 — Virtual connector cannot be manually deleted
- **Steps**: Try to delete a virtual/preset connector.
- **Expected**: Delete not allowed or connector re-creates on next chat (auto-built from integration).

### TC-16.11.3 — Virtual connector tools available in AI chat
- **Steps**: With Supabase connected, ask AI to "Run a SQL query".
- **Expected**: AI calls `mcp_supabase_execute_sql` or similar. Query executed via MCP.

---

## 16.12 Environment Filtering of Connectors (P1)

### TC-16.12.1 — Environment with specific connector refs only
- **Steps**: Create environment with only Connector A referenced. Assign to project. Chat.
- **Expected**: Only Connector A's tools available. Other workspace connectors excluded.

### TC-16.12.2 — Environment with zero connector refs (all disabled)
- **Steps**: Create environment with empty connectorRefs []. Assign to project. Chat.
- **Expected**: No MCP tools available. AI cannot use any MCP tools.

### TC-16.12.3 — No environment = all workspace connectors
- **Steps**: Remove project environment override. Chat.
- **Expected**: All workspace-scoped connectors' tools available to AI.

---

## 16.13 Connector Tool Overrides (P2)

### TC-16.13.1 — Per-tool enable/disable
- **Steps**: If UI supports `mcp_tool_overrides` table — disable specific tool from a connector.
- **Expected**: Disabled tool not exposed to AI. Other tools from same connector still available.

### TC-16.13.2 — Disable dangerous tools
- **Steps**: Disable `printEnv` tool (security) while keeping `echo` and `add`.
- **Expected**: AI can use echo and add but NOT printEnv.

---

## 16.14 Access Control (P1)

### TC-16.14.1 — Workspace admin can add connectors
- **Steps**: As workspace admin, add a connector.
- **Expected**: Success. Connector created.

### TC-16.14.2 — Non-admin member cannot add workspace connectors
- **Steps**: As regular member, try to add workspace-scoped connector.
- **Expected**: Permission denied (403). Only admin/owner can manage workspace connectors.

### TC-16.14.3 — User-scoped connector: any member can create
- **Steps**: As regular member, add user-scoped connector.
- **Expected**: Success. Connector only visible/usable by this user.

### TC-16.14.4 — Delete other user's user-scoped connector
- **Steps**: As admin, try to delete another user's user-scoped connector.
- **Expected**: Either allowed (admin privilege) or denied. Verify policy.

---

## 16.15 Error States & Recovery (P1)

### TC-16.15.1 — Server process crashes (stdio)
- **Steps**: Connect to stdio server → kill the process externally → trigger tool call.
- **Expected**: Error detected. Connection retried or re-spawned. Error reported to user gracefully.

### TC-16.15.2 — HTTP server goes down
- **Steps**: Stop HTTP MCP server → trigger tool call.
- **Expected**: Connection error. AI reports tool unavailable. Status updates to "error".

### TC-16.15.3 — Timeout on slow MCP tool
- **Steps**: Use `longRunningOperation` tool with `duration: 60, steps: 10`.
- **Expected**: Either tool completes with progress (if supported) or times out gracefully. No infinite hang.

### TC-16.15.4 — Invalid tool arguments
- **Steps**: Ask AI to call `add` with strings instead of numbers.
- **Expected**: MCP server returns error. AI handles gracefully and may correct arguments.

### TC-16.15.5 — Connector with expired credentials
- **Steps**: Add server with bearer token → later the token expires → trigger tool.
- **Expected**: Auth error returned. User prompted to update credentials.

---

## 16.16 Transport-Specific Tests (P2)

### TC-16.16.1 — Stdio: process spawned per connection
- **Steps**: Add stdio connector. Connect. Check system processes.
- **Expected**: Child process spawned for MCP server. Cleaned up on disconnect.

### TC-16.16.2 — SSE: event stream maintained
- **Steps**: Add SSE connector. Test. Monitor network.
- **Expected**: SSE connection established and maintained. Events streamed correctly.

### TC-16.16.3 — Streamable HTTP: request/response pattern
- **Steps**: Add streamable HTTP connector. Test.
- **Expected**: Each tool call is a POST request. Response is JSON-RPC. No persistent connection required.

### TC-16.16.4 — Switch transport type on existing connector
- **Steps**: Change connector from stdio to HTTP. Update URL. Re-test.
- **Expected**: Transport changes. Old process cleaned up. New HTTP connection works. Tools re-discovered.
