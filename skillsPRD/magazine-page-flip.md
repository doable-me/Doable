# Skill: Magazine Page-Flip Reader

## Trigger Keywords
`magazine`, `flipbook`, `page flip`, `page turn`, `book reader`, `catalog`, `lookbook`, `portfolio book`, `digital magazine`, `flip pages`, `ebook`, `storybook`

## Purpose
Create interactive magazine-style reading experiences with realistic page-flip animations, touch/swipe support, and paginated content layouts.

---

## Dependencies

```json
{
  "devDependencies": {},
  "dependencies": {
    "page-flip": "^2.0.7"
  }
}
```

**React wrapper (optional):**
```json
{
  "dependencies": {
    "react-pageflip": "^2.0.3"
  }
}
```

---

## Architecture

### File Structure
```
src/
├── App.tsx                    # Main app with book viewer
├── components/
│   ├── FlipBook.tsx           # Core flipbook wrapper
│   ├── Page.tsx               # Individual page component
│   ├── Cover.tsx              # Front/back cover
│   ├── TableOfContents.tsx    # TOC with page navigation
│   ├── PageNavigation.tsx     # Prev/Next buttons + page indicator
│   └── ThumbnailStrip.tsx     # Page thumbnail navigator
├── hooks/
│   └── useFlipBook.ts         # PageFlip instance management
├── styles/
│   └── flipbook.css           # Page styles, shadows, animations
└── data/
    └── pages.ts               # Page content configuration
```

---

## Core Implementation

### React PageFlip Component

```tsx
import React, { useRef, useCallback, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';

interface PageProps {
  number: number;
  children: React.ReactNode;
}

const Page = React.forwardRef<HTMLDivElement, PageProps>(({ number, children }, ref) => (
  <div className="page" ref={ref}>
    <div className="page-content">
      {children}
    </div>
    <div className="page-footer">
      <span className="page-number">{number}</span>
    </div>
  </div>
));

export function FlipBook({ pages }: { pages: React.ReactNode[] }) {
  const bookRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const onFlip = useCallback((e: any) => {
    setCurrentPage(e.data);
  }, []);

  const onInit = useCallback((e: any) => {
    setTotalPages(e.data.pages);
  }, []);

  return (
    <div className="flipbook-container">
      <HTMLFlipBook
        ref={bookRef}
        width={550}
        height={733}
        size="stretch"
        minWidth={315}
        maxWidth={1000}
        minHeight={420}
        maxHeight={1333}
        maxShadowOpacity={0.5}
        showCover={true}
        mobileScrollSupport={true}
        onFlip={onFlip}
        onInit={onInit}
        className="flipbook"
        style={{}}
        startPage={0}
        drawShadow={true}
        flippingTime={1000}
        usePortrait={true}
        startZIndex={0}
        autoSize={true}
        clickEventForward={true}
        useMouseEvents={true}
        swipeDistance={30}
        showPageCorners={true}
        disableFlipByClick={false}
      >
        {pages.map((content, i) => (
          <Page key={i} number={i + 1}>
            {content}
          </Page>
        ))}
      </HTMLFlipBook>

      <div className="navigation no-print">
        <button
          onClick={() => bookRef.current?.pageFlip()?.flipPrev()}
          disabled={currentPage === 0}
        >
          ← Previous
        </button>
        <span className="page-indicator">
          {currentPage + 1} / {totalPages}
        </span>
        <button
          onClick={() => bookRef.current?.pageFlip()?.flipNext()}
          disabled={currentPage >= totalPages - 1}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
```

### Vanilla JS Implementation (No React)

```typescript
import { PageFlip } from 'page-flip';

export function initFlipBook(containerId: string, options?: Partial<PageFlipOptions>) {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Container #${containerId} not found`);

  const pageFlip = new PageFlip(container, {
    width: 550,
    height: 733,
    maxShadowOpacity: 0.5,
    showCover: true,
    mobileScrollSupport: true,
    useMouseEvents: true,
    swipeDistance: 30,
    flippingTime: 800,
    ...options,
  });

  // Load pages from DOM elements
  const pages = container.querySelectorAll('.page');
  pageFlip.loadFromHTML(Array.from(pages));

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      pageFlip.flipNext('top');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      pageFlip.flipPrev('top');
    }
  });

  return pageFlip;
}
```

---

## Page Layout Patterns

### Magazine Spread (Two-Page Layout)
```css
.page {
  background: white;
  box-shadow: inset -2px 0 5px rgba(0, 0, 0, 0.1);
  padding: 40px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100%;
  box-sizing: border-box;
  font-family: 'Georgia', serif;
}

.page-header {
  border-bottom: 2px solid #222;
  padding-bottom: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.page-header .section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: #666;
}

.page-content {
  overflow: hidden;
}

.page-footer {
  text-align: center;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

.page-number {
  font-size: 11px;
  color: #999;
}
```

### Editorial Text Layout
```css
.editorial-page .article-title {
  font-family: 'Playfair Display', serif;
  font-size: 2.5rem;
  line-height: 1.1;
  margin-bottom: 0.5rem;
}

.editorial-page .byline {
  font-style: italic;
  color: #666;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

.editorial-page .article-body {
  column-count: 2;
  column-gap: 24px;
  column-rule: 1px solid #eee;
  font-size: 0.9rem;
  line-height: 1.7;
  text-align: justify;
  hyphens: auto;
}

.editorial-page .drop-cap::first-letter {
  float: left;
  font-size: 4rem;
  line-height: 0.8;
  padding-right: 8px;
  font-family: 'Playfair Display', serif;
  font-weight: 700;
  color: var(--primary);
}

.editorial-page .pull-quote {
  column-span: all;
  font-size: 1.5rem;
  font-style: italic;
  text-align: center;
  padding: 1.5rem 2rem;
  border-top: 3px solid var(--primary);
  border-bottom: 3px solid var(--primary);
  margin: 1.5rem 0;
  font-family: 'Playfair Display', serif;
}
```

### Photo Spread
```css
.photo-spread {
  display: grid;
  grid-template-columns: 2fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
  height: 100%;
  padding: 20px;
}

.photo-spread .hero-image {
  grid-row: 1 / -1;
  grid-column: 1;
  object-fit: cover;
  width: 100%;
  height: 100%;
  border-radius: 4px;
}

.photo-spread .secondary-image {
  object-fit: cover;
  width: 100%;
  height: 100%;
  border-radius: 4px;
}

.photo-spread .caption {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 12px;
  font-size: 0.75rem;
  border-radius: 4px;
}
```

### Cover Page
```css
.cover-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
  color: white;
  text-align: center;
  padding: 3rem;
  position: relative;
  overflow: hidden;
}

.cover-page::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
  animation: shimmer 6s ease-in-out infinite;
}

.cover-page .magazine-title {
  font-size: 4rem;
  font-weight: 900;
  letter-spacing: -2px;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.cover-page .issue-info {
  font-size: 0.875rem;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 3px;
}

@keyframes shimmer {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(3deg); }
}
```

---

## Touch & Swipe Support

```css
/* Tap zones for mobile */
.tap-zone {
  position: absolute;
  top: 0;
  width: 20%;
  height: 100%;
  z-index: 10;
  cursor: pointer;
}

.tap-zone-left {
  left: 0;
}

.tap-zone-right {
  right: 0;
}

/* Swipe hint animation */
@keyframes swipe-hint {
  0% { transform: translateX(0); opacity: 0; }
  50% { transform: translateX(-20px); opacity: 1; }
  100% { transform: translateX(-40px); opacity: 0; }
}

.swipe-hint {
  animation: swipe-hint 2s ease-in-out 3;
}
```

---

## Performance Optimization

```typescript
// Lazy load page content
function LazyPage({ pageIndex, loadContent }: { pageIndex: number; loadContent: () => Promise<string> }) {
  const [content, setContent] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isVisible && !content) {
      loadContent().then(setContent);
    }
  }, [isVisible]);

  return (
    <div className="page" data-visible={isVisible}>
      {content ? (
        <div dangerouslySetInnerHTML={{ __html: content }} />
      ) : (
        <div className="page-skeleton" />
      )}
    </div>
  );
}
```

### Image Optimization
```html
<!-- Use WebP with fallback -->
<picture>
  <source srcset="page-bg.webp" type="image/webp" />
  <img src="page-bg.jpg" alt="" loading="lazy" />
</picture>
```

### CSS Performance
```css
.page {
  /* GPU acceleration for flip animation */
  transform: translateZ(0);
  will-change: transform;
  backface-visibility: hidden;
  contain: layout paint;
}
```

---

## Critical Rules

1. **Use `page-flip` (StPageFlip) for modern projects** — TypeScript native, no jQuery dependency, best flip quality
2. **Use `react-pageflip` for React** — thin wrapper over StPageFlip with ref forwarding
3. **Pages MUST use forwardRef** — the flip library needs direct DOM access to each page
4. **Set `mobileScrollSupport: true`** — prevents scroll hijacking on mobile while allowing flip gestures
5. **Content must fit within page bounds** — no overflow; use CSS `overflow: hidden` on page content
6. **Include keyboard navigation** — Arrow keys for accessibility (Left/Right for prev/next)
7. **Show page numbers** — users need orientation in multi-page documents
8. **Preload adjacent pages** — load current ± 2 pages for smooth flipping
9. **Use `showCover: true`** — first and last pages display as single pages (like real books)
10. **Keep page DOM light** — max 2-3 images per page; use thumbnails for navigation strip
11. **Add `loading="lazy"` to images** — prevent loading all page images at once
12. **Test on iOS Safari** — touch events behave differently; verify swipe sensitivity

---

## Page Content Types

| Page Type | Layout | Use Case |
|-----------|--------|----------|
| **Cover** | Full-bleed image + title | First/last page |
| **TOC** | List with page numbers | Navigation |
| **Editorial** | 2-column text + drop cap | Articles |
| **Photo Spread** | Grid of images | Photography |
| **Infographic** | Charts + icons + stats | Data pages |
| **Quote** | Large text centered | Section breaks |
| **Ad/CTA** | Bold visual + button | Marketing |
| **Credits** | Small text, multi-column | Back matter |

---

## Complete Example: Digital Magazine

```tsx
import HTMLFlipBook from 'react-pageflip';
import React, { useRef, useState } from 'react';

const CoverPage = React.forwardRef<HTMLDivElement>((_, ref) => (
  <div className="cover-page" ref={ref}>
    <h1 className="magazine-title">DESIGN</h1>
    <p className="issue-info">Issue 42 • Spring 2026</p>
    <div className="cover-image">
      <img src="/cover.jpg" alt="Cover" />
    </div>
  </div>
));

const ArticlePage = React.forwardRef<HTMLDivElement, { title: string; body: string; number: number }>(
  ({ title, body, number }, ref) => (
    <div className="page editorial-page" ref={ref}>
      <div className="page-header">
        <span className="section-title">Feature</span>
        <span className="page-number">{number}</span>
      </div>
      <div className="page-content">
        <h2 className="article-title">{title}</h2>
        <div className="article-body drop-cap">
          {body}
        </div>
      </div>
    </div>
  )
);

export function DigitalMagazine() {
  const bookRef = useRef<any>(null);
  const [page, setPage] = useState(0);

  return (
    <div className="magazine-viewer">
      <HTMLFlipBook
        ref={bookRef}
        width={550}
        height={733}
        showCover={true}
        mobileScrollSupport={true}
        maxShadowOpacity={0.5}
        onFlip={(e) => setPage(e.data)}
        className="magazine"
      >
        <CoverPage />
        <ArticlePage
          title="The Future of Design"
          body="Lorem ipsum dolor sit amet..."
          number={1}
        />
        {/* More pages... */}
      </HTMLFlipBook>

      <nav className="magazine-nav">
        <button onClick={() => bookRef.current?.pageFlip()?.flipPrev()}>
          ◀ Prev
        </button>
        <span>{page + 1}</span>
        <button onClick={() => bookRef.current?.pageFlip()?.flipNext()}>
          Next ▶
        </button>
      </nav>
    </div>
  );
}
```
