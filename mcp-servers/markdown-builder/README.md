# markdown-builder — Doable built-in MCP App

A standards-compliant MCP App ([modelcontextprotocol.io/extensions/apps](https://modelcontextprotocol.io/extensions/apps/overview))
that ships with Doable. Renders polished Markdown documents with a
live HTML preview, .md download, and rendered .html download — all
theme-adaptive (light/dark) inside Doable's chat.

## Tools

| Tool | Purpose |
|------|---------|
| `create_markdown({ topic, audience?, tone?, length? })` | Returns a status card. Injects a `BUILD_MARKDOWN` prompt back to the host as a synthetic user turn — instructing the LLM to narrate progress and then call `build_markdown` once. |
| `build_markdown({ topic, content, frontmatter?, fileName? })` | Renders the unified preview + downloads card. |

## Standards

- ✅ Standard `tools/list` / `tools/call` (`@modelcontextprotocol/sdk`)
- ✅ UI resources via `createUIResource()` (`@mcp-ui/server`)
- ✅ Self-contained HTML using `window.parent.postMessage()` per the MCP Apps wire format
- ✅ Theme-adaptive — both `:root` light defaults and `html[data-theme="dark"]` overrides
- ❌ No host-specific extensions

The same server runs unchanged on any MCP Apps host.

## Run locally

```bash
cd mcp-servers/markdown-builder
pnpm install
node index.mjs   # talks MCP over stdio
```

Inspect with `npx @modelcontextprotocol/inspector node index.mjs`.

## Skill

See `skills/SKILL.md` for the full writing-quality guidance the LLM follows.
