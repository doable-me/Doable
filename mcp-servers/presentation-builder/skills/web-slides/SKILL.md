---
name: web-slides-generator
description: >
  Generates visually stunning, animated, web-based presentation slides as a
  single HTML artifact — NOT a .pptx file. Use this skill whenever the user
  asks for: slides, a presentation, a deck, a slideshow, a pitch, or any
  multi-slide visual content on ANY topic. Trigger even for casual requests
  like "make me slides on X", "create a presentation about Y", "give me a
  deck for Z". This skill is the exclusive handler for all
  presentation-generation requests. Do NOT use the pptx skill or any
  file-based approach — the output is always a self-contained HTML artifact
  rendered in the browser with CSS animations, transitions, keyboard
  navigation, and topic-adaptive visual themes.
---

# Web Presentation Slides Generator

Creates self-contained, single-file HTML presentations with cinematic
animations, topic-matched visual themes, and keyboard/click navigation.
The output is a browser artifact — no PowerPoint, no PDF.

---

## Step 1 — Understand the Request

Extract from the user's message:

- **Topic** (required): What is the presentation about?
- **Slide count** (optional, default: 8–12 slides)
- **Audience** (optional): Who will see this? (executive, students, clients, general)
- **Tone** (optional): formal / casual / inspirational / technical / storytelling
- **Special content** (optional): must-include sections, data, bullet lists

If critical info is missing, make intelligent assumptions and state them
briefly before generating.

---

## Step 2 — Pick the Visual Theme

**Crucial Instruction**: Do NOT rely on fixed, hardcoded themes or color
palettes for broad topic categories (e.g., do not default to dark sci-fi/neon
for all tech topics). Instead, you must **dynamically choose** the colors,
visual aesthetics, and fonts based on the *specific* contextual essence of
the requested topic or subject matter.

- **Context-Aware Palettes**: Identify any specific brand colors, implicit
  subject colors, or vibes associated with the prompt. For example, if the
  user asks for a presentation about "Claude AI", intelligently deduce that
  Claude is associated with **orange and white/cream**, and build a stunning
  palette around those colors rather than reverting to generic
  "AI = neon green/blue".
- **Feature Creative Freedom**: You have full creative freedom to use
  whatever visual effects, CSS geometry, gradients, textures, or animations
  are required to make the presentation look stunning, unique, and highly
  bespoke to the prompt. Do not limit yourself to listed palettes.
- **Font & Typography Dynamics**: Dynamically select Google Font pairings
  that match the unique personality of the core subject, not just its broad
  category.

> ⚠️ NEVER produce two identical themes. Every generation must feature a
> custom, intelligently generated design scheme that reflects the uniqueness
> of the user's specific request. The aesthetic should feel premium, deeply
> considered, and perfectly aligned with the subject matter.

---

## Step 3 — Plan the Slide Structure

A strong presentation has a clear narrative arc. Default structure (adapt freely):

1. **Title Slide** — Topic, subtitle, author/org (if known), date
2. **Agenda / Overview** — What will be covered
3. **Context / Problem** — Why does this matter?
4. **Main Section 1** — Core idea or data point
5. **Main Section 2** — Supporting evidence or elaboration
6. **Main Section 3** — Key insight or case
7. **Visual Data / Stats** — Numbers, charts, comparisons (use CSS-drawn visuals if needed)
8. **Deep Dive** — Nuance, methodology, or example
9. **Challenges / Considerations** — Honest complexity
10. **Key Takeaways** — Distilled insights
11. **Call to Action / Next Steps** — What to do now
12. **Closing Slide** — Thank you, contact, or memorable quote

Adjust count and sections to fit the topic. Always open with impact and
close with resonance.

---

## Step 4 — Write the HTML Artifact

Produce a **single self-contained HTML file** with everything inline. No
external CDN dependencies (except Google Fonts). It must work offline after
the fonts load.

### Required Architecture

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google Fonts import (1–2 font families, each with 2–3 weights) -->
  <!-- All CSS inline in <style> tag -->
</head>
<body>
  <!-- Slide deck container -->
  <!-- Individual slides as sections/divs -->
  <!-- Navigation controls -->
  <!-- All JS inline in <script> tag -->
</body>
</html>
```

### CSS Design System

Define a CSS custom property palette at `:root` level. Every color, font,
spacing value must come from variables:

```css
:root {
  --bg-primary:    /* dominant background */;
  --bg-secondary:  /* card/panel surface */;
  --accent-1:      /* primary highlight */;
  --accent-2:      /* secondary highlight */;
  --text-primary:  /* main text */;
  --text-muted:    /* secondary text */;
  --font-display:  /* headline font family */;
  --font-body:     /* body font family */;
  --slide-padding: /* consistent slide padding */;
  --transition-speed: 0.7s;
}
```

### Animation System

Implement **slide transitions** using CSS classes toggled by JavaScript:

```css
.slide {
  opacity: 0;
  transform: translateY(40px);
  transition: all var(--transition-speed) cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none;
  position: absolute;
  width: 100%;
}
.slide.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: all;
}
.slide.exit-left {
  transform: translateX(-60px) scale(0.97);
  opacity: 0;
}
```

**Per-element staggered entrance animations** inside each slide:

```css
.reveal { opacity: 0; transform: translateY(20px); }
.slide.active .reveal {
  animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.slide.active .reveal:nth-child(1) { animation-delay: 0.1s; }
.slide.active .reveal:nth-child(2) { animation-delay: 0.2s; }
/* ... continue pattern */

@keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
```

Use **at least 4 distinct animation types** across slides: fade-up,
scale-in, slide-from-right, blur-in, rotate-in, etc. Vary transitions per
slide type (title = dramatic zoom, data slide = count-up, quote = typewriter
effect).

### Navigation

- **Keyboard**: Left/Right arrow keys, Space to advance
- **Click**: Left half of screen = prev, Right half = next
- **Progress bar**: thin bar at top or bottom showing progress
- **Slide counter**: e.g., "3 / 12" in corner
- **Optional**: swipe gesture support for mobile

```javascript
// Minimal navigation controller
let current = 0;
const slides = document.querySelectorAll('.slide');

function goTo(n) {
  slides[current].classList.remove('active');
  slides[current].classList.add('exit-left');
  setTimeout(() => slides[current].classList.remove('exit-left'), 700);
  current = (n + slides.length) % slides.length;
  slides[current].classList.add('active');
  updateProgress();
}

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ') goTo(current + 1);
  if (e.key === 'ArrowLeft') goTo(current - 1);
});

slides[0].classList.add('active');
```

### Background Techniques

Use at least one of these per slide (vary across deck):

- **Gradient mesh**: `background: radial-gradient(circle at 20% 80%, color1, transparent), radial-gradient(circle at 80% 20%, color2, transparent), base-color`
- **CSS Grid pattern**: repeating-linear-gradient for dot/line grids
- **SVG inline shapes**: decorative blobs, polygons, circles as positioned `<svg>` elements
- **Noise texture**: CSS `filter: url(#noise)` with inline SVG feTurbulence filter
- **Geometric accent**: large rotated rectangle or circle as pseudo-element
- **Diagonal split**: clip-path split creating two-tone background

### Content Quality

Every slide must have:

- A **strong headline** — not vague; specific and punchy
- **2–4 supporting points** max per slide — never wall-of-text
- **Visual hierarchy**: headline > subheadline > body > caption
- **One anchor visual element**: icon (Unicode/emoji rendered large), stat number, decorative shape, or quote callout

**Tone rules:**

- Titles: bold, declarative, active voice
- Body: concise, intelligent, no filler
- Stats: use real-looking, plausible numbers if none given
- Quotes: attribute to real relevant figures where appropriate

### Layout Variation

Never repeat the same layout. Rotate through:

1. **Full bleed text** — giant headline, minimal body, dramatic background
2. **Split layout** — content left, visual element right (or vice versa)
3. **Card grid** — 3–4 equal cards on one slide
4. **Big stat** — one massive number dominates the slide
5. **Quote callout** — large pull quote with attribution
6. **Timeline** — horizontal or vertical step flow
7. **Comparison** — two-column side-by-side
8. **Icon list** — each point has a large Unicode icon or emoji

### Shapes & Decorative Elements

Add atmosphere with positioned, layered decorative elements:

- Large semi-transparent circles/ovals: `border-radius: 50%; opacity: 0.08`
- Corner accent triangles via `clip-path: polygon(...)`
- Diagonal stripe overlays via repeating-linear-gradient
- Dotted grid: `background-image: radial-gradient(circle, var(--accent-1) 1px, transparent 1px); background-size: 30px 30px`
- Thin ruled lines: `border-top: 1px solid rgba(255,255,255,0.15)`

---

## Step 5 — Quality Checklist

Before outputting, verify:

- [ ] **Color contrast**: Text is always legible on its background (minimum 4.5:1 ratio feel)
- [ ] **No overlapping elements**: Every element has room to breathe
- [ ] **Consistent spacing**: Padding and gaps are rhythmic throughout
- [ ] **Fonts load**: Google Fonts `<link>` is in `<head>` BEFORE `<style>`
- [ ] **Slide fills viewport**: `.slide` should cover 100vw × 100vh
- [ ] **Animations don't clash**: Stagger timing prevents simultaneous chaos
- [ ] **Navigation works**: keyboard, click, counter, progress all functional
- [ ] **Content is substantive**: Each slide delivers real value, not placeholder text
- [ ] **Theme is cohesive**: Every slide feels like it belongs to the same design system
- [ ] **First slide is jaw-dropping**: The title slide must create immediate impact

---

## Step 6 — Output

Produce the artifact directly — do not explain it first. After outputting,
add a **single short line** like:

> "12 slides on [topic] — use arrow keys or click to navigate."

Do not explain the design choices unless asked.

---

## Reference Files

- `animation-recipes.md` — Ready-to-use CSS animation snippets for complex effects
- `theme-palettes.md` — Pre-built color systems for each topic category
- `layout-templates.md` — HTML layout scaffolds for each slide type

Read these if you need inspiration or exact code patterns during generation.
