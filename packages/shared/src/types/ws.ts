// ─── Presence ───────────────────────────────────────────
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

export interface PresenceUpdate {
  currentFile?: string | null;
  currentView?: "code" | "preview" | "chat" | "team";
  status?: "active" | "idle" | "away";
}

// ─── Team Chat ──────────────────────────────────────────
export interface TeamChatSend {
  content: string;
  mentions?: string[];
  parentId?: string;
}

export interface TeamChatMessage {
  id: string;
  projectId: string;
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  content: string;
  messageType: "user" | "system";
  mentions: string[];
  parentId: string | null;
  createdAt: string;
}

// ─── Activity ───────────────────────────────────────────
export interface ActivityEvent {
  id: string;
  projectId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  eventType: "file_save" | "file_create" | "file_delete" | "publish" | "version_create" | "ai_chat" | "settings_change";
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Selection / Awareness ──────────────────────────────
export interface SelectionData {
  elementSelector: string | null;
  boundingRect: { x: number; y: number; width: number; height: number } | null;
}

// ─── Client → Server Messages ───────────────────────────
export type WsClientMessage =
  | { type: "room:join"; projectId: string; resumeToken?: string }
  | { type: "room:leave" }
  | { type: "heartbeat" }
  | { type: "presence:update"; data: PresenceUpdate }
  | { type: "chat:send"; data: TeamChatSend }
  | { type: "chat:typing"; typing: boolean }
  | { type: "awareness:file_open"; filePath: string }
  | { type: "awareness:file_close"; filePath: string }
  | { type: "awareness:selection"; data: SelectionData }
  | { type: "cursor:move"; filePath: string; line: number; column: number }
  | { type: "yjs:sync-request" }
  | { type: "yjs:update"; data: string };

// ─── Server → Client Messages ───────────────────────────
export type WsServerMessage =
  | { type: "connected"; userId: string; resumeToken: string }
  | { type: "room:joined"; projectId: string; members: PresenceUser[] }
  | { type: "presence:sync"; users: PresenceUser[] }
  | { type: "presence:user_joined"; user: PresenceUser }
  | { type: "presence:user_left"; userId: string }
  | { type: "presence:user_updated"; user: PresenceUser }
  | { type: "chat:message"; message: TeamChatMessage }
  | { type: "chat:history"; messages: TeamChatMessage[] }
  | { type: "chat:user_typing"; userId: string; typing: boolean }
  | { type: "activity:event"; event: ActivityEvent }
  | { type: "awareness:files_open"; data: Record<string, string[]> }
  | { type: "awareness:user_selection"; userId: string; data: SelectionData }
  | { type: "heartbeat_ack" }
  | { type: "error"; code: string; message: string }
  | { type: "cursor:move"; userId: string; displayName: string; color: string; filePath: string; line: number; column: number }
  | { type: "yjs:sync-response"; data: string }
  | { type: "yjs:update"; userId: string; data: string };

// ─── Helpers ────────────────────────────────────────────
const PRESENCE_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
export function userColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length] ?? "#FF6B6B";
}
