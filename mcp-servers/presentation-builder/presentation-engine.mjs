/**
 * Presentation engine — pure pptxgenjs build (no LLM, deterministic template).
 * Runs entirely inside this MCP server. The host knows nothing about it.
 */
import PptxGenJS from "pptxgenjs";

const THEME = {
  bg: "0F172A",          // slate-900
  panel: "1E293B",       // slate-800
  accent: "38BDF8",      // sky-400
  accent2: "F472B6",     // pink-400
  text: "F8FAFC",        // slate-50
  subtext: "CBD5E1",     // slate-300
};

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
  const n = clampSlideCount(slideCount);
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
 * Build a real .pptx Buffer for the given hints.
 * Returns { buffer, fileName, slideCount }.
 */
export async function buildPptx({ topic, slideCount, audience, tone }) {
  const t = (topic || "Presentation").trim();
  const outline = buildOutline({ topic: t, slideCount, audience, tone });

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
  pptx.title = t;
  pptx.company = "Doable";

  for (const slide of outline) {
    const s = pptx.addSlide();
    s.background = { color: THEME.bg };

    if (slide.type === "cover") {
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 6.6, w: 13.33, h: 0.9, fill: { color: THEME.accent },
      });
      s.addText(slide.title, {
        x: 0.6, y: 2.2, w: 12, h: 2.2,
        fontFace: "Calibri", fontSize: 60, bold: true, color: THEME.text,
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.6, y: 4.5, w: 12, h: 1,
          fontFace: "Calibri", fontSize: 22, color: THEME.subtext,
        });
      }
    } else if (slide.type === "closing") {
      s.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: THEME.accent2 },
      });
      s.addText(slide.title, {
        x: 0.6, y: 2.5, w: 12, h: 1.6,
        fontFace: "Calibri", fontSize: 54, bold: true, color: THEME.text,
      });
      s.addText(slide.subtitle, {
        x: 0.6, y: 4.3, w: 12, h: 1,
        fontFace: "Calibri", fontSize: 24, color: THEME.subtext,
      });
    } else {
      s.addShape(pptx.ShapeType.rect, {
        x: 0.6, y: 0.9, w: 0.15, h: 5.5, fill: { color: THEME.accent },
      });
      s.addText(slide.title, {
        x: 1.0, y: 0.7, w: 11.5, h: 1.0,
        fontFace: "Calibri", fontSize: 36, bold: true, color: THEME.text,
      });
      const bulletObjs = slide.bullets.map((b) => ({
        text: b,
        options: { bullet: { indent: 20 }, fontSize: 22, color: THEME.subtext },
      }));
      s.addText(bulletObjs, {
        x: 1.0, y: 2.0, w: 11.5, h: 4.5,
        fontFace: "Calibri", paraSpaceAfter: 14,
      });
    }
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return {
    buffer,
    fileName: `${slugify(t)}.pptx`,
    slideCount: outline.length,
  };
}
