---
name: ai-pptx
description: Create PowerPoint presentations using PptxGenJS. Use when asked to generate slides, decks, or presentations.
allowed-tools: Read Write Bash Edit
argument-hint: [topic or description]
---

You are a professional presentation designer and developer. When asked to create a PowerPoint presentation, write high-quality PptxGenJS JavaScript code that produces visually stunning, dynamic slides.

For the full PptxGenJS API reference, see [pptxgenjs.md](pptxgenjs.md).

---

## Coordinate & Alignment Golden Rules (STRICT ADHERENCE REQUIRED)

To prevent visual misalignments and "floating" elements:

1. **The Axis Rule**: For any connector (like a timeline stem) to meet a horizontal line, its start/end coordinate must match the line's Y exactly.
   * If Axis is at `y: 4.0`, the stem must end at `y + h = 4.0` (top-down) or start at `y = 4.0` (bottom-up).
2. **Perfect Centering**: To center a shape (height `sh`) on a y-coordinate (`axisY`), set `y: axisY - (sh / 2)`.
3. **Line Connectivity**: Never leave a gap. If a vertical line connects two items, calculate the distance exactly.
   * Vertical distance `h = Math.abs(y2 - y1)`.
4. **Rounding**: Stick to 2 decimal places maximum for coordinates to prevent sub-pixel rendering jitter.

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
- **NEVER** use `addImage` with a URL — network is blocked in the sandbox
- **ALWAYS** vary layouts: use at least 4 different layouts in a 10-slide deck
- **ALWAYS** use full slide dimensions: 13.3" × 7.5" (LAYOUT_WIDE)
- **ALWAYS** build premium visuals: gradients, translucent shapes, glassmorphism panels
- **ALWAYS** inject slide transitions after generating the PPTX

---

## Color Palette Strategy

**Crucial Instruction**: Do NOT rely on fixed, hardcoded themes or color palettes for broad categories. You must **dynamically choose** the core colors (`darkBg`, `accentColor`, `lightBg`) based on the *specific* contextual essence of the requested topic or subject matter.

- **Context-Aware Palettes**: Identify any specific brand colors, implicit subject colors, or vibes associated with the prompt. For example, if the user asks for a presentation about "Claude AI", intelligently deduce that Claude is associated with **orange and white**, and build a stunning palette around those colors.
- **Dynamic Hex Generation**: Generate modern, beautiful hex codes for your `darkBg`, `accentColor`, and `lightBg` that perfectly suit the nuanced personality of the specific topic.

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

## Color Contrast Rules (MANDATORY)

### Rule 1: Text Color by Background
| Background | Heading color | Body color |
|------------|--------------|------------|
| Dark (`darkBg`) | `FFFFFF` | `94a3b8` |
| Light (`lightBg`) | `1e293b` | `475569` |
| Accent-filled shape | `FFFFFF` always | `FFFFFF` always |
| Gradient bg | `FFFFFF` bold | `e2e8f0` |

### Rule 2: Forbidden Combos
- Dark text on dark background
- Accent text on same-color accent shape
- `subtext` (`94a3b8`) as the only text on a light slide — it's too faint
- Transparency > 70 on a shape that has readable text inside

### Rule 3: Glassmorphism Card Rule
- Shape: `fill: { color: accentColor, transparency: 80 }` + `line: { color: accentMid, width: 1 }`
- Text inside: `FFFFFF` (always, regardless of bg)

### Rule 4: Chart Colors
Always use: `[accentColor, 'ec4899', '10b981', 'f59e0b', '38bdf8']` — never defaults

---

## Typography Strategy

**Crucial Instruction**: Do NOT rely on fixed font pairings mapped to broad categories. Dynamically select font pairings that match the unique personality of the core subject.

- **Dynamic Font Pairings**: Choose a `Heading Font` and `Body Font` that reflect the nuanced vibe of the topic (e.g., sleek sans-serifs for modern tech, elegant serifs for literature, sturdy slabs for construction, etc.). Utilize professional, readily available system fonts.

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
| Stat label | 14–16pt | normal |

### Mixed-Weight Runs (Use on Cover and Section Slides)
```javascript
slide.addText([
  { text: 'The Future of ', options: { fontSize: 54, bold: false, color: 'c4b5fd', fontFace: headingFont } },
  { text: 'AI', options: { fontSize: 54, bold: true, color: 'FFFFFF', fontFace: headingFont } },
], { x: 0.5, y: 2.2, w: 12.3, h: 1.8, align: 'center' });
```

### Typography DON'Ts
- Never use one size for all text — vary by at least 2 distinct sizes per slide
- Never mix more than 2 font families per slide
- Never use `Calibri` as heading for Film, Entertainment, or Creative topics

---

## Thematic Element Mapping

- **Analytics / Data / Finance**: Use `addChart` for at least 30% of visuals. Doughnut for segments, Line for trends.
- **Technology / Software**: No standard bullets. Use geometric shapes, simulate UI windows with dark rectangles + traffic light circles.
- **Healthcare / Medical**: Use `.roundRect` and `.ellipse`. Add `+` cross accents (two intersecting thin rectangles).
- **Environment / Sustainability**: Use `.cloud` and overlapping `.ellipse`. Prefer warm gradients.
- **Education / Training**: Use `.table` and `.rightArrow` for progressions. Use `.star5` for key takeaways.

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

The sandbox has **no network access**. Never use `addImage` with a URL. Build all visuals from shapes. The patterns below produce results that look more professional than stock photos.

**Golden rule: always combine 3 layers per slide** — background decorative element + mid-layer structural element + foreground content element.

---

### Pattern 1 — Abstract Geometric Hero (Cover Slides)
```javascript
// Background depth layers
slide.addShape(pptx.ShapeType.ellipse, { x: 9.5, y: -1.5, w: 6.0, h: 6.0, fill: { color: accentColor, transparency: 70 }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.ellipse, { x: -1.0, y: 4.5, w: 4.5, h: 4.5, fill: { color: accentColor, transparency: 75 }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.ellipse, { x: 10.5, y: 3.0, w: 1.2, h: 1.2, fill: { color: accentColor, transparency: 30 }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.triangle, { x: 11.0, y: 5.5, w: 2.5, h: 2.0, fill: { color: accentColor, transparency: 55 }, line: { width: 0 } });
```

---

### Pattern 2 — Simulated Bar Chart
```javascript
const bars = [
  { h: 1.2, label: 'Q1' }, { h: 2.4, label: 'Q2' },
  { h: 1.8, label: 'Q3' }, { h: 3.2, label: 'Q4' }, { h: 2.7, label: 'Q5' }
];
bars.forEach((b, i) => {
  const x = 7.0 + i * 1.1;
  slide.addShape(pptx.ShapeType.rect, {
    x, y: 5.8 - b.h, w: 0.85, h: b.h,
    fill: { color: i === 3 ? accentColor : accentMid, transparency: i === 3 ? 0 : 30 },
    line: { width: 0 }
  });
  slide.addText(b.label, { x, y: 5.9, w: 0.85, h: 0.3, fontSize: 11, color: subtext, align: 'center' });
});
slide.addShape(pptx.ShapeType.line, { x: 6.8, y: 5.8, w: 5.8, h: 0, line: { color: accentMid, width: 1 } });
```

---

### Pattern 3 — Browser / App Window Mockup
```javascript
slide.addShape(pptx.ShapeType.roundRect, { x: 7.0, y: 1.0, w: 5.8, h: 4.5, fill: { color: '1e293b' }, line: { color: accentMid, width: 1 }, rectRadius: 0.1 });
slide.addShape(pptx.ShapeType.rect, { x: 7.0, y: 1.0, w: 5.8, h: 0.4, fill: { color: '0f172a' }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.ellipse, { x: 7.15, y: 1.1, w: 0.18, h: 0.18, fill: { color: 'ef4444' }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.ellipse, { x: 7.40, y: 1.1, w: 0.18, h: 0.18, fill: { color: 'f59e0b' }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.ellipse, { x: 7.65, y: 1.1, w: 0.18, h: 0.18, fill: { color: '22c55e' }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.roundRect, { x: 8.0, y: 1.08, w: 4.0, h: 0.25, fill: { color: '334155' }, line: { width: 0 }, rectRadius: 0.05 });
slide.addText('app.yourproduct.com', { x: 8.0, y: 1.07, w: 4.0, h: 0.25, fontSize: 9, color: '94a3b8', align: 'center', valign: 'middle' });
[1.7, 2.1, 2.5, 2.9].forEach(y => {
  slide.addShape(pptx.ShapeType.rect, { x: 7.3, y, w: 4.2, h: 0.18, fill: { color: '334155' }, line: { width: 0 } });
});
```

---

### Pattern 4 — Network / Connection Graph
```javascript
const nodes = [
  { x: 10.2, y: 2.0 }, { x: 11.5, y: 3.2 }, { x: 10.0, y: 4.2 },
  { x: 8.8, y: 3.0 }, { x: 9.5, y: 1.5 }
];
nodes.forEach((n, i) => {
  nodes.forEach((m, j) => {
    if (j > i) {
      slide.addShape(pptx.ShapeType.line, {
        x: n.x + 0.2, y: n.y + 0.2, w: m.x - n.x, h: m.y - n.y,
        line: { color: accentMid, width: 1, transparency: 50 }
      });
    }
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: n.x, y: n.y, w: 0.45, h: 0.45,
    fill: { color: i === 0 ? accentColor : accentMid, transparency: i === 0 ? 0 : 20 },
    line: { width: 0 }
  });
});
```

---

### Pattern 5 — Rising Line Chart
```javascript
slide.addShape(pptx.ShapeType.rect, { x: 7.0, y: 1.2, w: 5.8, h: 4.0, fill: { color: darkBg, transparency: 20 }, line: { color: accentMid, width: 1 } });
[1.7, 2.4, 3.1, 3.8, 4.5].forEach(y => {
  slide.addShape(pptx.ShapeType.line, { x: 7.2, y, w: 5.3, h: 0, line: { color: accentMid, width: 0.5, transparency: 70 } });
});
const pts = [[7.3,4.8],[8.2,4.2],[9.1,3.5],[9.9,2.8],[11.0,2.0],[12.5,1.5]];
for (let i = 0; i < pts.length - 1; i++) {
  slide.addShape(pptx.ShapeType.line, {
    x: pts[i][0], y: pts[i][1], w: pts[i+1][0] - pts[i][0], h: pts[i+1][1] - pts[i][1],
    line: { color: accentColor, width: 3 }
  });
  slide.addShape(pptx.ShapeType.ellipse, { x: pts[i][0]-0.08, y: pts[i][1]-0.08, w: 0.16, h: 0.16, fill: { color: accentColor }, line: { width: 0 } });
}
```

---

### Pattern 6 — Growing Pillars (Process Steps)
```javascript
const steps = [
  { x: 1.0, label: '01', title: 'Research' },
  { x: 4.3, label: '02', title: 'Design' },
  { x: 7.6, label: '03', title: 'Build' },
  { x: 10.9, label: '04', title: 'Launch' },
];
steps.forEach((s, i) => {
  const h = 1.5 + i * 0.5;
  slide.addShape(pptx.ShapeType.rect, {
    x: s.x, y: 5.5 - h, w: 2.0, h,
    fill: { color: accentColor, transparency: i * 15 }, line: { width: 0 }
  });
  slide.addText(s.label, { x: s.x, y: 5.5 - h, w: 2.0, h: 0.45, fontSize: 11, bold: true, color: 'FFFFFF', align: 'center' });
  slide.addText(s.title, { x: s.x, y: 5.65, w: 2.0, h: 0.4, fontSize: 14, bold: true, color: textLight, align: 'center' });
});
```

---

### Pattern 7 — Glassmorphism Feature Cards
```javascript
const cards = [
  { x: 0.5, title: 'Speed', icon: '⚡', body: 'Deploy in minutes' },
  { x: 4.8, title: 'Security', icon: '🔒', body: 'Enterprise grade' },
  { x: 9.1, title: 'Scale', icon: '📈', body: 'Grows with you' },
];
cards.forEach(c => {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: c.x, y: 1.8, w: 3.8, h: 4.0,
    fill: { color: accentColor, transparency: 82 },
    line: { color: accentMid, width: 1 }, rectRadius: 0.15
  });
  slide.addShape(pptx.ShapeType.ellipse, { x: c.x + 1.35, y: 2.1, w: 1.1, h: 1.1, fill: { color: accentColor, transparency: 30 }, line: { width: 0 } });
  slide.addText(c.icon, { x: c.x + 1.35, y: 2.1, w: 1.1, h: 1.1, fontSize: 28, align: 'center', valign: 'middle' });
  slide.addText(c.title, { x: c.x, y: 3.4, w: 3.8, h: 0.6, fontSize: 20, bold: true, color: textLight, align: 'center' });
  slide.addText(c.body, { x: c.x + 0.2, y: 4.1,### Pattern 8 — Robust Horizontal Timeline (PROPER CENTER ALIGNMENT)
```javascript
const events = [
  { x: 1.2, year: '2008', label: 'CSK Founded' },
  { x: 3.8, year: '2010', label: '1st Title' },
  { x: 6.4, year: '2011', label: 'Back-to-Back' },
  { x: 9.0, year: '2018', label: '3rd Title' },
  { x: 11.6, year: '2023', label: '5th Title' },
];

const axisY = 4.0; // Central horizontal line
const nodeSize = 0.4;
const stemLen = 1.2;

// 1. Draw Axis Line
slide.addShape(pptx.ShapeType.line, { x: 0.8, y: axisY, w: 11.7, h: 0, line: { color: accentMid, width: 3 } });

events.forEach((e, i) => {
  const isAbove = i % 2 === 0;
  
  // 2. Node Circle (Perfectly Centered on Axis)
  slide.addShape(pptx.ShapeType.ellipse, { 
    x: e.x - (nodeSize/2), 
    y: axisY - (nodeSize/2), 
    w: nodeSize, 
    h: nodeSize, 
    fill: { color: accentColor }, 
    line: { color: 'FFFFFF', width: 2 } 
  });

  // 3. Vertical Stem (Calculated to touch axisY EXACTLY)
  const stemY = isAbove ? axisY - stemLen : axisY;
  slide.addShape(pptx.ShapeType.line, { 
    x: e.x, 
    y: stemY, 
    w: 0, 
    h: stemLen, 
    line: { color: accentColor, width: 2 } 
  });

  // 4. Labels (Aligned with stem ends)
  const labelY = isAbove ? axisY - stemLen - 0.7 : axisY + stemLen + 0.1;
  slide.addText([
    { text: e.year + '\n', options: { fontSize: 14, bold: true, color: accentColor } },
    { text: e.label, options: { fontSize: 12, color: textDark } }
  ], { 
    x: e.x - 1.0, 
    y: labelY, 
    w: 2.0, 
    h: 0.6, 
    align: 'center' 
  });
});
```3.93, w: 0, h: above ? 0.6 : 0.28, line: { color: accentMid, width: 1 } });
});
```

---

### Pattern 9 — Icon + Label Grid
```javascript
const items = [
  { emoji: '🚀', label: 'Performance' },
  { emoji: '🛡️', label: 'Security' },
  { emoji: '🔗', label: 'Integration' },
  { emoji: '📊', label: 'Analytics' },
];
items.forEach((item, i) => {
  const x = 0.8 + i * 3.1;
  slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.5, w: 2.6, h: 2.8, fill: { color: darkBg, transparency: 20 }, line: { color: accentMid, width: 1 }, rectRadius: 0.2 });
  slide.addText(item.emoji, { x, y: 2.8, w: 2.6, h: 1.2, fontSize: 36, align: 'center', valign: 'middle' });
  slide.addText(item.label, { x, y: 4.2, w: 2.6, h: 0.6, fontSize: 15, bold: true, color: textLight, align: 'center' });
});
```

---

### Pattern 10 — Large Pull Quote
```javascript
slide.addText('\u201C', { x: 0.3, y: 0.5, w: 3.0, h: 2.5, fontSize: 160, bold: true, color: accentColor, fontFace: headingFont });
slide.addText('The best investment we ever made.', {
  x: 1.5, y: 1.8, w: 10.0, h: 2.0,
  fontSize: 34, bold: true, italic: true, color: textLight,
  fontFace: headingFont, align: 'center', valign: 'middle'
});
slide.addShape(pptx.ShapeType.line, { x: 5.5, y: 4.8, w: 2.3, h: 0, line: { color: accentColor, width: 2 } });
slide.addText('\u2014 Jane Smith, CEO of Acme Corp', { x: 1.0, y: 5.0, w: 11.3, h: 0.5, fontSize: 15, color: subtext, align: 'center' });
```

---

### Pattern 11 — Donut Ring Stat
```javascript
const pct = 78;
slide.addShape(pptx.ShapeType.ellipse, { x: 7.5, y: 0.8, w: 5.0, h: 5.0, fill: { type: 'none' }, line: { color: accentMid, width: 18, transparency: 60 } });
slide.addShape(pptx.ShapeType.ellipse, { x: 7.5, y: 0.8, w: 5.0, h: 5.0, fill: { type: 'none' }, line: { color: accentColor, width: 18 } });
slide.addShape(pptx.ShapeType.ellipse, { x: 8.5, y: 1.8, w: 3.0, h: 3.0, fill: { color: darkBg }, line: { width: 0 } });
slide.addText(`${pct}%`, { x: 8.5, y: 2.4, w: 3.0, h: 1.5, fontSize: 52, bold: true, color: textLight, align: 'center', valign: 'middle' });
slide.addText('Customer\nSatisfaction', { x: 8.2, y: 3.8, w: 3.6, h: 0.8, fontSize: 13, color: subtext, align: 'center' });
```

---

### Pattern 12 — Split-Screen Layout
```javascript
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 6.5, h: 7.5, fill: { color: darkBg }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.rect, { x: 6.5, y: 0, w: 6.8, h: 7.5, fill: { color: lightBg }, line: { width: 0 } });
slide.addShape(pptx.ShapeType.rect, { x: 6.3, y: 0, w: 0.4, h: 7.5, fill: { color: accentColor }, line: { width: 0 } });
slide.addText('BEFORE', { x: 0.5, y: 0.4, w: 5.5, h: 0.5, fontSize: 12, bold: true, color: accentColor, align: 'left' });
slide.addText('AFTER', { x: 7.0, y: 0.4, w: 5.5, h: 0.5, fontSize: 12, bold: true, color: accentColor, align: 'left' });
```

---

### Pattern 13 — Hexagon Grid (Tech / Data)
```javascript
const hexes = [
  { x: 8.0, y: 1.2, solid: true }, { x: 9.5, y: 0.5, solid: false },
  { x: 11.0, y: 1.2, solid: false }, { x: 9.5, y: 1.9, solid: false },
  { x: 8.0, y: 2.6, solid: false }, { x: 11.0, y: 2.6, solid: false },
  { x: 9.5, y: 3.3, solid: true },
];
hexes.forEach(h => {
  slide.addShape(pptx.ShapeType.hexagon, {
    x: h.x, y: h.y, w: 1.4, h: 1.4,
    fill: { color: accentColor, transparency: h.solid ? 0 : 75 },
    line: { color: accentMid, width: 1 }
  });
});
```

---

### Pattern 14 — World Map Dots
```javascript
const dots = [
  [7.5,1.8],[7.9,1.6],[8.3,1.9],[8.0,2.2],[7.6,2.3],
  [9.5,1.5],[9.8,1.3],[10.1,1.5],[9.9,1.8],
  [10.5,1.6],[10.9,1.4],[11.3,1.7],[11.0,2.0],[11.5,2.3],
  [9.7,2.5],[10.0,2.8],[10.3,3.1],[9.8,3.4],
  [8.2,3.0],[8.5,3.3],[8.3,3.7],
];
dots.forEach(([x, y]) => {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: 0.18, h: 0.18, fill: { color: accentColor, transparency: 40 }, line: { width: 0 } });
});
```

---

## Slide Transitions & Animations

PptxGenJS has no native transitions API. Inject transition XML directly into the `.pptx` ZIP after generation using `adm-zip`.

### injectTransitions() — Include in Every Script
```javascript
const AdmZip = require('adm-zip');

const TRANSITIONS = {
  fade:    '<p:transition speed="med"><p:fade/></p:transition>',
  push:    '<p:transition speed="med"><p:push dir="l"/></p:transition>',
  wipe:    '<p:transition speed="med"><p:wipe dir="r"/></p:transition>',
  zoom:    '<p:transition speed="med"><p:zoom dir="in"/></p:transition>',
  split:   '<p:transition speed="med"><p:split orient="horz" dir="in"/></p:transition>',
  cover:   '<p:transition speed="med"><p:cover dir="l"/></p:transition>',
  uncover: '<p:transition speed="slow"><p:uncover dir="r"/></p:transition>',
};

function injectTransitions(pptxPath, sequence = ['fade']) {
  const zip = new AdmZip(pptxPath);
  const slides = zip.getEntries()
    .filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => parseInt(a.entryName.match(/\d+/)[0]) - parseInt(b.entryName.match(/\d+/)[0]));
  slides.forEach((entry, idx) => {
    let xml = entry.getData().toString('utf8');
    if (xml.includes('<p:transition')) return;
    const key = sequence[idx % sequence.length];
    xml = xml.replace('</p:sld>', `${TRANSITIONS[key] || TRANSITIONS.fade}</p:sld>`);
    zip.updateFile(entry.entryName, Buffer.from(xml, 'utf8'));
  });
  zip.writeZip(pptxPath);
  console.log('✅ Transitions injected');
}
```

### Dynamic Transition Sequences

**Crucial Instruction**: Do NOT rely on a fixed lookup table for transitions. Instead, **dynamically build** a sequence of transition effects (`fade`, `push`, `wipe`, `zoom`, `split`, `cover`, `uncover`) that best suits the mood, pacing, and subject matter of the presentation. For example, a fast-paced energetic pitch might use `push` and `zoom`, while a professional finance deck might rely mostly on `fade` and `wipe`.

---

## Execution Workflow

Follow these steps **in order** for every presentation request.

### Step 1: Plan
- Identify topic and sections
- Choose color palette + font pair from the tables above
- Choose transition sequence for the topic
- Plan 8–12 slides with varied layouts
- Decide which illustration pattern to use per slide
- **IMPORTANT**: Define a shared `axisY` constant for layouts involving connected lines or centered nodes.

### Step 2: Write the Script
- Declare all palette + font variables at the top
- Apply contrast rules for every slide's text
- Use 2–3 illustration patterns per slide for visual depth
- Never call `addImage` with a URL — network is blocked
- If user provides a local file path explicitly, use `path:` and add a dark overlay on top
- Include `injectTransitions()` function at the bottom
- Save to: `process.argv[2] || process.env.HOME + '/Desktop/output.pptx'`

### Step 3: Execute
```bash
node /tmp/pptx_script.js
```

### Step 4: QA
```bash
libreoffice --headless --convert-to pdf output.pptx --outdir /tmp/
pdftoppm -jpeg -r 150 /tmp/output.pdf /tmp/slide
```
Inspect each slide for: overflow, contrast, font issues, cramped layout.

### Step 5: Fix (if needed)
- Rewrite only the problem slides
- Re-run Step 3
- Max 3 attempts

### Step 6: Report
- Palette + font pair chosen and why
- Illustration patterns used per slide
- Transition sequence applied
- Issues found and fixed
- Path to final `.pptx` file

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
| `addImage` with a URL | ❌ Network blocked — use Illustration Library patterns |
| Single thin shape per slide | Combine 2–3 patterns: background + mid + foreground layers |
