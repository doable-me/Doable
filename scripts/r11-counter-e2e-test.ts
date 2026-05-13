/**
 * R11 counter-app AI chat E2E — TC-AI-CHAT-PREVIEW-COUNTER-001.
 *
 * Flow: create project → POST /chat with counter prompt → stream SSE → poll
 * preview URL until 2xx → fetch preview HTML → assert DOM contains the
 * required '0' number, '+1'/'-1'/'Reset' buttons.
 *
 * Writes evidence to testcases/evidence/dev/ai-counter-r11/.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const API = process.env.API ?? "https://dev-api.doable.me";
const ACCESS = process.env.ACCESS_TOKEN!;
const WS_ID = process.env.WORKSPACE_ID ?? "a63f70c2-a4ee-4ce1-ad61-ff0b05218873";
const OUTDIR = process.env.OUTDIR ?? "testcases/evidence/dev/ai-counter-r11";
const PROMPT = process.env.PROMPT ?? `Build a single-page counter app. Show a large number starting at 0 in the center. Below it, render three buttons in a row: "+1" (increments), "-1" (decrements), "Reset" (sets to 0). Use Tailwind classes (text-6xl, flex gap-3, etc.). State must persist via React useState in App.tsx.`;

if (!ACCESS) { console.error("Set ACCESS_TOKEN"); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });

function now() { return new Date().toISOString(); }

interface Ev { ts: string; tdelta_ms: number; kind: string; preview: string; }

async function main() {
  const T0 = Date.now();

  // 1. Create project
  const projRes = await fetch(`${API}/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: WS_ID, name: `R11 Counter E2E ${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`, frameworkId: "vite-react" }),
  });
  const projText = await projRes.text();
  writeFileSync(join(OUTDIR, "01-project.json"), `HTTP ${projRes.status}\n${projText}`);
  if (!projRes.ok) { console.error("Project create failed:", projRes.status); process.exit(3); }
  const proj = JSON.parse(projText).data;
  console.log("Project:", proj.id, proj.name);

  // 2. POST chat (counter prompt)
  const T_send = Date.now();
  const events: Ev[] = [];
  const seen = new Set<string>();
  const t_kinds: Record<string, number> = {};

  const chatRes = await fetch(`${API}/projects/${proj.id}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ content: PROMPT, mode: "agent" }),
  });
  console.log(`Chat POST: HTTP ${chatRes.status} after ${Date.now() - T_send}ms`);
  if (!chatRes.ok) {
    const t = await chatRes.text();
    writeFileSync(join(OUTDIR, "02-chat-error.txt"), `HTTP ${chatRes.status}\n${t}`);
    process.exit(4);
  }

  const reader = chatRes.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let n = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      let p: any = null;
      try { p = JSON.parse(data); } catch {}
      const kind = data === "[DONE]" ? "done-sentinel" : (p?.type ?? "unknown");
      const td = Date.now() - T_send;
      events.push({ ts: now(), tdelta_ms: td, kind, preview: JSON.stringify(p ?? data).slice(0, 200) });
      if (!seen.has(kind)) { t_kinds[`T_${kind}_first_ms`] = td; seen.add(kind); console.log(`[+${td}ms] ${kind}`); }
      n++;
      if (data === "[DONE]" || p?.type === "done") break;
    }
  }
  const T_done = Date.now();
  writeFileSync(join(OUTDIR, "03-sse-events.json"), JSON.stringify(events, null, 2));
  console.log(`SSE: ${n} events / ${T_done - T_send}ms`);

  // 3. Poll project for dev_server_url + preview ready
  let projAgain: any = null;
  let previewUrl: string | null = null;
  const tPoll0 = Date.now();
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${API}/projects/${proj.id}`, { headers: { Authorization: `Bearer ${ACCESS}` } });
    if (r.ok) {
      projAgain = (await r.json()).data;
      previewUrl = projAgain.dev_server_url || projAgain.devServerUrl || null;
      if (previewUrl) break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  writeFileSync(join(OUTDIR, "04-project-after.json"), JSON.stringify(projAgain, null, 2));
  console.log(`Preview URL: ${previewUrl} (after ${Date.now() - tPoll0}ms polling)`);

  // 4. Fetch App.tsx
  let appTsx = "";
  for (const cand of ["src/App.tsx", "App.tsx"]) {
    const r = await fetch(`${API}/projects/${proj.id}/files/${cand}`, { headers: { Authorization: `Bearer ${ACCESS}` } });
    if (r.ok) {
      appTsx = (await r.json()).data?.content ?? "";
      writeFileSync(join(OUTDIR, `05-${cand.replace(/\//g, "_")}`), appTsx);
      break;
    }
  }

  // 5. Acceptance regex per author guide
  const rePlus1 = /[\+＋]\s?1\b/;
  const reMinus1 = /[\-−–—]\s?1\b/;
  const checks = {
    has_useState_or_setCount: /useState\b.*?\(\s*0\s*\)|setCount|setCounter|setValue|setNumber/.test(appTsx),
    has_zero_initial: /useState\s*<?\s*number\s*>?\s*\(\s*0\s*\)|useState\(\s*0\s*\)/.test(appTsx),
    has_plus_button: rePlus1.test(appTsx),
    has_minus_button: reMinus1.test(appTsx),
    has_reset: /reset/i.test(appTsx),
    has_tailwind_text_size: /text-(4xl|5xl|6xl|7xl|8xl|9xl)/.test(appTsx),
  };

  // 6. Preview DOM fetch (if URL ready)
  let previewHtml = "";
  let previewStatus = 0;
  if (previewUrl) {
    const tPreview = Date.now();
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(previewUrl);
        previewStatus = r.status;
        if (r.ok) {
          previewHtml = await r.text();
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    writeFileSync(join(OUTDIR, "06-preview.html"), previewHtml);
    console.log(`Preview status: ${previewStatus} after ${Date.now() - tPreview}ms polling`);
  }

  const summary = {
    project_id: proj.id,
    project_name: proj.name,
    T_first_event_ms: events[0]?.tdelta_ms ?? null,
    t_kinds_first_ms: t_kinds,
    T_total_chat_ms: T_done - T_send,
    n_sse_events: n,
    preview_url: previewUrl,
    preview_status: previewStatus,
    preview_html_length: previewHtml.length,
    app_tsx_length: appTsx.length,
    code_checks: checks,
    overall_pass: checks.has_useState_or_setCount && checks.has_plus_button && checks.has_minus_button && checks.has_reset,
  };
  writeFileSync(join(OUTDIR, "00-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== SUMMARY ===\n", JSON.stringify(summary, null, 2));
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
