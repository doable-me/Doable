# PptxGenJS API Reference

Complete reference for writing PptxGenJS Node.js scripts.

---

## Setup

```javascript
const pptxgen = require('pptxgenjs');
const pptx = new pptxgen();

// Set wide layout (13.3" x 7.5") — recommended
pptx.layout = 'LAYOUT_WIDE';

// Or standard layout (10" x 7.5")
// pptx.layout = 'LAYOUT_4x3';

// Save
pptx.writeFile({ fileName: '/path/to/output.pptx' });
```

---

## Adding Slides

```javascript
const slide = pptx.addSlide();
```

### Slide Background
```javascript
// Solid color background
slide.background = { color: '1e1b4b' };  // hex color WITHOUT #

// Image background
slide.background = { path: '/path/to/image.jpg' };

// Gradient background
slide.background = {
  type: 'grad',
  color: '7c3aed',
  color2: '1e1b4b',
  angle: 135
};
```

---

## Text Elements

```javascript
slide.addText('Hello World', {
  x: 0.5,       // inches from left
  y: 1.0,       // inches from top
  w: 9.0,       // width in inches
  h: 1.5,       // height in inches
  fontSize: 36,
  bold: true,
  color: 'FFFFFF',   // hex WITHOUT #
  fontFace: 'Calibri',
  align: 'center',   // left | center | right
  valign: 'middle',  // top | middle | bottom
  wrap: true,
  breakLine: false
});
```

### Text with Multiple Runs (mixed styling)
```javascript
slide.addText([
  { text: 'Bold Part ', options: { bold: true, fontSize: 24, color: 'FFFFFF' } },
  { text: 'Normal Part', options: { bold: false, fontSize: 24, color: '94a3b8' } }
], {
  x: 0.5, y: 2.0, w: 9.0, h: 1.0
});
```

### Bullet Lists
```javascript
slide.addText([
  { text: 'First item', options: { bullet: true } },
  { text: 'Second item', options: { bullet: true } },
  { text: 'Third item', options: { bullet: true } }
], {
  x: 0.5, y: 2.5, w: 5.0, h: 3.0,
  fontSize: 18,
  color: 'f8fafc',
  valign: 'top'
});
```

### Font Options
```javascript
{
  fontFace: 'Calibri',     // or 'Arial', 'Trebuchet MS', 'Georgia'
  fontSize: 24,             // points
  bold: true,
  italic: false,
  underline: false,
  color: 'FFFFFF'
}
```

---

## Shape Elements

### Rectangle
```javascript
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.3, h: 1.0,
  fill: { color: '7c3aed' },
  line: { color: '7c3aed', width: 0 }  // no border: same color or width 0
});
```

### Rounded Rectangle
```javascript
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 2.0, w: 3.0, h: 2.0,
  fill: { color: '7c3aed', transparency: 20 },  // transparency 0-100
  line: { color: '8b5cf6', width: 1 },
  rectRadius: 0.1  // corner radius in inches
});
```

### Circle / Ellipse
```javascript
slide.addShape(pptx.ShapeType.ellipse, {
  x: 5.0, y: 1.5, w: 2.0, h: 2.0,
  fill: { color: 'ec4899', transparency: 30 },
  line: { color: 'ec4899', width: 2 }
});
```

### Line
```javascript
slide.addShape(pptx.ShapeType.line, {
  x: 0.5, y: 3.5, w: 4.0, h: 0,
  line: { color: '7c3aed', width: 3 }
});
```

### Triangle
```javascript
slide.addShape(pptx.ShapeType.triangle, {
  x: 9.0, y: 5.0, w: 3.0, h: 2.0,
  fill: { color: '7c3aed', transparency: 40 },
  line: { width: 0 }
});
```

### Right Arrow
```javascript
slide.addShape(pptx.ShapeType.rightArrow, {
  x: 2.0, y: 3.0, w: 2.5, h: 1.0,
  fill: { color: '10b981' },
  line: { width: 0 }
});
```

### All Available Shape Types
```javascript
pptx.ShapeType.rect
pptx.ShapeType.roundRect
pptx.ShapeType.ellipse
pptx.ShapeType.triangle
pptx.ShapeType.rtTriangle
pptx.ShapeType.line
pptx.ShapeType.rightArrow
pptx.ShapeType.leftArrow
pptx.ShapeType.bentArrow
pptx.ShapeType.pentagon
pptx.ShapeType.hexagon
pptx.ShapeType.star5
pptx.ShapeType.star6
pptx.ShapeType.cloud
pptx.ShapeType.diamond
```

---

## Images

```javascript
// From file path
slide.addImage({
  path: '/path/to/image.png',
  x: 6.0, y: 1.5, w: 4.0, h: 3.0
});

// From URL
slide.addImage({
  path: 'https://example.com/image.jpg',
  x: 6.0, y: 1.5, w: 4.0, h: 3.0
});

// From base64
slide.addImage({
  data: 'data:image/png;base64,...',
  x: 6.0, y: 1.5, w: 4.0, h: 3.0
});
```

---

## Charts

### Bar Chart
```javascript
const chartData = [
  {
    name: 'Revenue',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    values: [120, 145, 180, 220]
  }
];

slide.addChart(pptx.ChartType.bar, chartData, {
  x: 1.0, y: 1.5, w: 8.0, h: 4.5,
  chartColors: ['7c3aed'],
  showLegend: false,
  showTitle: false,
  dataLabelColor: 'FFFFFF',
  valAxisLabelColor: '94a3b8',
  catAxisLabelColor: '94a3b8'
});
```

### Doughnut / Pie Chart
```javascript
const pieData = [
  { name: 'Segment A', labels: ['A'], values: [40] },
  { name: 'Segment B', labels: ['B'], values: [35] },
  { name: 'Segment C', labels: ['C'], values: [25] }
];

slide.addChart(pptx.ChartType.doughnut, pieData, {
  x: 2.0, y: 1.5, w: 6.0, h: 5.0,
  chartColors: ['7c3aed', 'ec4899', '10b981'],
  holeSize: 60,  // doughnut hole size %
  showLabel: true,
  showPercent: true
});
```

### Line Chart
```javascript
slide.addChart(pptx.ChartType.line, chartData, {
  x: 1.0, y: 1.5, w: 8.0, h: 4.5,
  chartColors: ['7c3aed'],
  lineDataSymbol: 'circle',
  lineSize: 3
});
```

### Chart Types Available
```javascript
pptx.ChartType.bar
pptx.ChartType.bar3d
pptx.ChartType.line
pptx.ChartType.area
pptx.ChartType.pie
pptx.ChartType.doughnut
pptx.ChartType.scatter
pptx.ChartType.bubble
pptx.ChartType.radar
```

---

## Tables

```javascript
const rows = [
  [
    { text: 'Feature', options: { bold: true, fill: { color: '7c3aed' }, color: 'FFFFFF' }},
    { text: 'Basic', options: { bold: true, fill: { color: '7c3aed' }, color: 'FFFFFF' }},
    { text: 'Pro', options: { bold: true, fill: { color: '7c3aed' }, color: 'FFFFFF' }}
  ],
  ['Storage', '5GB', '100GB'],
  ['Users', '1', 'Unlimited'],
  ['Support', 'Email', '24/7 Chat']
];

slide.addTable(rows, {
  x: 1.5, y: 1.5, w: 10.0,
  colW: [4.0, 3.0, 3.0],
  border: { pt: 1, color: '7c3aed' },
  fontSize: 16,
  color: 'f8fafc',
  fill: { color: '1e1b4b' },
  align: 'center'
});
```

---

## Coordinate System Reference

All measurements are in **inches**.

```
┌─────────────────────────────────────────────────────────┐
│ (0,0)                                         (13.3, 0) │  ← LAYOUT_WIDE
│                                                          │
│                                                          │
│                                                          │
│ (0, 7.5)                                   (13.3, 7.5)  │
└─────────────────────────────────────────────────────────┘
```

### Safe Content Area (with margins)
```
x: 0.5 to 12.8  (left/right 0.5" margin)
y: 0.5 to 7.0   (top/bottom 0.5" margin)
```

### Common Layout Positions (LAYOUT_WIDE = 13.3 × 7.5")

| Element | x | y | w | h |
|---------|---|---|---|---|
| Full-bleed background shape | 0 | 0 | 13.3 | 7.5 |
| Header bar | 0 | 0 | 13.3 | 1.2 |
| Footer bar | 0 | 6.8 | 13.3 | 0.7 |
| Main title (centered) | 0.5 | 1.5 | 12.3 | 1.5 |
| Subtitle (centered) | 0.5 | 3.2 | 12.3 | 1.0 |
| Left column content | 0.5 | 1.5 | 5.8 | 5.0 |
| Right column content | 7.0 | 1.5 | 5.8 | 5.0 |
| Left-third column | 0.5 | 1.5 | 3.8 | 5.0 |
| Mid-third column | 4.8 | 1.5 | 3.8 | 5.0 |
| Right-third column | 9.0 | 1.5 | 3.8 | 5.0 |
| Large stat number | 1.0 | 2.0 | 5.0 | 2.5 |
| Decorative accent circle (top-right) | 10.5 | -0.5 | 3.5 | 3.5 |

---

## Complete Slide Templates

### Template 1: Full-Bleed Cover Slide
```javascript
const slide1 = pptx.addSlide();
slide1.background = { color: '1e1b4b' };

// Decorative circle top-right
slide1.addShape(pptx.ShapeType.ellipse, {
  x: 10.5, y: -0.5, w: 4.0, h: 4.0,
  fill: { color: '7c3aed', transparency: 60 },
  line: { width: 0 }
});

// Title
slide1.addText('Your Presentation Title', {
  x: 1.0, y: 2.5, w: 11.3, h: 1.8,
  fontSize: 54, bold: true, color: 'FFFFFF',
  align: 'center', fontFace: 'Calibri'
});

// Subtitle
slide1.addText('Subtitle or Author Name', {
  x: 1.0, y: 4.5, w: 11.3, h: 0.8,
  fontSize: 22, color: '94a3b8',
  align: 'center', fontFace: 'Calibri'
});

// Bottom accent bar
slide1.addShape(pptx.ShapeType.rect, {
  x: 0, y: 7.0, w: 13.3, h: 0.5,
  fill: { color: '7c3aed' }, line: { width: 0 }
});
```

### Template 2: Two-Column Content Slide
```javascript
const slide = pptx.addSlide();
slide.background = { color: 'f8fafc' };

// Left accent bar
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 0.08, h: 7.5,
  fill: { color: '7c3aed' }, line: { width: 0 }
});

// Section label
slide.addText('SECTION NAME', {
  x: 0.5, y: 0.4, w: 4.0, h: 0.4,
  fontSize: 11, bold: true, color: '7c3aed',
  align: 'left'
});

// Title
slide.addText('Slide Title Here', {
  x: 0.5, y: 0.9, w: 5.5, h: 0.9,
  fontSize: 32, bold: true, color: '1e293b',
  align: 'left', fontFace: 'Calibri'
});

// Bullet content (left)
slide.addText([
  { text: 'Key point one', options: { bullet: true } },
  { text: 'Key point two', options: { bullet: true } },
  { text: 'Key point three', options: { bullet: true } },
], {
  x: 0.5, y: 2.2, w: 5.5, h: 4.0,
  fontSize: 18, color: '334155', valign: 'top'
});

// Right accent shape
slide.addShape(pptx.ShapeType.roundRect, {
  x: 7.5, y: 1.5, w: 5.0, h: 4.5,
  fill: { color: '7c3aed', transparency: 85 },
  line: { color: '7c3aed', width: 1 },
  rectRadius: 0.15
});

// Right side text/icon/stat
slide.addText('KEY\nSTAT', {
  x: 7.5, y: 1.5, w: 5.0, h: 4.5,
  fontSize: 48, bold: true, color: '7c3aed',
  align: 'center', valign: 'middle'
});
```

### Template 3: Three Stat Cards
```javascript
const slide = pptx.addSlide();
slide.background = { color: '1e1b4b' };

// Title
slide.addText('Key Metrics', {
  x: 0.5, y: 0.5, w: 12.3, h: 0.9,
  fontSize: 36, bold: true, color: 'FFFFFF',
  align: 'center'
});

const stats = [
  { value: '$2.4M', label: 'Annual Revenue', x: 0.5 },
  { value: '94%', label: 'Customer Retention', x: 5.0 },
  { value: '3.2x', label: 'YoY Growth', x: 9.5 }
];

stats.forEach(stat => {
  // Card bg
  slide.addShape(pptx.ShapeType.roundRect, {
    x: stat.x, y: 1.8, w: 3.8, h: 4.0,
    fill: { color: '7c3aed', transparency: 80 },
    line: { color: '7c3aed', width: 1 },
    rectRadius: 0.15
  });
  // Stat value
  slide.addText(stat.value, {
    x: stat.x, y: 2.5, w: 3.8, h: 1.5,
    fontSize: 44, bold: true, color: 'FFFFFF',
    align: 'center'
  });
  // Stat label
  slide.addText(stat.label, {
    x: stat.x, y: 4.2, w: 3.8, h: 0.8,
    fontSize: 16, color: '94a3b8',
    align: 'center'
  });
});
```

---

## Writing Complete Presentation Scripts

Always use this script structure:

```javascript
const pptxgen = require('pptxgenjs');

async function createPresentation() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';  // 13.3" x 7.5"

  // Define palette
  const darkBg = '1e1b4b';
  const accent = '7c3aed';
  const light = 'f8fafc';
  const textLight = 'FFFFFF';
  const textDark = '1e293b';
  const subtext = '94a3b8';

  // === Slide 1: Cover ===
  const s1 = pptx.addSlide();
  // ... slide 1 code ...

  // === Slide 2: Overview ===
  const s2 = pptx.addSlide();
  // ... slide 2 code ...

  // ... more slides ...

  // Save
  await pptx.writeFile({ fileName: process.argv[2] || 'output.pptx' });
  console.log('✅ Presentation saved successfully');
}

createPresentation().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
```

---

## Tips for High-Quality Output

1. **Vary backgrounds**: Alternate dark (1e1b4b) and light (f8fafc) slides
2. **Decorative shapes**: Add large semi-transparent circles/triangles behind content
3. **Consistent palette**: Use the same 3-4 colors throughout
4. **Font sizes**: Title 32-54pt, body 16-20pt, captions 12-14pt
5. **White space**: Don't fill every inch — give content room to breathe
6. **Accent bars**: Thin colored bars on edges give professional structure
7. **Section separators**: Full dark slides between major topics keep flow clear

---

## Slide Transitions (ZIP Post-Processing)

PptxGenJS does not have a native transitions API. Instead, inject transition XML directly into the `.pptx` file after generation. A `.pptx` file is a ZIP archive of XML files.

### Install
```bash
npm install adm-zip
```

### Available Transition XML Snippets
```javascript
const TRANSITIONS = {
  fade:    '<p:transition speed="med"><p:fade/></p:transition>',
  push:    '<p:transition speed="med"><p:push dir="l"/></p:transition>',
  wipe:    '<p:transition speed="med"><p:wipe dir="r"/></p:transition>',
  zoom:    '<p:transition speed="med"><p:zoom dir="in"/></p:transition>',
  split:   '<p:transition speed="med"><p:split orient="horz" dir="in"/></p:transition>',
  cover:   '<p:transition speed="med"><p:cover dir="l"/></p:transition>',
  uncover: '<p:transition speed="slow"><p:uncover dir="r"/></p:transition>',
};
```

### Injection Function
```javascript
const AdmZip = require('adm-zip');

function injectTransitions(pptxPath, transitionSequence = ['fade']) {
  const zip = new AdmZip(pptxPath);
  const slideEntries = zip.getEntries()
    .filter(e => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const nA = parseInt(a.entryName.match(/\d+/)[0]);
      const nB = parseInt(b.entryName.match(/\d+/)[0]);
      return nA - nB;
    });

  slideEntries.forEach((entry, idx) => {
    let xml = entry.getData().toString('utf8');
    if (xml.includes('<p:transition')) return; // already has one
    const key = transitionSequence[idx % transitionSequence.length];
    const txXml = TRANSITIONS[key] || TRANSITIONS.fade;
    xml = xml.replace('</p:sld>', `${txXml}</p:sld>`);
    zip.updateFile(entry.entryName, Buffer.from(xml, 'utf8'));
  });

  zip.writeZip(pptxPath);
}
```

### Usage
```javascript
// At the end of your createPresentation() function, after writeFile():
await pptx.writeFile({ fileName: outputPath });
injectTransitions(outputPath, ['fade', 'push', 'wipe', 'cover', 'fade']);
```

---

## Images from node-canvas (No Network Required)

Generate images programmatically and embed as base64. No internet access needed.

### Install
```bash
npm install canvas
```

### Gradient Panel Image
```javascript
const { createCanvas } = require('canvas');

function gradientPanel(w, h, hex1, hex2) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `#${hex1}`);
  g.addColorStop(1, `#${hex2}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return canvas.toDataURL('image/png');
}

// Embed in slide
slide.addImage({
  data: gradientPanel(800, 600, '7c3aed', '1e1b4b'),
  x: 7.0, y: 1.0, w: 5.8, h: 5.0
});
```

### Pattern / Texture Image
```javascript
function dotPattern(w, h, bgHex, dotHex) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${bgHex}`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `#${dotHex}`;
  for (let x = 20; x < w; x += 40) {
    for (let y = 20; y < h; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvas.toDataURL('image/png');
}
```

---

## SVG Icons as Base64 (Zero Dependencies)

Encode small SVG strings to base64 and embed directly:

```javascript
function svgIcon(svgStr) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svgStr).toString('base64');
}

// Example: checkmark icon
const checkIcon = svgIcon(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#10b981">
    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
  </svg>
`);

slide.addImage({ data: checkIcon, x: 1.0, y: 2.0, w: 0.6, h: 0.6 });
```

---

## Font Quick Reference

All fonts below are system fonts available on Windows/Mac without installation:

| Font Name | Style | Best For |
|-----------|-------|----------|
| `Segoe UI` | Modern sans-serif | Tech, SaaS, AI |
| `Calibri` | Clean sans-serif | Universal body text |
| `Century Gothic` | Geometric sans | Creative, Startup, Green |
| `Trebuchet MS` | Humanist sans | Healthcare, Education |
| `Georgia` | Serif | Education, Film, Editorial |
| `Palatino Linotype` | Elegant serif | Finance, Law, Formal |
| `Book Antiqua` | Classic serif | Lifestyle, Food, Heritage |
| `Impact` | Ultra-bold condensed | Marketing, Campaigns |
| `Arial Black` | Heavy sans | Headlines, Stats |
| `Consolas` | Monospace | Tech, Code, Terminal |
| `Courier New` | Classic mono | Film scripts, Retro |

### Usage Pattern
```javascript
// Always define at top of script
const headingFont = 'Century Gothic';  // chosen for topic
const bodyFont    = 'Trebuchet MS';

// Heading usage
slide.addText('Title Here', {
  fontFace: headingFont, fontSize: 36, bold: true, color: textLight
});

// Body usage
slide.addText('Body content here.', {
  fontFace: bodyFont, fontSize: 18, bold: false, color: subtext
});
```
