# Skill: Brochure & Flyer Builder

## Trigger Keywords
`brochure`, `flyer`, `marketing material`, `print layout`, `tri-fold`, `bi-fold`, `pamphlet`, `leaflet`, `handout`, `poster`, `newsletter`

## Purpose
Generate professional print-quality brochures, flyers, newsletters, and marketing materials using HTML/CSS with optional PDF export capability.

---

## Dependencies

```json
{
  "devDependencies": {},
  "dependencies": {
    "html2canvas": "^1.4.1",
    "jspdf": "^2.5.1"
  }
}
```

**Optional (for advanced PDF):**
- `pdf-lib` — TypeScript-first PDF creation/editing
- `pdfmake` — Styled document generation with tables/columns

---

## Architecture

### File Structure
```
src/
├── App.tsx              # Main brochure/flyer layout
├── components/
│   ├── BrochureLayout.tsx   # Fold layout (tri-fold, bi-fold)
│   ├── FlyerLayout.tsx      # Single-page flyer
│   ├── Panel.tsx            # Individual panel component
│   ├── ExportButton.tsx     # PDF/PNG download
│   └── EditableText.tsx     # Inline editable text blocks
├── styles/
│   ├── print.css            # @media print styles
│   └── brochure.css         # Layout-specific styles
└── utils/
    └── export-pdf.ts        # html2canvas + jsPDF export logic
```

---

## Layout Types

### 1. Tri-Fold Brochure (6 panels)
```css
.trifold {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 11in;
  height: 8.5in;
  gap: 0;
}

.trifold .panel {
  padding: 0.5in;
  border-right: 1px dashed #ccc; /* Fold guide */
  position: relative;
  overflow: hidden;
}

.trifold .panel:last-child {
  border-right: none;
}
```

**Panel Order (front side):** Back Cover | Inside Left | Inside Right
**Panel Order (back side):** Front Cover | Inside Flap | Inside Middle

### 2. Bi-Fold Brochure (4 panels)
```css
.bifold {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 11in;
  height: 8.5in;
}

.bifold .panel {
  padding: 0.75in;
  border-right: 1px dashed #ccc;
}
```

### 3. Single-Page Flyer
```css
.flyer {
  width: 8.5in;
  height: 11in;
  padding: 0.5in;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.flyer-header {
  flex: 0 0 30%;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  border-radius: 1rem;
  color: white;
}

.flyer-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.flyer-footer {
  flex: 0 0 15%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

### 4. Newsletter Layout
```css
.newsletter {
  width: 8.5in;
  min-height: 11in;
  padding: 0.75in;
  column-count: 2;
  column-gap: 0.5in;
  column-rule: 1px solid #e5e5e5;
}

.newsletter h1 {
  column-span: all;
  text-align: center;
  border-bottom: 3px solid var(--primary);
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

.newsletter .full-width {
  column-span: all;
}
```

---

## PDF Export Implementation

```typescript
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportToPDF(elementId: string, filename: string = 'brochure.pdf') {
  const element = document.getElementById(elementId);
  if (!element) return;

  // High DPI for print quality (300 DPI equivalent)
  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  
  // Determine orientation from element dimensions
  const isLandscape = element.offsetWidth > element.offsetHeight;
  const pdf = new jsPDF(isLandscape ? 'l' : 'p', 'in', 'letter');
  
  const pdfWidth = isLandscape ? 11 : 8.5;
  const pdfHeight = isLandscape ? 8.5 : 11;
  
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(filename);
}

export async function exportToPNG(elementId: string, filename: string = 'flyer.png') {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
```

---

## Print CSS

```css
@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  body {
    margin: 0;
    padding: 0;
  }

  .no-print,
  .export-button,
  .toolbar {
    display: none !important;
  }

  @page {
    margin: 0;
    size: letter landscape; /* or portrait */
  }

  .panel {
    page-break-inside: avoid;
  }

  .trifold, .bifold, .flyer {
    box-shadow: none;
    border: none;
  }
}
```

---

## Typography for Marketing

```css
:root {
  /* Display font for headlines */
  --font-display: 'Poppins', 'Montserrat', sans-serif;
  /* Body font for readability */
  --font-body: 'Open Sans', 'Inter', sans-serif;
  /* Accent font for callouts */
  --font-accent: 'Playfair Display', serif;
}

.headline {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(1.5rem, 4vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.subheadline {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(1rem, 2.5vw, 1.75rem);
  color: var(--primary);
}

.body-text {
  font-family: var(--font-body);
  font-size: 11pt;
  line-height: 1.6;
  color: #333;
}

.callout {
  font-family: var(--font-accent);
  font-style: italic;
  font-size: 1.25rem;
  border-left: 4px solid var(--accent);
  padding-left: 1rem;
}

.cta-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.125rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

---

## Design Principles

1. **Visual Hierarchy**: Hero image/headline → Subheadline → Body → CTA
2. **Rule of Thirds**: Place key elements at intersection points
3. **White Space**: Minimum 0.5in margins; don't crowd panels
4. **Color Limit**: Max 3 colors (primary, accent, neutral)
5. **Image Quality**: Use high-res images; min 150 DPI for print
6. **CTA Prominence**: Make call-to-action buttons/text the focal point
7. **Consistent Alignment**: Use grid lines for professional appearance
8. **Bleed Area**: Add 0.125in bleed outside trim for professional print

---

## Critical Rules

1. **Use CSS inches/points for print layouts** — px are screen units, in/pt/cm are print units
2. **Always include @media print styles** — ensure what you see is what prints
3. **Set print-color-adjust: exact** — browsers strip backgrounds by default
4. **Images must be high-resolution** — canvas scale: 3 for 300 DPI equivalent
5. **Test with browser Print Preview** — Ctrl+P verifies output before PDF export
6. **Keep fold guides visible in edit mode** — dashed lines help positioning
7. **Use flexbox/grid (NOT absolute positioning)** — prevents content overlap
8. **Font sizes in pt for print** — 10-12pt body, 24-36pt headlines minimum
9. **CMYK-safe colors** — avoid neon/bright colors that don't print well
10. **Include bleed margins** — content that extends to edge needs 0.125in extra

---

## Example: Complete Tri-Fold Brochure Component

```tsx
import { useState } from 'react';
import { exportToPDF } from './utils/export-pdf';

export function TriFoldBrochure() {
  const [side, setSide] = useState<'front' | 'back'>('front');

  return (
    <div className="brochure-editor">
      <div className="toolbar no-print">
        <button onClick={() => setSide(side === 'front' ? 'back' : 'front')}>
          Flip: {side}
        </button>
        <button onClick={() => exportToPDF('brochure', 'my-brochure.pdf')}>
          Export PDF
        </button>
      </div>

      <div id="brochure" className="trifold">
        {side === 'front' ? (
          <>
            <div className="panel back-cover">
              <h3>Contact Us</h3>
              <p>123 Main Street</p>
              <p>info@company.com</p>
              <p>(555) 123-4567</p>
            </div>
            <div className="panel inside-left">
              <h2>Our Services</h2>
              <ul>
                <li>Service One</li>
                <li>Service Two</li>
                <li>Service Three</li>
              </ul>
            </div>
            <div className="panel inside-right">
              <h2>Why Choose Us</h2>
              <p>Professional quality...</p>
              <img src="/team.jpg" alt="Our team" />
            </div>
          </>
        ) : (
          <>
            <div className="panel front-cover">
              <div className="hero">
                <h1>Company Name</h1>
                <p>Your tagline here</p>
              </div>
            </div>
            <div className="panel inside-flap">
              <h2>About Us</h2>
              <p>Company description...</p>
            </div>
            <div className="panel inside-middle">
              <h2>Testimonials</h2>
              <blockquote>"Great service!"</blockquote>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```
