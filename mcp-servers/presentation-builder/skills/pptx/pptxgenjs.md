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
slide.background = { color: '1e1b4b' }; // hex WITHOUT #

// Image background
slide.background = { path: '/path/to/image.jpg' };

// Gradient background
slide.background = { type: 'grad', color: '7c3aed', color2: '1e1b4b', angle: 135 };
```

---

## Text Elements

```javascript
slide.addText('Hello World', {
  x: 0.5, y: 1.0, w: 9.0, h: 1.5, // inches
  fontSize: 36, bold: true,
  color: 'FFFFFF', // hex WITHOUT #
  fontFace: 'Calibri',
  align: 'center',  // left | center | right
  valign: 'middle', // top | middle | bottom
  wrap: true,
  breakLine: false
});
```

### Text with Multiple Runs (mixed styling)

```javascript
slide.addText([
  { text: 'Bold Part ',  options: { bold: true,  fontSize: 24, color: 'FFFFFF' } },
  { text: 'Normal Part', options: { bold: false, fontSize: 24, color: '94a3b8' } }
], { x: 0.5, y: 2.0, w: 9.0, h: 1.0 });
```

### Bullet Lists

```javascript
slide.addText([
  { text: 'First item',  options: { bullet: true } },
  { text: 'Second item', options: { bullet: true } },
  { text: 'Third item',  options: { bullet: true } }
], { x: 0.5, y: 2.5, w: 5.0, h: 3.0, fontSize: 18, color: 'f8fafc', valign: 'top' });
```

---

## Shape Elements

### Rectangle / RoundRect / Ellipse / Line / Triangle / RightArrow

```javascript
slide.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: 13.3, h: 1.0,
  fill: { color: '7c3aed' },
  line: { color: '7c3aed', width: 0 }
});

slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.5, y: 2.0, w: 3.0, h: 2.0,
  fill: { color: '7c3aed', transparency: 20 }, // 0-100
  line: { color: '8b5cf6', width: 1 },
  rectRadius: 0.1
});

slide.addShape(pptx.ShapeType.ellipse, {
  x: 5.0, y: 1.5, w: 2.0, h: 2.0,
  fill: { color: 'ec4899', transparency: 30 },
  line: { color: 'ec4899', width: 2 }
});

slide.addShape(pptx.ShapeType.line, {
  x: 0.5, y: 3.5, w: 4.0, h: 0,
  line: { color: '7c3aed', width: 3 }
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
slide.addImage({ path: '/path/to/image.png', x: 6.0, y: 1.5, w: 4.0, h: 3.0 });

// From URL (network must be available)
slide.addImage({ path: 'https://example.com/image.jpg', x: 6.0, y: 1.5, w: 4.0, h: 3.0 });

// From base64
slide.addImage({ data: 'data:image/png;base64,...', x: 6.0, y: 1.5, w: 4.0, h: 3.0 });
```

---

## Charts

```javascript
const chartData = [
  { name: 'Revenue', labels: ['Q1','Q2','Q3','Q4'], values: [120,145,180,220] }
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
    { text: 'Basic',   options: { bold: true, fill: { color: '7c3aed' }, color: 'FFFFFF' }},
    { text: 'Pro',     options: { bold: true, fill: { color: '7c3aed' }, color: 'FFFFFF' }}
  ],
  ['Storage', '5GB', '100GB'],
  ['Users',   '1',   'Unlimited'],
  ['Support', 'Email', '24/7 Chat']
];

slide.addTable(rows, {
  x: 1.5, y: 1.5, w: 10.0,
  colW: [4.0, 3.0, 3.0],
  border: { pt: 1, color: '7c3aed' },
  fontSize: 16, color: 'f8fafc',
  fill: { color: '1e1b4b' },
  align: 'center'
});
```

---

## Coordinate System Reference

All measurements are in **inches**.

```
┌─────────────────────────────────────────────────────────┐
│ (0,0)                                       (13.3, 0)   │  ← LAYOUT_WIDE
│                                                         │
│                                                         │
│ (0, 7.5)                                  (13.3, 7.5)   │
└─────────────────────────────────────────────────────────┘
```

### Safe Content Area (with margins)

```
x: 0.5 to 12.8 (left/right 0.5" margin)
y: 0.5 to 7.0 (top/bottom 0.5" margin)
```

---

## Slide Transitions (ZIP Post-Processing)

PptxGenJS does not have a native transitions API. Inject transition XML
directly into the `.pptx` file after generation. A `.pptx` file is a ZIP
archive of XML files.

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
    .sort((a, b) => parseInt(a.entryName.match(/\d+/)[0]) - parseInt(b.entryName.match(/\d+/)[0]));

  slideEntries.forEach((entry, idx) => {
    let xml = entry.getData().toString('utf8');
    if (xml.includes('<p:transition')) return;
    const key = transitionSequence[idx % transitionSequence.length];
    const txXml = TRANSITIONS[key] || TRANSITIONS.fade;
    xml = xml.replace('</p:sld>', `${txXml}</p:sld>`);
    zip.updateFile(entry.entryName, Buffer.from(xml, 'utf8'));
  });

  zip.writeZip(pptxPath);
}
```

---

## Font Quick Reference

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
