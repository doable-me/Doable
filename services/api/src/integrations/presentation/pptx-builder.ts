/**
 * PPTX Builder
 *
 * Server-side PowerPoint (.pptx) generator for the presentation-builder
 * MCP picker. Produces a real .pptx binary from a topic + a few hints,
 * using PptxGenJS, with a tasteful default theme.
 *
 * No LLM is called in this version — slide content is template-driven
 * from the topic. Phase 2 will add an LLM-drafted slide spec.
 */
import PptxGenJS from "pptxgenjs";

export interface PptxSpecHints {
  topic: string;
  slideCount?: number;
  audience?: string;
  tone?: string;
}

export interface PptxBuildResult {
  buffer: Buffer;
  fileName: string;
  slideCount: number;
}

const DEFAULT_SLIDES = 5;
const MIN_SLIDES = 3;
const MAX_SLIDES = 12;

const THEME = {
  bg: "0F172A",      // slate-900
  surface: "1E293B", // slate-800
  text: "F8FAFC",    // slate-50
  muted: "94A3B8",   // slate-400
  accent: "38BDF8",  // sky-400
  accent2: "F472B6", // pink-400
};

function clampSlideCount(n: unknown): number {
  const v = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v)) return DEFAULT_SLIDES;
  return Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.floor(v)));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "presentation";
}

function buildOutline(topic: string, count: number, audience?: string, tone?: string): {
  title: string;
  subtitle: string;
  contentSlides: Array<{ heading: string; bullets: string[] }>;
  closing: { heading: string; bullets: string[] };
} {
  const title = topic.replace(/^./, (c) => c.toUpperCase());
  const subtitleParts: string[] = [];
  if (audience) subtitleParts.push(`For ${audience}`);
  if (tone) subtitleParts.push(`${tone[0].toUpperCase() + tone.slice(1)} tone`);
  const subtitle = subtitleParts.join(" • ") || "An overview";

  // 1 cover + N content + 1 closing → contentSlides count = count - 2
  const contentCount = Math.max(1, count - 2);

  const sectionTemplates: Array<{ heading: (t: string) => string; bullets: (t: string) => string[] }> = [
    {
      heading: (t) => `Introduction to ${t}`,
      bullets: (t) => [
        `What ${t} is and why it matters`,
        "Key terms and concepts at a glance",
        "Where we are heading in this deck",
      ],
    },
    {
      heading: (t) => `A brief history of ${t}`,
      bullets: () => [
        "Origins and early developments",
        "Major milestones and turning points",
        "How it shapes the present",
      ],
    },
    {
      heading: (t) => `Why ${t} matters today`,
      bullets: () => [
        "Real-world impact",
        "Who is affected and how",
        "Opportunities and risks",
      ],
    },
    {
      heading: (t) => `${t} in practice`,
      bullets: () => [
        "Common patterns and best practices",
        "Examples that work well",
        "Common pitfalls to avoid",
      ],
    },
    {
      heading: () => `Looking ahead`,
      bullets: (t) => [
        `Where ${t} is heading next`,
        "Trends to watch",
        "How to stay informed",
      ],
    },
    {
      heading: () => `Key takeaways`,
      bullets: (t) => [
        `${t} is shaped by people, context, and choice`,
        "Small steps compound into meaningful change",
        "What to do next",
      ],
    },
  ];

  const contentSlides = Array.from({ length: contentCount }, (_, i) => {
    const tpl = sectionTemplates[i % sectionTemplates.length];
    return { heading: tpl.heading(title), bullets: tpl.bullets(title) };
  });

  return {
    title,
    subtitle,
    contentSlides,
    closing: {
      heading: "Thank you",
      bullets: [
        `Questions on ${title}?`,
        "Let's continue the conversation.",
      ],
    },
  };
}

export async function buildPptx(hints: PptxSpecHints): Promise<PptxBuildResult> {
  const topic = String(hints.topic ?? "").trim();
  if (!topic) throw new Error("topic is required");

  const slideCount = clampSlideCount(hints.slideCount);
  const outline = buildOutline(topic, slideCount, hints.audience, hints.tone);

  // 16:9 widescreen
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = outline.title;
  pptx.subject = outline.title;
  pptx.author = "Doable";
  pptx.company = "Doable";

  // Cover slide
  const cover = pptx.addSlide();
  cover.background = { color: THEME.bg };
  cover.addShape("rect", {
    x: 0, y: 6.6, w: 13.33, h: 0.06,
    fill: { color: THEME.accent }, line: { color: THEME.accent },
  });
  cover.addText(outline.title, {
    x: 0.7, y: 2.6, w: 11.9, h: 1.6,
    fontSize: 54, bold: true, color: THEME.text, fontFace: "Calibri",
  });
  cover.addText(outline.subtitle, {
    x: 0.7, y: 4.4, w: 11.9, h: 0.6,
    fontSize: 22, color: THEME.muted, fontFace: "Calibri",
  });
  cover.addText("Doable", {
    x: 0.7, y: 6.85, w: 4, h: 0.3,
    fontSize: 11, color: THEME.muted, fontFace: "Calibri",
  });

  // Content slides
  outline.contentSlides.forEach((slide, idx) => {
    const s = pptx.addSlide();
    s.background = { color: THEME.bg };
    s.addText(`${String(idx + 1).padStart(2, "0")}`, {
      x: 0.7, y: 0.4, w: 1.5, h: 0.5,
      fontSize: 14, bold: true, color: THEME.accent, fontFace: "Calibri",
    });
    s.addText(slide.heading, {
      x: 0.7, y: 0.9, w: 11.9, h: 1.0,
      fontSize: 32, bold: true, color: THEME.text, fontFace: "Calibri",
    });
    s.addShape("rect", {
      x: 0.7, y: 1.95, w: 1.4, h: 0.05,
      fill: { color: THEME.accent }, line: { color: THEME.accent },
    });
    s.addText(
      slide.bullets.map((b) => ({ text: b, options: { bullet: { code: "25CF" } } })),
      {
        x: 0.9, y: 2.4, w: 11.5, h: 4.2,
        fontSize: 20, color: THEME.text, fontFace: "Calibri",
        paraSpaceAfter: 14,
      },
    );
    s.addText(`Doable  •  ${outline.title}`, {
      x: 0.7, y: 6.95, w: 11.9, h: 0.3,
      fontSize: 9, color: THEME.muted, fontFace: "Calibri",
    });
  });

  // Closing slide
  const close = pptx.addSlide();
  close.background = { color: THEME.bg };
  close.addText(outline.closing.heading, {
    x: 0.7, y: 2.6, w: 11.9, h: 1.4,
    fontSize: 54, bold: true, color: THEME.text, fontFace: "Calibri",
  });
  close.addText(
    outline.closing.bullets.map((b) => ({ text: b, options: { bullet: false } })),
    {
      x: 0.7, y: 4.2, w: 11.9, h: 1.5,
      fontSize: 20, color: THEME.muted, fontFace: "Calibri",
      paraSpaceAfter: 10,
    },
  );
  close.addShape("rect", {
    x: 0, y: 6.6, w: 13.33, h: 0.06,
    fill: { color: THEME.accent2 }, line: { color: THEME.accent2 },
  });

  // Render to Node Buffer. PptxGenJS returns ArrayBuffer when outputType="nodebuffer"
  // but type signature says string in some versions; coerce safely.
  const out = (await pptx.write({ outputType: "nodebuffer" })) as unknown;
  const buffer = Buffer.isBuffer(out)
    ? out
    : out instanceof ArrayBuffer
      ? Buffer.from(out)
      : out instanceof Uint8Array
        ? Buffer.from(out)
        : Buffer.from(String(out));

  const fileName = `${slugify(outline.title)}.pptx`;
  // pptx.addSlide is internal — just compute it from outline length.
  const totalSlides = 1 + outline.contentSlides.length + 1;
  return { buffer, fileName, slideCount: totalSlides };
}
