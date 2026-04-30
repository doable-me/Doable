# pdf-builder — Doable built-in MCP App

A standards-compliant MCP App that produces a real PDF from a
print-ready HTML document via headless Chrome (puppeteer). The
preview iframe and the .pdf are pixel-equivalent. Theme-adaptive
chrome around the preview per [mcpui.dev](https://mcpui.dev).

## Tools

| Tool | Purpose |
|------|---------|
| `create_pdf({ topic, audience?, tone?, length?, pageSize? })` | Status card. Injects a `BUILD_PDF` prompt back to the host so the LLM narrates and calls `build_pdf` once. |
| `build_pdf({ topic, html, pageSize?, margins?, landscape?, fileName? })` | Renders preview + .pdf + .html downloads. |

## Print-ready HTML rules

The LLM is told to:
- Open with `<!doctype html>` + `<html lang="…">` + complete `<head>`.
- Embed all CSS in `<style>` (Google Fonts via `<link>` is the only allowed external resource).
- Use `@page { size: A4; margin: 18mm 16mm; }`.
- Use mm/cm/pt for print sizes; pt for fonts (10.5–11.5 body, 16–22 h2, 24–32 h1).
- Page-break hints: `h1, h2 { page-break-after: avoid; }`.
- No JS (static document).

## Implementation notes

- A singleton headless Chrome instance is launched lazily on the
  first `build_pdf` call and reused for the lifetime of the MCP
  process. ~150 ms warm render after the initial 1–2 s cold start.
- `preferCSSPageSize: true` honours the document's own `@page`
  declaration when it's present, and falls back to the `pageSize`
  arg otherwise.
- Default margins: 18 mm top/bottom, 16 mm left/right.

## Run locally

```bash
cd mcp-servers/pdf-builder
pnpm install
node index.mjs
```

The first run will download a private Chromium build (~120 MB) into
puppeteer's cache. On dev/prod servers we set `PUPPETEER_CACHE_DIR`
to share a single cache with the API service's thumbnail capture
puppeteer install.

## Skill

See `skills/SKILL.md`.
