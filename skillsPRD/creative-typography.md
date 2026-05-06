# Skill: Creative Typography & Styled Fonts Design

## Trigger Keywords
`typography`, `styled fonts`, `creative text`, `font design`, `text effects`, `gradient text`, `neon text`, `3D text`, `kinetic typography`, `animated text`, `font pairing`, `display font`, `hero text`, `text animation`, `lettering`

## Purpose
Generate visually striking typography-driven designs with creative text effects, proper font pairing, animated type, gradient/neon/3D effects, and responsive fluid typography.

---

## Dependencies

```json
{
  "devDependencies": {},
  "dependencies": {
    "@fontsource/inter": "^5.0.0",
    "@fontsource/playfair-display": "^5.0.0",
    "@fontsource/space-grotesk": "^5.0.0"
  }
}
```

**Optional (for advanced animations):**
- `gsap` — Professional-grade kinetic typography
- `framer-motion` — React-native spring animations

**Fontsource alternatives per style:**
- Modern/Clean: `@fontsource/inter`, `@fontsource/poppins`, `@fontsource/geist`
- Editorial/Luxury: `@fontsource/playfair-display`, `@fontsource/cormorant-garamond`
- Display/Bold: `@fontsource/space-grotesk`, `@fontsource/clash-display`
- Monospace/Tech: `@fontsource/jetbrains-mono`, `@fontsource/fira-code`

---

## Architecture

### File Structure
```
src/
├── App.tsx                    # Typography showcase / landing
├── components/
│   ├── GradientText.tsx       # Text with gradient fill
│   ├── NeonText.tsx           # Glowing neon effect
│   ├── ThreeDText.tsx         # 3D extruded text
│   ├── TypewriterText.tsx     # Typewriter animation
│   ├── SplitText.tsx          # Letter-by-letter animation
│   ├── StrokeText.tsx         # Outlined/stroke text
│   ├── MaskedText.tsx         # Image/video masked text
│   └── FluidHeading.tsx       # Responsive heading
├── styles/
│   ├── typography.css         # Font imports & type scale
│   ├── effects.css            # Text effect classes
│   └── animations.css         # Keyframe animations
└── fonts/
    └── (self-hosted woff2 files if needed)
```

---

## Font Loading & Setup

### Fontsource (Recommended for Vite)
```typescript
// main.tsx or App.tsx
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/900.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
```

### Google Fonts (Alternative)
```html
<!-- In index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&family=Playfair+Display:wght@700;900&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
```

### Variable Fonts
```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}

/* Usage */
.variable-weight {
  font-family: 'Inter', sans-serif;
  font-variation-settings: 'wght' 650;
}
```

---

## Typography Scale (Fluid)

```css
:root {
  /* Fluid type scale using clamp() */
  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm: clamp(0.875rem, 0.8rem + 0.35vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-lg: clamp(1.125rem, 1rem + 0.6vw, 1.375rem);
  --text-xl: clamp(1.25rem, 1rem + 1.25vw, 1.75rem);
  --text-2xl: clamp(1.5rem, 1rem + 2.5vw, 2.5rem);
  --text-3xl: clamp(2rem, 1.5rem + 3vw, 3.5rem);
  --text-4xl: clamp(2.5rem, 1.5rem + 5vw, 5rem);
  --text-5xl: clamp(3rem, 2rem + 6vw, 7rem);
  --text-hero: clamp(4rem, 2rem + 10vw, 12rem);

  /* Font families */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-display: 'Space Grotesk', 'Inter', sans-serif;
  --font-serif: 'Playfair Display', 'Georgia', serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Line heights */
  --leading-tight: 0.9;
  --leading-snug: 1.1;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;

  /* Letter spacing */
  --tracking-tight: -0.04em;
  --tracking-snug: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.05em;
  --tracking-wider: 0.1em;
}
```

---

## Text Effects

### 1. Gradient Text
```css
.gradient-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% 200%;
}

/* Animated gradient */
.gradient-text-animated {
  background: linear-gradient(270deg, #667eea, #764ba2, #f093fb, #667eea);
  background-size: 300% 300%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-flow 4s ease infinite;
}

@keyframes gradient-flow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

### 2. Neon Glow Text
```css
.neon-text {
  color: #fff;
  text-shadow:
    0 0 5px #fff,
    0 0 10px #fff,
    0 0 20px #007cff,
    0 0 40px #007cff,
    0 0 60px #007cff;
  font-family: var(--font-display);
  font-weight: 700;
}

/* Pulsing neon */
.neon-pulse {
  animation: neon-flicker 2s ease-in-out infinite alternate;
}

@keyframes neon-flicker {
  0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% {
    text-shadow:
      0 0 5px #fff,
      0 0 10px #fff,
      0 0 20px #ff00de,
      0 0 40px #ff00de,
      0 0 60px #ff00de;
  }
  20%, 24%, 55% {
    text-shadow: none;
  }
}

/* Colored neon variants */
.neon-blue { --neon-color: #00f3ff; }
.neon-pink { --neon-color: #ff00de; }
.neon-green { --neon-color: #39ff14; }
.neon-orange { --neon-color: #ff6600; }
```

### 3. 3D Extruded Text
```css
.text-3d {
  color: #f5f5f5;
  text-shadow:
    0 1px 0 #ccc,
    0 2px 0 #c9c9c9,
    0 3px 0 #bbb,
    0 4px 0 #b9b9b9,
    0 5px 0 #aaa,
    0 6px 1px rgba(0, 0, 0, 0.1),
    0 0 5px rgba(0, 0, 0, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.3),
    0 3px 5px rgba(0, 0, 0, 0.2),
    0 5px 10px rgba(0, 0, 0, 0.25),
    0 10px 10px rgba(0, 0, 0, 0.2),
    0 20px 20px rgba(0, 0, 0, 0.15);
  font-weight: 900;
  font-size: var(--text-5xl);
}

/* Simpler 3D (lighter) */
.text-3d-simple {
  text-shadow:
    2px 2px 0 #6366f1,
    4px 4px 0 #4f46e5;
  font-weight: 900;
}
```

### 4. Stroke/Outline Text
```css
.text-stroke {
  -webkit-text-stroke: 2px currentColor;
  -webkit-text-fill-color: transparent;
  font-weight: 900;
  font-size: var(--text-5xl);
}

/* Stroke with gradient */
.text-stroke-gradient {
  -webkit-text-stroke: 2px transparent;
  background: linear-gradient(135deg, #667eea, #764ba2);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 2px #667eea;
}

/* Hover fill effect */
.text-stroke-fill {
  -webkit-text-stroke: 2px #667eea;
  -webkit-text-fill-color: transparent;
  transition: -webkit-text-fill-color 0.3s;
}

.text-stroke-fill:hover {
  -webkit-text-fill-color: #667eea;
}
```

### 5. Image/Video Masked Text
```css
.text-masked {
  background-image: url('/texture.jpg');
  background-size: cover;
  background-position: center;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 900;
  font-size: var(--text-hero);
}

/* Video masked text */
.text-video-mask {
  mix-blend-mode: screen; /* or multiply */
  background: black;
  color: white;
  font-weight: 900;
}
```

---

## Animation Patterns

### Typewriter Effect
```css
.typewriter {
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  border-right: 3px solid;
  animation:
    typing 3.5s steps(40, end),
    blink-caret 0.75s step-end infinite;
}

@keyframes typing {
  from { width: 0; }
  to { width: 100%; }
}

@keyframes blink-caret {
  from, to { border-color: transparent; }
  50% { border-color: currentColor; }
}
```

### Letter-by-Letter Reveal (React)
```tsx
import { motion } from 'framer-motion';

export function SplitText({ text, className = '' }: { text: string; className?: string }) {
  const letters = text.split('');

  return (
    <span className={className} aria-label={text}>
      {letters.map((letter, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20, rotateX: 90 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{
            delay: i * 0.03,
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ display: 'inline-block' }}
          aria-hidden="true"
        >
          {letter === ' ' ? '\u00A0' : letter}
        </motion.span>
      ))}
    </span>
  );
}
```

### Word-by-Word Slide Up
```tsx
export function SlideUpText({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');

  return (
    <span className={className}>
      {words.map((word, i) => (
        <span key={i} style={{ display: 'inline-block', overflow: 'hidden' }}>
          <motion.span
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{
              delay: i * 0.08,
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{ display: 'inline-block' }}
          >
            {word}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  );
}
```

### Scroll-Triggered Text Reveal
```tsx
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export function ScrollRevealText({ children, className = '' }: { children: string; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-20% 0px' });

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
      animate={isInView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.span>
  );
}
```

---

## Font Pairing Reference

### Proven Combinations

| Style | Display Font | Body Font | Use Case |
|-------|-------------|-----------|----------|
| **Modern** | Space Grotesk 700 | Inter 400 | SaaS, Tech |
| **Editorial** | Playfair Display 900 | Inter 400 | Magazine, Blog |
| **Luxury** | Cormorant Garamond 600 | Inter 300 | Fashion, Jewelry |
| **Playful** | Poppins 800 | Nunito 400 | Kids, Creative |
| **Corporate** | Inter 800 | Inter 400 | Business, Finance |
| **Brutalist** | Space Grotesk 700 | JetBrains Mono 400 | Art, Agency |
| **Elegant** | Playfair Display 700 | Lora 400 | Wedding, Events |

### Pairing Rules
1. **Contrast in weight**: Bold display (700-900) + Light body (300-400)
2. **Contrast in style**: Serif display + Sans body (or vice versa)
3. **Same x-height**: Fonts with matching x-heights look harmonious
4. **Max 2-3 fonts per project** — display, body, and optionally mono
5. **Similar proportions**: Match width characteristics

---

## Responsive Typography Tips

```css
/* Hero heading that scales dramatically */
.hero-heading {
  font-family: var(--font-display);
  font-size: var(--text-hero);
  font-weight: 900;
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  text-wrap: balance;  /* Prevent awkward wraps */
}

/* Constrain line length for readability */
.body-text {
  max-width: 65ch;
  font-size: var(--text-base);
  line-height: var(--leading-relaxed);
}

/* Negative letter-spacing at large sizes */
.large-text {
  letter-spacing: clamp(-0.05em, -0.02em - 0.5vw, -0.08em);
}
```

---

## Critical Rules

1. **Import only needed font weights** — each weight adds ~20-50KB; import max 4 weights per font
2. **Use `font-display: swap`** — prevents invisible text during font load (FOIT)
3. **Preload critical fonts** — `<link rel="preload" as="font">` for above-fold fonts
4. **WOFF2 format only** — best compression; all modern browsers support it
5. **`background-clip: text` needs `-webkit-` prefix** — still required for Safari
6. **Gradient text needs explicit `background-size`** — prevents clipping on multiline
7. **Never use `font-weight: bold` on variable fonts** — use specific numeric weight
8. **`text-wrap: balance`** — use on headings to prevent orphaned words
9. **Accessibility**: Never rely on color/effects alone for meaning; ensure contrast
10. **Performance**: Limit simultaneous text animations to 3-5 elements max
11. **Fallback fonts**: Always include system-ui fallback stack for progressive loading
12. **Test on Windows**: Font rendering differs (ClearType); check weight clarity

---

## Complete Example: Typography Hero Section

```tsx
import { motion } from 'framer-motion';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';

export function TypographyHero() {
  return (
    <section className="hero-section">
      <div className="hero-content">
        <motion.p
          className="hero-eyebrow"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Welcome to the future
        </motion.p>

        <h1 className="hero-heading gradient-text-animated">
          <SplitText text="Create Something" />
          <br />
          <span className="text-stroke">Extraordinary</span>
        </h1>

        <motion.p
          className="hero-description"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          Beautiful typography that captivates, informs, and inspires.
        </motion.p>
      </div>
    </section>
  );
}
```

```css
.hero-section {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
  background: #0a0a23;
}

.hero-eyebrow {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: #667eea;
  margin-bottom: 1rem;
}

.hero-heading {
  font-family: var(--font-display);
  font-size: var(--text-hero);
  font-weight: 900;
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  margin-bottom: 1.5rem;
}

.hero-description {
  font-family: var(--font-sans);
  font-size: var(--text-xl);
  color: #94a3b8;
  max-width: 50ch;
  line-height: var(--leading-normal);
}
```
