# presentation-builder — an MCP App example for Doable

A complete, decoupled example of an **MCP App** (per
[modelcontextprotocol.io/extensions/apps](https://modelcontextprotocol.io/extensions/apps/overview)
and [mcpui.dev](https://mcpui.dev)) that plugs into Doable — or any other
MCP Apps host — without any host-side code changes.

```
┌─────────────────────┐                      ┌──────────────────────┐
│  Doable host        │  stdio / streamable  │  presentation-       │
│  (chat + iframe)    │ ◄──── MCP ────►      │  builder MCP server  │
│                     │                      │  (this folder)       │
└─────────────────────┘                      └──────────────────────┘
        │                                              │
        │  tool result includes a UI resource          │
        │  ({type:'resource', resource:{uri:'ui://…',  │
        │   mimeType:'text/html', text:'<html>…'}})    │
        ▼                                              │
   sandboxed iframe rendered inline in chat            │
   (via @mcp-ui/client UIResourceRenderer)             │
        │                                              │
        │  user clicks PowerPoint                      │
        │  iframe → window.parent.postMessage(         │
        │    {type:'tool', payload:{toolName:          │
        │     'build_presentation', params:{…}}})      │
        ▼                                              │
   host POSTs /chat/mcp-call ──────────────────────► tools/call build_presentation
                                                       │
                                                       │  PptxGenJS builds .pptx in-process
                                                       │  Returns a NEW UIResource (download card)
                                                       │  with the bytes embedded as a data URL
                                                       ▼
                                               iframe re-renders → user clicks Download
```

---

## Tools exposed

| Tool | Purpose |
|------|---------|
| `create_presentation({ topic, slideCount?, audience?, tone? })` | Returns a UI resource (`ui://presentation-builder/picker/…`) showing a 2-button picker (PowerPoint / Web Slides). |
| `build_presentation({ topic, format, slideCount?, audience?, tone? })` | Generates the artifact. For `format:"pptx"` returns a UI resource (`ui://presentation-builder/download/…`) containing a Download button with the .pptx bytes embedded as a base64 data URL. |

Both tools return both:
1. A `UIResource` content item (rendered as a sandboxed iframe by the host).
2. A short `text` content item that tells the LLM what to do next (e.g.,
   "wait for the user", "presentation is ready, acknowledge briefly").

The LLM never reads HTML. The host never knows what tools exist.
The MCP server is the single source of truth.

---

## Why this is decoupled

This server uses **only** standard MCP + the MCP Apps spec. It contains:

- ✅ Standard `tools/list` and `tools/call` handlers (`@modelcontextprotocol/sdk`).
- ✅ Standard UI resources via `createUIResource()` from `@mcp-ui/server`.
- ✅ Self-contained HTML that uses `window.parent.postMessage()` per the
   MCP Apps wire format.
- ❌ No Doable-specific JSON envelopes.
- ❌ No Doable-specific tool names or routing.
- ❌ No host filesystem access.
- ❌ No `_meta` extensions specific to Doable.

This means **the same server runs unchanged on any MCP Apps host**:
Claude Desktop, Goose, LibreChat, Postman, ui-inspector, MCPJam,
or your own host built on `@mcp-ui/client`.

---

## Running locally

```bash
cd mcp-servers/presentation-builder
pnpm install
node index.mjs            # talks MCP over stdio
```

Inspect with `npx @modelcontextprotocol/inspector node index.mjs` or
[`ui-inspector`](https://github.com/idosal/ui-inspector).

---

## Connecting to Doable

In Doable, add a connector with:

| Field | Value |
|-------|-------|
| Transport | `stdio` |
| Command | `node` |
| Args | `["/abs/path/to/mcp-servers/presentation-builder/index.mjs"]` |
| Scope | `workspace` (or `user`) |

That's it. Doable's chat will list `create_presentation` (prefixed
`mcp_presentation_builder_create_presentation`) and route the rest
through the standard MCP Apps flow.

---

## Building your own MCP App for Doable

Use this server as a template:

1. **Stick to the spec.** Return UI resources via `createUIResource`
   (`@mcp-ui/server`). Do **not** invent your own JSON envelopes — the
   host will not understand them.
2. **Self-contained HTML.** Inline CSS + JS. The iframe is sandboxed; it
   cannot reach back into the host page. Use `window.parent.postMessage`
   for any callback.
3. **Two-tool pattern.** A primary tool returns the picker UI resource;
   secondary tool(s) do the actual work and return a result UI resource
   (e.g., a download card, a summary, a chart). The iframe drives the
   second call via a `{type:'tool', payload:{toolName, params}}` message.
4. **Always include a small text item alongside the UI** so the LLM has a
   sensible thing to do next ("Acknowledge and stop", "User must pick…",
   "Artifact ready, stop calling tools.").
5. **Embed binaries as data URLs** inside the download UI when possible
   — the user gets a one-click download with no host-side endpoint
   needed.
6. **Test in any MCP Apps host first** (`ui-inspector` is great) before
   plugging into Doable, to prove the decoupling.

The host (Doable) provides a generic `POST /projects/:id/chat/mcp-call`
proxy that any iframe can hit via the standard MCP Apps `tool` action —
nothing special about presentations.

---

## Files

- [`index.mjs`](./index.mjs) — MCP server, two tool handlers, picker + download HTML.
- [`presentation-engine.mjs`](./presentation-engine.mjs) — PptxGenJS deck builder (no LLM, deterministic template).
- [`package.json`](./package.json) — deps: `@modelcontextprotocol/sdk`, `@mcp-ui/server`, `pptxgenjs`.

---

License: same as Doable.
