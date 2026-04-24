/**
 * Presentation engine — pure pptxgenjs build (no LLM, deterministic template).
 * Runs entirely inside this MCP server. The host knows nothing about it.
 */
import PptxGenJS from "pptxgenjs";

// Strip leading '#' from a hex string so it's safe for pptxgenjs (which
// rejects '#'-prefixed colors).
function pptxColor(hex) {
  return String(hex || "").replace(/^#/, "").toUpperCase();
}

// Pull a sensible PPTX font face out of a CSS font-family string like
// "'Plus Jakarta Sans', sans-serif" → "Plus Jakarta Sans". Falls back to
// Calibri for monospace/serif families that PowerPoint can't always render.
function pptxFont(cssFontFamily, fallback = "Calibri") {
  const m = String(cssFontFamily || "").match(/'([^']+)'/);
  return m ? m[1] : fallback;
}

const SLIDE_TEMPLATES = [
  "Why this matters",
  "The opportunity",
  "How it works",
  "Key benefits",
  "Roadmap",
  "Next steps",
];

function clampSlideCount(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 5;
  return Math.max(3, Math.min(12, Math.floor(n)));
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "presentation";
}

function buildOutline({ topic, slideCount, audience, tone }) {
  // `slideCount` = TOTAL slides the user wants (cover + content + closing).
  // We clamp to [3, 12], reserve 1 for cover and 1 for closing, and fill
  // the remainder with content slides. So "4 slides" → 1 cover + 2 content + 1 closing.
  const total = clampSlideCount(slideCount);
  const n = Math.max(1, total - 2);
  const audienceLine = audience ? `For ${audience}.` : "";
  const toneLine = tone ? `Tone: ${tone}.` : "";

  const cover = {
    type: "cover",
    title: topic,
    subtitle: [audienceLine, toneLine].filter(Boolean).join(" "),
  };

  const middle = [];
  for (let i = 0; i < n; i++) {
    const tpl = SLIDE_TEMPLATES[i % SLIDE_TEMPLATES.length];
    middle.push({
      type: "content",
      title: tpl,
      bullets: [
        `Insight #${i + 1} about ${topic}`,
        `Why this matters to ${audience || "the audience"}`,
        `One concrete example or story`,
      ],
    });
  }

  const closing = {
    type: "closing",
    title: "Let's discuss",
    subtitle: `Questions about "${topic}"?`,
  };

  return [cover, ...middle, closing];
}

/**
 * Internal: render a sequence of slide objects (each {layout, title, bullets?, subtitle?})
 * into a PptxGenJS buffer using the shared palette + renderer system.
 */
async function renderPptxFromSlides({ topic, slides, palette }) {
  const t = (topic || "Presentation").trim();

  // Translate web palette → PPTX-safe colors (no '#').
  const C = {
    bg:      pptxColor(palette.vars.bg),
    panel:   pptxColor(palette.vars.panel),
    accent:  pptxColor(palette.vars.accent),
    accent2: pptxColor(palette.vars.accent2),
    accent3: pptxColor(palette.vars.accent3),
    text:    pptxColor(palette.vars.text),
    sub:     pptxColor(palette.vars.sub),
  };
  const isLightBg = (parseInt(C.bg.slice(0, 2), 16) +
                     parseInt(C.bg.slice(2, 4), 16) +
                     parseInt(C.bg.slice(4, 6), 16)) / 3 > 160;
  const headingFont = pptxFont(palette.fonts.display, "Calibri");
  const bodyFont    = pptxFont(palette.fonts.body, "Calibri");

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = t;
  pptx.company = "Doable";

  slides.forEach((slide, i) => {
    const layout = slide.layout || (i === 0 ? "cover" : i === slides.length - 1 ? "closing" : "twoCol");
    const ctx = { pptx, palette, C, isLightBg, headingFont, bodyFont, slide, idx: i, total: slides.length, topic: t };
    const renderer = PPTX_RENDERERS[layout] || PPTX_RENDERERS.twoCol;
    renderer(ctx);
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return { buffer, fileName: `${slugify(t)}.pptx`, slideCount: slides.length, paletteId: palette.id };
}

/**
 * Build a .pptx Buffer from a deterministic outline (no AI). Uses topic-aware
 * palette + rotating rich layouts. Returns { buffer, fileName, slideCount, paletteId }.
 */
export async function buildPptx({ topic, slideCount, audience, tone }) {
  const t = (topic || "Presentation").trim();
  const outline = buildOutline({ topic: t, slideCount, audience, tone });
  const layouts = planLayouts(outline.length);
  const slides = outline.map((s, i) => ({ ...s, layout: layouts[i] || (s.type === "cover" ? "cover" : s.type === "closing" ? "closing" : "twoCol") }));
  return renderPptxFromSlides({ topic: t, slides, palette: pickPalette(t) });
}

/**
 * Build a .pptx Buffer from an AI-supplied JSON spec. The spec format:
 *   { topic, palette?, paletteId?, slides: [ { layout, title, bullets?, subtitle? }, ... ] }
 *
 * Palette resolution order:
 *   1. `palette` — a full bespoke palette the LLM designed for this topic
 *      (colors + fonts). Preferred path; enables truly topic-adaptive design.
 *   2. `paletteId` — a preset id (legacy/convenience).
 *   3. Keyword-based auto-pick from the topic (last-resort fallback only).
 *
 * Each slide's `layout` must match a key in PPTX_RENDERERS (cover, twoCol, stat, cards,
 * timeline, quote, compare, takeaways, closing). Unknown layouts fall back to twoCol.
 */
export async function buildPptxFromSpec({ topic, palette, paletteId, slides }) {
  const t = (topic || "Presentation").trim();
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("`slides` must be a non-empty array");
  }
  const resolvedPalette =
    normalisePalette(palette) || pickPaletteById(paletteId) || pickPalette(t);
  // Normalise each slide: ensure bullets is an array of strings.
  const normalised = slides.map((s) => ({
    layout: s.layout,
    title: String(s.title || ""),
    subtitle: s.subtitle ? String(s.subtitle) : "",
    bullets: Array.isArray(s.bullets) ? s.bullets.map((b) => String(b)) : [],
  }));
  return renderPptxFromSlides({ topic: t, slides: normalised, palette: resolvedPalette });
}

// ─────────────────────────────────────────────────────────────────────────
// PPTX per-layout renderers
// Embodies skills/pptx/SKILL.md design rules:
//  • Sandwich structure (dark cover + content + dark closing)
//  • At least 3 visual layers per slide (bg deco + structural + content)
//  • Topic-adaptive palette + typography
//  • Rotating layouts so no two consecutive slides look the same
// ─────────────────────────────────────────────────────────────────────────

function pptxBaseBg(s, ctx, { dark = false } = {}) {
  const { C, isLightBg, pptx } = ctx;
  // Dark slides override the palette bg with the panel; light palettes flip.
  const bg = dark ? (isLightBg ? C.text : C.bg) : C.bg;
  s.background = { color: bg };
  // Decorative layer 1: large translucent corner orb (accent2).
  s.addShape(pptx.ShapeType.ellipse, {
    x: -2, y: -2, w: 6, h: 6,
    fill: { color: C.accent, transparency: 88 },
    line: { color: C.accent, width: 0, transparency: 100 },
  });
  // Decorative layer 2: smaller orb on opposite corner (accent3).
  s.addShape(pptx.ShapeType.ellipse, {
    x: 10, y: 5, w: 5, h: 5,
    fill: { color: C.accent3 || C.accent2, transparency: 90 },
    line: { color: C.accent3 || C.accent2, width: 0, transparency: 100 },
  });
}

function pptxFooter(s, ctx) {
  const { C, headingFont, slide, idx, total } = ctx;
  s.addText(`${idx + 1} / ${total}`, {
    x: 12.0, y: 7.05, w: 1.1, h: 0.3,
    fontFace: headingFont, fontSize: 10, color: C.sub, align: "right",
  });
  s.addText("DOABLE", {
    x: 0.5, y: 7.05, w: 3, h: 0.3,
    fontFace: headingFont, fontSize: 10, bold: true, color: C.accent, charSpacing: 4,
  });
}

const PPTX_RENDERERS = {
  cover({ pptx, C, headingFont, bodyFont, slide, total, topic }) {
    const s = pptx.addSlide();
    s.background = { color: C.bg };
    // Layer 1: huge accent gradient orb top-left
    s.addShape(pptx.ShapeType.ellipse, {
      x: -3, y: -3, w: 9, h: 9,
      fill: { color: C.accent, transparency: 75 },
      line: { color: C.accent, width: 0, transparency: 100 },
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: 8, y: 4, w: 8, h: 8,
      fill: { color: C.accent2, transparency: 82 },
      line: { color: C.accent2, width: 0, transparency: 100 },
    });
    // Layer 2: top tag bar
    s.addShape(pptx.ShapeType.rect, {
      x: 0.6, y: 0.6, w: 2.4, h: 0.05, fill: { color: C.accent }, line: { width: 0 },
    });
    s.addText(`PRESENTATION · ${total} SLIDES`, {
      x: 0.6, y: 0.75, w: 8, h: 0.4,
      fontFace: headingFont, fontSize: 12, bold: true, color: C.accent, charSpacing: 6,
    });
    // Layer 3: hero title
    s.addText(slide.title, {
      x: 0.6, y: 2.0, w: 12.1, h: 3.2,
      fontFace: headingFont, fontSize: 64, bold: true, color: C.text, valign: "top",
    });
    if (slide.subtitle) {
      s.addText(slide.subtitle, {
        x: 0.6, y: 5.3, w: 11, h: 1.0,
        fontFace: bodyFont, fontSize: 20, color: C.sub,
      });
    }
    // Bottom rule
    s.addShape(pptx.ShapeType.rect, {
      x: 0, y: 7.3, w: 13.33, h: 0.2, fill: { color: C.accent }, line: { width: 0 },
    });
  },

  closing({ pptx, C, headingFont, bodyFont, slide }) {
    const s = pptx.addSlide();
    s.background = { color: C.bg };
    // Background mega text "FIN"
    s.addText("FIN", {
      x: 0, y: 0.5, w: 13.33, h: 7,
      fontFace: headingFont, fontSize: 380, bold: true, color: C.panel,
      align: "center", valign: "middle",
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 13.33, h: 0.2, fill: { color: C.accent2 }, line: { width: 0 },
    });
    s.addText(slide.title, {
      x: 0.6, y: 2.4, w: 12.1, h: 1.6,
      fontFace: headingFont, fontSize: 80, bold: true, color: C.text, align: "center",
    });
    s.addText(slide.subtitle, {
      x: 0.6, y: 4.4, w: 12.1, h: 1.0,
      fontFace: bodyFont, fontSize: 22, color: C.sub, align: "center",
    });
    // Accent CTA pill
    s.addShape(pptx.ShapeType.roundRect, {
      x: 5.6, y: 5.7, w: 2.1, h: 0.7, rectRadius: 0.35,
      fill: { color: C.accent }, line: { width: 0 },
    });
    s.addText("THANK YOU", {
      x: 5.6, y: 5.7, w: 2.1, h: 0.7,
      fontFace: headingFont, fontSize: 14, bold: true,
      color: C.bg, align: "center", valign: "middle", charSpacing: 4,
    });
  },

  twoCol(ctx) {
    const { pptx, C, headingFont, bodyFont, slide } = ctx;
    const s = pptx.addSlide();
    pptxBaseBg(s, ctx);
    // Left vertical accent column
    s.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 1.0, w: 0.08, h: 5.5, fill: { color: C.accent }, line: { width: 0 },
    });
    s.addText(slide.title, {
      x: 0.85, y: 0.7, w: 11.5, h: 1.0,
      fontFace: headingFont, fontSize: 36, bold: true, color: C.text,
    });
    // Right glass card with bullets
    s.addShape(pptx.ShapeType.roundRect, {
      x: 6.6, y: 1.9, w: 6.2, h: 4.6, rectRadius: 0.15,
      fill: { color: C.accent, transparency: 88 },
      line: { color: C.accent, width: 1, transparency: 60 },
    });
    const bulletObjs = slide.bullets.map((b) => ({
      text: b,
      options: { bullet: { code: "25CF" }, fontSize: 18, color: C.text, paraSpaceAfter: 10 },
    }));
    s.addText(bulletObjs, {
      x: 6.95, y: 2.2, w: 5.6, h: 4.0,
      fontFace: bodyFont, valign: "top",
    });
    // Left side: lead paragraph
    s.addText(slide.bullets[0] || "", {
      x: 0.85, y: 2.0, w: 5.5, h: 4.5,
      fontFace: bodyFont, fontSize: 24, color: C.sub, valign: "top",
    });
    pptxFooter(s, ctx);
  },

  stat(ctx) {
    const { pptx, C, headingFont, bodyFont, slide } = ctx;
    const s = pptx.addSlide();
    pptxBaseBg(s, ctx);
    const stat = `${Math.floor(70 + Math.random() * 28)}%`;
    s.addText(slide.title, {
      x: 0.85, y: 0.7, w: 11.5, h: 0.8,
      fontFace: headingFont, fontSize: 28, bold: true, color: C.text,
    });
    // Mega stat
    s.addText(stat, {
      x: 0.85, y: 1.9, w: 7, h: 3.5,
      fontFace: headingFont, fontSize: 220, bold: true, color: C.accent, valign: "top",
    });
    s.addText(slide.bullets[0] || "Key indicator", {
      x: 0.85, y: 5.4, w: 7, h: 1.2,
      fontFace: bodyFont, fontSize: 20, color: C.sub,
    });
    // Right column supporting bullets
    const rest = slide.bullets.slice(1, 4);
    rest.forEach((b, i) => {
      s.addShape(pptx.ShapeType.roundRect, {
        x: 8.2, y: 1.9 + i * 1.55, w: 4.6, h: 1.35, rectRadius: 0.12,
        fill: { color: C.accent2, transparency: 88 },
        line: { color: C.accent2, width: 1, transparency: 60 },
      });
      s.addText(`0${i + 1}`, {
        x: 8.4, y: 2.0 + i * 1.55, w: 0.8, h: 0.4,
        fontFace: headingFont, fontSize: 14, bold: true, color: C.accent2,
      });
      s.addText(b, {
        x: 8.4, y: 2.4 + i * 1.55, w: 4.3, h: 0.85,
        fontFace: bodyFont, fontSize: 14, color: C.text, valign: "top",
      });
    });
    pptxFooter(s, ctx);
  },

  cards(ctx) {
    const { pptx, C, headingFont, bodyFont, slide } = ctx;
    const s = pptx.addSlide();
    pptxBaseBg(s, ctx);
    s.addText(slide.title, {
      x: 0.85, y: 0.7, w: 11.5, h: 0.8,
      fontFace: headingFont, fontSize: 32, bold: true, color: C.text,
    });
    // 3 cards left-to-right
    const colors = [C.accent, C.accent2, C.accent3 || C.accent];
    const items = slide.bullets.slice(0, 3);
    items.forEach((b, i) => {
      const x = 0.85 + i * 4.05;
      s.addShape(pptx.ShapeType.roundRect, {
        x, y: 2.0, w: 3.85, h: 4.5, rectRadius: 0.15,
        fill: { color: colors[i], transparency: 84 },
        line: { color: colors[i], width: 1.5, transparency: 50 },
      });
      // Number bubble
      s.addShape(pptx.ShapeType.ellipse, {
        x: x + 0.3, y: 2.3, w: 0.7, h: 0.7,
        fill: { color: colors[i] }, line: { width: 0 },
      });
      s.addText(`${i + 1}`, {
        x: x + 0.3, y: 2.3, w: 0.7, h: 0.7,
        fontFace: headingFont, fontSize: 22, bold: true,
        color: C.bg, align: "center", valign: "middle",
      });
      s.addText(b, {
        x: x + 0.3, y: 3.3, w: 3.25, h: 3.0,
        fontFace: bodyFont, fontSize: 16, color: C.text, valign: "top",
      });
    });
    pptxFooter(s, ctx);
  },

  timeline(ctx) {
    const { pptx, C, headingFont, bodyFont, slide } = ctx;
    const s = pptx.addSlide();
    pptxBaseBg(s, ctx);
    s.addText(slide.title, {
      x: 0.85, y: 0.7, w: 11.5, h: 0.8,
      fontFace: headingFont, fontSize: 32, bold: true, color: C.text,
    });
    const axisY = 4.0;
    // Horizontal axis line
    s.addShape(pptx.ShapeType.line, {
      x: 0.85, y: axisY, w: 11.6, h: 0,
      line: { color: C.accent, width: 2 },
    });
    const items = slide.bullets.slice(0, 4);
    const step = 11.6 / Math.max(1, items.length);
    items.forEach((b, i) => {
      const cx = 0.85 + step * (i + 0.5);
      // Node dot
      s.addShape(pptx.ShapeType.ellipse, {
        x: cx - 0.18, y: axisY - 0.18, w: 0.36, h: 0.36,
        fill: { color: C.accent }, line: { color: C.bg, width: 2 },
      });
      // Step label
      s.addText(`STEP ${String(i + 1).padStart(2, "0")}`, {
        x: cx - 1.2, y: axisY - 1.4, w: 2.4, h: 0.4,
        fontFace: headingFont, fontSize: 12, bold: true, color: C.accent,
        align: "center", charSpacing: 4,
      });
      s.addText(b, {
        x: cx - 1.3, y: axisY + 0.4, w: 2.6, h: 2.4,
        fontFace: bodyFont, fontSize: 14, color: C.text, align: "center", valign: "top",
      });
    });
    pptxFooter(s, ctx);
  },

  quote(ctx) {
    const { pptx, C, headingFont, bodyFont, slide, topic } = ctx;
    const s = pptx.addSlide();
    pptxBaseBg(s, ctx);
    // Mega quote mark background
    s.addText("\u201C", {
      x: 0.5, y: 0.0, w: 6, h: 5,
      fontFace: headingFont, fontSize: 400, bold: true, color: C.accent,
    });
    s.addText(slide.bullets[0] || `What if ${topic} could change everything?`, {
      x: 1.5, y: 2.5, w: 10.5, h: 2.5,
      fontFace: headingFont, fontSize: 36, italic: true, color: C.text, valign: "top",
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 1.5, y: 5.4, w: 0.4, h: 0.04, fill: { color: C.accent2 }, line: { width: 0 },
    });
    s.addText(slide.title, {
      x: 2.0, y: 5.25, w: 8, h: 0.4,
      fontFace: bodyFont, fontSize: 16, color: C.sub, charSpacing: 3,
    });
    pptxFooter(s, ctx);
  },

  compare(ctx) {
    const { pptx, C, headingFont, bodyFont, slide } = ctx;
    const s = pptx.addSlide();
    pptxBaseBg(s, ctx);
    s.addText(slide.title, {
      x: 0.85, y: 0.7, w: 11.5, h: 0.8,
      fontFace: headingFont, fontSize: 32, bold: true, color: C.text,
    });
    // Two columns with vs divider
    const items = slide.bullets;
    const half = Math.ceil(items.length / 2);
    const left = items.slice(0, half);
    const right = items.slice(half);
    // Left card
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.85, y: 2.0, w: 5.65, h: 4.5, rectRadius: 0.15,
      fill: { color: C.accent, transparency: 86 },
      line: { color: C.accent, width: 1.5, transparency: 50 },
    });
    s.addText("BEFORE", {
      x: 1.05, y: 2.2, w: 5, h: 0.5,
      fontFace: headingFont, fontSize: 14, bold: true, color: C.accent, charSpacing: 4,
    });
    s.addText(left.map(b => ({ text: b, options: { bullet: true, fontSize: 16, color: C.text, paraSpaceAfter: 8 } })), {
      x: 1.05, y: 2.9, w: 5.25, h: 3.4, fontFace: bodyFont, valign: "top",
    });
    // VS divider
    s.addShape(pptx.ShapeType.ellipse, {
      x: 6.41, y: 4.05, w: 0.5, h: 0.5,
      fill: { color: C.accent2 }, line: { width: 0 },
    });
    s.addText("VS", {
      x: 6.41, y: 4.05, w: 0.5, h: 0.5,
      fontFace: headingFont, fontSize: 12, bold: true,
      color: C.bg, align: "center", valign: "middle",
    });
    // Right card
    s.addShape(pptx.ShapeType.roundRect, {
      x: 6.83, y: 2.0, w: 5.65, h: 4.5, rectRadius: 0.15,
      fill: { color: C.accent2, transparency: 86 },
      line: { color: C.accent2, width: 1.5, transparency: 50 },
    });
    s.addText("AFTER", {
      x: 7.03, y: 2.2, w: 5, h: 0.5,
      fontFace: headingFont, fontSize: 14, bold: true, color: C.accent2, charSpacing: 4,
    });
    s.addText(right.map(b => ({ text: b, options: { bullet: true, fontSize: 16, color: C.text, paraSpaceAfter: 8 } })), {
      x: 7.03, y: 2.9, w: 5.25, h: 3.4, fontFace: bodyFont, valign: "top",
    });
    pptxFooter(s, ctx);
  },

  takeaways(ctx) {
    const { pptx, C, headingFont, bodyFont, slide } = ctx;
    const s = pptx.addSlide();
    pptxBaseBg(s, ctx);
    s.addText("KEY TAKEAWAYS", {
      x: 0.85, y: 0.7, w: 11.5, h: 0.4,
      fontFace: headingFont, fontSize: 12, bold: true, color: C.accent, charSpacing: 6,
    });
    s.addText(slide.title, {
      x: 0.85, y: 1.1, w: 11.5, h: 0.8,
      fontFace: headingFont, fontSize: 32, bold: true, color: C.text,
    });
    const items = slide.bullets.slice(0, 4);
    items.forEach((b, i) => {
      const y = 2.4 + i * 1.05;
      s.addShape(pptx.ShapeType.rect, {
        x: 0.85, y, w: 0.08, h: 0.85, fill: { color: C.accent }, line: { width: 0 },
      });
      s.addText(`${i + 1}`, {
        x: 1.1, y, w: 0.8, h: 0.85,
        fontFace: headingFont, fontSize: 36, bold: true, color: C.accent2, valign: "middle",
      });
      s.addText(b, {
        x: 2.0, y, w: 10.5, h: 0.85,
        fontFace: bodyFont, fontSize: 18, color: C.text, valign: "middle",
      });
    });
    pptxFooter(s, ctx);
  },

  // Fallbacks
  split(ctx)    { PPTX_RENDERERS.twoCol(ctx); },
};

// ─────────────────────────────────────────────────────────────────────────
// HTML web-slides builder
// ─────────────────────────────────────────────────────────────────────────
//
// Embodies the `skills/web-slides/` design system deterministically:
//   • Topic-aware theme catalog (8 palettes from theme-palettes.md)
//   • Rotating layout templates from layout-templates.md
//   • Staggered .reveal animations from animation-recipes.md
//   • Google Fonts per theme, decorative orbs, gradient backgrounds
//
// Forks can customise by editing PALETTES, LAYOUTS, or the per-layout
// renderers below — or by replacing buildWebSlides() entirely with an
// AI-driven generator that returns its own HTML.
// ─────────────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ─────────────────────────────────────────────────────────────────────────
// Theme palettes — ported verbatim from skills/web-slides/theme-palettes.md
// Each palette declares CSS vars + Google Fonts import. Keyword arrays
// drive topic detection in pickPalette().
// ─────────────────────────────────────────────────────────────────────────
const PALETTES = [
  {
    id: "neural-dark",
    keywords: ["ai", "code", "tech", "software", "machine learning", "neural", "data", "developer", "coding", "algorithm", "api", "cloud"],
    fonts: { display: "'Syne', sans-serif", body: "'Space Mono', monospace" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap",
    vars: { bg: "#050d1a", panel: "#0a1628", accent: "#00f5c4", accent2: "#3d8ef8", accent3: "#b44aff", text: "#e8f4ff", sub: "#5a7a9a", card: "rgba(255,255,255,0.04)", border: "rgba(0,245,196,0.18)" },
  },
  {
    id: "gold-standard",
    keywords: ["business", "finance", "investing", "investment", "money", "wealth", "banking", "venture", "stock", "market", "revenue", "profit", "ipo"],
    fonts: { display: "'Cormorant Garamond', serif", body: "'DM Sans', sans-serif" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap",
    vars: { bg: "#0c0c0c", panel: "#161616", accent: "#c9a84c", accent2: "#e8d5a3", accent3: "#ff6b35", text: "#f5f0e8", sub: "#888070", card: "rgba(201,168,76,0.06)", border: "rgba(201,168,76,0.2)" },
  },
  {
    id: "terra-viva",
    keywords: ["nature", "environment", "climate", "forest", "ocean", "earth", "wildlife", "hiking", "camping", "mountain", "river", "sustainable", "eco", "green"],
    fonts: { display: "'Playfair Display', serif", body: "'Jost', sans-serif" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Jost:wght@300;400;500&display=swap",
    vars: { bg: "#1a2a1c", panel: "#243326", accent: "#7ec850", accent2: "#f4a435", accent3: "#e85d3a", text: "#f0ede4", sub: "#8aaa7a", card: "rgba(126,200,80,0.08)", border: "rgba(126,200,80,0.2)" },
  },
  {
    id: "vital-soft",
    keywords: ["health", "wellness", "fitness", "yoga", "meditation", "nutrition", "diet", "medical", "doctor", "hospital", "wellbeing", "mindfulness"],
    fonts: { display: "'Libre Baskerville', serif", body: "'Nunito', sans-serif" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;700&family=Libre+Baskerville:wght@400;700&display=swap",
    vars: { bg: "#fafaf8", panel: "#f0f5f2", accent: "#3dbf8c", accent2: "#ff7e67", accent3: "#6b9fe4", text: "#1a2a22", sub: "#5a7a6a", card: "rgba(61,191,140,0.08)", border: "rgba(61,191,140,0.2)" },
  },
  {
    id: "scholar-crimson",
    keywords: ["history", "education", "school", "teaching", "learning", "academic", "research", "university", "literature", "philosophy", "ancient", "scholar"],
    fonts: { display: "'EB Garamond', serif", body: "'Source Sans 3', sans-serif" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;800&family=Source+Sans+3:wght@300;400;600&display=swap",
    vars: { bg: "#1c0e0e", panel: "#2a1515", accent: "#c94040", accent2: "#e8c87a", accent3: "#8facd4", text: "#f5efe0", sub: "#9a7a6a", card: "rgba(201,64,64,0.08)", border: "rgba(232,200,122,0.2)" },
  },
  {
    id: "brutalist-pop",
    keywords: ["art", "design", "creative", "music", "fashion", "photography", "film", "painting", "gallery", "studio", "brand", "marketing"],
    fonts: { display: "'Bebas Neue', sans-serif", body: "'IBM Plex Mono', monospace" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;700&display=swap",
    vars: { bg: "#f5f500", panel: "#e8e800", accent: "#0a0a0a", accent2: "#ff2d55", accent3: "#0055ff", text: "#0a0a0a", sub: "#444400", card: "rgba(0,0,0,0.06)", border: "rgba(0,0,0,0.3)" },
  },
  {
    id: "venture-pulse",
    keywords: ["startup", "pitch", "founder", "saas", "growth", "scale", "vc", "seed", "series", "product", "launch", "mvp"],
    fonts: { display: "'Plus Jakarta Sans', sans-serif", body: "'Plus Jakarta Sans', sans-serif" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;500;800&display=swap",
    vars: { bg: "#0f0720", panel: "#1a0f35", accent: "#8b5cf6", accent2: "#f59e0b", accent3: "#10b981", text: "#f8fafc", sub: "#94a3b8", card: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.25)" },
  },
  {
    id: "kinetic-edge",
    keywords: ["sport", "sports", "adventure", "racing", "gym", "athletic", "soccer", "football", "basketball", "diving", "surfing", "extreme", "competition"],
    fonts: { display: "'Barlow Condensed', sans-serif", body: "'Barlow', sans-serif" },
    fontsUrl: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=Barlow:wght@300;400&display=swap",
    vars: { bg: "#0d0d0d", panel: "#1a1a1a", accent: "#ff1a1a", accent2: "#ffd700", accent3: "#f5f5f5", text: "#ffffff", sub: "#888888", card: "rgba(255,26,26,0.08)", border: "rgba(255,215,0,0.3)" },
  },
];

function pickPalette(topic) {
  const t = String(topic || "").toLowerCase();
  let best = PALETTES[6]; // venture-pulse fallback (premium generic)
  let bestScore = 0;
  for (const p of PALETTES) {
    let score = 0;
    for (const kw of p.keywords) if (t.includes(kw)) score += kw.length;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

/** Look up a palette by id; returns null when unknown so callers can fall back. */
export function pickPaletteById(id) {
  if (!id) return null;
  return PALETTES.find((p) => p.id === id) || null;
}

/**
 * Normalise an LLM-supplied bespoke palette into the renderer shape. Accepts
 * loose input: `{ fonts?:{display,body}, fontsUrl?, vars?:{bg,panel,accent,accent2,accent3,text,sub,card?,border?} }`
 * or flat `{ bg, panel, accent, ..., displayFont, bodyFont, fontsUrl }`.
 * Missing fields fall back to sensible defaults. Returns null for non-objects.
 */
export function normalisePalette(spec) {
  if (!spec || typeof spec !== "object") return null;
  const v = spec.vars && typeof spec.vars === "object" ? spec.vars : spec;
  const f = spec.fonts && typeof spec.fonts === "object" ? spec.fonts : {};
  const vars = {
    bg:      String(v.bg      ?? "#0f0720"),
    panel:   String(v.panel   ?? "#1a0f35"),
    accent:  String(v.accent  ?? "#8b5cf6"),
    accent2: String(v.accent2 ?? "#f59e0b"),
    accent3: String(v.accent3 ?? "#10b981"),
    text:    String(v.text    ?? "#f8fafc"),
    sub:     String(v.sub     ?? "#94a3b8"),
    card:    String(v.card    ?? "rgba(255,255,255,0.06)"),
    border:  String(v.border  ?? "rgba(255,255,255,0.18)"),
  };
  const fonts = {
    display: String(f.display ?? spec.displayFont ?? "'Plus Jakarta Sans', sans-serif"),
    body:    String(f.body    ?? spec.bodyFont    ?? "'Plus Jakarta Sans', sans-serif"),
  };
  return {
    id: String(spec.id ?? "custom"),
    keywords: [],
    fonts,
    fontsUrl: typeof spec.fontsUrl === "string" ? spec.fontsUrl : "",
    vars,
  };
}

/** Stable list of palette ids the AI can choose from in a deck spec. */
export const PALETTE_IDS = PALETTES.map((p) => p.id);

/** Layouts the AI can request per slide in a deck spec. */
export const PPTX_LAYOUTS = ["cover", "twoCol", "stat", "cards", "timeline", "quote", "compare", "takeaways", "closing"];

// ─────────────────────────────────────────────────────────────────────────
// Layout outline planner — picks a sequence of layout types
// drawn from skills/web-slides/layout-templates.md.
// ─────────────────────────────────────────────────────────────────────────
const CONTENT_LAYOUTS = ["split", "cards", "stat", "quote", "timeline", "compare", "takeaways"];

function planLayouts(total) {
  // total = full slide count incl cover + closing.
  const middle = Math.max(1, total - 2);
  const seq = ["cover"];
  for (let i = 0; i < middle; i++) {
    seq.push(CONTENT_LAYOUTS[i % CONTENT_LAYOUTS.length]);
  }
  seq.push("closing");
  return seq;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-layout renderers — each returns inner HTML for one <section class="slide">
// ─────────────────────────────────────────────────────────────────────────
function renderCover({ topic, audience, tone, idx, total }) {
  return `
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="hero">
      <div class="reveal tag">PRESENTATION · ${total} SLIDES</div>
      <h1 class="reveal display">${escHtml(topic)}</h1>
      <p class="reveal subtitle">${escHtml(audience ? `Crafted for ${audience}.` : "A focused look at what matters and what to do next.")}${tone ? ` <em>${escHtml(tone)} tone.</em>` : ""}</p>
      <div class="reveal meta-row"><span>Doable</span><span class="dot">·</span><span>${new Date().getFullYear()}</span></div>
    </div>
    <div class="bar bottom"></div>
  `;
}

function renderClosing({ topic }) {
  return `
    <div class="bar top"></div>
    <div class="closing-bg">FIN</div>
    <div class="hero centered">
      <div class="reveal tag">THANK YOU</div>
      <h1 class="reveal display">Let's discuss.</h1>
      <p class="reveal subtitle">Questions about <strong>${escHtml(topic)}</strong>?</p>
      <div class="reveal cta-block"><span>Press <kbd>F</kbd> for fullscreen · <kbd>←</kbd> <kbd>→</kbd> to navigate</span></div>
    </div>
  `;
}

function renderSplit({ topic, idx }) {
  return `
    <div class="orb orb-1" style="opacity:.08"></div>
    <div class="split">
      <div class="split-left">
        <div class="reveal tag">SECTION ${String(idx).padStart(2, "0")}</div>
        <h2 class="reveal">Why ${escHtml(topic)} matters now</h2>
        <p class="reveal lead">A focused take on the forces shaping this space — and where attention pays off.</p>
        <ul class="reveal point-list">
          <li><span class="bul">→</span> Real shift in user expectations</li>
          <li><span class="bul">→</span> New tools change the unit economics</li>
          <li><span class="bul">→</span> Window to act is shorter than it looks</li>
        </ul>
      </div>
      <div class="split-right reveal">
        <div class="visual-block">
          <span class="mega-icon">◆</span>
          <div class="visual-caption">${escHtml(topic).toUpperCase()}</div>
        </div>
      </div>
    </div>
  `;
}

function renderCards({ topic, idx }) {
  const cards = [
    { icon: "⚡", t: "Speed", b: `Move on ${escHtml(topic)} in days, not quarters.` },
    { icon: "◎", t: "Focus", b: `Strip the noise. Keep what changes outcomes.` },
    { icon: "↗", t: "Compounding", b: `Small, repeatable wins beat one-off heroics.` },
  ];
  return `
    <h2 class="reveal section-title">Three pillars</h2>
    <div class="card-grid three-col">
      ${cards.map((c) => `
        <div class="card reveal">
          <div class="card-icon">${c.icon}</div>
          <h3 class="card-title">${c.t}</h3>
          <p class="card-body">${c.b}</p>
        </div>`).join("")}
    </div>
  `;
}

function renderStat({ topic }) {
  const num = 84 + Math.floor(Math.random() * 14);
  return `
    <div class="stat-bg-text">DATA</div>
    <div class="hero centered">
      <div class="reveal tag">BY THE NUMBERS</div>
      <div class="reveal stat-block"><span class="stat-number">${num}</span><span class="stat-unit">%</span></div>
      <div class="reveal stat-label">of teams that lean into <strong>${escHtml(topic)}</strong> see measurable impact within a quarter.</div>
      <div class="reveal stat-context">Driven by clearer focus, faster iteration loops, and shared understanding across the team.</div>
    </div>
  `;
}

function renderQuote({ topic }) {
  return `
    <div class="quote-mark reveal">"</div>
    <div class="hero centered">
      <blockquote class="reveal pull-quote">The best way to understand <strong>${escHtml(topic)}</strong> is to ship something small with it — today.</blockquote>
      <div class="reveal quote-attribution">
        <span class="attr-name">— Anonymous Practitioner</span>
        <span class="attr-title">Builder · Operator · Curious mind</span>
      </div>
    </div>
    <div class="quote-mark reveal closing-mark">"</div>
  `;
}

function renderTimeline({ topic }) {
  const steps = [
    { n: "01", t: "Discover", b: `Map the surface of ${escHtml(topic)}.` },
    { n: "02", t: "Prototype", b: "Build the smallest thing that proves the idea." },
    { n: "03", t: "Iterate", b: "Ship, listen, refine. Repeat." },
  ];
  return `
    <h2 class="reveal section-title">The path forward</h2>
    <div class="timeline">
      ${steps.map((s) => `
        <div class="timeline-item reveal">
          <div class="timeline-node">${s.n}</div>
          <div class="timeline-content">
            <h4>${s.t}</h4>
            <p>${s.b}</p>
          </div>
        </div>`).join("")}
    </div>
  `;
}

function renderCompare({ topic }) {
  return `
    <h2 class="reveal section-title">Before vs After</h2>
    <div class="comparison-grid">
      <div class="comparison-col col-before reveal">
        <div class="col-label">Before</div>
        <ul>
          <li>Fragmented attention across ${escHtml(topic)} efforts</li>
          <li>Long cycles between idea and feedback</li>
          <li>Hard to tell what's actually moving the needle</li>
        </ul>
      </div>
      <div class="comparison-divider"></div>
      <div class="comparison-col col-after reveal">
        <div class="col-label">After</div>
        <ul>
          <li>One sharp question driving the work</li>
          <li>Days, not weeks, to learn something real</li>
          <li>Clear signals tied to a clear next move</li>
        </ul>
      </div>
    </div>
  `;
}

function renderTakeaways({ topic }) {
  const items = [
    `${escHtml(topic)} rewards focus over breadth`,
    "Small, frequent loops beat big bets",
    "The right next step is usually obvious — it just needs picking",
  ];
  return `
    <div class="closing-bg-text">KEY</div>
    <div class="hero centered">
      <div class="reveal tag">TAKEAWAYS</div>
      <h2 class="reveal closing-headline">Three things to remember</h2>
      <div class="takeaway-list reveal">
        ${items.map((t, i) => `
          <div class="takeaway-item">
            <span class="tk-num">${i + 1}</span>
            <span class="tk-text">${t}</span>
          </div>`).join("")}
      </div>
    </div>
  `;
}

const RENDERERS = {
  cover: renderCover,
  closing: renderClosing,
  split: renderSplit,
  cards: renderCards,
  stat: renderStat,
  quote: renderQuote,
  timeline: renderTimeline,
  compare: renderCompare,
  takeaways: renderTakeaways,
};

/**
 * Build a single-file HTML slide deck. Returns { html, fileName, slideCount, paletteId }.
 * Embodies skills/web-slides/ deterministically.
 */
export function buildWebSlides({ topic, slideCount, audience, tone }) {
  const t = (topic || "Presentation").trim();
  const total = clampSlideCount(slideCount);
  const palette = pickPalette(t);
  const layouts = planLayouts(total);

  const slidesHtml = layouts.map((layout, idx) => {
    const renderer = RENDERERS[layout] || RENDERERS.split;
    const inner = renderer({ topic: t, audience, tone, idx, total: layouts.length });
    return `<section class="slide layout-${layout}" data-i="${idx}">${inner}</section>`;
  }).join("\n");

  const v = palette.vars;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escHtml(t)} — Slides</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${palette.fontsUrl}">
<style>
  :root {
    --bg: ${v.bg}; --panel: ${v.panel};
    --accent: ${v.accent}; --accent2: ${v.accent2}; --accent3: ${v.accent3};
    --text: ${v.text}; --sub: ${v.sub};
    --card: ${v.card}; --border: ${v.border};
    --font-display: ${palette.fonts.display};
    --font-body: ${palette.fonts.body};
    --pad: 7vmin;
    --speed: 0.7s;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 18px; line-height: 1.5; overflow: hidden; }
  .deck { position: fixed; inset: 0; }

  /* Slide base */
  .slide { position: absolute; inset: 0; padding: var(--pad); display: flex; flex-direction: column; justify-content: center; opacity: 0; pointer-events: none; transition: opacity var(--speed) cubic-bezier(0.16,1,0.3,1), transform var(--speed) cubic-bezier(0.16,1,0.3,1); transform: translateY(40px); overflow: hidden; }
  .slide.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
  .slide.exit-left { opacity: 0; transform: translateX(-60px) scale(0.97); }

  /* Reveal animation — staggered */
  .reveal { opacity: 0; transform: translateY(24px); }
  .slide.active .reveal { animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) forwards; }
  .slide.active .reveal:nth-child(1) { animation-delay: 0.10s; }
  .slide.active .reveal:nth-child(2) { animation-delay: 0.22s; }
  .slide.active .reveal:nth-child(3) { animation-delay: 0.34s; }
  .slide.active .reveal:nth-child(4) { animation-delay: 0.46s; }
  .slide.active .reveal:nth-child(5) { animation-delay: 0.58s; }
  .slide.active .reveal:nth-child(6) { animation-delay: 0.70s; }
  @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }

  /* Typography */
  h1.display { font-family: var(--font-display); font-size: clamp(40px, 8vw, 96px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.02; }
  h2 { font-family: var(--font-display); font-size: clamp(28px, 4.5vw, 56px); font-weight: 700; letter-spacing: -0.015em; }
  h3, h4 { font-family: var(--font-display); }
  .tag { font-family: var(--font-body); font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); margin-bottom: 1.5vmin; font-weight: 600; }
  .subtitle, .lead { font-size: clamp(17px, 2vw, 24px); color: var(--sub); margin-top: 2vmin; max-width: 65ch; line-height: 1.5; }
  .meta-row { display: flex; gap: 12px; align-items: center; margin-top: 4vmin; color: var(--sub); font-size: 13px; letter-spacing: 0.05em; }
  .meta-row .dot { color: var(--accent); }
  kbd { display: inline-block; padding: 2px 6px; background: var(--card); border: 1px solid var(--border); border-radius: 4px; font-family: var(--font-body); font-size: 11px; }

  /* Hero (cover, closing, stat, quote) */
  .hero { display: flex; flex-direction: column; gap: 1.5vmin; max-width: 80%; }
  .hero.centered { align-items: center; text-align: center; margin: 0 auto; }
  .hero.centered .subtitle, .hero.centered .lead { text-align: center; }

  /* Decorative orbs */
  .orb { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; }
  .orb-1 { width: 60vmin; height: 60vmin; background: var(--accent); opacity: 0.20; top: -15vmin; right: -15vmin; animation: float 14s ease-in-out infinite; }
  .orb-2 { width: 40vmin; height: 40vmin; background: var(--accent2); opacity: 0.18; bottom: -10vmin; left: -10vmin; animation: float 18s ease-in-out infinite reverse; }
  @keyframes float { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-30px) scale(1.05); } }

  /* Bars */
  .bar { position: absolute; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
  .bar.bottom { bottom: 0; }
  .bar.top { top: 0; }

  /* Split layout */
  .split { display: grid; grid-template-columns: 1.2fr 1fr; gap: 6vmin; align-items: center; height: 100%; }
  .split-left .point-list { list-style: none; display: grid; gap: 1.6vmin; margin-top: 3vmin; }
  .split-left .point-list li { font-size: clamp(16px, 1.8vw, 22px); color: var(--sub); display: flex; gap: 0.8em; align-items: baseline; }
  .split-left .point-list .bul { color: var(--accent); font-weight: 700; }
  .split-right .visual-block { background: var(--card); border: 1px solid var(--border); border-radius: 24px; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2vmin; }
  .visual-block .mega-icon { font-size: clamp(64px, 12vw, 140px); color: var(--accent); }
  .visual-block .visual-caption { font-family: var(--font-display); font-size: clamp(14px, 1.4vw, 18px); letter-spacing: 0.15em; color: var(--text); }

  /* Card grid */
  .section-title { margin-bottom: 4vmin; }
  .card-grid { display: grid; gap: 3vmin; }
  .card-grid.three-col { grid-template-columns: repeat(3, 1fr); }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 3.5vmin 3vmin; display: flex; flex-direction: column; gap: 1.5vmin; }
  .card-icon { font-size: clamp(28px, 3vw, 40px); color: var(--accent); }
  .card-title { font-size: clamp(20px, 2.2vw, 28px); font-weight: 700; }
  .card-body { font-size: clamp(14px, 1.5vw, 18px); color: var(--sub); line-height: 1.5; }

  /* Stat */
  .stat-bg-text { position: absolute; bottom: -8vmin; left: 50%; transform: translateX(-50%); font-family: var(--font-display); font-size: 40vmin; font-weight: 800; color: var(--accent); opacity: 0.05; pointer-events: none; line-height: 1; }
  .stat-block { display: flex; align-items: baseline; gap: 0.1em; }
  .stat-number { font-family: var(--font-display); font-size: clamp(80px, 18vw, 240px); font-weight: 800; color: var(--accent); line-height: 1; letter-spacing: -0.04em; }
  .stat-unit { font-family: var(--font-display); font-size: clamp(40px, 8vw, 100px); font-weight: 700; color: var(--accent2); }
  .stat-label { font-size: clamp(18px, 2.2vw, 28px); color: var(--text); max-width: 60ch; margin-top: 1vmin; }
  .stat-context { font-size: clamp(14px, 1.5vw, 18px); color: var(--sub); max-width: 55ch; margin-top: 2vmin; }

  /* Quote */
  .quote-mark { position: absolute; font-family: var(--font-display); font-size: 30vmin; line-height: 0.6; color: var(--accent); opacity: 0.2; top: 4vmin; left: 4vmin; pointer-events: none; }
  .quote-mark.closing-mark { top: auto; left: auto; bottom: -2vmin; right: 4vmin; }
  .pull-quote { font-family: var(--font-display); font-size: clamp(28px, 4.5vw, 52px); font-style: italic; line-height: 1.25; max-width: 22ch; }
  .quote-attribution { display: flex; flex-direction: column; gap: 0.3em; margin-top: 4vmin; }
  .quote-attribution .attr-name { font-size: 18px; font-weight: 600; color: var(--text); }
  .quote-attribution .attr-title { font-size: 13px; color: var(--sub); letter-spacing: 0.05em; }

  /* Timeline */
  .timeline { display: grid; gap: 2.5vmin; max-width: 70ch; }
  .timeline-item { display: grid; grid-template-columns: auto 1fr; gap: 3vmin; align-items: center; padding: 2.5vmin 3vmin; background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
  .timeline-node { font-family: var(--font-display); font-size: clamp(32px, 4vw, 52px); font-weight: 800; color: var(--accent); line-height: 1; min-width: 1.5em; }
  .timeline-content h4 { font-size: clamp(20px, 2.2vw, 28px); font-weight: 700; color: var(--text); }
  .timeline-content p { font-size: clamp(14px, 1.6vw, 18px); color: var(--sub); margin-top: 0.4em; }

  /* Compare */
  .comparison-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 4vmin; align-items: stretch; }
  .comparison-col { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 3.5vmin; }
  .comparison-col .col-label { font-family: var(--font-display); font-size: clamp(20px, 2.4vw, 32px); font-weight: 700; margin-bottom: 2vmin; }
  .comparison-col.col-before .col-label { color: var(--accent3); }
  .comparison-col.col-after .col-label { color: var(--accent); }
  .comparison-col ul { list-style: none; display: grid; gap: 1.4vmin; }
  .comparison-col li { font-size: clamp(14px, 1.6vw, 18px); color: var(--sub); padding-left: 1em; position: relative; }
  .comparison-col li::before { content: "•"; position: absolute; left: 0; color: var(--accent); }
  .comparison-divider { width: 1px; background: var(--border); }

  /* Takeaways */
  .closing-bg, .closing-bg-text { position: absolute; bottom: -10vmin; left: 50%; transform: translateX(-50%); font-family: var(--font-display); font-size: 50vmin; font-weight: 800; color: var(--accent); opacity: 0.05; pointer-events: none; line-height: 1; }
  .closing-headline { margin: 1vmin 0 4vmin; }
  .takeaway-list { display: grid; gap: 1.5vmin; max-width: 60ch; margin: 0 auto; }
  .takeaway-item { display: grid; grid-template-columns: auto 1fr; gap: 2.5vmin; align-items: center; padding: 2vmin 3vmin; background: var(--card); border: 1px solid var(--border); border-radius: 12px; text-align: left; }
  .tk-num { font-family: var(--font-display); font-size: clamp(28px, 3.5vw, 44px); font-weight: 800; color: var(--accent); line-height: 1; }
  .tk-text { font-size: clamp(14px, 1.7vw, 20px); color: var(--text); }
  .cta-block { margin-top: 5vmin; font-size: 13px; color: var(--sub); letter-spacing: 0.05em; }

  /* Nav + progress */
  .nav { position: fixed; bottom: 2vmin; right: 2vmin; display: flex; gap: 8px; align-items: center; color: var(--sub); font-size: 13px; z-index: 100; font-family: var(--font-body); }
  .nav button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 6px; background: var(--card); border: 1px solid var(--border); color: var(--text); font-size: 13px; transition: background 0.15s; }
  .nav button:hover { background: var(--border); }
  .counter { padding: 0 8px; font-variant-numeric: tabular-nums; }
  .progress { position: fixed; top: 0; left: 0; height: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); transition: width 0.5s ease; z-index: 100; }

  /* Print */
  @media print {
    .nav, .progress, .orb { display: none; }
    .slide { opacity: 1 !important; pointer-events: auto !important; transform: none !important; position: relative; page-break-after: always; height: 100vh; }
    html, body { overflow: visible; }
  }
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="deck" id="deck">
${slidesHtml}
</div>
<div class="nav">
  <button id="prev" title="Previous (←)">‹</button>
  <span class="counter"><span id="cur">1</span> / <span id="tot">${layouts.length}</span></span>
  <button id="next" title="Next (→)">›</button>
  <button id="full" title="Fullscreen (F)">⛶</button>
</div>
<script>
  const slides = [...document.querySelectorAll('.slide')];
  const cur = document.getElementById('cur');
  const progress = document.getElementById('progress');
  let i = 0;
  function show(n) {
    const next = Math.max(0, Math.min(slides.length - 1, n));
    if (next === i && slides[i].classList.contains('active')) return;
    if (slides[i] && next !== i) {
      slides[i].classList.add('exit-left');
      setTimeout(() => slides[i] && slides[i].classList.remove('exit-left'), 700);
    }
    slides.forEach((s, idx) => s.classList.toggle('active', idx === next));
    i = next;
    cur.textContent = i + 1;
    progress.style.width = ((i + 1) / slides.length * 100) + '%';
    location.hash = '#' + (i + 1);
  }
  document.getElementById('prev').onclick = () => show(i - 1);
  document.getElementById('next').onclick = () => show(i + 1);
  document.getElementById('full').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { show(i + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(i - 1); e.preventDefault(); }
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(slides.length - 1);
    else if (e.key === 'f' || e.key === 'F') document.getElementById('full').click();
  });
  // Click left/right halves of viewport to navigate
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav') || e.target.closest('a') || e.target.closest('button')) return;
    if (e.clientX < window.innerWidth / 2) show(i - 1);
    else show(i + 1);
  });
  // Touch swipe
  let touchX = 0;
  document.addEventListener('touchstart', e => touchX = e.touches[0].clientX, { passive: true });
  document.addEventListener('touchend', e => {
    const d = e.changedTouches[0].clientX - touchX;
    if (Math.abs(d) > 50) show(i + (d < 0 ? 1 : -1));
  }, { passive: true });
  const startHash = parseInt(location.hash.slice(1), 10);
  show(Number.isFinite(startHash) && startHash > 0 ? startHash - 1 : 0);
</script>
</body>
</html>`;

  return {
    html,
    fileName: `${slugify(t)}.html`,
    slideCount: layouts.length,
    paletteId: palette.id,
  };
}
