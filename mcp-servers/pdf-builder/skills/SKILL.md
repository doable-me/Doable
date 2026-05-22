---
name: pdf
description: Print-ready PDF document creation via HTML for Doable's pdf-builder MCP App. Adapted from the Anthropic pdf skill — focuses on @page CSS, hierarchical typography, page-break hints, and producing PDFs that look professional when printed at A4/Letter.
---

# Print-ready HTML for PDF generation

Adapted for Doable's `pdf-builder` MCP App. The engine renders the
HTML you supply directly to PDF using headless Chrome — so what you
style is what you get.

## Hard requirements

### Use `@page` for paper size and margins
```css
@page {
  size: A4;            /* or Letter, Legal, A3, A5 */
  margin: 18mm 16mm;   /* top/bottom  left/right */
}
```

### Use print-correct units
- mm/cm/pt for layout and font sizes (NOT vh/vw — they're undefined for print).
- pt for fonts: body 10.5–11.5, h2 16–22, h1 24–32, captions 8.5–9.5.
- px is OK for borders and small radii.

### Hierarchy
- ONE `<h1>` (the document title).
- Multiple `<h2>` sections.
- Use `<h3>` for sub-sections only when content needs it.
- Don't skip levels.

### Page-break hints
```css
h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
table, figure, blockquote { break-inside: avoid; }
.page-break { page-break-before: always; break-before: always; }
```

Insert explicit page breaks ONLY when the content clearly needs one
(start of major part, end of cover page, before an appendix).

## Typography

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap');

body {
  font: 11pt/1.55 'Inter', -apple-system, sans-serif;
  color: #1a1a1a;
}
h1, h2, h3 { font-family: 'Source Serif 4', Georgia, serif; }
h1 { font-size: 28pt; }
h2 { font-size: 18pt; margin-top: 1.4em; }
h3 { font-size: 14pt; }
```

Pick a tasteful pair (one display + one body). Avoid the same
serif/sans-serif on every document — match the subject.

## Layout

- Body content area is set by the `@page` margin. Do NOT fight it
  with `body { width: 210mm }` — that breaks page breaks.
- For two-column reports, use CSS columns:
  ```css
  .body { columns: 2; column-gap: 8mm; }
  ```
- Tables: thin borders (0.5pt), a subtle header tint, alternating
  row tint optional. Always wrap in `<div style="break-inside:avoid">` for short tables.
- Images: `<img style="max-width:100%; break-inside:avoid">`.
  Only use real public URLs.

## Front matter / cover

For longer docs (length=long), open with a cover block:
```html
<header class="cover">
  <h1>Title</h1>
  <p class="lede">One-sentence subtitle.</p>
  <p class="meta">By Author · 2026-05-01</p>
</header>
```

Style with a top accent bar, generous padding, and `page-break-after:
always` so the cover gets its own page.

## Footer / page numbers

Native CSS page numbers are inconsistent across rendering engines.
For Doable's puppeteer renderer, the cleanest pattern is to skip the
header/footer and put any necessary metadata inline at the very end
of the body in a small muted style.

If you really want page numbers, declare `@page { @bottom-center { content: counter(page); } }` —
Chrome supports this when `printBackground` and CSS `@page` are
honoured.

## What NOT to do

- ❌ Set `body { width: 210mm }` — overrides `@page` and breaks paging.
- ❌ Use `vh`/`vw`/`%` for layout heights in print (undefined behaviour).
- ❌ Put interactive JS in the document — it's static print output.
- ❌ Use `position: fixed` for a "header bar" — won't work in print.
- ❌ Embed enormous base64 images. Use a public URL.
- ❌ Forget `print-color-adjust: exact` if a colored background is essential:
  ```css
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ```
