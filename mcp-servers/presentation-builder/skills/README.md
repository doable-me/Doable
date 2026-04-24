# Presentation Builder — Skills

This folder contains the **design knowledge** that powers the
`presentation-builder` MCP App. It is split into two skills:

| Skill | Purpose | Files |
|-------|---------|-------|
| [`web-slides/`](web-slides/) | Single-file HTML decks with cinematic CSS animations and topic-adaptive themes | `SKILL.md`, `theme-palettes.md`, `layout-templates.md`, `animation-recipes.md` |
| [`pptx/`](pptx/) | Downloadable `.pptx` files via PptxGenJS | `SKILL.md`, `pptxgenjs.md` |

Each skill is structured so it can be consumed in **two ways**:

## 1. As a reference for the deterministic engine

The current implementation in [`../presentation-engine.mjs`](../presentation-engine.mjs)
embodies these skills directly:

- The 8 palettes from `web-slides/theme-palettes.md` are encoded as the
  `PALETTES` array, with topic-keyword scoring to pick the right theme.
- The layout templates from `web-slides/layout-templates.md` are realised as
  the `RENDERERS` map (cover, split, cards, stat, quote, timeline, compare,
  takeaways, closing).
- The staggered `.reveal` pattern + floating-orb effect from
  `web-slides/animation-recipes.md` are baked into the deck CSS.
- The PptxGenJS API shapes from `pptx/pptxgenjs.md` are used by `buildPptx()`.

This guarantees deterministic, predictable output without any LLM round-trip.

## 2. As prompt material for an AI-driven fork

If you want to switch to AI-driven generation (where the LLM writes the deck
HTML/JS directly using these skills as a prompt), you can:

1. Add a tool like `request_web_slides_skill({topic, ...})` that returns the
   full text of `SKILL.md` + the three reference files.
2. Add a tool like `render_web_slides({topic, html})` that wraps
   AI-generated HTML in the inline preview UIResource (see
   `webSlidesPreviewHtml()` in [`../index.mjs`](../index.mjs)).
3. Wire your picker iframe to send a `prompt` postMessage that gives the AI
   the context plus an instruction to call those tools in sequence.

The MCP App standard supports both flows — pick whichever matches your
trust model and latency budget. Deterministic is fast & predictable;
AI-driven is more bespoke but slower and can fail in interesting ways.

## Forking your own MCP App

This MCP App is fully decoupled from Doable's host. The host just renders
any UIResource that comes back as `{type:'resource', resource:{uri:'ui://…',
mimeType:'text/html', text}}`. To build your own:

1. Copy this whole `presentation-builder/` folder.
2. Rename the package, edit `index.mjs`, swap the `skills/` content with
   your own design system.
3. Wire it as an MCP server (stdio transport works out of the box).
4. Connect it via your host's MCP connector flow — no special host code
   needed if the host follows the [MCP Apps spec](https://modelcontextprotocol.io/extensions/apps).

The two helper functions in `index.mjs` worth studying are:

- `pickerHtml({topic, slideCount, audience, tone})` — opaque white card
  with format options that postMessages a `tool` action back to the host.
- `webSlidesPreviewHtml({deckHtml, fileName, base64, sizeBytes, summary})` —
  inline live preview wrapper with a 16:9 stage that runs the deck inside a
  nested sandboxed iframe, plus Fullscreen / Open / Download buttons.
