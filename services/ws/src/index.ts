import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { jwtVerify } from "jose";
import { RoomManager } from "./rooms/room-manager.js";
import type { WsClientMessage, WsServerMessage, PresenceUser } from "./rooms/room.js";

const PORT = parseInt(process.env.WS_PORT ?? "4001", 10);
const HOST = process.env.WS_HOST ?? "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-dev-secret-change-me";
const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "internal-dev-secret";

// ─── State ──────────────────────────────────────────────
const rooms = new RoomManager();

interface ClientState {
  userId: string;
  displayName: string | null;
  projectId: string | null;
}
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

    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { projectId, message } = JSON.parse(body) as { projectId: string; message: WsServerMessage };
        const room = rooms.get(projectId);
        if (room) {
          room.broadcast(message);
        }
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end("Invalid JSON");
      }
    });
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
        room.leave(state.userId);
        if (room.isEmpty) rooms.remove(state.projectId);
      }
    }
    clients.delete(ws);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

// ─── Message Handler ────────────────────────────────────
function handleMessage(ws: WebSocket, state: ClientState, msg: WsClientMessage): void {
  switch (msg.type) {
    case "room:join": {
      // Leave previous room if any
      if (state.projectId) {
        const oldRoom = rooms.get(state.projectId);
        if (oldRoom) {
          oldRoom.leave(state.userId);
          if (oldRoom.isEmpty) rooms.remove(state.projectId);
        }
      }
      state.projectId = msg.projectId;
      const room = rooms.getOrCreate(msg.projectId);
      const members = room.join(ws, state.userId, state.displayName, null);
      send(ws, { type: "room:joined", projectId: msg.projectId, members });
      // Send chat history
      const API_URL = process.env.API_URL ?? "http://localhost:4000";
      fetch(`${API_URL}/team-chat/${msg.projectId}/internal?limit=50`, {
        headers: { "X-Internal-Secret": INTERNAL_SECRET },
      }).then(r => r.json()).then(data => {
        if (data.data) send(ws, { type: "chat:history", messages: data.data.map((m: any) => ({
          id: m.id, projectId: m.project_id, userId: m.user_id,
          displayName: m.display_name, avatarUrl: null, content: m.content,
          messageType: m.message_type, mentions: m.mentions ?? [],
          parentId: m.parent_id, createdAt: m.created_at,
        })) });
      }).catch(() => {});
      break;
    }

    case "room:leave": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.leave(state.userId);
          if (room.isEmpty) rooms.remove(state.projectId);
        }
        state.projectId = null;
      }
      break;
    }

    case "heartbeat": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        room?.heartbeat(state.userId);
      }
      send(ws, { type: "heartbeat_ack" });
      break;
    }

    case "presence:update": {
      if (state.projectId) {
        rooms.get(state.projectId)?.updatePresence(state.userId, msg.data);
      }
      break;
    }

    case "chat:send": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          const chatMsg = {
            id: crypto.randomUUID(),
            projectId: state.projectId,
            userId: state.userId,
            displayName: state.displayName,
            avatarUrl: null,
            content: msg.data.content,
            messageType: "user" as const,
            mentions: msg.data.mentions ?? [],
            parentId: msg.data.parentId ?? null,
            createdAt: new Date().toISOString(),
          };
          // Broadcast to entire room including sender
          room.broadcast({ type: "chat:message", message: chatMsg });
          // Persist to database via internal API call
          const API_URL = process.env.API_URL ?? "http://localhost:4000";
          fetch(`${API_URL}/team-chat/${state.projectId}/internal`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
            body: JSON.stringify(chatMsg),
          }).catch((err) => console.error("[ws] Failed to persist chat:", err));
        }
      }
      break;
    }

    case "chat:typing": {
      if (state.projectId) {
        rooms.get(state.projectId)?.setTyping(state.userId, msg.typing);
      }
      break;
    }

    case "awareness:file_open": {
      if (state.projectId) {
        rooms.get(state.projectId)?.updateFileOpen(state.userId, msg.filePath);
      }
      break;
    }

    case "awareness:file_close": {
      if (state.projectId) {
        rooms.get(state.projectId)?.updateFileClose(state.userId, msg.filePath);
      }
      break;
    }

    case "awareness:selection": {
      if (state.projectId) {
        rooms.get(state.projectId)?.updateSelection(state.userId, msg.data);
      }
      break;
    }
  }
}

function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ─── Heartbeat Tick ─────────────────────────────────────
setInterval(() => rooms.tick(), 30_000);

// ─── Start ──────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`[ws] WebSocket server listening on ${HOST}:${PORT}`);
});
