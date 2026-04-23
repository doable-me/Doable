# Presentation Builder MCP

An MCP server that adds a "presentation/report" capability to Doable's chat. When the user asks for slides, a deck, a pitch, or a report, the LLM calls this server, which renders an **interactive select widget** in the chat (powered by Doable's MCP UI protocol). The user picks one of two output formats — and the server returns the matching skill instructions so the LLM produces the final artifact.

## Tools exposed

| Tool | Purpose |
|------|---------|
| `create_presentation(topic, slideCount?, audience?, tone?)` | Returns a `__ui` select widget with two options: **Web Slides (HTML)** or **PowerPoint (.pptx)**. |
| `ui_action(toolCallId, action, payload)` | Callback invoked by Doable when the user picks a choice. Returns the SKILL.md content for the chosen format so the LLM can generate the artifact. |

## Install

```powershell
cd mcp-servers/presentation-builder
pnpm install
# or: npm install
```

## Add to Doable

Open Doable → **Settings → MCP Connectors → Add Server** and fill in:

- **Name:** `Presentation Builder`
- **Transport:** `stdio`
- **Command:** `node`
- **Args:** `["<absolute-path-to-repo>/mcp-servers/presentation-builder/index.mjs"]`
- **Scope:** `workspace`

Save. Then in any project chat, type something like:

> *"Make me a presentation on the history of coffee"*

The LLM will call `create_presentation`, a picker appears inline, and whichever option you click drives the final output.

## How the flow works

```
User prompt ─▶ LLM calls create_presentation(topic="coffee")
               │
               ▼
          MCP server returns `__ui` select payload
               │
               ▼
     Doable emits mcp_ui_open SSE event
               │
               ▼
       Select widget renders in chat
               │
     ┌─────────┴─────────┐
User clicks              User clicks
"Web Slides"             "PPTX"
     │                      │
     ▼                      ▼
POST /chat/mcp-action   POST /chat/mcp-action
     │                      │
     ▼                      ▼
MCP `ui_action` tool    MCP `ui_action` tool
returns web-slides      returns pptx SKILL.md
SKILL.md content        content
     │                      │
     ▼                      ▼
LLM generates           LLM generates
single-file HTML        PptxGenJS code
```

## Environment

| Var | Purpose |
|-----|---------|
| `SKILLS_DIR` | (optional) Override the path to `my_skills/`. Default: auto-detected by walking up from this file. |

## Local testing

You can test the server by piping MCP JSON-RPC over stdio:

```powershell
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node index.mjs
```
