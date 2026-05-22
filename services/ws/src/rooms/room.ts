import type { WebSocket } from "ws";
import * as Y from "yjs";
import { YjsDocumentManager } from "../collaboration/yjs-document-manager.js";

// ─── Local WS Types (until promoted to @doable/shared) ──
export interface PresenceUser {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "idle" | "away";
  currentFile: string | null;
  currentView: "code" | "preview" | "chat" | "team";
  joinedAt: string;
  lastActiveAt: string;
  color: string;
}

export interface SelectionData {
  filePath: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
}

export type WsServerMessage =
  | { type: "connected"; userId: string; resumeToken: string }
  | { type: "error"; code: string; message: string }
  | { type: "heartbeat_ack" }
  | { type: "room:joined"; projectId: string; members: PresenceUser[] }
  | { type: "presence:user_joined"; user: PresenceUser }
  | { type: "presence:user_left"; userId: string }
  | { type: "presence:user_updated"; user: PresenceUser }
  | { type: "chat:message"; message: ChatMessage }
  | { type: "chat:history"; messages: ChatMessage[] }
  | { type: "chat:user_typing"; userId: string; typing: boolean }
  | { type: "awareness:files_open"; data: Record<string, string[]> }
  | { type: "awareness:user_selection"; userId: string; data: SelectionData }
  | { type: "cursor:move"; userId: string; displayName: string; color: string; filePath: string; line: number; column: number }
  | { type: "yjs:sync-response"; data: string; filePath?: string }
  | { type: "yjs:update"; userId: string; data: string; filePath?: string }
  // Phase B: AI stream events
  | { type: "ai:stream-chunk"; chunk: string; messageId: string; isThinking?: boolean }
  | { type: "ai:stream-end"; messageId: string; finalContent?: string }
  | { type: "ai:tool-event"; messageId: string; event: "tool_call" | "tool_result"; data: Record<string, unknown> }
  | { type: "ai:status"; messageId: string; data: unknown }
  | { type: "ai:error"; messageId: string; error: unknown }
  | { type: "ai:queue-update"; queue: AiQueueItem[] }
  | { type: "ai:typing"; userId: string; displayName: string; isTyping: boolean }
  | { type: "ai:message-sent"; userId: string; displayName: string; content: string; messageId: string }
  | { type: "ai:abort"; messageId: string; abortedByUserId: string }
  // Phase C: Visual edit events
  | { type: "visual-edit:select"; userId: string; displayName: string; color: string; selector: string; boundingRect: { x: number; y: number; width: number; height: number } }
  | { type: "visual-edit:deselect"; userId: string }
  | { type: "visual-edit:style-change"; userId: string; selector: string; property: string; value: string }
  | { type: "visual-edit:text-change"; userId: string; selector: string; newText: string }
  | { type: "visual-edit:cursor-move"; userId: string; displayName: string; color: string; x: number; y: number }
  | { type: "visual-edit:preview-refresh" }
  // Phase D: Design comments
  | { type: "design-comment:added"; comment: DesignCommentMsg }
  | { type: "design-comment:resolved"; commentId: string; resolvedBy: string }
  | { type: "design-comment:unresolved"; commentId: string }
  | { type: "design-comment:deleted"; commentId: string };

export interface DesignCommentMsg {
  id: string;
  projectId: string;
  userId: string;
  displayName: string | null;
  userColor: string | null;
  xPercent: number;
  yPercent: number;
  selector: string | null;
  pagePath: string;
  content: string;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
}

export interface AiQueueItem {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  position: number;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  content: string;
  messageType: "user";
  mentions: string[];
  parentId: string | null;
  createdAt: string;
}

export type WsClientMessage =
  | { type: "room:join"; projectId: string }
  | { type: "room:leave" }
  | { type: "heartbeat" }
  | { type: "presence:update"; data: { currentFile?: string | null; currentView?: string; status?: string } }
  | { type: "chat:send"; data: { content: string; mentions?: string[]; parentId?: string } }
  | { type: "chat:typing"; typing: boolean }
  | { type: "awareness:file_open"; filePath: string }
  | { type: "awareness:file_close"; filePath: string }
  | { type: "awareness:selection"; data: SelectionData }
  | { type: "cursor:move"; filePath: string; line: number; column: number }
  | { type: "yjs:sync-request"; filePath?: string }
  | { type: "yjs:update"; data: string; filePath?: string }
  // Phase B: AI events from client
  | { type: "ai:typing"; isTyping: boolean }
  // Phase C: Visual edit events from client
  | { type: "visual-edit:select"; selector: string; boundingRect: { x: number; y: number; width: number; height: number } }
  | { type: "visual-edit:deselect" }
  | { type: "visual-edit:style-change"; selector: string; property: string; value: string }
  | { type: "visual-edit:text-change"; selector: string; newText: string }
  | { type: "visual-edit:cursor-move"; x: number; y: number }
  | { type: "visual-edit:preview-refresh" }
  // Phase D: Design comments from client
  | { type: "design-comment:add"; data: { id: string; xPercent: number; yPercent: number; selector: string | null; pagePath: string; content: string; parentId: string | null } }
  | { type: "design-comment:resolve"; commentId: string }
  | { type: "design-comment:unresolve"; commentId: string }
  | { type: "design-comment:delete"; commentId: string };

// ─── User Color ──────────────────────────────────────────
const COLORS = [
  "#E57373", "#F06292", "#BA68C8", "#9575CD",
  "#7986CB", "#64B5F6", "#4FC3F7", "#4DD0E1",
  "#4DB6AC", "#81C784", "#AED581", "#FFD54F",
  "#FFB74D", "#FF8A65", "#A1887F", "#90A4AE",
];

export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

// ─── Room Member ─────────────────────────────────────────
interface RoomMember {
  ws: WebSocket;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "idle" | "away";
  currentFile: string | null;
  currentView: "code" | "preview" | "chat" | "team";
  joinedAt: string;
  lastActiveAt: string;
  openFiles: Set<string>;
  typingInChat: boolean;
  visualSelection: SelectionData | null;
  // Phase C: visual edit selection
  visualEditSelector: string | null;
}

export class Room {
  readonly projectId: string;
  /** userId → list of connections (supports same user in multiple tabs) */
  private members = new Map<string, RoomMember[]>();
  private yjsManager: YjsDocumentManager;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.yjsManager = new YjsDocumentManager(projectId);
  }

  /**
   * Get the YjsDocumentManager for this room.
   */
  getYjsManager(): YjsDocumentManager {
    return this.yjsManager;
  }

  getYjsState(): Uint8Array {
    return this.yjsManager.getState();
  }

  applyYjsUpdate(update: Uint8Array, origin?: string): void {
    this.yjsManager.applyUpdate(update, origin ?? "remote-client");
  }

  /**
   * Get the Yjs state for a specific file. Loads from disk if needed.
   */
  async getYjsFileState(filePath: string): Promise<Uint8Array> {
    await this.yjsManager.getFileText(filePath);
    return this.yjsManager.getState();
  }

  join(ws: WebSocket, userId: string, displayName: string | null, avatarUrl: string | null): PresenceUser[] {
    const now = new Date().toISOString();
    const member: RoomMember = {
      ws, userId, displayName, avatarUrl,
      status: "active", currentFile: null, currentView: "code",
      joinedAt: now, lastActiveAt: now,
      openFiles: new Set(), typingInChat: false, visualSelection: null,
      visualEditSelector: null,
    };
    const existing = this.members.get(userId) ?? [];
    existing.push(member);
    this.members.set(userId, existing);

    // Cancel GC if a user reconnects
    this.yjsManager.cancelGracePeriod();

    // Broadcast to others that this user joined (only if first connection for this user)
    if (existing.length === 1) {
      const presenceUser = this.toPresenceUser(member);
      this.broadcast({ type: "presence:user_joined", user: presenceUser }, userId);
    }

    // Return current members list for the joining user
    return this.getPresenceUsers();
  }

  leave(userId: string, ws?: WebSocket): void {
    const connections = this.members.get(userId);
    if (!connections) return;

    if (ws) {
      // Remove only the specific connection
      const filtered = connections.filter(m => m.ws !== ws);
      if (filtered.length > 0) {
        this.members.set(userId, filtered);
        return; // User still has other connections, don't broadcast leave
      }
    }

    // User has no more connections — fully leave
    this.members.delete(userId);
    this.broadcast({ type: "presence:user_left", userId });
    this.broadcast({ type: "visual-edit:deselect", userId });
  }

  updatePresence(userId: string, data: { currentFile?: string | null; currentView?: string; status?: string }): void {
    const connections = this.members.get(userId);
    if (!connections?.length) return;
    // Update the most-recently-active connection's metadata
    const member = connections[connections.length - 1]!;
    if (data.currentFile !== undefined) member.currentFile = data.currentFile;
    if (data.currentView) member.currentView = data.currentView as RoomMember["currentView"];
    if (data.status) member.status = data.status as RoomMember["status"];
    member.lastActiveAt = new Date().toISOString();
    this.broadcast({ type: "presence:user_updated", user: this.toPresenceUser(member) }, userId);
  }

  updateFileOpen(userId: string, filePath: string): void {
    const connections = this.members.get(userId);
    if (!connections?.length) return;
    const member = connections[connections.length - 1]!;
    member.openFiles.add(filePath);
    member.currentFile = filePath;
    member.lastActiveAt = new Date().toISOString();
    this.broadcastFilesOpen();
  }

  updateFileClose(userId: string, filePath: string): void {
    const connections = this.members.get(userId);
    if (!connections?.length) return;
    const member = connections[connections.length - 1]!;
    member.openFiles.delete(filePath);
    if (member.currentFile === filePath) member.currentFile = null;
    this.broadcastFilesOpen();
  }

  setTyping(userId: string, typing: boolean): void {
    const connections = this.members.get(userId);
    if (!connections?.length) return;
    for (const m of connections) m.typingInChat = typing;
    this.broadcast({ type: "chat:user_typing", userId, typing }, userId);
  }

  updateSelection(userId: string, data: SelectionData): void {
    const connections = this.members.get(userId);
    if (!connections?.length) return;
    for (const m of connections) m.visualSelection = data;
    this.broadcast({ type: "awareness:user_selection", userId, data }, userId);
  }

  // Phase C: Visual edit selection (atomic conflict check + update)
  updateVisualEditSelection(userId: string, selector: string, boundingRect: { x: number; y: number; width: number; height: number }, excludeWs?: WebSocket): { succeeded: boolean; conflict?: { userId: string; displayName: string } } {
    const connections = this.members.get(userId);
    if (!connections?.length) return { succeeded: false };

    // Atomic: check conflict and update in same synchronous block
    const conflict = this.getVisualEditConflict(userId, selector);
    if (conflict) {
      return { succeeded: false, conflict };
    }

    for (const m of connections) m.visualEditSelector = selector;
    const member = connections[connections.length - 1]!;
    const message: WsServerMessage = {
      type: "visual-edit:select",
      userId,
      displayName: member.displayName ?? "User",
      color: userColor(userId),
      selector,
      boundingRect,
    };
    if (excludeWs) {
      this.broadcastExceptWs(message, excludeWs);
    } else {
      this.broadcast(message, userId);
    }
    return { succeeded: true };
  }

  clearVisualEditSelection(userId: string, excludeWs?: WebSocket): void {
    const connections = this.members.get(userId);
    if (connections) {
      for (const m of connections) m.visualEditSelector = null;
    }
    const message: WsServerMessage = { type: "visual-edit:deselect", userId };
    if (excludeWs) {
      this.broadcastExceptWs(message, excludeWs);
    } else {
      this.broadcast(message, userId);
    }
  }

  // Check if another user is editing the same element
  getVisualEditConflict(userId: string, selector: string): { userId: string; displayName: string } | null {
    for (const [memberId, connections] of this.members) {
      if (memberId === userId) continue;
      for (const member of connections) {
        if (member.visualEditSelector === selector) {
          return { userId: memberId, displayName: member.displayName ?? "User" };
        }
      }
    }
    return null;
  }

  heartbeat(userId: string): void {
    const connections = this.members.get(userId);
    if (connections) {
      for (const member of connections) {
        member.lastActiveAt = new Date().toISOString();
        if (member.status === "idle") {
          member.status = "active";
        }
      }
      this.broadcast({ type: "presence:user_updated", user: this.toPresenceUser(connections[0]!) });
    }
  }

  /** Check for idle users (no heartbeat for 60s) */
  checkIdle(): string[] {
    const now = Date.now();
    const disconnected: string[] = [];
    for (const [userId, connections] of this.members) {
      // Use the most recently active connection
      const member = connections.reduce((a, b) =>
        new Date(a.lastActiveAt).getTime() > new Date(b.lastActiveAt).getTime() ? a : b
      );
      const elapsed = now - new Date(member.lastActiveAt).getTime();
      if (elapsed > 5 * 60_000) {
        disconnected.push(userId);
      } else if (elapsed > 60_000 && member.status === "active") {
        for (const m of connections) m.status = "idle";
        this.broadcast({ type: "presence:user_updated", user: this.toPresenceUser(member) });
      }
    }
    return disconnected;
  }

  broadcast(message: WsServerMessage, excludeUserId?: string): void {
    const data = JSON.stringify(message);
    for (const [userId, connections] of this.members) {
      if (userId === excludeUserId) continue;
      for (const member of connections) {
        if (member.ws.readyState === member.ws.OPEN) {
          member.ws.send(data);
        }
      }
    }
  }

  /** Broadcast to everyone except a specific WebSocket connection.
   *  Unlike broadcast(), this allows the same user's OTHER tabs to receive the message. */
  broadcastExceptWs(message: WsServerMessage, excludeWs: WebSocket): void {
    const data = JSON.stringify(message);
    for (const [, connections] of this.members) {
      for (const member of connections) {
        if (member.ws === excludeWs) continue;
        if (member.ws.readyState === member.ws.OPEN) {
          member.ws.send(data);
        }
      }
    }
  }

  /** Send to a specific user (all connections) */
  sendTo(userId: string, message: WsServerMessage): void {
    const connections = this.members.get(userId);
    if (!connections) return;
    const data = JSON.stringify(message);
    for (const member of connections) {
      if (member.ws.readyState === member.ws.OPEN) {
        member.ws.send(data);
      }
    }
  }

  getPresenceUsers(): PresenceUser[] {
    const users: PresenceUser[] = [];
    for (const connections of this.members.values()) {
      if (connections.length > 0) {
        // Use the most recently active connection for presence
        const member = connections.reduce((a, b) =>
          new Date(a.lastActiveAt).getTime() > new Date(b.lastActiveAt).getTime() ? a : b
        );
        users.push(this.toPresenceUser(member));
      }
    }
    return users;
  }

  get size(): number {
    return this.members.size;
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  hasUser(userId: string): boolean {
    return this.members.has(userId);
  }

  getWs(userId: string): WebSocket | undefined {
    const connections = this.members.get(userId);
    return connections?.[0]?.ws;
  }

  getMember(userId: string): { displayName: string | null; color: string } | undefined {
    const connections = this.members.get(userId);
    if (!connections?.length) return undefined;
    return { displayName: connections[0]!.displayName, color: userColor(userId) };
  }

  /**
   * Called when the room becomes empty. Start GC grace period.
   */
  onEmpty(onDestroy: () => void): void {
    this.yjsManager.startGracePeriod(onDestroy);
  }

  /**
   * Destroy the room and its resources.
   */
  async destroy(): Promise<void> {
    await this.yjsManager.persistAll();
    this.yjsManager.destroy();
  }

  private toPresenceUser(m: RoomMember): PresenceUser {
    return {
      userId: m.userId,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      status: m.status,
      currentFile: m.currentFile,
      currentView: m.currentView,
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt,
      color: userColor(m.userId),
    };
  }

  private broadcastFilesOpen(): void {
    const data: Record<string, string[]> = {};
    for (const [userId, connections] of this.members) {
      const allFiles = new Set<string>();
      for (const member of connections) {
        for (const f of member.openFiles) allFiles.add(f);
      }
      if (allFiles.size > 0) {
        data[userId] = Array.from(allFiles);
      }
    }
    this.broadcast({ type: "awareness:files_open", data });
  }
}
