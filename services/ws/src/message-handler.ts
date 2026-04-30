import { WebSocket } from "ws";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import type { RoomManager } from "./rooms/room-manager.js";
import { type WsClientMessage, type WsServerMessage, type PresenceUser, userColor } from "./rooms/room.js";
import { getTracer } from "./tracing/instrumentation.js";

const tracer = getTracer("doable-ws");

export interface ClientState {
  userId: string;
  displayName: string | null;
  projectId: string | null;
}

export function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createMessageHandler(deps: {
  rooms: RoomManager;
  INTERNAL_SECRET: string;
  lastCursorMove: Map<string, number>;
  CURSOR_MOVE_MIN_INTERVAL_MS: number;
}) {
  const { rooms, INTERNAL_SECRET, lastCursorMove, CURSOR_MOVE_MIN_INTERVAL_MS } = deps;

  return function handleMessage(ws: WebSocket, state: ClientState, msg: WsClientMessage): void {
    // Per-message child span. Synchronous branches end the span when this
    // function returns; async branches (e.g. yjs:sync-request) return
    // `true` to take over ending the span from their own callback.
    const span = tracer.startSpan(`ws.recv.${msg.type}`, {
      attributes: {
        "user_id": state.userId,
        "project_id": state.projectId ?? "",
        "ws.message.type": msg.type,
      },
    });
    let asyncOwnsSpan = false;
    try {
      asyncOwnsSpan = handleMessageInner(ws, state, msg, span);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.end();
      throw err;
    }
    if (!asyncOwnsSpan) span.end();
  };

  function handleMessageInner(ws: WebSocket, state: ClientState, msg: WsClientMessage, span: Span): boolean {
  switch (msg.type) {
    case "room:join": {
      console.log(`[ws] room:join userId=${state.userId} displayName=${state.displayName} projectId=${msg.projectId}`);
      // Leave previous room if any
      if (state.projectId) {
        const oldRoom = rooms.get(state.projectId);
        if (oldRoom) {
          oldRoom.leave(state.userId, ws);
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
          room.leave(state.userId, ws);
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
            span.setAttribute("yjs.file_path", msg.filePath);
            // Per-file sync: load file into CRDT and return state
            const filePath = msg.filePath;
            room.getYjsFileState(filePath).then((stateUpdate) => {
              const encoded = Buffer.from(stateUpdate).toString("base64");
              send(ws, { type: "yjs:sync-response", data: encoded, filePath });
              span.end();
            }).catch((err) => {
              // Previously silently logged — now also surfaced as a span error.
              console.error(`[ws] Yjs file sync error for ${filePath}:`, err);
              span.recordException(err as Error);
              span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
              span.end();
            });
            return true; // async branch owns span lifecycle
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
          if (msg.filePath) span.setAttribute("yjs.file_path", msg.filePath);
          try {
            // Decode and apply to server doc
            const update = Buffer.from(msg.data, "base64");
            room.applyYjsUpdate(new Uint8Array(update));
            // Broadcast to all other room members
            room.broadcast(
              { type: "yjs:update", userId: state.userId, data: msg.data, filePath: msg.filePath },
              state.userId,
            );
          } catch (err) {
            // Previously this path could throw and bubble up uncaught — record
            // it on the span so we can see Yjs apply failures in the trace UI.
            console.error(`[ws] Yjs apply error:`, err);
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          }
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
          // Atomic conflict check + selection update
          const result = room.updateVisualEditSelection(state.userId, msg.selector, msg.boundingRect, ws);
          if (!result.succeeded && result.conflict) {
            send(ws, {
              type: "error",
              code: "VISUAL_EDIT_CONFLICT",
              message: `${result.conflict.displayName} is already editing this element`,
            });
          }
        }
      }
      break;
    }

    case "visual-edit:deselect": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.clearVisualEditSelection(state.userId, ws);
        }
      }
      break;
    }

    case "visual-edit:style-change": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcastExceptWs({
            type: "visual-edit:style-change",
            userId: state.userId,
            selector: msg.selector,
            property: msg.property,
            value: msg.value,
          }, ws);
        }
      }
      break;
    }

    case "visual-edit:text-change": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcastExceptWs({
            type: "visual-edit:text-change",
            userId: state.userId,
            selector: msg.selector,
            newText: msg.newText,
          }, ws);
        }
      }
      break;
    }

    case "visual-edit:cursor-move": {
      if (state.projectId) {
        // Server-side rate limiting to prevent DoS from buggy clients
        const now = Date.now();
        const lastTime = lastCursorMove.get(state.userId) ?? 0;
        if (now - lastTime < CURSOR_MOVE_MIN_INTERVAL_MS) break;
        lastCursorMove.set(state.userId, now);

        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcastExceptWs({
            type: "visual-edit:cursor-move",
            userId: state.userId,
            displayName: state.displayName ?? "User",
            color: userColor(state.userId),
            x: msg.x,
            y: msg.y,
          }, ws);
        }
      }
      break;
    }

    case "visual-edit:preview-refresh": {
      console.log("[ws] preview-refresh from", state.userId, "project", state.projectId);
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcastExceptWs({ type: "visual-edit:preview-refresh" }, ws);
          console.log("[ws] broadcast preview-refresh to room");
        }
      }
      break;
    }

    // ─── Phase D: Design Comments ────────────────────────
    case "design-comment:add": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          const commentMsg = {
            id: msg.data.id,
            projectId: state.projectId,
            userId: state.userId,
            displayName: state.displayName,
            userColor: userColor(state.userId),
            xPercent: msg.data.xPercent,
            yPercent: msg.data.yPercent,
            selector: msg.data.selector,
            pagePath: msg.data.pagePath,
            content: msg.data.content,
            parentId: msg.data.parentId,
            resolved: false,
            createdAt: new Date().toISOString(),
          };
          // Broadcast to entire room including sender
          room.broadcast({ type: "design-comment:added", comment: commentMsg });
          // Persist to database via internal API call
          const API_URL = process.env.API_URL ?? "http://localhost:4000";
          fetch(`${API_URL}/design-comments/${state.projectId}/internal`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
            body: JSON.stringify(commentMsg),
          }).catch((err) => console.error("[ws] Failed to persist design comment:", err));
        }
      }
      break;
    }

    case "design-comment:resolve": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({ type: "design-comment:resolved", commentId: msg.commentId, resolvedBy: state.userId });
        }
      }
      break;
    }

    case "design-comment:unresolve": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({ type: "design-comment:unresolved", commentId: msg.commentId });
        }
      }
      break;
    }

    case "design-comment:delete": {
      if (state.projectId) {
        const room = rooms.get(state.projectId);
        if (room) {
          room.broadcast({ type: "design-comment:deleted", commentId: msg.commentId });
        }
      }
      break;
    }
  }
  return false;
  }
}