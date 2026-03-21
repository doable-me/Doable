import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { jwtVerify } from "jose";
import { RoomManager } from "./rooms/room-manager.js";
import { type WsClientMessage, type WsServerMessage, type PresenceUser, userColor } from "./rooms/room.js";

const PORT = parseInt(process.env.WS_PORT ?? "4001", 10);
const HOST = process.env.WS_HOST ?? "127.0.0.1";
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
        room.leave(state.userId);
        if (room.isEmpty) {
          // Start GC grace period instead of immediate removal
          room.onEmpty(() => rooms.remove(state.projectId!));
        }
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
      console.log(`[ws] room:join userId=${state.userId} displayName=${state.displayName} projectId=${msg.projectId}`);
      // Leave previous room if any
      if (state.projectId) {
        const oldRoom = rooms.get(state.projectId);
        if (oldRoom) {
          oldRoom.leave(state.userId);
          if (oldRoom.isEmpty) {
            oldRoom.onEmpty(() => rooms.remove(state.projectId!));
          }
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
      }).then(r => r.json()).then((data: any) => {
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
          if (room.isEmpty) {
            room.onEmpty(() => rooms.remove(state.projectId!));
          }
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

    case "cursor:move": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({
            type: "cursor:move",
            userId: state.userId,
            displayName: state.displayName ?? "User",
            color: userColor(state.userId),
            filePath: msg.filePath,
            line: msg.line,
            column: msg.column,
          }, state.userId);
        }
      }
      break;
    }

    // ─── Yjs CRDT sync (per-file aware) ──────────────────
    case "yjs:sync-request": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          if (msg.filePath) {
            // Per-file sync: load file into CRDT and return state
            room.getYjsFileState(msg.filePath).then((stateUpdate) => {
              const encoded = Buffer.from(stateUpdate).toString("base64");
              send(ws, { type: "yjs:sync-response", data: encoded, filePath: msg.filePath });
            }).catch((err) => {
              console.error(`[ws] Yjs file sync error for ${msg.filePath}:`, err);
            });
          } else {
            // Full doc sync (backward compatible)
            const stateUpdate = room.getYjsState();
            const encoded = Buffer.from(stateUpdate).toString("base64");
            send(ws, { type: "yjs:sync-response", data: encoded });
          }
        }
      }
      break;
    }

    case "yjs:update": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          // Decode and apply to server doc
          const update = Buffer.from(msg.data, "base64");
          room.applyYjsUpdate(new Uint8Array(update));
          // Broadcast to all other room members
          room.broadcast(
            { type: "yjs:update", userId: state.userId, data: msg.data, filePath: msg.filePath },
            state.userId,
          );
        }
      }
      break;
    }

    // ─── Phase B: AI typing indicator ────────────────────
    case "ai:typing": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({
            type: "ai:typing",
            userId: state.userId,
            displayName: state.displayName ?? "User",
            isTyping: msg.isTyping,
          }, state.userId);
        }
      }
      break;
    }

    // ─── Phase C: Visual edit events ─────────────────────
    case "visual-edit:select": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.updateVisualEditSelection(state.userId, msg.selector, msg.boundingRect);
        }
      }
      break;
    }

    case "visual-edit:deselect": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.clearVisualEditSelection(state.userId);
        }
      }
      break;
    }

    case "visual-edit:style-change": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({
            type: "visual-edit:style-change",
            userId: state.userId,
            selector: msg.selector,
            property: msg.property,
            value: msg.value,
          }, state.userId);
        }
      }
      break;
    }

    case "visual-edit:text-change": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({
            type: "visual-edit:text-change",
            userId: state.userId,
            selector: msg.selector,
            newText: msg.newText,
          }, state.userId);
        }
      }
      break;
    }

    case "visual-edit:cursor-move": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({
            type: "visual-edit:cursor-move",
            userId: state.userId,
            displayName: state.displayName ?? "User",
            color: userColor(state.userId),
            x: msg.x,
            y: msg.y,
          }, state.userId);
        }
      }
      break;
    }

    case "visual-edit:preview-refresh": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({ type: "visual-edit:preview-refresh" } as any, state.userId);
        }
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
