---
name: magazine-flipbook
description: "Build a realistic web magazine/flipbook reader with page-flip physics, page curl, shadows, optional sound, and keyboard/touch navigation. Triggers on: flipbook, digital magazine, magazine reader, page flip, page turn, page curl, ebook reader, catalog viewer, brochure flip, turn.js, book reader, flip animation."
---

# Magazine Flipbook Skill

## Section 1: Role

You are a professional digital magazine designer and interactive flipbook developer with expertise in web animation, page physics simulation, and immersive reading experiences. Your task is to create a realistic web-based magazine reader where pages flip smoothly with natural motion, visible page curl, and optional page-flip sounds. You think like a premium magazine publisher: realism first, performance second, elegance always.

---

## Section 2: Objective

Create an elegant, immersive, and realistic magazine browsing experience on the web. The user should feel like they are physically holding and flipping through a premium printed magazine.

The experience must deliver:
- Smooth, natural page turning with realistic paper physics
- Visible page curl animation that follows the cursor or finger
- Realistic drop shadows and depth during flips
- Optional page-flip sound effects
- Mouse drag, touch swipe, and keyboard navigation
- Mobile and desktop responsiveness
- High-quality reading and visual presentation
- Graceful fallback when sound is blocked or motion is reduced

---

## Section 3: Inputs

Gather or infer the following before generating the flipbook. State assumptions when inputs are missing.

**Content inputs:**
- Magazine title
- Cover image (URL or description)
- Page count
- Page images or PDF source
- Single-page or double-page spread preference
- Language direction: LTR or RTL

**Experience inputs:**
- Brand style or magazine category (editorial, lifestyle, news, corporate, fashion, etc.)
- Desired background style (dark studio, light paper, custom color)
- Sound on/off preference
- Thumbnail navigation required or not
- Zoom mode required or not
- Table of contents required or not
- Autoplay / auto-flip required or not

**Technical inputs:**
- Target environment: browser only, embedded, or responsive app
- Hosting: static files or served via framework
- Performance constraints: large page count, low-end device support

---

## Section 4: Visual Style

The flipbook must look premium, polished, and physically believable at all times.

**Required visual elements:**
- Elegant, non-distracting background (dark felt, light linen, gradient)
- Soft drop shadow under the entire book
- Page-level shadow that intensifies at the fold point during flip
- Subtle page edge highlight (the slight brightness of a paper edge)
- Clean cover presentation with centered or framed book
- Polished controls that recede into the background
- Readable text overlays and page numbers
- Professional spacing around the book body

The design must feel like a real magazine viewer, not an image slider or basic carousel.

---

## Section 5: Page Flip Behavior

The page flip motion is the core of the experience. It must feel physical and believable.

**Motion requirements:**
- Drag start: corner lifts and begins to curl toward the cursor/finger position
- Drag move: curl angle updates dynamically per frame, shadow intensifies near fold
- Drag release: if past the threshold → complete flip with easing; if below threshold → snap back with easing
- Click navigation: complete flip animation plays from corner to spine
- Keyboard navigation: same animation triggered programmatically
- No abrupt snapping at any point — all motion must have easing

**Page physics during flip:**
- The lifted corner follows the cursor position
- Curl angle is computed from cursor X distance relative to book spine
- The back of the page reveals at the correct angle (front face fades out, back face fades in)
- Page shadow opacity increases as fold angle increases
- At maximum fold the page appears at its thinnest (edge-on)
- The newly revealed page slides in naturally from the spine

**Easing curves:**
- Drag-release completion: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out)
- Snap-back: `cubic-bezier(0.55, 0.055, 0.675, 0.19)` (ease-in)
- Auto-flip: `cubic-bezier(0.4, 0, 0.2, 1)` (standard material)

---

## Section 6: Page Physics

This section defines the visual realism rules that make the flipbook feel like real paper.

**During every flip, enforce these physics:**

| Physics rule | Implementation |
|---|---|
| Corner follows cursor | Compute angle from cursor X to spine center on mousemove |
| Curl angle is dynamic | Update `rotateY` per frame via `requestAnimationFrame` |
| Shadow intensifies at fold | Map fold angle 0°→90° to shadow opacity 0.05→0.35 |
| Back side is slightly darker | Apply `brightness(0.88)` to the back face of the flipping page |
| Page attached to spine | Rotation origin is always the spine edge (`transform-origin: left center` or `right center`) |
| Paper resistance | When drag speed slows, curl angle temporarily overshoots then corrects |
| Thickness illusion | Thin offset layer (`2px`) rendered at the spine to simulate page stack depth |
| Perspective depth | Wrap in `perspective: 2000px` container so far edge curves realistically |

**The spine must remain visually fixed.** The book should never appear to shift horizontally during a flip.

---

## Section 7: Sound Design

When a page flip completes, play a subtle page-turn sound.

**Rules:**
- Preload the audio asset on page load (do not lazy-load sound)
- Sound plays once per completed flip — not during drag, not on snap-back
- Trigger only after the flip threshold is crossed, not at drag start
- Volume: 0.3–0.5 max — never jarring
- Reset `currentTime = 0` before each play to allow rapid sequential flips
- Provide a mute/unmute toggle that persists during the session
- If `AudioContext` or autoplay is blocked by the browser, catch the error gracefully and continue without sound
- Never let a blocked sound error break the flip animation

```javascript
const flipSound = new Audio('/sounds/page-flip.mp3');
flipSound.volume = 0.4;
flipSound.preload = 'auto';

function playFlipSound(isMuted) {
  if (isMuted) return;
  flipSound.currentTime = 0;
  flipSound.play().catch(() => {}); // silently ignore blocked autoplay
}
```

---

## Section 8: Layout Modes

Support these reading mode configurations. Select the appropriate default based on the magazine type and screen size.

| Mode | Description | Best for |
|---|---|---|
| **Single-page view** | One page fills the reader area | Mobile, portrait, simple magazines |
| **Double-page spread** | Two pages side by side | Desktop, editorial, magazine spreads |
| **Cover view** | First page displayed as standalone cover | Book-like entry experience |
| **Centered reading view** | Page centered with large margins, focus mode | Long-form editorial |
| **Full-screen mode** | Reader fills the viewport, controls hidden | Immersive reading |
| **Thumbnail strip** | Row of small page thumbnails for navigation | Multi-page magazines |
| **Table of contents** | Chapter/section links jump to page | Structured publications |

**Special pages:**
- Page 1 (cover): Rendered as a single page even in double-spread mode
- Center spread: Allow pages to span both panels as one connected image
- Last page (back cover): Rendered as single page to complete the book metaphor

---

## Section 9: Controls and Navigation

Controls must be minimal, modern, and non-intrusive. They should support the reading experience, not interrupt it.

**Required controls:**
- Previous page button
- Next page button
- First page / Last page jump
- Page number display: `current / total`
- Fullscreen toggle
- Sound mute/unmute toggle
- Thumbnail panel toggle

**Optional controls (include when relevant):**
- Zoom in / Zoom out (step-based, not pinch-only)
- Download button (if allowed by content owner)
- Table of contents toggle
- Auto-flip toggle with speed control
- Share / embed button

**Control UX rules:**
- Controls should fade in on hover and fade out after 2.5 seconds of inactivity
- On mobile, controls remain visible or appear on tap
- Active state and focus state must always be visible (accessibility)
- Controls must never overlap or obscure the page being read
- Keyboard shortcuts: `←` / `→` for navigation, `F` for fullscreen, `M` for mute

---

## Section 10: Responsive Behavior

The flipbook must adapt gracefully to every screen size.

| Breakpoint | Behavior |
|---|---|
| Desktop (≥1024px) | Double-page spread default, full controls visible |
| Tablet (768–1023px) | Single or double spread based on orientation |
| Mobile portrait (< 768px) | Single-page view, swipe navigation, compact controls |
| Mobile landscape | Auto-switch to double-page if width allows |

**Mobile-specific rules:**
- Touch swipe: natural resistance, same physics as drag-flip
- Pinch-to-zoom: enabled by default on mobile
- Tap left edge: go to previous page; tap right edge: go to next page
- Buttons sized minimum `44×44px` touch target
- No hover states relied upon for core interaction
- Layout must not distort or overflow on small screens

---

## Section 11: Performance Rules

The flipbook must maintain smooth 60fps animation at all times.

**Architecture rules:**
- Only render visible pages plus immediate neighbors (current ±1 spread)
- Lazy load all other page images as the reader approaches them
- Never trigger layout recalculations during animation — use `transform` and `opacity` only
- Use `will-change: transform` on the flipping page element only (remove after flip completes)
- Use `requestAnimationFrame` for all drag-driven animation updates
- Preload the next page image before the user reaches it
- Avoid replacing DOM nodes during flips — toggle visibility instead
- Use image compression: WebP at 85% quality preferred

```javascript
// Only GPU-safe properties in the animation loop
requestAnimationFrame(() => {
  flippingPage.style.transform = `perspective(2000px) rotateY(${angle}deg)`;
  shadowLayer.style.opacity = Math.min(angle / 90, 1) * 0.35;
});
```

**Fallback for slow devices:**
- Detect low-end device via `navigator.hardwareConcurrency < 4` or `connection.effectiveType === '2g'`
- On low-end: disable curl animation, use a simple slide transition instead
- Always preserve navigation functionality regardless of animation capability

---

## Section 12: Accessibility

The magazine must remain usable without mouse, touch, or sound.

| Requirement | Implementation |
|---|---|
| Keyboard navigation | `←` `→` arrows turn pages; `Tab` reaches all controls |
| Focus states | All interactive elements have visible `:focus` outline |
| ARIA labels | All buttons have `aria-label`; page count announced via `aria-live` |
| Alt text | All page images have descriptive `alt` attributes |
| Reduced motion | Respect `prefers-reduced-motion`: replace flip with crossfade |
| Sound mute | Always provide mute option; sound never auto-plays without user interaction |
| Contrast | All control overlays meet WCAG AA contrast ratio |
| Screen reader | Current page and total announced on each turn |

```javascript
// Reduced motion fallback
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const flipDuration = prefersReducedMotion ? 0 : 600;
```

---

## Section 13: Premium Effects

Apply these effects when the magazine style warrants them. Never apply all at once.

| Effect | When to use |
|---|---|
| Paper texture overlay | Fashion, lifestyle, artisan, editorial magazines |
| Soft page shadow during flip | All implementations — required for realism |
| Cover shine / specular highlight | Premium, luxury, fashion covers |
| Depth layering (z-index stack) | Always — creates the stacked pages illusion |
| Background blur under book | Studio-style dark backgrounds |
| Page edge gradient highlight | High-end productions to simulate paper reflectance |
| Realistic page curl (SVG clip-path) | When CSS rotateY alone is insufficient |
| Hover preview — corner lift | Desktop: slight corner lift on mouse enter |
| Chapter separator pages | Structured publications with clear sections |
| Animated opening sequence | Launch: cover slides in from center, book opens |

Use CSS `filter`, `box-shadow`, and `background-image` gradients for most effects. Reserve SVG clip-path for high-fidelity curl shapes only.

---

## Section 14: Motion Design Rules

Every movement in the flipbook must follow these rules without exception.

- Use smooth easing curves — never `linear` for page motion
- Simulate paper resistance: slight overshoot on fast drags, natural settle
- Shadow depth must increase proportionally with fold angle
- Pages must feel attached to the spine — rotation origin never drifts
- Maintain 60fps — degrade gracefully rather than drop frames
- Use `transform` only for animation — never `left`, `width`, `top`
- Hardware acceleration: apply `translateZ(0)` to animated layers
- Duration guidelines: full flip = 500–700ms; snap-back = 300–400ms; hover lift = 150ms

---

## Section 15: Validation and Fail-Safe Rules

Before delivering any flipbook implementation, verify all of the following.

**Input validation:**
- [ ] Page count is known or defaulted to a sample set
- [ ] Cover image is available or a placeholder is used
- [ ] Navigation mode (single/double) is confirmed
- [ ] Sound preference is stated

**Implementation validation:**
- [ ] Page flip completes on mouse drag, click, and keyboard
- [ ] Sound plays only after confirmed user interaction
- [ ] Snap-back works when drag is released below threshold
- [ ] Reduced-motion fallback is implemented
- [ ] Mobile swipe works correctly
- [ ] Controls are accessible via keyboard
- [ ] No layout shift occurs during animation
- [ ] Performance degrades gracefully on slow devices

**If inputs are missing:**
- Default to: double-page spread, dark studio background, 10-page sample, sound off
- State all defaults explicitly at the top of the output

---

## Section 16: Output Format

For every flipbook project, provide the following structured output:

1. **Flipbook brief** — title, page count, mode, style direction
2. **Visual style plan** — background, typography, shadow treatment, premium effects
3. **Page flip architecture** — layout engine, physics rules, easing curves used
4. **Animation specification** — drag behavior, release behavior, snap-back, shadow interpolation
5. **Sound specification** — asset, volume, trigger point, mute behavior
6. **Navigation plan** — controls included, keyboard shortcuts, thumbnail mode
7. **Responsive plan** — breakpoint behavior, mobile interaction model
8. **Accessibility notes** — keyboard, ARIA, reduced-motion handling
9. **Performance strategy** — lazy loading, rendering window, fallback
10. **Premium effects applied** — list only effects actually used and why
11. **Implementation recommendation** — which tech stack section to use and why

---

## Section 17: What to Avoid

Never do the following in any flipbook implementation:

- Do not use `left` or `top` in animation — use `transform` only
- Do not snap pages without easing
- Do not play sound on snap-back (only on successful flip)
- Do not block the reading view with controls or overlays
- Do not make sound too loud, repetitive, or fake-sounding
- Do not render all pages simultaneously — causes memory/performance issues
- Do not animate using `setInterval` — always use `requestAnimationFrame`
- Do not ignore the spine: the rotation origin must stay fixed at the spine edge
- Do not use `rotateY` without `perspective` on the parent — the flip will look flat
- Do not ignore mobile: swipe must feel as natural as desktop drag
- Do not break navigation if the animation is skipped or interrupted

---

## Section 18: Designer Thinking Framework

Think like a premium magazine publisher in this order:

1. **Physical believability first** — does every part of the flip feel like real paper?
2. **Reading clarity** — does the layout support reading at every stage of the flip?
3. **Sound as enhancement** — does the sound add realism without drawing attention to itself?
4. **Controls as servants** — do the controls disappear when not needed?
5. **Performance as respect** — is the experience smooth even on a mid-range phone?

The most important part of the flipbook is the page-flip engine. Getting the physics right is what separates a magazine reader from an image carousel.

---

## Section 19: Recommended Tech Stack

Use the following stack for implementing magazine flipbook projects. This ensures reliable, performant, and maintainable results.

### Preferred Frontend
- **HTML5** — semantic structure, canvas fallback support
- **CSS3** — `transform`, `perspective`, `backface-visibility`, `will-change`
- **JavaScript (ES6+)** — `requestAnimationFrame`, pointer/touch events, `IntersectionObserver`

### Optional Frameworks
- **React** — for flipbook as a configurable component or SaaS tool
- **Next.js** — for full magazine apps with SSR, PDF pipeline, and CDN delivery
- **Vue** — for lightweight standalone flipbook embeds

### Animation Libraries
- **GSAP** — recommended for production-grade flip timelines with fine easing control
- **Framer Motion** — for React-based flipbooks with spring physics
- **Turn.js** — purpose-built jQuery flipbook library (rapid prototyping)
- **Three.js** — optional for 3D paper curl effect with real mesh deformation (advanced only)

### Sound Handling
- **Howler.js** — preferred: handles autoplay unlock, sprite support, cross-browser audio
- **HTML5 Audio API** — sufficient for single flip sound with manual unlock handling

### Styling
- **TailwindCSS** — rapid UI layout for controls and thumbnails
- **SCSS** — preferred for flipbook core styles (variables for timing, perspective, shadow)
- **CSS Modules** — for React/Vue component-scoped page styles

### Performance
- `IntersectionObserver` for lazy loading page images
- `will-change: transform` on flipping page element only (applied/removed per flip)
- `requestAnimationFrame` for all animation loops — never `setInterval`
- `transform` and `opacity` only in animation — never layout-triggering properties
- WebP image format at 85% quality for page assets
- `ImageBitmap` preloading for upcoming pages

---

## Section 20: Reusable Code Snippets

Store and reuse these verified patterns. Do not rewrite from scratch when a snippet exists.

### Core Page Flip (CSS + JS)

```css
/* Flipbook container */
.flipbook {
  perspective: 2000px;
  position: relative;
}

/* Page wrapper */
.page {
  transform-style: preserve-3d;
  transform-origin: left center; /* or right center for left-to-right flip */
  transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: absolute;
  width: 100%; height: 100%;
}

/* Front and back faces */
.page-front,
.page-back {
  position: absolute; inset: 0;
  backface-visibility: hidden;
}

.page-back {
  transform: rotateY(180deg);
  filter: brightness(0.88); /* back of page is slightly darker */
}

/* Flipped state */
.page.flipped {
  transform: rotateY(-180deg);
}
```

### requestAnimationFrame Drag Loop

```javascript
let isDragging = false;
let currentAngle = 0;
let targetAngle = 0;
let animFrameId = null;

function onPointerMove(e) {
  if (!isDragging) return;
  const spineX = getSpineX(); // center of book
  const dx = e.clientX - spineX;
  targetAngle = Math.max(-180, Math.min(0, (dx / spineX) * -180));
}

function animationLoop() {
  currentAngle += (targetAngle - currentAngle) * 0.12; // lerp for smooth follow
  flippingPage.style.transform =
    `perspective(2000px) rotateY(${currentAngle}deg)`;
  updateShadow(currentAngle);
  animFrameId = requestAnimationFrame(animationLoop);
}

function startDrag() {
  isDragging = true;
  animFrameId = requestAnimationFrame(animationLoop);
}

function endDrag() {
  isDragging = false;
  cancelAnimationFrame(animFrameId);
  const threshold = -90;
  targetAngle = currentAngle < threshold ? -180 : 0;
  completeFl ip(targetAngle);
}
```

### Dynamic Shadow Interpolation

```javascript
function updateShadow(angle) {
  // angle: 0 = flat, -90 = perpendicular (max fold), -180 = complete
  const foldProgress = Math.abs(angle) / 180; // 0 → 1
  const shadowOpacity = foldProgress * 0.35;
  const shadowWidth = foldProgress * 40; // px spread
  shadowLayer.style.opacity = shadowOpacity;
  shadowLayer.style.width = `${shadowWidth}px`;
}
```

### Sound System (Howler.js)

```javascript
import { Howl } from 'howler';

const flipSound = new Howl({
  src: ['/sounds/page-flip.mp3', '/sounds/page-flip.ogg'],
  volume: 0.4,
  preload: true,
});

let isMuted = false;

function playFlipSound() {
  if (isMuted) return;
  flipSound.stop(); // prevent overlap
  flipSound.play();
}

function toggleMute() {
  isMuted = !isMuted;
  muteButton.setAttribute('aria-pressed', isMuted);
}
```

### Lazy Page Loading (IntersectionObserver)

```javascript
const pageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target.querySelector('img[data-src]');
      if (img) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
      pageObserver.unobserve(entry.target);
    }
  });
}, { rootMargin: '200px' }); // preload 200px before visible

document.querySelectorAll('.page').forEach(p => pageObserver.observe(p));
```

### Reduced Motion Fallback

```javascript
const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function flipPage(direction) {
  if (prefersReducedMotion) {
    // Simple crossfade instead of physical flip
    currentPage.style.opacity = '0';
    nextPage.style.opacity = '1';
    updatePageNumber(direction);
  } else {
    runPhysicsFlip(direction);
  }
}
```

### Keyboard Navigation

```javascript
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowRight': flipPage('next'); break;
    case 'ArrowLeft':  flipPage('prev'); break;
    case 'f':
    case 'F':          toggleFullscreen(); break;
    case 'm':
    case 'M':          toggleMute(); break;
  }
});
```

### Touch Swipe (Pointer Events)

```javascript
let touchStartX = 0;

document.addEventListener('pointerdown', (e) => {
  touchStartX = e.clientX;
});

document.addEventListener('pointerup', (e) => {
  const dx = e.clientX - touchStartX;
  const swipeThreshold = 50; // px
  if (dx < -swipeThreshold) flipPage('next');
  if (dx >  swipeThreshold) flipPage('prev');
});
```

---

## Section 21: Component Architecture

When building a magazine flipbook as a web application, use this component structure for consistency and maintainability.

### Main Components

| Component | Responsibility |
|---|---|
| `FlipbookContainer` | Book root: perspective, dimensions, dark background |
| `MagazinePage` | Single page: front + back faces, flip state |
| `PageShadow` | Dynamic shadow layer that intensifies during fold |
| `PageCurlEffect` | SVG or gradient-based curl detail at the fold point |
| `SpineLayer` | Fixed spine element that anchors all rotation |
| `PageStack` | Visual illusion of page thickness at book edges |
| `NavigationControls` | Prev/next/first/last buttons, keyboard handlers |
| `PageCounter` | Current page / total display with ARIA live region |
| `ThumbnailSidebar` | Scrollable thumbnail strip for direct page jump |
| `SoundController` | Audio preload, play, mute toggle |
| `ZoomController` | Step zoom in/out with min/max limits |
| `FullscreenController` | Fullscreen API handler with fallback |
| `TableOfContents` | Chapter list with page jump targets |
| `CoverPage` | Special single-page treatment for page 1 and last |

### State Management

```javascript
const flipbookState = {
  // Navigation
  currentPage: 0,           // 0-indexed
  totalPages: 0,
  spreadMode: 'double',     // 'single' | 'double'
  isFlipping: false,
  flipDirection: null,      // 'next' | 'prev'

  // Interaction
  isDragging: false,
  dragStartX: 0,
  currentFoldAngle: 0,

  // UI
  isFullscreen: false,
  isThumbnailOpen: false,
  isTOCOpen: false,
  zoomLevel: 1.0,           // 0.5 → 2.0

  // Sound
  soundEnabled: true,
  soundLoaded: false,

  // Performance
  reducedMotion: false,
  lowEndDevice: false,
};
```

### Event Contracts

```javascript
// Core navigation
function goToPage(index) { /* validate, animate, update state */ }
function flipNext() { goToPage(flipbookState.currentPage + spreadStep()); }
function flipPrev() { goToPage(flipbookState.currentPage - spreadStep()); }

// Drag interaction
function onDragStart(e) { /* record start X, set isDragging, start rAF loop */ }
function onDragMove(e)  { /* compute angle, apply transform */ }
function onDragEnd(e)   { /* check threshold, complete or snap back */ }

// Sound
function onFlipComplete(direction) {
  playFlipSound();
  announcePageChange(); // ARIA live region
}

// Utility
function spreadStep() {
  return flipbookState.spreadMode === 'double' ? 2 : 1;
}
```

### File Structure

```
/src
  /components
    FlipbookContainer.jsx
    MagazinePage.jsx
    PageShadow.jsx
    PageCurlEffect.jsx
    SpineLayer.jsx
    NavigationControls.jsx
    PageCounter.jsx
    ThumbnailSidebar.jsx
    SoundController.jsx
    ZoomController.jsx
    FullscreenController.jsx
    TableOfContents.jsx
  /hooks
    useFlipAnimation.js      ← rAF loop, drag handlers
    usePageLoader.js         ← lazy loading, preloading
    useSoundSystem.js        ← Howler.js wrapper
    useKeyboardNav.js        ← keyboard shortcut bindings
    useReducedMotion.js      ← prefers-reduced-motion hook
  /utils
    flipPhysics.js           ← angle calculation, easing, shadow mapping
    deviceDetect.js          ← low-end device detection
    ariaAnnouncer.js         ← screen reader live region
  /assets
    /sounds
      page-flip.mp3
      page-flip.ogg
  /styles
    flipbook.scss
    page.scss
    controls.scss
    responsive.scss
```

---

## Section 22: Reference Implementation Patterns

These are the canonical approaches for each core system. When in doubt, use these.

### Page Flip: CSS Transform + rAF
```
Approach: CSS perspective on container + transform rotateY on page
Origin:   Left or right edge of page (spine side)
Drive:    requestAnimationFrame with lerp smoothing
Easing:   cubic-bezier(0.25, 0.46, 0.45, 0.94) for completion
Fallback: Simple opacity crossfade when reduced-motion is detected
```

### Page Shadow: Dynamic Opacity
```
Approach: Absolutely positioned dark gradient overlay on each page
Drive:    Opacity mapped from fold angle: Math.abs(angle)/180 * 0.35
Timing:   Updated every rAF frame during drag; fades out on completion
```

### Depth / Page Stack Illusion
```
Approach: Multiple thin div layers at the spine, stacked with z-index
Color:    Alternating very-light-gray and white layers
Count:    5–8 layers visible (do not render per actual page count)
Purpose:  Simulates the thickness of unread pages
```

### Sound Trigger
```
When:  After flip threshold crossed (-90deg or drag-release to completion
Not:   On drag start, snap-back, or thumbnail click navigation
Once:  Reset currentTime=0 to allow rapid sequential flips
Guard: Try/catch on .play() to handle browser autoplay policy
```

### Lazy Loading
```
Strategy: IntersectionObserver with 200px rootMargin
Window:   Always keep current spread + 1 spread ahead loaded
Trigger:  Load next page's image when user begins a flip
Preload:  On component mount, load covers and first spread only
```

### Keyboard Accessibility
```
ArrowRight / ArrowLeft → flipNext / flipPrev
Home / End            → goToPage(0) / goToPage(last)
F                     → toggleFullscreen
M                     → toggleMute
Tab                   → cycles through all visible controls
Escape                → close fullscreen / close sidebar panels
```

---

## Section 23: 2026 Animation Best Practices (Research-Updated)

*Sources: Chrome Developer Docs (Scroll-Driven Animations), web.dev (High-Performance CSS Animations), MDN backface-visibility, CSS Individual Transform Properties.*

---

### 23.1 Composite-Stage Rendering — The Cardinal Rule

> **Only animate `transform` and `opacity` in the animation hot path.** Any other property (left, top, width, height, background-color) triggers layout or paint recalculation, which kills 60fps.

From web.dev: *"Restrict animations to `opacity` and `transform` to keep animations on the compositing stage."*

```css
/* ✅ CORRECT — compositor only, runs off main thread */
.flipping-page { transition: transform 0.6s ease-out; }

/* ❌ WRONG — triggers layout reflow every frame */
.flipping-page { transition: left 0.6s ease-out; }
```

---

### 23.2 Individual Transform Properties (All Major Browsers)

Use `translate`, `rotate`, `scale` as individual properties to animate each axis independently without overwriting the full `transform` shorthand. They run on the compositor identically to `transform`.

```css
/* Hover lift + flip — independent animations, no overwrite conflict */
.page {
  transition: translate 150ms ease, rotate 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.page:hover  { translate: 0 -2px; }
.page.flip   { rotate: y -180deg; }
```

**Fixed application order** (declaration order does not matter):
1. `translate` (outermost)
2. `rotate`
3. `scale` (innermost)

---

### 23.3 Web Animations API (WAAPI) for Programmatic Flips

For click/keyboard-triggered flips (no drag), use `element.animate()` over CSS transitions. Benefits: cancellable, reversible, Promise-based, exact control.

```javascript
async function flipPageWAAPI(page, direction) {
  const endAngle = direction === 'next' ? -180 : 180;
  const anim = page.animate([
    { transform: 'perspective(2000px) rotateY(0deg)' },
    { transform: `perspective(2000px) rotateY(${endAngle}deg)` }
  ], {
    duration: 620,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    fill: 'forwards'
  });
  await anim.finished;
  // safe to update DOM state after this
}
```

---

### 23.4 Pointer Capture API for Reliable Drag

When dragging quickly, the pointer exits the page element. Use pointer capture so all events continue to fire on the element regardless:

```javascript
page.addEventListener('pointerdown', (e) => {
  page.setPointerCapture(e.pointerId); // route all future events here
  startDrag(e);
});
page.addEventListener('pointermove', onDragMove);
page.addEventListener('pointerup', endDrag);
page.addEventListener('pointercancel', endDrag); // system interruption guard
```

---

### 23.5 `will-change` — Apply Per-Flip, Not Globally

From web.dev: *"Apply `will-change` using JavaScript when a change is likely to happen. Remove the property when the change has stopped."* Overusing it can hurt performance by consuming GPU memory.

```javascript
function startFlip(page) {
  page.style.willChange = 'transform'; // promote just before animation
  runFlipAnimation(page);
}
function endFlip(page) {
  page.addEventListener('transitionend', () => {
    page.style.willChange = 'auto'; // release GPU layer immediately after
  }, { once: true });
}
```

---

### 23.6 `overflow: hidden` Kills `preserve-3d` — Critical Trap

From MDN: These CSS properties applied to a `preserve-3d` element **flatten** its 3D context:
- `overflow` (any value except `visible` or `clip`)
- `opacity < 1`
- `filter` (any value except `none`)
- `clip-path` (any value other than `none`)
- `isolation: isolate`
- `mix-blend-mode` (non-normal)

```css
/* ❌ Flattens 3D — page faces will NOT flip in 3D */
.page-wrapper {
  transform-style: preserve-3d;
  overflow: hidden; /* ← destroys 3D context */
}

/* ✅ Apply overflow to the face, not the 3D wrapper */
.page-wrapper { transform-style: preserve-3d; }
.page-face    { overflow: hidden; } /* ← safe here */
```

---

### 23.7 `filter: brightness()` Must Be on Faces, Not the 3D Wrapper

```css
/* ✅ Correct — applied to the face (a 2D element) */
.page-back {
  transform: rotateY(180deg);
  filter: brightness(0.88);
}

/* ❌ Wrong — applied to preserve-3d container = 3D context flattened */
.page-wrapper {
  transform-style: preserve-3d;
  filter: brightness(0.88); /* kills 3D */
}
```

---

### 23.8 Cover Entrance Animation (Individual Transform Properties)

```css
@keyframes coverReveal {
  from { opacity: 0; translate: 0 28px; scale: 0.96; }
  to   { opacity: 1; translate: 0 0;    scale: 1;    }
}
.magazine-cover {
  animation: coverReveal 0.75s cubic-bezier(0.2, 0, 0, 1) both;
}
.magazine-cover .page-title {
  animation: coverReveal 0.75s 0.1s cubic-bezier(0.2, 0, 0, 1) both;
}
```

---

### 23.9 Force GPU Layer

```css
/* Force compositing layer — all browsers */
.flipbook { transform: translateZ(0); }

/* Modern hint — use sparingly */
.flipbook { will-change: transform; }
```

---

### 23.10 View Transitions API for View Changes (Chrome 111+, Safari 18+)

For switching between magazine sections/views (not individual page flips):

```javascript
async function navigateToSection(index) {
  if (!document.startViewTransition) {
    showSection(index); return; // fallback
  }
  await document.startViewTransition(() => showSection(index));
}
```

---

## Section 24: Scroll-Driven Animation Integration (Chrome 115+, Edge 115+)

Run scroll-linked animations off the main thread using the CSS Scroll-Driven Animations API. Zero JavaScript event listeners needed.

### 24.1 Reading Progress Indicator

```css
@keyframes grow-progress {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
#reading-progress {
  position: fixed; top: 0; left: 0;
  width: 100%; height: 3px;
  background: var(--accent);
  transform-origin: 0 50%;
  animation: grow-progress linear;
  animation-timeline: scroll(root block);
}
```

### 24.2 Page Reveal on Scroll

```css
@keyframes pageReveal {
  entry 0%   { opacity: 0; translate: 0 20px; }
  entry 100% { opacity: 1; translate: 0 0; }
}
.page-thumbnail {
  animation: pageReveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}
```

### 24.3 Named Timeline for Thumbnail Carousel

```css
.thumbnail-strip {
  scroll-timeline-name: --thumb-scroll;
  scroll-timeline-axis: inline;
  overflow-x: auto;
}
.thumb-active-indicator {
  animation: indicate-position linear;
  animation-timeline: --thumb-scroll;
}
```

### 24.4 Stacking Cards Cover Flow Effect

```css
.cover-stack li {
  view-timeline-name: --item-view;
  animation: stack-scale linear both;
  animation-timeline: --item-view;
  animation-range: exit -20% exit 20%;
}
@keyframes stack-scale {
  to { scale: 0.9; opacity: 0.6; }
}
```
