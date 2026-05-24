// Tracing must initialize BEFORE any other instrumented module so the OTel
// SDK can register its global providers and the kill-switch (TRACING_LEVEL=off)
// can short-circuit with zero overhead.
import { initTracing, getTracer } from "./tracing/instrumentation.js";
initTracing({ serviceName: "doable-ws" });

// Warn if .env is group/world-readable in production (non-fatal).
import { checkEnvFilePerms } from "@doable/shared/security/env-perms-check.js";
checkEnvFilePerms();

import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { jwtVerify } from "jose";
import { context as otelContext, trace as otelTrace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { RoomManager } from "./rooms/room-manager.js";
import { type WsClientMessage, type WsServerMessage, type PresenceUser, userColor } from "./rooms/room.js";
import { createMessageHandler, send, type ClientState } from "./message-handler.js";

import { resolveSecret } from "@doable/shared/security/secret-resolver.js";

const tracer = getTracer("doable-ws");

// Per-connection long-running span store. WeakMap so we don't leak refs when
// a socket is GC'd without a clean close (it shouldn't happen, but be safe).
const connectionSpans = new WeakMap<WebSocket, Span>();

const PORT = parseInt(process.env.WS_PORT ?? "4001", 10);
const HOST = process.env.WS_HOST ?? "127.0.0.1";
const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";

// ─── Secret guards ───────────────────────────────────────
// Delegated to the shared resolver so api + ws agree on identical, restart-
// stable values. In production a missing secret is fatal; in dev/self-host a
// stable secret is persisted to disk and shared with the api process (a
// per-boot random value here would mismatch the api's JWT_SECRET and break all
// WS auth + internal RPC).
const JWT_SECRET = resolveSecret("JWT_SECRET", "WS server");
const INTERNAL_SECRET = resolveSecret("INTERNAL_SECRET", "WS server");

// ─── State ──────────────────────────────────────────────
const rooms = new RoomManager();
const CURSOR_MOVE_MIN_INTERVAL_MS = 50;
const lastCursorMove = new Map<string, number>();

const clients = new Map<WebSocket, ClientState>();

// ─── JWT Verification ───────────────────────────────────
async function verifyToken(token: string): Promise<{ sub: string; email: string; display_name?: string } | null> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
    });
    if (!payload.sub || !payload.email) return null;
    return payload as { sub: string; email: string; display_name?: string };
  } catch {
    return null;
  }
}

// ─── HTTP body parser helper ────────────────────────────
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// ─── HTTP Server ────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Internal-Secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.getRoomCount(), users: rooms.getTotalUsers() }));
    return;
  }

  // Internal broadcast endpoint — used by API server to push events
  if (req.method === "POST" && req.url === "/internal/broadcast") {
    const secret = req.headers["x-internal-secret"];
    if (secret !== INTERNAL_SECRET) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const body = await readBody(req);
    await tracer.startActiveSpan("ws.internal.broadcast", async (span) => {
      try {
        const { projectId, message, excludeUserId } = JSON.parse(body) as { projectId: string; message: WsServerMessage; excludeUserId?: string };
        const room = rooms.get(projectId);
        const msgType = (message as any)?.type ?? "unknown";
        const roomSize = room?.size ?? 0;
        span.setAttribute("ws.broadcast.type", msgType);
        span.setAttribute("project_id", projectId);
        span.setAttribute("ws.room.size", roomSize);
        if (excludeUserId) span.setAttribute("ws.broadcast.exclude_user_id", excludeUserId);
        console.log(`[ws] broadcast projectId=${projectId} type=${msgType} roomSize=${roomSize} exclude=${excludeUserId ?? "none"}`);
        if (room) {
          room.broadcast(message, excludeUserId);
        }
        res.writeHead(200);
        res.end("ok");
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        res.writeHead(400);
        res.end("Invalid JSON");
      } finally {
        span.end();
      }
    });
    return;
  }

  // ─── Internal Yjs write endpoint — AI tools write through CRDT ───
  if (req.method === "POST" && req.url === "/internal/yjs/write") {
    const secret = req.headers["x-internal-secret"];
    if (secret !== INTERNAL_SECRET) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const body = await readBody(req);
    try {
      const { projectId, filePath, content, operation, oldString, newString, replaceAll } =
        JSON.parse(body) as {
          projectId: string;
          filePath: string;
          content?: string;
          operation: "write" | "edit";
          oldString?: string;
          newString?: string;
          replaceAll?: boolean;
        };

      const room = rooms.get(projectId);
      if (!room || room.isEmpty) {
        // No active collaboration — tell API to write directly
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ handled: false }));
        return;
      }

      const manager = room.getYjsManager();

      if (operation === "write" && content !== undefined) {
        await manager.writeFileThroughCrdt(filePath, content);

        // Broadcast the Yjs update to all clients
        const state = manager.getState();
        const encoded = Buffer.from(state).toString("base64");
        room.broadcast({ type: "yjs:update", userId: "__ai__", data: encoded });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ handled: true }));
      } else if (operation === "edit" && oldString && newString !== undefined) {
        const result = await manager.editFileThroughCrdt(filePath, oldString, newString, replaceAll ?? false);

        if (result.success) {
          // Broadcast update
          const state = manager.getState();
          const encoded = Buffer.from(state).toString("base64");
          room.broadcast({ type: "yjs:update", userId: "__ai__", data: encoded });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ handled: true, ...result }));
      } else {
        res.writeHead(400);
        res.end("Invalid operation");
      }
    } catch (err) {
      console.error("[ws] Yjs write error:", err);
      res.writeHead(500);
      res.end("Internal error");
    }
    return;
  }

  // ─── Internal: check if project has active collaborators ───
  if (req.method === "GET" && req.url?.startsWith("/internal/collab-active/")) {
    // BUG-EDITOR-002 (follow-up): like /internal/presence/:id, this endpoint
    // leaks per-project state (active flag + connected-user count) to any
    // unauthenticated caller that reaches dev-ws.doable.me. The only
    // legitimate caller is services/api (yjs-bridge.isCollaborationActive),
    // which already sends X-Internal-Secret. Gate it the same way the other
    // /internal/* routes are gated.
    const secret = req.headers["x-internal-secret"];
    if (secret !== INTERNAL_SECRET) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const projectId = req.url.split("/internal/collab-active/")[1];
    const room = rooms.get(projectId ?? "");
    const active = room ? !room.isEmpty : false;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ active, users: room?.size ?? 0 }));
    return;
  }

  // Presence REST fallback
  if (req.method === "GET" && req.url?.startsWith("/internal/presence/")) {
    // BUG-EDITOR-002: this endpoint exposes presence data (user IDs, names,
    // active files) for any project. Match the same X-Internal-Secret gate
    // used by /internal/broadcast and /internal/yjs/write — without it,
    // anyone reachable on dev-ws.doable.me could enumerate collaborators.
    const secret = req.headers["x-internal-secret"];
    if (secret !== INTERNAL_SECRET) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const projectId = req.url.split("/internal/presence/")[1];
    const room = rooms.get(projectId ?? "");
    const users: PresenceUser[] = room ? room.getPresenceUsers() : [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ users }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ─── WebSocket Server ───────────────────────────────────
//
// BUG-017 (CSWSH): reject WebSocket upgrades from origins that aren't on
// the allowlist. Without this, any page (e.g. https://evil.example) could
// open a WS connection using the victim's auth, leading to Cross-Site
// WebSocket Hijacking. Allowlist is sourced from WS_ALLOWED_ORIGINS (csv).
// In non-production with no allowlist configured, fall back to allowing
// localhost / 127.0.0.1 so local dev still works. Same-origin requests
// (no Origin header — typical of curl/SDK clients with valid tokens) are
// allowed because they cannot be initiated by a browser cross-origin.
// BUG-017 introduced WS_ALLOWED_ORIGINS as a separate knob from
// CORS_ORIGINS. Pre-knob .env files silently 403 every browser WS upgrade
// in non-prod — inherit from CORS_ORIGINS when unset so operator intent
// on the API side carries to WS without lowering the security bar.
const WS_ALLOWED_ORIGINS = (
  process.env.WS_ALLOWED_ORIGINS ?? process.env.CORS_ORIGINS ?? ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string | undefined): boolean {
  // No Origin header — non-browser client (curl, SDK). Browsers always
  // send Origin on WS upgrades, so this is safe.
  if (!origin) return true;
  if (WS_ALLOWED_ORIGINS.includes(origin)) return true;
  // Dev fallback only when operator hasn't configured an allowlist AND
  // we're not in production.
  if (WS_ALLOWED_ORIGINS.length === 0 && process.env.NODE_ENV !== "production") {
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  }
  return false;
}

const wss = new WebSocketServer({
  server,
  verifyClient: (info, done) => {
    const origin = info.req.headers.origin;
    if (!isOriginAllowed(origin)) {
      console.warn(`[ws] Rejected WebSocket upgrade from disallowed origin: ${origin}`);
      return done(false, 403, "Forbidden origin");
    }
    return done(true);
  },
});

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
  // Long-running span for the lifetime of the WebSocket connection.
  // Per-message child spans use this as their parent so a single trace
  // captures the full session.
  const connSpan = tracer.startSpan("ws.connection", {
    attributes: {
      "ws.url": req.url ?? "",
      "ws.remote_addr": req.socket.remoteAddress ?? "",
    },
  });
  connectionSpans.set(ws, connSpan);

  // Extract token from query string
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    connSpan.setAttribute("ws.close_reason", "missing_token");
    connSpan.setStatus({ code: SpanStatusCode.ERROR, message: "Missing token" });
    connSpan.end();
    connectionSpans.delete(ws);
    ws.close(4001, "Missing token");
    return;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    connSpan.setAttribute("ws.close_reason", "invalid_token");
    connSpan.setStatus({ code: SpanStatusCode.ERROR, message: "Invalid token" });
    connSpan.end();
    connectionSpans.delete(ws);
    ws.close(4002, "Invalid token");
    return;
  }

  const state: ClientState = {
    userId: payload.sub,
    displayName: payload.display_name ?? payload.email.split("@")[0] ?? null,
    projectId: null,
  };
  clients.set(ws, state);

  connSpan.setAttribute("user_id", state.userId);
  if (state.displayName) connSpan.setAttribute("ws.display_name", state.displayName);

  // Send connected acknowledgment
  send(ws, { type: "connected", userId: payload.sub, resumeToken: "" });

  ws.on("message", (raw) => {
    // Run message handling inside the connection span's context so any
    // child spans created in message-handler.ts hang off this trace.
    otelContext.with(otelTrace.setSpan(otelContext.active(), connSpan), () => {
      try {
        const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
        // BUG-WSI-001: accept dotted alias `room.join` and `roomId` field
        // alongside canonical `room:join` / `projectId`. Some early QA
        // clients (and external integrations) used the dotted form; rather
        // than silently no-op'ing them and leaving the client waiting 5+s
        // for an ack, normalise here so the rest of the pipeline behaves
        // uniformly.
        if (parsed && typeof parsed === "object") {
          const t = parsed["type"];
          if (typeof t === "string") {
            if (t === "room.join") parsed["type"] = "room:join";
            else if (t === "room.leave") parsed["type"] = "room:leave";
          }
          if (parsed["type"] === "room:join" && parsed["projectId"] === undefined && typeof parsed["roomId"] === "string") {
            parsed["projectId"] = parsed["roomId"];
          }
        }
        const msg = parsed as unknown as WsClientMessage;
        handleMessage(ws, state, msg);
      } catch {
        send(ws, { type: "error", code: "PARSE_ERROR", message: "Invalid JSON" });
      }
    });
  });

  ws.on("close", (code, reasonBuf) => {
    // Leave room if in one
    if (state.projectId) {
      const room = rooms.get(state.projectId);
      if (room) {
        room.leave(state.userId, ws);
        if (room.isEmpty) {
          // Start GC grace period instead of immediate removal
          room.onEmpty(() => rooms.remove(state.projectId!));
        }
      }
    }
    clients.delete(ws);
    lastCursorMove.delete(state.userId);

    const span = connectionSpans.get(ws);
    if (span) {
      span.setAttribute("ws.close_code", code);
      const reason = reasonBuf?.toString();
      if (reason) span.setAttribute("ws.close_reason", reason);
      span.end();
      connectionSpans.delete(ws);
    }
  });

  ws.on("error", (err) => {
    clients.delete(ws);
    lastCursorMove.delete(state.userId);

    const span = connectionSpans.get(ws);
    if (span) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      connectionSpans.delete(ws);
    }
  });
});

// ─── Message Handler ────────────────────────────────────
const handleMessage = createMessageHandler({
  rooms, INTERNAL_SECRET, lastCursorMove, CURSOR_MOVE_MIN_INTERVAL_MS,
});


// ─── Heartbeat Tick ─────────────────────────────────────
setInterval(() => rooms.tick(), 30_000);

// ─── Start ──────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`[ws] WebSocket server listening on ${HOST}:${PORT}`);
});
