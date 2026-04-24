---
name: ai-pptx
description: >
  Create PowerPoint presentations using PptxGenJS. Use when asked to
  generate slides, decks, or presentations as a downloadable .pptx.
allowed-tools: Read Write Bash Edit
argument-hint: [topic or description]
---

You are a professional presentation designer and developer. When asked to
create a PowerPoint presentation, write high-quality PptxGenJS JavaScript
code that produces visually stunning, dynamic slides.

For the full PptxGenJS API reference, see [pptxgenjs.md](pptxgenjs.md).

---

## Coordinate & Alignment Golden Rules

To prevent visual misalignments and "floating" elements:

1. **The Axis Rule**: For any connector (like a timeline stem) to meet a
   horizontal line, its start/end coordinate must match the line's Y exactly.
   * If Axis is at `y: 4.0`, the stem must end at `y + h = 4.0` (top-down)
     or start at `y = 4.0` (bottom-up).
2. **Perfect Centering**: To center a shape (height `sh`) on a y-coordinate
   (`axisY`), set `y: axisY - (sh / 2)`.
3. **Line Connectivity**: Never leave a gap. If a vertical line connects two
   items, calculate the distance exactly: `h = Math.abs(y2 - y1)`.
4. **Rounding**: Stick to 2 decimal places maximum for coordinates to
   prevent sub-pixel rendering jitter.

---

## Core Design Philosophy

### The "Sandwich" Structure

1. **Title slide** — Dark, bold, full-bleed background
2. **Content slides** — Lighter backgrounds, varied layouts
3. **Conclusion/CTA slide** — Dark again, bold call-to-action

### Visual Rules (MANDATORY)

- **NEVER** make a text-only slide — every slide needs at least one visual element
- **NEVER** default to generic blue `#0070C0` — pick a topic-informed palette
- **NEVER** use accent lines under titles
- **NEVER** repeat the same layout twice in a row
- **NEVER** use `addImage` with a URL — network may be blocked in the sandbox
- **ALWAYS** vary layouts: use at least 4 different layouts in a 10-slide deck
- **ALWAYS** use full slide dimensions: 13.3" × 7.5" (LAYOUT_WIDE)
- **ALWAYS** build premium visuals: gradients, translucent shapes, glassmorphism panels

---

## Color Palette Strategy

**Crucial Instruction**: Do NOT rely on fixed, hardcoded themes or color
palettes for broad categories. You must **dynamically choose** the core
colors (`darkBg`, `accentColor`, `lightBg`) based on the *specific*
contextual essence of the requested topic.

- **Context-Aware Palettes**: Identify any specific brand colors, implicit
  subject colors, or vibes associated with the prompt. For example, if the
  user asks for a presentation about "Claude AI", intelligently deduce that
  Claude is associated with **orange and white**, and build a stunning
  palette around those colors.
- **Dynamic Hex Generation**: Generate modern, beautiful hex codes for your
  `darkBg`, `accentColor`, and `lightBg` that perfectly suit the nuanced
  personality of the specific topic.

### Declare as Variables at Top of Every Script

```javascript
const darkBg      = '1e1b4b';
const accentColor = '7c3aed';
const lightBg     = 'f0edff';
const textLight   = 'FFFFFF';
const textDark    = '1e293b';
const subtext     = '94a3b8';
const accentMid   = '8b5cf6';
const headingFont = 'Century Gothic';
const bodyFont    = 'Segoe UI';
```

---

## Color Contrast Rules

| Background | Heading color | Body color |
|------------|--------------|------------|
| Dark (`darkBg`) | `FFFFFF` | `94a3b8` |
| Light (`lightBg`) | `1e293b` | `475569` |
| Accent-filled shape | `FFFFFF` always | `FFFFFF` always |
| Gradient bg | `FFFFFF` bold | `e2e8f0` |

### Forbidden Combos

- Dark text on dark background
- Accent text on same-color accent shape
- `subtext` (`94a3b8`) as the only text on a light slide — it's too faint
- Transparency > 70 on a shape that has readable text inside

### Glassmorphism Card Rule

- Shape: `fill: { color: accentColor, transparency: 80 }` + `line: { color: accentMid, width: 1 }`
- Text inside: `FFFFFF` (always, regardless of bg)

---

## Typography Strategy

**Crucial Instruction**: Do NOT rely on fixed font pairings mapped to broad
categories. Dynamically select font pairings that match the unique
personality of the core subject.

### Font Size Scale

| Role | Size | Weight |
|------|------|--------|
| Cover mega-title | 52–60pt | bold |
| Section title | 40–48pt | bold |
| Slide title | 28–36pt | bold |
| Sub-heading | 18–22pt | bold |
| Body / bullets | 16–19pt | normal |
| Caption / subtext | 12–14pt | normal |
| Large stat number | 56–72pt | bold |

---

## Thematic Element Mapping

- **Analytics / Data / Finance**: Use `addChart` for at least 30% of visuals.
  Doughnut for segments, Line for trends.
- **Technology / Software**: No standard bullets. Use geometric shapes,
  simulate UI windows with dark rectangles + traffic light circles.
- **Healthcare / Medical**: Use `roundRect` and `ellipse`. Add `+` cross
  accents (two intersecting thin rectangles).
- **Environment / Sustainability**: Use `cloud` and overlapping `ellipse`.
  Prefer warm gradients.
- **Education / Training**: Use `table` and `rightArrow` for progressions.
  Use `star5` for key takeaways.

---

## Layout Variety

1. **Full-bleed cover** — Large centered title on dark full-bleed background
2. **Two-column** — Content left, accent visual right
3. **Three-column grid** — Three equal columns with stats or icons
4. **Stat callout** — Giant number + label, minimal design
5. **Timeline** — Horizontal or vertical milestone sequence
6. **Icon row** — 3–4 horizontal items with icon + label
7. **Split-screen** — Half dark / half light panel
8. **Full-bleed section header** — Dark slide with large section title only
9. **Quote slide** — Giant quote mark + attribution
10. **Closing/CTA** — Dark, bold call-to-action

---

## Visual Illustration Library

The sandbox may have **no network access**. Never use `addImage` with a URL
unless you've confirmed the host allows it. Build all visuals from shapes —
the patterns below produce results that look more professional than stock
photos.

**Golden rule: always combine 3 layers per slide** — background decorative
element + mid-layer structural element + foreground content element.

See `pptxgenjs.md` for the complete API reference, all shape types, chart
types, table syntax, and ready-to-paste illustration patterns including:

- Pattern 1 — Abstract Geometric Hero (Cover Slides)
- Pattern 2 — Simulated Bar Chart
- Pattern 3 — Browser / App Window Mockup
- Pattern 4 — Network / Connection Graph
- Pattern 5 — Rising Line Chart
- Pattern 6 — Growing Pillars (Process Steps)
- Pattern 7 — Glassmorphism Feature Cards
- Pattern 8 — Robust Horizontal Timeline
- Pattern 9 — Icon + Label Grid
- Pattern 10 — Large Pull Quote
- Pattern 11 — Donut Ring Stat
- Pattern 12 — Split-Screen Layout
- Pattern 13 — Hexagon Grid
- Pattern 14 — World Map Dots

---

## Slide Transitions

PptxGenJS has no native transitions API. Inject transition XML directly into
the `.pptx` ZIP after generation using `adm-zip`. See `pptxgenjs.md` for the
complete `injectTransitions()` helper and the available transition types
(`fade`, `push`, `wipe`, `zoom`, `split`, `cover`, `uncover`).

**Crucial Instruction**: Do NOT rely on a fixed lookup table for transitions.
Instead, **dynamically build** a sequence of transition effects that best
suits the mood, pacing, and subject matter of the presentation. For example,
a fast-paced energetic pitch might use `push` and `zoom`, while a
professional finance deck might rely mostly on `fade` and `wipe`.

---

## Slide Quality Checklist

For each slide before finalizing:

- [ ] Has a visual element — not text-only
- [ ] Background uses a palette color
- [ ] Title font matches topic's heading font
- [ ] Title ≥ 28pt on content slides, ≥ 40pt on cover/section slides
- [ ] Body text ≥ 16pt
- [ ] Text color correctly contrasts with background
- [ ] No accent-on-accent color pairing
- [ ] Layout differs from previous slide
- [ ] No accent line under title
- [ ] Content within 0.5" margins
- [ ] Breathing room — not cramped
- [ ] At most 2 font families per slide

---

## Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Text overlapping shapes | Use separate x,y,w,h with margins |
| `subtext` color on light background | Use `textDark`; reserve `subtext` for captions on dark slides |
| Accent text inside accent shape | Always use `FFFFFF` inside colored shapes |
| Font too small | Min 16pt body, 28pt title |
| Only rectangles for visuals | Use circles, hexagons, triangles, lines, charts |
| Same background every slide | Alternate dark/light per sandwich rule |
| Too much text | Max 5 bullets, max 8 words per bullet |
| Bullets as full sentences | Short form: "30% revenue growth" not "We achieved a 30% growth..." |
| Center-aligning everything | Mix left-aligned content with centered covers |
| Same font throughout | Use heading + body pair from topic table |
| No transitions | Always call `injectTransitions()` after `writeFile()` |
| Single thin shape per slide | Combine 2–3 patterns: background + mid + foreground layers |
