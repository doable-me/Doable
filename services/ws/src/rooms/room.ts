import type { WebSocket } from "ws";

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
  | { type: "chat:user_typing"; userId: string; typing: boolean }
  | { type: "awareness:files_open"; data: Record<string, string[]> }
  | { type: "awareness:user_selection"; userId: string; data: SelectionData };

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
  | { type: "awareness:selection"; data: SelectionData };

// ─── User Color ──────────────────────────────────────────
const COLORS = [
  "#E57373", "#F06292", "#BA68C8", "#9575CD",
  "#7986CB", "#64B5F6", "#4FC3F7", "#4DD0E1",
  "#4DB6AC", "#81C784", "#AED581", "#FFD54F",
  "#FFB74D", "#FF8A65", "#A1887F", "#90A4AE",
];

function userColor(userId: string): string {
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
}

export class Room {
  readonly projectId: string;
  private members = new Map<string, RoomMember>();

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  join(ws: WebSocket, userId: string, displayName: string | null, avatarUrl: string | null): PresenceUser[] {
    const now = new Date().toISOString();
    const member: RoomMember = {
      ws, userId, displayName, avatarUrl,
      status: "active", currentFile: null, currentView: "code",
      joinedAt: now, lastActiveAt: now,
      openFiles: new Set(), typingInChat: false, visualSelection: null,
    };
    this.members.set(userId, member);

    // Broadcast to others that this user joined
    const presenceUser = this.toPresenceUser(member);
    this.broadcast({ type: "presence:user_joined", user: presenceUser }, userId);

    // Return current members list for the joining user
    return this.getPresenceUsers();
  }

  leave(userId: string): void {
    this.members.delete(userId);
    this.broadcast({ type: "presence:user_left", userId });
  }

  updatePresence(userId: string, data: { currentFile?: string | null; currentView?: string; status?: string }): void {
    const member = this.members.get(userId);
    if (!member) return;
    if (data.currentFile !== undefined) member.currentFile = data.currentFile;
    if (data.currentView) member.currentView = data.currentView as RoomMember["currentView"];
    if (data.status) member.status = data.status as RoomMember["status"];
    member.lastActiveAt = new Date().toISOString();
    this.broadcast({ type: "presence:user_updated", user: this.toPresenceUser(member) }, userId);
  }

  updateFileOpen(userId: string, filePath: string): void {
    const member = this.members.get(userId);
    if (!member) return;
    member.openFiles.add(filePath);
    member.currentFile = filePath;
    member.lastActiveAt = new Date().toISOString();
    this.broadcastFilesOpen();
  }

  updateFileClose(userId: string, filePath: string): void {
    const member = this.members.get(userId);
    if (!member) return;
    member.openFiles.delete(filePath);
    if (member.currentFile === filePath) member.currentFile = null;
    this.broadcastFilesOpen();
  }

  setTyping(userId: string, typing: boolean): void {
    const member = this.members.get(userId);
    if (!member) return;
    member.typingInChat = typing;
    this.broadcast({ type: "chat:user_typing", userId, typing }, userId);
  }

  updateSelection(userId: string, data: SelectionData): void {
    const member = this.members.get(userId);
    if (!member) return;
    member.visualSelection = data;
    this.broadcast({ type: "awareness:user_selection", userId, data }, userId);
  }

  heartbeat(userId: string): void {
    const member = this.members.get(userId);
    if (member) {
      member.lastActiveAt = new Date().toISOString();
      if (member.status === "idle") {
        member.status = "active";
        this.broadcast({ type: "presence:user_updated", user: this.toPresenceUser(member) });
      }
    }
  }

  /** Check for idle users (no heartbeat for 60s) */
  checkIdle(): string[] {
    const now = Date.now();
    const disconnected: string[] = [];
    for (const [userId, member] of this.members) {
      const elapsed = now - new Date(member.lastActiveAt).getTime();
      if (elapsed > 5 * 60_000) {
        disconnected.push(userId);
      } else if (elapsed > 60_000 && member.status === "active") {
        member.status = "idle";
        this.broadcast({ type: "presence:user_updated", user: this.toPresenceUser(member) });
      }
    }
    return disconnected;
  }

  broadcast(message: WsServerMessage, excludeUserId?: string): void {
    const data = JSON.stringify(message);
    for (const [userId, member] of this.members) {
      if (userId === excludeUserId) continue;
      if (member.ws.readyState === member.ws.OPEN) {
        member.ws.send(data);
      }
    }
  }

  getPresenceUsers(): PresenceUser[] {
    return Array.from(this.members.values()).map((m) => this.toPresenceUser(m));
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
    return this.members.get(userId)?.ws;
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
    for (const [userId, member] of this.members) {
      if (member.openFiles.size > 0) {
        data[userId] = Array.from(member.openFiles);
      }
    }
    this.broadcast({ type: "awareness:files_open", data });
  }
}
