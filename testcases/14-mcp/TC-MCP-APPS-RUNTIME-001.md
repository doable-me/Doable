# TC-MCP-APPS-RUNTIME-001 — Live MCP-Apps render against real MCP server

**Spec:** https://modelcontextprotocol.io/extensions/apps/overview
**Date:** 2026-05-10
**Env:** env1 (zantaz)
**Status:** ✅ **PASS** — MCP Apps RUNTIME WORK CONFIRMED end-to-end with a live builtin MCP server.

## Setup

- API base: `https://zantaz-api.doable.me`
- Workspace: `4bbd6afe-c396-4da6-add5-d71f73f51801` (qa-owner is `owner`)
- Fresh project: `68bf88ec-53ec-4efc-bef7-f6b9182382ed` (`mcp-apps-runtime-test`, framework=`vite-react`), created via `POST /projects`.
- Workspace connectors enumerated via `GET /workspaces/<ws>/connectors` — all four builtin MCP App servers are registered and `status:"active"`:
  - **Markdown Builder** `42c20755-…` → `node /opt/doable/mcp-servers/markdown-builder/index.mjs`
  - **PDF Builder** `7f1fa6e0-…` → `node /opt/doable/mcp-servers/pdf-builder/index.mjs`
  - **Presentation Builder** `e346ee31-…` → `node /opt/doable/mcp-servers/presentation-builder/index.mjs`
  - **Spreadsheet Builder** `fd50b74c-…` → `node /opt/doable/mcp-servers/spreadsheet-builder/index.mjs`

All four are stdio MCP servers, transport=`stdio`, auth=`none` (builtin, ship with the platform).

## Probe

```bash
curl -sS -N --max-time 90 -X POST \
  "$API/projects/68bf88ec-…/chat" \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d '{"content":"Use the Markdown Builder MCP tool to generate a small report titled Doable QA …"}' \
  > _mcp-apps-runtime-sse.log
```

(Full payload + SSE log: `testcases/evidence/env1/_mcp-apps-runtime-sse.log`, 13 678 bytes; project create response: `_mcp-apps-runtime-create.json`.)

## SSE event-type frequency (uniq -c)

```
29 status
12 thinking
 3 tool_call
 2 tool_result
 2 keep_alive
 1 version_created
 1 usage
 1 thinking_block_end
 1 mcp_ui_resource          ← MCP APPS PAYLOAD
 1 done
```

## The mcp_ui_resource event

One event was emitted, 8 605 bytes on the wire, carrying the full host-side iframe HTML:

```jsonc
{
  "type": "mcp_ui_resource",
  "data": {
    "toolCallId":  "tc_mcp_markdown_builder_create_markdown_1778384756159_l2ng27",
    "connectorId": "42c20755-8827-40c5-9c04-ae1b8b229cba",   // Markdown Builder
    "toolName":    "mcp_markdown_builder_create_markdown",
    "resource": {
      "uri":      "ui://markdown-builder/auto-build/1778384756151",   // ← ui:// scheme
      "mimeType": "text/html;profile=mcp-app",                        // ← MCP Apps profile
      "text":     "<!doctype html>… <iframe-targeted HTML with postMessage host-ready/prompt/status/size handlers> …"
    }
  }
}
```

Spec compliance check — every field required by the MCP Apps host responsibilities is present:

| Spec field            | Value in live response                                 | OK |
|-----------------------|--------------------------------------------------------|----|
| `resource.uri`        | starts with `ui://`                                    | ✅ |
| `resource.mimeType`   | `text/html;profile=mcp-app`                            | ✅ |
| `resource.text`       | self-contained HTML, sandboxable via `<iframe srcdoc>` | ✅ |
| `connectorId`         | matches workspace connector row for Markdown Builder   | ✅ |
| `toolCallId`          | unique, idempotency-key shape                          | ✅ |

Inside `resource.text` the host handshake protocol is wired correctly:

- Listens for `host-ready` and replies with `{ type: "prompt", payload: { prompt, displayText } }`.
- Accepts `{ type: "status", payload: { lines | text } }` for live status updates.
- Accepts `{ type: "deck-ready" | "doc-ready", payload: { text } }` for completion signal.
- Reports iframe size via `{ type: "size", payload: { height } }` (used by `mcp-ui-resource.tsx` to autosize).

This is exactly the wire format that `apps/web/src/modules/editor/chat/mcp-ui-resource.tsx` consumes.

## Tool-call lifecycle observed

```
tool_call    → mcp_markdown_builder_create_markdown  (args: {topic:"Doable QA", tone:"casual", length:"short"})
tool_call    → mcp_markdown_builder_create_markdown  (re-emit with friendlyMessage "Running …")
tool_call    → mcp_markdown_builder_create_markdown  (re-emit with full args)
tool_result  → success:true   friendlyMessage:"Added to your project"
mcp_ui_resource → ui://markdown-builder/auto-build/<ts>   (8 605 B HTML)
tool_result  → success:true   friendlyMessage:"Done"
…
done
```

The dual `tool_result` (one immediately after MCP returns, one after the iframe-driven secondary build completes) matches the picker-style flow described in `tool-callbacks.ts` — first result acks the tool, second result confirms the in-iframe build.

## Verdict

✅ **MCP Apps RUNTIME WORK CONFIRMED.**

Evidence chain, end-to-end:

1. Workspace has a real, **active** stdio MCP server (`/opt/doable/mcp-servers/markdown-builder/index.mjs`) shipped with the platform.
2. Chat completion routed the AI's tool call to that MCP server through `services/api/src/routes/chat/tool-callbacks.ts`.
3. The server returned a `ui://` resource with `mimeType: text/html;profile=mcp-app`.
4. The API detected the MCP App resource and emitted **exactly one `mcp_ui_resource` SSE event** (per `tool-callbacks.ts:440`) carrying connectorId, toolCallId, toolName, and the full resource.
5. The iframe HTML is well-formed and implements the mcpui.dev / MCP Apps host protocol (`host-ready` → `prompt`, `status`, `size`, `*-ready`).

The CLAUDE.md claim "DOABLE IS MCP APPS COMPATIBLE" is accurate and now also runtime-verified, not just code-verified.

## Artifacts

- `testcases/evidence/env1/_mcp-apps-runtime-create.json` — fresh project creation response
- `testcases/evidence/env1/_mcp-apps-runtime-sse.log` — full SSE stream (13 678 B)

## Follow-ups (not blockers)

- TC-MCP-APPS-RUNTIME-002 (suggested): repeat with PDF Builder (`pdf-builder`) — since it shells out to headless Chrome, it exercises a different code path (Puppeteer + binary download in tool_result).
- TC-MCP-APPS-RUNTIME-003 (suggested): exercise the iframe → host postMessage round-trip via `services/api/src/routes/chat/mcp-call.ts` (`POST /projects/:id/chat/mcp-call`) to confirm the bidirectional channel, not just the one-shot render.
- The `tool-callbacks.ts` "flaky on some networks → text-link fallback" branch was NOT exercised; would need a forced-failure test.
