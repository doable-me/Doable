/**
 * Shared UI helpers for Doable's built-in MCP App servers.
 *
 * These are theme-adaptive HTML fragments matching the patterns used
 * by mcp-servers/presentation-builder. The host (Doable) injects:
 *   - color-scheme on <html>
 *   - data-theme="dark"|"light" on <html>
 *   - body { margin/padding: 0 !important; background: transparent !important }
 *   - postMessage 'host-ready' when chat is idle
 *   - postMessage 'status' with payload.lines = ["..."]
 *   - postMessage 'deck-ready' (or generic 'ready') with payload.text
 *
 * Cards must:
 *   - postMessage {type:'size', payload:{height}} on every layout change
 *   - never set body background or padding (host overrides)
 *   - provide BOTH light defaults AND html[data-theme="dark"] rules
 */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "document"
  );
}

/**
 * Auto-build status card.
 *
 * Drops into chat right after `create_*` is called. On `host-ready`
 * it postMessages a `prompt` back to the host that injects a
 * synthetic user turn — the BUILD_* prompt — telling the LLM to
 * narrate progress and call `build_*` once.
 *
 * Listens for status/deck-ready messages from the host so live AI
 * narration appears inside the card itself (no static spinner).
 *
 * Inputs:
 *   - topic:        plain string (used in default text)
 *   - title:        e.g. "Designing your spreadsheet…"
 *   - subtitle:     e.g. "Warming up — researching your topic."
 *   - displayText:  the bubble shown in chat as a synthetic user turn
 *   - buildPrompt:  the long instructional prompt sent back via postMessage('prompt')
 *   - accent:       hex tuple { lightFg, lightBg, lightBorder, darkFg } (optional)
 */
export function autoBuildCardHtml({
  topic,
  title,
  subtitle,
  displayText,
  buildPrompt,
  accent = {},
}) {
  const a = {
    lightBg1: accent.lightBg1 || "#faf8ff",
    lightBg2: accent.lightBg2 || "#f3f0ff",
    lightBorder: accent.lightBorder || "#c4b5fd",
    lightTitle: accent.lightTitle || "#6d28d9",
    lightSub: accent.lightSub || "#7c3aed",
    spinTrack: accent.spinTrack || "#c4b5fd",
    spinHead: accent.spinHead || "#7c3aed",
    scrollLight: accent.scrollLight || "#c4b5fd",
  };
  const buildPromptJson = JSON.stringify(String(buildPrompt));
  const displayTextJson = JSON.stringify(String(displayText));
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; font: 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 10px 0; background: transparent; color: #1a1a2e; }
  .card { background: linear-gradient(135deg, ${a.lightBg1} 0%, ${a.lightBg2} 100%); border: 1px solid ${a.lightBorder}; border-radius: 14px; padding: 14px 18px; box-shadow: 0 2px 8px rgba(109,40,217,.08); }
  .hdr { display: flex; gap: 12px; align-items: center; }
  .spin { width: 18px; height: 18px; border: 2.5px solid ${a.spinTrack}; border-top-color: ${a.spinHead}; border-radius: 50%; animation: sp 0.8s linear infinite; flex: none; }
  .spin.done { border-top-color: #10b981; animation: none; background: #10b981; border-color: #10b981; position: relative; }
  .spin.done::after { content: '✓'; position: absolute; inset: 0; color: white; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  @keyframes sp { to { transform: rotate(360deg); } }
  .msg { flex: 1; min-width: 0; }
  .ttl { font-weight: 600; color: ${a.lightTitle}; font-size: 13px; }
  .sub { font-size: 11px; color: ${a.lightSub}; margin-top: 2px; }
  .log { margin-top: 10px; padding-top: 10px; border-top: 1px dashed ${a.lightBorder}; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .log:empty { display: none; }
  .line { font-size: 12px; color: #1e1b4b; line-height: 1.45; padding: 2px 0; animation: fi .25s ease-out; white-space: pre-wrap; word-wrap: break-word; }
  .line.stale { color: ${a.lightSub}; opacity: .65; }
  @keyframes fi { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .meta { margin-top: 8px; display: flex; justify-content: space-between; gap: 10px; font-size: 10px; color: ${a.lightSub}; font-variant-numeric: tabular-nums; opacity: .7; }
  .log::-webkit-scrollbar { width: 6px; }
  .log::-webkit-scrollbar-track { background: transparent; }
  .log::-webkit-scrollbar-thumb { background: ${a.scrollLight}; border-radius: 3px; }

  /* Dark mode */
  html[data-theme="dark"] body { color: #f4f4f5; }
  html[data-theme="dark"] .card { background: #111113; border-color: #27272a; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  html[data-theme="dark"] .ttl { color: #f4f4f5; }
  html[data-theme="dark"] .sub { color: #a1a1aa; }
  html[data-theme="dark"] .spin { border-color: #3f3f46; border-top-color: #a78bfa; }
  html[data-theme="dark"] .log { border-top-color: #27272a; }
  html[data-theme="dark"] .line { color: #e4e4e7; }
  html[data-theme="dark"] .line.stale { color: #71717a; }
  html[data-theme="dark"] .meta { color: #71717a; }
  html[data-theme="dark"] .log::-webkit-scrollbar-thumb { background: #3f3f46; }
  html[data-theme="dark"] .log::-webkit-scrollbar-thumb:hover { background: #52525b; }
</style></head>
<body>
<div class="card">
  <div class="hdr">
    <div class="spin" id="spin"></div>
    <div class="msg">
      <div class="ttl" id="ttl">${escapeHtml(title)}</div>
      <div class="sub" id="sub">${escapeHtml(subtitle)}</div>
    </div>
  </div>
  <div class="log" id="log"></div>
  <div class="meta"><span id="count">0 updates</span><span id="timer">0.0s</span></div>
</div>
<script>
  const buildPrompt = ${buildPromptJson};
  const displayText = ${displayTextJson};
  const logEl = document.getElementById('log');
  const ttlEl = document.getElementById('ttl');
  const subEl = document.getElementById('sub');
  const spinEl = document.getElementById('spin');
  const countEl = document.getElementById('count');
  const timerEl = document.getElementById('timer');
  const t0 = performance.now();
  let count = 0; let done = false;
  const seen = new Set();
  const timerInterval = setInterval(() => {
    if (done) { clearInterval(timerInterval); return; }
    timerEl.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's';
  }, 200);
  function addStatus(text) {
    if (!text || typeof text !== 'string') return;
    const trimmed = text.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    for (const el of logEl.querySelectorAll('.line')) el.classList.add('stale');
    const el = document.createElement('div'); el.className = 'line'; el.textContent = trimmed;
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    count++;
    countEl.textContent = count + (count === 1 ? ' update' : ' updates');
    subEl.textContent = trimmed.length > 80 ? trimmed.slice(0, 77) + '…' : trimmed;
    reportSize();
  }
  function markDone(t) {
    if (done) return; done = true;
    spinEl.classList.add('done');
    ttlEl.textContent = t || 'Ready';
    subEl.textContent = 'Preview and download are above.';
    reportSize();
  }
  let fired = false;
  function firePrompt() {
    if (fired) return; fired = true;
    window.parent.postMessage({ type: 'prompt', payload: { prompt: buildPrompt, displayText } }, '*');
  }
  window.addEventListener('message', (ev) => {
    const d = ev.data; if (!d || typeof d !== 'object') return;
    if (d.type === 'host-ready') firePrompt();
    else if (d.type === 'status' && d.payload) {
      const lines = Array.isArray(d.payload.lines) ? d.payload.lines
        : (typeof d.payload.text === 'string' ? [d.payload.text] : []);
      for (const l of lines) addStatus(l);
    } else if (d.type === 'deck-ready' || d.type === 'doc-ready') {
      markDone(d.payload && d.payload.text);
    }
  });
  function reportSize() {
    window.parent.postMessage({ type: 'size', payload: { height: document.documentElement.scrollHeight } }, '*');
  }
  new ResizeObserver(reportSize).observe(document.body);
  window.addEventListener('load', reportSize);
  reportSize();
</script>
</body></html>`;
}

/**
 * Generic preview + download card.
 *
 * Used for the final tool result. Shows a header bar with the file
 * name + size + an iframe preview (sandboxed, scripts allowed but
 * NOT allow-same-origin so user content is isolated), plus one or
 * more download buttons (each `{label, fileName, mimeType, base64}`).
 *
 * `previewKind`:
 *   - 'iframe-html'  → render `previewHtml` as a full HTML document via srcdoc.
 *   - 'iframe-srcdoc-bare' → same as iframe-html, no aspect ratio (auto height).
 *   - 'html'         → render `previewHtml` directly inside the card body
 *                      (already-styled fragment; useful for tables/markdown).
 */
export function previewDownloadCardHtml({
  title,
  subtitle,
  previewKind = "iframe-html",
  previewHtml,
  downloads = [],
  hint = "",
  iconEmoji = "📄",
  accent = {},
}) {
  const a = {
    primary: accent.primary || "#6d28d9",
    primaryHover: accent.primaryHover || "#5b21b6",
    secondary: accent.secondary || "#6d28d9",
    secondaryHover: accent.secondaryHover || "#5b21b6",
  };
  const downloadButtons = downloads
    .map((d, i) => {
      const href = `data:${d.mimeType};base64,${d.base64}`;
      const sizeKb = d.sizeBytes != null ? ` · ${(d.sizeBytes / 1024).toFixed(1)} KB` : "";
      const cls = i === 0 ? "dl primary" : "dl secondary";
      return `<a class="${cls}" download="${escapeHtml(d.fileName)}" href="${href}">${escapeHtml(d.label)}${sizeKb}</a>`;
    })
    .join("");

  let stage = "";
  if (previewKind === "iframe-html") {
    const srcdoc = String(previewHtml).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    stage = `<div class="stage iframe-stage"><iframe class="preview" title="preview" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe><div class="fade-overlay"></div></div>`;
  } else if (previewKind === "iframe-srcdoc-bare") {
    const srcdoc = String(previewHtml).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    stage = `<div class="stage stage-bare"><iframe class="preview-bare" title="preview" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe><div class="fade-overlay"></div></div>`;
  } else {
    stage = `<div class="stage html-stage">${previewHtml || ""}</div>`;
  }

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; font: 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .wrap { color: #1a1a2e; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03); }

  /* Header bar */
  .bar { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid #f0f0f5; background: #fafafa; }
  .bar .ico { font-size: 22px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; background: #f3f0ff; border-radius: 10px; flex-shrink: 0; }
  .bar .meta { flex: 1; min-width: 0; }
  .bar .ttl { font-weight: 600; font-size: 14px; color: #1a1a2e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar .sub { font-size: 12px; color: #6b7280; margin-top: 2px; }

  /* Buttons row — below the header on its own line */
  .actions { display: flex; gap: 8px; padding: 12px 18px; border-bottom: 1px solid #f0f0f5; align-items: center; flex-wrap: wrap; }
  .actions a, .actions button { all: unset; cursor: pointer; padding: 7px 14px; border-radius: 8px; font-weight: 500; font-size: 12px; transition: all .15s ease; display: inline-flex; align-items: center; gap: 5px; }
  .actions a.dl.primary { background: ${a.primary}; color: #ffffff; }
  .actions a.dl.primary:hover { background: ${a.primaryHover}; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(109,40,217,.25); }
  .actions a.dl.secondary { background: transparent; color: ${a.secondary}; border: 1.5px solid ${a.secondary}; }
  .actions a.dl.secondary:hover { background: ${a.secondaryHover}; color: #ffffff; transform: translateY(-1px); }
  .actions button.fs { background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; }
  .actions button.fs:hover { background: #e5e7eb; color: #1f2937; }
  .actions .spacer { flex: 1; }

  /* Preview stage — bird's eye glance, no scrollbars */
  .stage { position: relative; width: 100%; overflow: hidden; }
  .iframe-stage { height: 220px; background: #f9fafb; }
  .iframe-stage iframe.preview { position: absolute; top: 0; left: 0; width: 100%; height: 400px; border: 0; display: block; pointer-events: none; }
  .stage-bare { height: 200px; }
  .stage-bare iframe.preview-bare { width: 100%; height: 380px; border: 0; display: block; pointer-events: none; }
  .html-stage { padding: 14px 18px; max-height: 240px; overflow: hidden; background: #ffffff; }
  .fade-overlay { position: absolute; bottom: 0; left: 0; right: 0; height: 60px; background: linear-gradient(to bottom, transparent, #ffffff); pointer-events: none; }

  /* Footer hint */
  .hint { padding: 10px 18px; font-size: 11px; color: #9ca3af; border-top: 1px solid #f0f0f5; background: #fafafa; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }

  /* ─── Dark mode ─── */
  html[data-theme="dark"] .wrap { background: #111113; border-color: #27272a; color: #f4f4f5; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  html[data-theme="dark"] .bar { background: #18181b; border-bottom-color: #27272a; }
  html[data-theme="dark"] .bar .ico { background: #1e1b4b; }
  html[data-theme="dark"] .bar .ttl { color: #f4f4f5; }
  html[data-theme="dark"] .bar .sub { color: #a1a1aa; }
  html[data-theme="dark"] .actions { border-bottom-color: #27272a; }
  html[data-theme="dark"] .actions a.dl.primary { background: #7c3aed; }
  html[data-theme="dark"] .actions a.dl.primary:hover { background: #8b5cf6; box-shadow: 0 2px 6px rgba(139,92,246,.3); }
  html[data-theme="dark"] .actions a.dl.secondary { color: #a78bfa; border-color: #a78bfa; background: transparent; }
  html[data-theme="dark"] .actions a.dl.secondary:hover { background: #7c3aed; color: #ffffff; border-color: #7c3aed; }
  html[data-theme="dark"] .actions button.fs { background: #27272a; color: #d4d4d8; border-color: #3f3f46; }
  html[data-theme="dark"] .actions button.fs:hover { background: #3f3f46; color: #f4f4f5; }
  html[data-theme="dark"] .iframe-stage { background: #18181b; }
  html[data-theme="dark"] .stage-bare iframe.preview-bare { background: #18181b; }
  html[data-theme="dark"] .html-stage { background: #18181b; color: #f4f4f5; }
  html[data-theme="dark"] .fade-overlay { background: linear-gradient(to bottom, transparent, #111113); }
  html[data-theme="dark"] .hint { color: #71717a; border-top-color: #27272a; background: #18181b; }
</style></head>
<body>
<div class="wrap">
  <div class="bar">
    <span class="ico">${iconEmoji}</span>
    <div class="meta">
      <div class="ttl">${escapeHtml(title)}</div>
      <div class="sub">${escapeHtml(subtitle)}</div>
    </div>
  </div>
  <div class="actions">
    ${downloadButtons}
    <span class="spacer"></span>
    ${previewKind === "iframe-html" ? `<button class="fs" id="fs" type="button">⛶ Fullscreen</button>` : ""}
  </div>
  ${stage}
  ${hint ? `<div class="hint"><span>${escapeHtml(hint)}</span></div>` : ""}
</div>
<script>
  const fsBtn = document.getElementById('fs');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      const stage = document.querySelector('.stage');
      if (document.fullscreenElement) document.exitFullscreen();
      else stage && stage.requestFullscreen();
    });
  }
  function reportSize() {
    window.parent.postMessage({ type: 'size', payload: { height: document.documentElement.scrollHeight } }, '*');
  }
  new ResizeObserver(reportSize).observe(document.body);
  window.addEventListener('load', reportSize);
  // Notify host the doc is ready (lets the auto-build card mark itself complete).
  try { window.parent.postMessage({ type: 'doc-ready', payload: { text: ${JSON.stringify(title || "Ready")} } }, '*'); } catch {}
  reportSize();
</script>
</body></html>`;
}
