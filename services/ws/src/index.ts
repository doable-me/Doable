import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { jwtVerify } from "jose";
import { RoomManager } from "./rooms/room-manager.js";
import { type WsClientMessage, type WsServerMessage, type PresenceUser, userColor } from "./rooms/room.js";
import { createMessageHandler, send, type ClientState } from "./message-handler.js";

const PORT = parseInt(process.env.WS_PORT ?? "4001", 10);
const HOST = process.env.WS_HOST ?? "127.0.0.1";
const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";

// ─── Secret guards (crash in production if missing) ──────
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function requireSecret(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value !== fallback) return value;
  if (IS_PRODUCTION) {
    console.error(`[FATAL] ${name} is not set or is using the insecure default. Cannot start WS server in production.`);
    process.exit(1);
  }
  console.warn(`[SECURITY] ${name} is using the insecure dev fallback — set it in .env for production.`);
  return value ?? fallback;
}

const JWT_SECRET = requireSecret("JWT_SECRET", "fallback-dev-secret-change-me");
const INTERNAL_SECRET = requireSecret("INTERNAL_SECRET", "internal-dev-secret");

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
    try {
      const { projectId, message, excludeUserId } = JSON.parse(body) as { projectId: string; message: WsServerMessage; excludeUserId?: string };
      const room = rooms.get(projectId);
      const msgType = (message as any)?.type ?? "unknown";
      console.log(`[ws] broadcast projectId=${projectId} type=${msgType} roomSize=${room?.size ?? 0} exclude=${excludeUserId ?? "none"}`);
      if (room) {
        room.broadcast(message, excludeUserId);
      }
      res.writeHead(200);
      res.end("ok");
    } catch {
      res.writeHead(400);
      res.end("Invalid JSON");
    }
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
    const projectId = req.url.split("/internal/collab-active/")[1];
    const room = rooms.get(projectId ?? "");
    const active = room ? !room.isEmpty : false;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ active, users: room?.size ?? 0 }));
    return;
  }

  // Presence REST fallback
  if (req.method === "GET" && req.url?.startsWith("/internal/presence/")) {
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
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
  // Extract token from query string
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Missing token");
    return;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    ws.close(4002, "Invalid token");
    return;
  }

  const state: ClientState = {
    userId: payload.sub,
    displayName: payload.display_name ?? payload.email.split("@")[0] ?? null,
    projectId: null,
  };
  clients.set(ws, state);

  // Send connected acknowledgment
  send(ws, { type: "connected", userId: payload.sub, resumeToken: "" });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsClientMessage;
      handleMessage(ws, state, msg);
    } catch {
      send(ws, { type: "error", code: "PARSE_ERROR", message: "Invalid JSON" });
    }
  });

  ws.on("close", () => {
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
  });

  ws.on("error", () => {
    clients.delete(ws);
    lastCursorMove.delete(state.userId);
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
