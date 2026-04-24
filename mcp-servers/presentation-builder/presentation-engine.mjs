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

// ─────────────────────────────────────────────────────────────────────────
// HTML web-slides builder
// ─────────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/**
 * Build a single-file HTML slide deck. Returns { html, fileName, slideCount }.
 * The deck is keyboard-navigable (←/→/Space), full-screen friendly, with
 * a subtle fade animation between slides.
 */
export function buildWebSlides({ topic, slideCount, audience, tone }) {
  const t = (topic || "Presentation").trim();
  const outline = buildOutline({ topic: t, slideCount, audience, tone });

  const slidesHtml = outline.map((slide, i) => {
    if (slide.type === "cover") {
      return `<section class="slide cover" data-i="${i}">
        <h1>${escHtml(slide.title)}</h1>
        ${slide.subtitle ? `<p class="sub">${escHtml(slide.subtitle)}</p>` : ""}
        <div class="bar"></div>
      </section>`;
    }
    if (slide.type === "closing") {
      return `<section class="slide closing" data-i="${i}">
        <div class="bar top"></div>
        <h1>${escHtml(slide.title)}</h1>
        <p class="sub">${escHtml(slide.subtitle)}</p>
      </section>`;
    }
    const bullets = slide.bullets.map((b) => `<li>${escHtml(b)}</li>`).join("");
    return `<section class="slide content" data-i="${i}">
      <div class="rule"></div>
      <h2>${escHtml(slide.title)}</h2>
      <ul>${bullets}</ul>
    </section>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escHtml(t)} — Slides</title>
<style>
  :root {
    --bg: #${THEME.bg};
    --panel: #${THEME.panel};
    --accent: #${THEME.accent};
    --accent2: #${THEME.accent2};
    --text: #${THEME.text};
    --sub: #${THEME.subtext};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: var(--bg); color: var(--text); font: 18px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; overflow: hidden; }
  .deck { position: fixed; inset: 0; }
  .slide { position: absolute; inset: 0; padding: 8vmin; display: flex; flex-direction: column; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .4s ease, transform .5s ease; transform: translateY(12px); }
  .slide.active { opacity: 1; pointer-events: auto; transform: translateY(0); }
  .slide h1 { font-size: clamp(36px, 7vw, 84px); font-weight: 800; letter-spacing: -.02em; line-height: 1.05; }
  .slide h2 { font-size: clamp(28px, 4vw, 52px); font-weight: 700; letter-spacing: -.01em; margin-bottom: 4vmin; }
  .slide .sub { font-size: clamp(18px, 2.2vw, 28px); color: var(--sub); margin-top: 2vmin; max-width: 70ch; }
  .slide ul { list-style: none; display: grid; gap: 2vmin; }
  .slide li { font-size: clamp(20px, 2.4vw, 30px); color: var(--sub); padding-left: 1.4em; position: relative; }
  .slide li::before { content: ""; position: absolute; left: 0; top: .65em; width: .6em; height: .15em; background: var(--accent); border-radius: 3px; }
  .slide.cover .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 1.2vmin; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
  .slide.closing .bar.top { position: absolute; left: 0; right: 0; top: 0; height: 1.2vmin; background: linear-gradient(90deg, var(--accent2), var(--accent)); }
  .slide.content .rule { position: absolute; left: 8vmin; top: 8vmin; bottom: 8vmin; width: .4vmin; background: var(--accent); border-radius: 2px; }
  .slide.content h2, .slide.content ul { padding-left: 4vmin; }
  .nav { position: fixed; bottom: 2vmin; right: 2vmin; display: flex; gap: 8px; align-items: center; color: var(--sub); font-size: 13px; z-index: 10; }
  .nav button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 6px; background: rgba(255,255,255,.06); color: var(--text); font-size: 13px; }
  .nav button:hover { background: rgba(255,255,255,.12); }
  .counter { padding: 0 8px; font-variant-numeric: tabular-nums; }
  .progress { position: fixed; top: 0; left: 0; height: 3px; background: var(--accent); transition: width .3s ease; z-index: 10; }
  @media print { .nav, .progress { display: none; } .slide { opacity: 1 !important; pointer-events: auto !important; transform: none !important; position: relative; page-break-after: always; height: 100vh; } html, body { overflow: visible; } }
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="deck" id="deck">
${slidesHtml}
</div>
<div class="nav">
  <button id="prev" title="Previous (←)">‹</button>
  <span class="counter"><span id="cur">1</span> / <span id="tot">${outline.length}</span></span>
  <button id="next" title="Next (→)">›</button>
  <button id="full" title="Fullscreen (F)">⛶</button>
</div>
<script>
  const slides = [...document.querySelectorAll('.slide')];
  const cur = document.getElementById('cur');
  const progress = document.getElementById('progress');
  let i = 0;
  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
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
  const startHash = parseInt(location.hash.slice(1), 10);
  show(Number.isFinite(startHash) && startHash > 0 ? startHash - 1 : 0);
</script>
</body>
</html>`;

  return {
    html,
    fileName: `${slugify(t)}.html`,
    slideCount: outline.length,
  };
}
