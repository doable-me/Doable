// Local-only test for the "refresh during AI generation" fix.
// Simulates a browser page-refresh by aborting the SSE request mid-stream,
// then polls /chat/status and fetches history to verify the assistant message
// completed in the background and was persisted with real content.

import { SignJWT } from "jose";

const API = "http://127.0.0.1:4000";
const JWT_SECRET = new TextEncoder().encode("change-me-to-a-64-char-random-string");
const JWT_ISSUER = "doable";

const USER_ID = "0ff7b403-24dd-4609-8d06-d594a6551658";
const USER_EMAIL = "uniquegodwin@gmail.com";
const PROJECT_ID = "d2a79cb0-8424-43fe-9981-8a5fd3b9ab8a"; // "Build A Todo App"

const PROMPT =
  "Write a detailed 10-step tutorial on building a simple TODO app in React with hooks, " +
  "covering state management, components, and styling. Be thorough.";

const ABORT_AFTER_MS = 4000;   // ~4s after first bytes -> abort (simulate refresh)
const POLL_INTERVAL_MS = 3000; // match spec
const MAX_WAIT_MS = 120_000;

function ts() { return new Date().toISOString().slice(11, 23); }
function log(...a) { console.log(`[${ts()}]`, ...a); }

async function mintToken() {
  return await new SignJWT({ email: USER_EMAIL })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER_ID)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET);
}

async function getLatestAssistantMessage(token) {
  const r = await fetch(`${API}/projects/${PROJECT_ID}/chat/history?all=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  const msgs = j.data ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") return msgs[i];
  }
  return null;
}

async function getStatus(token) {
  const r = await fetch(`${API}/projects/${PROJECT_ID}/chat/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.json();
}

async function main() {
  const token = await mintToken();
  log("minted token for", USER_EMAIL);

  // Baseline: record latest assistant message id BEFORE the test so we can
  // detect the new one afterwards.
  const baseline = await getLatestAssistantMessage(token);
  log("baseline last assistant message id:", baseline?.id ?? "(none)");

  const ac = new AbortController();
  const streamPromise = (async () => {
    try {
      const res = await fetch(`${API}/projects/${PROJECT_ID}/chat`, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: PROMPT, mode: "agent" }),
      });
      if (!res.ok) {
        log("stream HTTP error", res.status, await res.text());
        return;
      }
      let firstBytesAt = 0;
      let bytes = 0;
      const decoder = new TextDecoder();
      let buf = "";
      const reader = res.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!firstBytesAt) {
          firstBytesAt = Date.now();
          log("first SSE bytes received");
          setTimeout(() => {
            log(`aborting client request (simulating refresh) after ${ABORT_AFTER_MS}ms`);
            ac.abort();
          }, ABORT_AFTER_MS);
        }
        bytes += value.byteLength;
        buf += decoder.decode(value, { stream: true });
        // Log any "error" or "status" SSE frames to see what the server says
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const m = f.match(/^data: (.*)$/m);
          if (!m) continue;
          try {
            const obj = JSON.parse(m[1]);
            if (obj.type === "error" || obj.type === "status" || obj.type === "thinking") {
              log("SSE:", JSON.stringify(obj).slice(0, 250));
            }
          } catch {}
        }
      }
      log(`stream ended cleanly, bytes=${bytes}`);
    } catch (e) {
      if (e.name === "AbortError") log("client fetch aborted (as expected)");
      else log("stream error:", e.message);
    }
  })();

  await streamPromise;

  // Poll /chat/status until streaming becomes false or timeout
  const start = Date.now();
  let lastStatus = null;
  while (Date.now() - start < MAX_WAIT_MS) {
    const s = await getStatus(token);
    if (JSON.stringify(s) !== JSON.stringify(lastStatus)) {
      log("status:", JSON.stringify(s));
      lastStatus = s;
    }
    if (s.streaming === false) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (lastStatus?.streaming !== false) {
    log("WARN: status never went false within timeout");
  }

  // Give the save a moment to flush to DB
  await new Promise((r) => setTimeout(r, 1500));

  const final = await getLatestAssistantMessage(token);
  log("final last assistant message id:", final?.id ?? "(none)");
  if (!final || final.id === baseline?.id) {
    log("FAIL: no new assistant message was created");
    process.exitCode = 2;
    return;
  }
  const content = (final.content ?? "").toString();
  log(`final content length: ${content.length}`);
  log(`final content preview: ${content.slice(0, 240).replace(/\s+/g, " ")}...`);
  log(`final tail:            ...${content.slice(-160).replace(/\s+/g, " ")}`);

  const looksAborted =
    /cancel+ed|aborted|\[aborted\]/i.test(content) || content.trim().length < 200;
  if (looksAborted) {
    log("FAIL: content looks empty/aborted/cancelled");
    process.exitCode = 3;
    return;
  }
  log("PASS: background generation completed with substantive content");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
