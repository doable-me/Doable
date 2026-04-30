---
name: markdown
description: Comprehensive Markdown document creation. Used by Doable's markdown-builder MCP App to produce well-structured .md files with frontmatter, hierarchical headings, lists, tables, blockquotes, and code blocks. Ensures GitHub-flavored markdown that renders cleanly across viewers.
---

# Markdown writing guide

Adapted for Doable's `markdown-builder` MCP App. The LLM does NOT
ingest this whole file at runtime — it lives here as a developer
reference and to mirror the structure of `presentation-builder/skills`.

## Core requirements

- **GitHub-flavored Markdown (GFM).** Tables, fenced code blocks, task
  lists, autolinks, strikethrough.
- **Hierarchical headings.** Never skip levels. Document starts with
  ONE `#` Title; sections use `##`, sub-sections `###`, etc.
- **No raw HTML** unless absolutely necessary. Markdown should render
  identically in any viewer.
- **No trailing whitespace** on any line.
- **Single blank line between blocks** (paragraphs, lists, code,
  tables, headings). Double blank lines collapse on render.
- **No manual line wrapping** mid-sentence. Wrap at sentence
  boundaries; long paragraphs get split into logical paragraphs.

## Frontmatter

When emitting frontmatter via `frontmatter` arg, it becomes:

```yaml
---
title: "Quantum Computing in 2026"
date: "2026-05-01"
author: "Doable"
tags:
  - "quantum"
  - "research"
---
```

Frontmatter is OPTIONAL. Omit if the document is informal.

## Structure

```
# Title

One or two short sentences setting context for the entire document.

## Major Section

Lead paragraph. Then specifics.

### Sub-section (when needed)

Bulleted list when listing items:

- First item — concrete, specific.
- Second item — backed by a number, name, or example.
- Third item — tight, ≤ 90 chars per bullet ideally.

Numbered list when ORDER matters:

1. First step.
2. Second step.
3. Third step.

> Blockquote for an important callout, definition, or quotation.

| Comparison | Option A | Option B |
| ---------- | -------- | -------- |
| Speed      | Fast     | Slow     |
| Cost       | $        | $$$      |

## Key takeaways

- Closing bullet 1.
- Closing bullet 2.
- Closing bullet 3.
```

## Quality bar

- Specific facts, real numbers, real names — no placeholder text.
- One idea per paragraph; one paragraph per idea.
- Concrete examples in every section.
- Citations when a claim has a source: `[link text](url)`.
- Inline code with backticks: `` `MyClass.method()` ``.
- Fenced code blocks with a language tag for syntax highlighting:

  ````
  ```python
  def hello():
      print("Hello")
  ```
  ````

## What NOT to do

- ❌ Do NOT wrap the entire document in a fenced code block. Markdown
  is the document, not a payload.
- ❌ Do NOT use unicode bullets (`•`). Use `-` or `*`.
- ❌ Do NOT use HTML elements for layout (`<div>`, `<center>`).
- ❌ Do NOT skip heading levels (no `##` directly under `####`).
- ❌ Do NOT use ALL CAPS for emphasis. Use **bold** or *italic*.
