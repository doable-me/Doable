import { createServer } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { WebSocketServer, type WebSocket } from "ws";
import * as jose from "jose";

const app = new Hono();

app.use("*", logger());

app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    connections: clients.size,
    timestamp: new Date().toISOString(),
  });
});

// ─── Types ──────────────────────────────────────────────────
interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  projectId?: string;
  joinedAt: Date;
}

type IncomingMessage =
  | { type: "join_project"; projectId: string }
  | { type: "leave_project" }
  | { type: "cursor_move"; data: { x: number; y: number; file: string } }
  | { type: "file_change"; data: { path: string; content: string } }
  | { type: "ping" };

// ─── State ──────────────────────────────────────────────────
const clients = new Map<WebSocket, AuthenticatedClient>();

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-me"
);
const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";

// ─── Auth Helper ────────────────────────────────────────────
async function authenticateToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    });
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

// ─── Broadcast ──────────────────────────────────────────────
function broadcastToProject(
  projectId: string,
  message: object,
  exclude?: WebSocket
) {
  const payload = JSON.stringify(message);
  for (const [ws, client] of clients) {
    if (client.projectId === projectId && ws !== exclude && ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

// ─── Server Setup ───────────────────────────────────────────
const port = parseInt(process.env.WS_PORT ?? "4001", 10);
const host = process.env.WS_HOST ?? "0.0.0.0";

const server = createServer(serve({ fetch: app.fetch }).fetch as never);

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  // Extract token from query string: ?token=xxx
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Authentication required");
    return;
  }

  const userId = await authenticateToken(token);
  if (!userId) {
    ws.close(4001, "Invalid token");
    return;
  }

  const client: AuthenticatedClient = {
    ws,
    userId,
    joinedAt: new Date(),
  };
  clients.set(ws, client);

  ws.send(JSON.stringify({ type: "connected", userId }));

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as IncomingMessage;

      switch (message.type) {
        case "join_project": {
          client.projectId = message.projectId;
          broadcastToProject(
            message.projectId,
            { type: "user_joined", userId: client.userId },
            ws
          );
          break;
        }

        case "leave_project": {
          if (client.projectId) {
            broadcastToProject(
              client.projectId,
              { type: "user_left", userId: client.userId },
              ws
            );
            client.projectId = undefined;
          }
          break;
        }

        case "cursor_move": {
          if (client.projectId) {
            broadcastToProject(
              client.projectId,
              {
                type: "cursor_move",
                userId: client.userId,
                data: message.data,
              },
              ws
            );
          }
          break;
        }

        case "file_change": {
          if (client.projectId) {
            broadcastToProject(
              client.projectId,
              {
                type: "file_change",
                userId: client.userId,
                data: message.data,
              },
              ws
            );
          }
          break;
        }

        case "ping": {
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        }
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
    }
  });

  ws.on("close", () => {
    if (client.projectId) {
      broadcastToProject(client.projectId, {
        type: "user_left",
        userId: client.userId,
      });
    }
    clients.delete(ws);
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

server.listen(port, host, () => {
  console.log(`Doable WebSocket server started on ${host}:${port}`);
});
