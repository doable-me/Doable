import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const API = process.env.API ?? "https://dev-api.doable.me";
const ACCESS = process.env.ACCESS_TOKEN!;
const WS_ID = process.env.WORKSPACE_ID!;
const PDF_PATH = process.env.PDF_PATH ?? "C:/Users/gj/Downloads/srs_example_2010_group2.pdf";
const PROJ_ID_OVERRIDE = process.env.PROJ_ID_OVERRIDE;
const OUTDIR = process.env.OUTDIR ?? "testcases/evidence/dev/ai-pdf-r11/r13-run2";

const PROMPT = "Read the attached Software Requirements Specification (SRS) PDF carefully. Identify the system name, its main features, and a key data entity from the document. Then build a single-page React app whose title is the system name and whose first card lists the main features (taken verbatim from section 2 or 3 of the SRS). Use Tailwind. Put the data entity (with at least one field name from the SRS) as a JSON snippet under the card.";

mkdirSync(OUTDIR, { recursive: true });
function now() { return new Date().toISOString(); }

async function main() {
  const pdfBuf = readFileSync(PDF_PATH);
  const pdfB64 = pdfBuf.toString("base64");
  console.log(`PDF: ${pdfBuf.length} bytes -> b64 ${pdfB64.length} chars`);

  const T0 = Date.now();
  let projId = PROJ_ID_OVERRIDE;
  if (!projId) {
    const pr = await fetch(`${API}/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: WS_ID, name: `R13 PDF Test ${now().slice(0,19)}`, frameworkId: "vite-react" }),
    });
    const pd = await pr.json();
    projId = pd.data.id;
    writeFileSync(join(OUTDIR, "01-project.json"), JSON.stringify(pd, null, 2));
  }
  console.log(`Project: ${projId}`);

  const T_send = Date.now();
  const chatRes = await fetch(`${API}/projects/${projId}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ content: PROMPT, mode: "agent", attachments: [{ type: "application/pdf", data: pdfB64, name: "srs_example_2010_group2.pdf" }] }),
  });
  console.log(`Chat POST: HTTP ${chatRes.status} after ${Date.now()-T_send}ms`);
  if (!chatRes.ok) { console.error("Chat failed:", await chatRes.text()); process.exit(4); }

  const events: any[] = [];
  const reader = chatRes.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "", nEvents = 0;
  let usageData: any = null, doneReceived = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { console.log("Stream ended (done=true)"); break; }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        let parsed: any = null;
        try { parsed = JSON.parse(data); } catch {}
        const kind = parsed?.type ?? (data === "[DONE]" ? "done-sentinel" : "raw");
        const tdelta = Date.now() - T_send;
        events.push({ ts: now(), tdelta_ms: tdelta, kind, full: parsed });
        if (kind === "usage") { usageData = parsed.data; console.log(`[+${tdelta}ms] USAGE: promptTokens=${parsed.data.promptTokens} completionTokens=${parsed.data.completionTokens} toolCallCount=${parsed.data.toolCallCount}`); }
        if (kind === "done" || kind === "done-sentinel") { doneReceived = true; console.log(`[+${tdelta}ms] DONE`); }
        if (!["thinking","keep_alive","tool_result"].includes(kind)) console.log(`[+${tdelta}ms] ${kind}: ${JSON.stringify(parsed??data).slice(0,120)}`);
        nEvents++;
      }
    }
  } catch (err: any) {
    console.warn(`Stream read error (may be normal server-side close): ${err.message}`);
  }

  const T_done = Date.now();
  writeFileSync(join(OUTDIR, "03-sse-events.json"), JSON.stringify(events, null, 2));
  console.log(`SSE: ${nEvents} events in ${T_done-T_send}ms, doneReceived=${doneReceived}`);

  // poll for files (AI may still be writing after stream close)
  let appTsx = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise(r => setTimeout(r, 3000));
    for (const cand of ["src/App.tsx","App.tsx"]) {
      const r = await fetch(`${API}/projects/${projId}/files/${cand}`, { headers: { Authorization: `Bearer ${ACCESS}` } });
      if (r.ok) { const j = await r.json(); appTsx = j.data?.content ?? j.content ?? ""; if (appTsx.length > 500) break; }
    }
    if (appTsx.length > 500) { console.log(`Got App.tsx (${appTsx.length} chars) on attempt ${attempt+1}`); break; }
    console.log(`App.tsx poll attempt ${attempt+1}: ${appTsx.length} chars...`);
  }
  writeFileSync(join(OUTDIR, "06-src_App.tsx"), appTsx);

  const hist = await (await fetch(`${API}/projects/${projId}/chat/history`, { headers: { Authorization: `Bearer ${ACCESS}` } })).json();
  writeFileSync(join(OUTDIR, "04-chat-history.json"), JSON.stringify(hist, null, 2));
  const msgs = hist.data ?? [];
  console.log(`Chat history: ${msgs.length} messages`);

  const summary = {
    project_id: projId,
    prompt_tokens: usageData?.promptTokens ?? null,
    completion_tokens: usageData?.completionTokens ?? null,
    tool_call_count: usageData?.toolCallCount ?? null,
    response_chars: appTsx.length,
    done_received: doneReceived,
    n_sse_events: nEvents,
    T_total_ms: T_done - T_send,
    history_messages: msgs.length,
    app_tsx_snippet: appTsx.slice(0, 800),
    app_is_splash: /Dream it\. Build it\./.test(appTsx),
    srs_terms_found: ["Restaurant","Lunch","Indicator","SearchCriteria"].filter(t => appTsx.includes(t)),
  };
  writeFileSync(join(OUTDIR, "00-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== R13 SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(err => { console.error("FATAL:", err); process.exit(1); });
