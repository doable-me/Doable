import { WebSocket } from "ws";
import { SpanStatusCode, type Span } from "@opentelemetry/api";
import type { RoomManager } from "./rooms/room-manager.js";
import { type WsClientMessage, type WsServerMessage, type PresenceUser, userColor } from "./rooms/room.js";
import { getTracer } from "./tracing/instrumentation.js";
import { sql } from "./db.js";

const tracer = getTracer("doable-ws");

/**
 * BUG-CORPUS-WS-001: verify the joining user is allowed into the project's
 * room before granting access. Previously `room:join` accepted ANY UUID and
 * emitted `room:joined` (with member list/presence) — leaking cross-tenant
 * project IDs and enabling presence/cursor probing.
 *
 * Access is granted (mirroring the API-layer requireProjectAccess() and the
 * `projects` RLS policy in migration 098) when ANY of:
 *   - the user is a member of the project's workspace, OR
 *   - the user is a row in `project_collaborators` for this project (the
 *     Share-to-a-private-project mechanism — needed for presence/cursors on
 *     shared private projects), OR
 *   - the project is public (link-sharing on).
 *
 * Returns:
 *   - "ok"           → access granted; allow join.
 *   - "forbidden"    → no grant OR project doesn't exist.
 *
 * We deliberately collapse "project not found" into "forbidden" so an
 * attacker cannot distinguish nonexistent project IDs from ones they cannot
 * access (this avoids the namespace probe). The check stays a single
 * parameterized round-trip and remains fail-closed: an arbitrary UUID with no
 * workspace membership / collaborator row / public flag still gets "forbidden".
 */
async function checkProjectMembership(
  projectId: string,
  userId: string,
): Promise<"ok" | "forbidden"> {
  try {
    // Single round-trip. The row exists (project not soft-deleted) AND at
    // least one access grant holds:
    //   - workspace_members  (LEFT JOIN, matched on this user)
    //   - project_collaborators (LEFT JOIN, matched on this user)
    //   - p.visibility = 'public'
    // `deleted_at IS NULL` mirrors the canonical project query helper so
    // soft-deleted projects are treated as nonexistent. Non-members joining
    // a private project they have no collaborator row in select zero rows →
    // "forbidden" (anti-probe preserved).
    const rows = await sql<{ ok: boolean }[]>`
      SELECT TRUE AS ok
      FROM projects p
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = p.workspace_id AND wm.user_id = ${userId}::uuid
      LEFT JOIN project_collaborators pc
        ON pc.project_id = p.id AND pc.user_id = ${userId}::uuid
      WHERE p.id = ${projectId}::uuid
        AND p.deleted_at IS NULL
        AND (
          wm.user_id IS NOT NULL
          OR pc.user_id IS NOT NULL
          OR p.visibility = 'public'::project_visibility
        )
      LIMIT 1
    `;
    return rows.length > 0 ? "ok" : "forbidden";
  } catch (err) {
    // Invalid UUID syntax, schema mismatch, DB outage — never silently
    // grant access. Log and treat as forbidden.
    console.warn(`[ws] room:join membership check failed projectId=${projectId} userId=${userId}:`, err);
    return "forbidden";
  }
}

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
      // BUG-CORPUS-WS-001: enforce workspace membership BEFORE letting the
      // user into the room. We perform the DB check first; only on success
      // do we leave the previous room and register in the new one. This is
      // the async branch — we own the span and end it in the .then/.catch.
      const targetProjectId = msg.projectId;
      const previousProjectId = state.projectId;
      checkProjectMembership(targetProjectId, state.userId)
        .then((result) => {
          span.setAttribute("ws.room.access", result);
          if (result !== "ok") {
            send(ws, {
              type: "error",
              code: "FORBIDDEN_ROOM",
              message: "Not authorized to join this room",
            });
            span.setStatus({ code: SpanStatusCode.ERROR, message: "forbidden" });
            span.end();
            return;
          }

          // Authorized — proceed with the original join logic.
          if (previousProjectId) {
            const oldRoom = rooms.get(previousProjectId);
            if (oldRoom) {
              oldRoom.leave(state.userId, ws);
              if (oldRoom.isEmpty) {
                oldRoom.onEmpty(() => rooms.remove(previousProjectId));
              }
            }
          }
          state.projectId = targetProjectId;
          const room = rooms.getOrCreate(targetProjectId);
          const members = room.join(ws, state.userId, state.displayName, null);
          // BUG-WSI-001: ack must arrive within ~50ms — `room:joined` carries
          // the member snapshot so clients can render presence immediately.
          // The chat history is sent asynchronously below; ack is NOT gated
          // on it.
          send(ws, { type: "room:joined", projectId: targetProjectId, members });
          span.end();

          // Send chat history (best-effort, off the critical path)
          const API_URL = process.env.API_URL ?? "http://localhost:4000";
          fetch(`${API_URL}/team-chat/${targetProjectId}/internal?limit=50`, {
            headers: { "X-Internal-Secret": INTERNAL_SECRET },
          }).then(r => r.json()).then((data: any) => {
            if (data.data) send(ws, { type: "chat:history", messages: data.data.map((m: any) => ({
              id: m.id, projectId: m.project_id, userId: m.user_id,
              displayName: m.display_name, avatarUrl: null, content: m.content,
              messageType: m.message_type, mentions: m.mentions ?? [],
              parentId: m.parent_id, createdAt: m.created_at,
            })) });
          }).catch(() => {});
        })
        .catch((err) => {
          console.error(`[ws] room:join membership check threw:`, err);
          send(ws, {
            type: "error",
            code: "FORBIDDEN_ROOM",
            message: "Not authorized to join this room",
          });
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          span.end();
        });
      return true; // async branch owns span lifecycle
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