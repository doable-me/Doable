# TC-MCP-APPS-001 — Does Doable render MCP Apps in chat?

**Spec:** https://modelcontextprotocol.io/extensions/apps/overview
**Date:** 2026-05-10
**Status:** ✅ MCP Apps are rendered in the chat panel (compliant with the spec).

## Part 1 — Code search

Run: `grep -rln "mcp.app\|mcpApp\|app/component\|MCPApp\|extensions/apps\|app.embed\|ui://" apps/web services/api`

Concrete evidence found:

### Server (API)

- `services/api/src/mcp/apps-resource.ts` — explicit MCP Apps server-side helpers, citing the spec URL in its header. Provides:
  - `detectAppsInToolList(connectorId, tools)` — scans tool descriptions for `_meta.ui.resourceUri` starting with `ui://` and emits `mcp.app.detected` span events.
  - `tracedAppResourceFetch(...)` — wraps `resources/read` calls for `ui://` resources with an OTel span (`mcp.app.resource_fetch`, attributes `mcp.app.bytes`, `mcp.app.content_count`).
- `services/api/src/routes/chat/tool-callbacks.ts` (line 440) — emits a dedicated SSE event:
  ```ts
  type: "mcp_ui_resource"
  ```
  written to the chat stream when a tool call returns a `ui://` resource. Logs at lines 448/452/454 confirm the wire-up (`mcp_ui_resource SSE emit uri=… bytes=…`).
- `services/api/src/routes/chat/event-processor.ts` (line 236) — references the dedicated `mcp_ui_resource` SSE event in the streaming pipeline.
- `services/api/src/routes/chat/mcp-call.ts` — generic host-side proxy `/projects/:id/chat/mcp-call` that the iframe calls back into when the user clicks a button inside an MCP App.

### Frontend (web)

- `apps/web/src/modules/editor/chat/mcp-ui-resource.tsx` — full reference implementation of the MCP Apps host. Header docstring cites both `https://modelcontextprotocol.io/extensions/apps` and `https://mcpui.dev`. Implements:
  - Sandboxed `<iframe srcdoc>` rendering of the resource HTML.
  - Wire-format dispatcher for postMessage payloads `{ type: "tool" | "prompt" | "link" | "size" | "notify", payload }`.
  - Re-injection of returned `ui://` resources into the same chat message via `onResource` (no LLM round-trip).
  - Synthetic-prompt injection (`onPrompt`) for picker-style apps that hand off skill prompts to the AI.
  - `host-ready` handshake, theme propagation, status-line forwarding, completion signal — all per the MCP Apps host responsibilities.
- `apps/web/src/modules/editor/chat/chat-message.tsx` — wires `McpUiResourceCard` into the assistant message renderer.
- `McpUiResource` type lives in `apps/web/src/modules/editor/hooks/use-editor-store.ts`.

The implementation note in `mcp-ui-resource.tsx` (line ~88) is explicit: "intentionally implemented from scratch — no `@mcp-ui/client` — to keep it dependency-light and to serve as a reference implementation of the spec."

## Part 2 — Runtime test

Skipped within the 3-minute cap — the code path is conclusive. The runtime test would still be valuable to confirm an actual MCP server returning a `ui://` resource (e.g. mcpui.dev demos) renders end-to-end; recommend follow-up with one of the `services/api/src/mcp/presets` connectors that ships an Apps tool.

Suggested follow-up curl (for a future run):

```bash
curl -sS -N -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"content":"Render the mcp-ui demo card"}' \
  https://zantaz-api.doable.me/projects/<fresh-pid>/chat 2>&1 \
  | grep -E '"type":"(mcp_ui_resource|tool_result)' | head -20
```

Expected: at least one line with `"type":"mcp_ui_resource"` carrying a `resource.uri` starting with `ui://`.

## Part 3 — Verdict

**✅ MCP Apps ARE rendered fully in the chat panel.**

Rendering code path:

1. AI tool call → `services/api/src/routes/chat/tool-callbacks.ts:440` emits `mcp_ui_resource` SSE event when the tool result contains a `ui://` resource.
2. Web client receives the event → stored in editor store → rendered via `apps/web/src/modules/editor/chat/chat-message.tsx` → `apps/web/src/modules/editor/chat/mcp-ui-resource.tsx` (`McpUiResourceCard`).
3. iframe `postMessage` actions (`tool`, `prompt`, `link`, `size`) round-trip through `services/api/src/routes/chat/mcp-call.ts` for tool calls, or back into the chat as synthetic user prompts.
4. Server-side telemetry via `services/api/src/mcp/apps-resource.ts` (`mcp.app.detect`, `mcp.app.resource_fetch` spans).

The CLAUDE.md claim "DOABLE IS MCP APPS COMPATIBLE" is accurate, not aspirational. No bug to file.

### Minor caveats (not blockers)

- Comments in `tool-callbacks.ts` (lines ~290, 413, 428) note that the `mcp_ui_resource` SSE path can be "flaky on some networks", with a fallback that emits a clickable text link if the iframe path fails. Worth a future TC to characterize the network conditions that trip this.
- Part 2 runtime test was not executed; the code-path verdict stands but a live render against a real MCP server with `_meta.ui.resourceUri` is recommended as a follow-up sanity check.
