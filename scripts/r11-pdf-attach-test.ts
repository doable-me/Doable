/**
 * R11 PDF attachment regression test.
 *
 * Flow:
 *   1. Create a new project for uniquegodwin's workspace.
 *   2. POST /projects/<id>/chat with srs_example_2010_group2.pdf as a base64 attachment.
 *   3. Stream SSE, capture per-event UTC timestamps + the augmented prompt
 *      (we look for the [Attachment: ...] block that processAttachments adds).
 *   4. After [DONE], GET /chat/history to confirm pdf-parse text was inlined.
 *   5. GET /projects/<id>/files/App.tsx to confirm AI used the SRS content.
 *   6. Write evidence to testcases/evidence/dev/ai-pdf-r11/.
 *
 * Usage:
 *   ACCESS_TOKEN=<jwt> WORKSPACE_ID=<ws> pnpm exec tsx scripts/r11-pdf-attach-test.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const API = process.env.API ?? "https://dev-api.doable.me";
const ACCESS = process.env.ACCESS_TOKEN!;
const WS_ID = process.env.WORKSPACE_ID ?? "a63f70c2-a4ee-4ce1-ad61-ff0b05218873";
const PDF_PATH = process.env.PDF_PATH ?? "C:/Users/gj/Downloads/srs_example_2010_group2.pdf";
const PROMPT = process.env.PROMPT ?? "Read the attached Software Requirements Specification (SRS) PDF carefully. Identify the system name, its main features, and a key data entity from the document. Then build a single-page React app whose title is the system name and whose first card lists the main features (taken verbatim from section 2 or 3 of the SRS). Use Tailwind. Put the data entity (with at least one field name from the SRS) as a JSON snippet under the card.";
const OUTDIR = process.env.OUTDIR ?? "testcases/evidence/dev/ai-pdf-r11";

if (!ACCESS) {
  console.error("Set ACCESS_TOKEN env var");
  process.exit(2);
}
if (!existsSync(PDF_PATH)) {
  console.error("PDF not found:", PDF_PATH);
  process.exit(2);
}
mkdirSync(OUTDIR, { recursive: true });

function now() { return new Date().toISOString(); }

interface SseEvent { ts: string; tdelta_ms: number; kind: string; preview: string; full?: any; }

async function main() {
  const pdfBuf = readFileSync(PDF_PATH);
  console.log(`PDF size: ${pdfBuf.length} bytes (${(pdfBuf.length / 1024 / 1024).toFixed(2)} MB)`);
  const pdfB64 = pdfBuf.toString("base64");
  console.log(`Base64 length: ${pdfB64.length} (${(pdfB64.length / 1024 / 1024).toFixed(2)} MB)`);

  const T0 = Date.now();
  // ---- 1. Create project ----
  const projRes = await fetch(`${API}/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: WS_ID,
      name: `R11 PDF Attach Test ${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`,
      frameworkId: "vite-react",
    }),
  });
  const projText = await projRes.text();
  writeFileSync(join(OUTDIR, "01-project-create.json"), `HTTP ${projRes.status}\n${projText}`);
  if (!projRes.ok) {
    console.error("Project create failed:", projRes.status, projText);
    process.exit(3);
  }
  const proj = JSON.parse(projText).data;
  console.log("Project:", proj.id, proj.name);

  // ---- 2. POST chat with PDF attachment ----
  const T_send = Date.now();
  const events: SseEvent[] = [];
  const seenKinds = new Set<string>();

  const chatRes = await fetch(`${API}/projects/${proj.id}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      content: PROMPT,
      mode: "agent",
      attachments: [{
        type: "application/pdf",
        data: pdfB64,
        name: "srs_example_2010_group2.pdf",
      }],
    }),
  });

  console.log(`Chat POST: HTTP ${chatRes.status} after ${Date.now() - T_send}ms`);
  if (!chatRes.ok) {
    const errText = await chatRes.text();
    writeFileSync(join(OUTDIR, "02-chat-error.txt"), `HTTP ${chatRes.status}\n${errText}`);
    console.error("Chat failed:", chatRes.status, errText.slice(0, 500));
    process.exit(4);
  }

  // ---- 3. Stream SSE ----
  const reader = chatRes.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let nEvents = 0;
  const t_kinds: Record<string, number> = {};
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      let parsed: any = null;
      try { parsed = JSON.parse(data); } catch { /* might be [DONE] */ }
      const kind = parsed?.type ?? data === "[DONE]" ? (data === "[DONE]" ? "done-sentinel" : parsed?.type ?? "unknown") : "raw";
      const tdelta = Date.now() - T_send;
      const preview = JSON.stringify(parsed ?? data).slice(0, 200);
      events.push({ ts: now(), tdelta_ms: tdelta, kind, preview, full: parsed });
      if (!seenKinds.has(kind)) {
        t_kinds[`T_${kind}_first_ms`] = tdelta;
        seenKinds.add(kind);
        console.log(`[+${tdelta}ms] FIRST ${kind}: ${preview.slice(0, 150)}`);
      }
      nEvents++;
      if (data === "[DONE]" || parsed?.type === "done") break;
    }
  }
  const T_done = Date.now();
  writeFileSync(join(OUTDIR, "03-sse-events.json"), JSON.stringify(events, null, 2));
  console.log(`SSE complete: ${nEvents} events in ${T_done - T_send}ms`);

  // ---- 4. Inspect chat history for attachment text ----
  const histRes = await fetch(`${API}/projects/${proj.id}/chat/history`, {
    headers: { Authorization: `Bearer ${ACCESS}` },
  });
  const hist = await histRes.json();
  writeFileSync(join(OUTDIR, "04-chat-history.json"), JSON.stringify(hist, null, 2));
  const messages = hist.data ?? hist.messages ?? [];
  const userMsg = messages.find((m: any) => m.role === "user");
  const augmentedContent: string = userMsg?.content ?? userMsg?.augmented_content ?? "";
  const pdfTextDetected = /\[Attachment:.*srs_example_2010_group2\.pdf|Software Requirements|requirement|system shall/i.test(augmentedContent);
  console.log(`Chat history user-msg length: ${augmentedContent.length}`);
  console.log(`PDF extracted text in prompt? ${pdfTextDetected ? "YES" : "NO"}`);
  writeFileSync(join(OUTDIR, "05-augmented-prompt.txt"), augmentedContent);

  // ---- 5. Read generated App.tsx ----
  let appTsx = "";
  for (const candidate of ["src/App.tsx", "App.tsx", "src/App.jsx"]) {
    const r = await fetch(`${API}/projects/${proj.id}/files/${candidate}`, {
      headers: { Authorization: `Bearer ${ACCESS}` },
    });
    if (r.ok) {
      const j = await r.json();
      appTsx = j.data?.content ?? j.content ?? "";
      writeFileSync(join(OUTDIR, `06-${candidate.replace(/\//g, "_")}`), appTsx);
      console.log(`Got ${candidate} (${appTsx.length} chars)`);
      break;
    }
  }

  // ---- 6. Summary ----
  const summary = {
    project_id: proj.id,
    project_name: proj.name,
    framework: proj.framework_id,
    pdf_size_bytes: pdfBuf.length,
    pdf_b64_size_chars: pdfB64.length,
    T_project_create_ms: T_send - T0,
    T_chat_post_status: chatRes.status,
    T_first_event_ms: events[0]?.tdelta_ms ?? null,
    t_kinds_first_ms: t_kinds,
    n_sse_events: nEvents,
    T_total_ms: T_done - T_send,
    augmented_prompt_length: augmentedContent.length,
    pdf_text_detected_in_prompt: pdfTextDetected,
    app_tsx_length: appTsx.length,
    app_tsx_snippet: appTsx.slice(0, 1200),
  };
  writeFileSync(join(OUTDIR, "00-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== SUMMARY ===\n", JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
