// BUG-WSI-001 verification: room.join must produce ack within 5s
import WebSocket from "ws";

const TOK = process.env.OWNER_TOK;
const PROJ = process.env.PROJECT_ID || "12c6f088-fa18-4f5d-b2d6-53a0b28d9089";
const WS_URL = process.env.WS_URL || "wss://dev-ws.doable.me";

const start = Date.now();
const events = [];
const w = new WebSocket(`${WS_URL}/?token=${TOK}`);

const timeout = setTimeout(() => {
  console.log(JSON.stringify({ status: "TIMEOUT_5S", events }, null, 2));
  process.exit(1);
}, 6000);

w.on("open", () => {
  events.push({ t: Date.now() - start, ev: "open" });
  // BUG-WSI-001 used dotted form `room.join` with `roomId`.
  w.send(JSON.stringify({ type: "room.join", roomId: PROJ }));
});

w.on("message", (m) => {
  const txt = m.toString();
  let parsed = null;
  try { parsed = JSON.parse(txt); } catch {}
  events.push({ t: Date.now() - start, ev: "msg", data: parsed ?? txt });
  if (parsed && (parsed.type === "room:joined" || parsed.type === "error")) {
    clearTimeout(timeout);
    console.log(JSON.stringify({ status: parsed.type === "room:joined" ? "ACK_RECEIVED" : "ERROR", events }, null, 2));
    w.close();
    process.exit(0);
  }
});

w.on("error", (err) => {
  events.push({ t: Date.now() - start, ev: "error", msg: err.message });
  clearTimeout(timeout);
  console.log(JSON.stringify({ status: "WS_ERROR", events }, null, 2));
  process.exit(2);
});

w.on("close", (code, reason) => {
  events.push({ t: Date.now() - start, ev: "close", code, reason: reason?.toString() });
});
