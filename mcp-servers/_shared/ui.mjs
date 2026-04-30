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
    lightBg1: accent.lightBg1 || "#f5f3ff",
    lightBg2: accent.lightBg2 || "#ede9fe",
    lightBorder: accent.lightBorder || "#c4b5fd",
    lightTitle: accent.lightTitle || "#4338ca",
    lightSub: accent.lightSub || "#6366f1",
    spinTrack: accent.spinTrack || "#c7d2fe",
    spinHead: accent.spinHead || "#6366f1",
    scrollLight: accent.scrollLight || "#c4b5fd",
  };
  const buildPromptJson = JSON.stringify(String(buildPrompt));
  const displayTextJson = JSON.stringify(String(displayText));
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; font: 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 10px 0; background: transparent; color: #0f172a; }
  .card { background: linear-gradient(135deg, ${a.lightBg1} 0%, ${a.lightBg2} 100%); border: 1px solid ${a.lightBorder}; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(99,102,241,.12); }
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

  /* Dark mode — matches Doable's --card / --border / --foreground tokens. */
  html[data-theme="dark"] body { color: #f2f2f2; }
  html[data-theme="dark"] .card { background: #0f0f12; border-color: #27272a; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
  html[data-theme="dark"] .ttl { color: #f2f2f2; }
  html[data-theme="dark"] .sub { color: #a1a1aa; }
  html[data-theme="dark"] .spin { border-color: #3f3f46; border-top-color: #a1a1aa; }
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
    primary: accent.primary || "#0284c7",
    primaryHover: accent.primaryHover || "#0369a1",
    secondary: accent.secondary || "#d97706",
    secondaryHover: accent.secondaryHover || "#b45309",
  };
  const downloadButtons = downloads
    .map((d, i) => {
      const href = `data:${d.mimeType};base64,${d.base64}`;
      const sizeKb = d.sizeBytes != null ? `${(d.sizeBytes / 1024).toFixed(1)} KB` : "";
      const cls = i === 0 ? "dl primary" : "dl secondary";
      return `<a class="${cls}" download="${escapeHtml(d.fileName)}" href="${href}" title="${sizeKb}">${escapeHtml(d.label)}</a>`;
    })
    .join("");

  let stage = "";
  if (previewKind === "iframe-html") {
    const srcdoc = String(previewHtml).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    stage = `<div class="stage iframe-stage"><iframe class="preview" title="preview" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe></div>`;
  } else if (previewKind === "iframe-srcdoc-bare") {
    const srcdoc = String(previewHtml).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    stage = `<div class="stage stage-bare"><iframe class="preview-bare" title="preview" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe></div>`;
  } else {
    stage = `<div class="stage html-stage">${previewHtml || ""}</div>`;
  }

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  *, html { box-sizing: border-box; }
  html { background: transparent; }
  body { margin: 0; font: 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 12px 0; background: transparent; }
  .wrap { color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
  .bar { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; flex-wrap: wrap; }
  .bar .ico { font-size: 18px; }
  .bar .meta { flex: 1; min-width: 180px; }
  .bar .ttl { font-weight: 600; color: #0f172a; word-break: break-word; }
  .bar .sub { font-size: 11px; color: #475569; }
  .bar .btns { display: flex; gap: 6px; flex-wrap: wrap; }
  .bar a, .bar button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; transition: background .15s; display: inline-block; }
  .bar a.dl.primary { background: ${a.primary}; color: #ffffff; }
  .bar a.dl.primary:hover { background: ${a.primaryHover}; }
  .bar a.dl.secondary { background: ${a.secondary}; color: #ffffff; }
  .bar a.dl.secondary:hover { background: ${a.secondaryHover}; }
  .bar button.fs { background: #e2e8f0; color: #0f172a; }
  .bar button.fs:hover { background: #cbd5e1; }
  .stage { position: relative; width: 100%; background: #ffffff; }
  .iframe-stage { aspect-ratio: 16 / 11; background: #f1f5f9; }
  .iframe-stage iframe.preview { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .stage-bare { padding: 0; min-height: 240px; }
  .stage-bare iframe.preview-bare { width: 100%; min-height: 360px; border: 0; display: block; background: #ffffff; }
  .html-stage { padding: 14px 16px; max-height: 520px; overflow: auto; background: #ffffff; }
  .hint { padding: 8px 14px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }

  /* Dark mode */
  html[data-theme="dark"] .wrap { background: #0f0f12; border-color: #27272a; color: #f2f2f2; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
  html[data-theme="dark"] .bar { background: #18181b; border-bottom-color: #27272a; }
  html[data-theme="dark"] .bar .ttl { color: #f2f2f2; }
  html[data-theme="dark"] .bar .sub { color: #a1a1aa; }
  html[data-theme="dark"] .bar button.fs { background: #27272a; color: #f2f2f2; }
  html[data-theme="dark"] .bar button.fs:hover { background: #3f3f46; }
  html[data-theme="dark"] .iframe-stage { background: #18181b; }
  html[data-theme="dark"] .stage-bare iframe.preview-bare { background: #18181b; }
  html[data-theme="dark"] .html-stage { background: #18181b; color: #f2f2f2; }
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
    <div class="btns">
      ${previewKind === "iframe-html" ? `<button class="fs" id="fs" type="button">⛶ Fullscreen</button>` : ""}
      ${downloadButtons}
    </div>
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
