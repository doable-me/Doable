import { getStoredTokens } from "@/lib/api";

// ─── Constants ──────────────────────────────────────────────

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────

export interface CloudPanelProps {
  projectId: string;
  onClose: () => void;
}

export interface SupabaseConnection {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface DatabaseTable {
  name: string;
  rowCount: number;
  columns: TableColumn[];
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
}

export interface AuthProvider {
  id: string;
  name: string;
  enabled: boolean;
  icon: string;
}

export interface StorageBucket {
  name: string;
  isPublic: boolean;
  fileCount: number;
  sizeBytes: number;
}

export interface EdgeFunction {
  name: string;
  status: "active" | "inactive";
  lastInvoked: string | null;
}

export type CloudSection = "database" | "auth" | "storage" | "functions";

// ─── Helpers ────────────────────────────────────────────────

export function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatTimestamp(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Mock Data (used when not connected to real Supabase) ───

export const MOCK_TABLES: DatabaseTable[] = [
  {
    name: "users",
    rowCount: 1247,
    columns: [
      { name: "id", type: "uuid", nullable: false, isPrimary: true },
      { name: "email", type: "text", nullable: false, isPrimary: false },
      { name: "name", type: "text", nullable: true, isPrimary: false },
      { name: "avatar_url", type: "text", nullable: true, isPrimary: false },
      { name: "created_at", type: "timestamptz", nullable: false, isPrimary: false },
    ],
  },
  {
    name: "posts",
    rowCount: 3891,
    columns: [
      { name: "id", type: "uuid", nullable: false, isPrimary: true },
      { name: "title", type: "text", nullable: false, isPrimary: false },
      { name: "content", type: "text", nullable: true, isPrimary: false },
      { name: "author_id", type: "uuid", nullable: false, isPrimary: false },
      { name: "published", type: "boolean", nullable: false, isPrimary: false },
      { name: "created_at", type: "timestamptz", nullable: false, isPrimary: false },
    ],
  },
  {
    name: "comments",
    rowCount: 8432,
    columns: [
      { name: "id", type: "uuid", nullable: false, isPrimary: true },
      { name: "post_id", type: "uuid", nullable: false, isPrimary: false },
      { name: "author_id", type: "uuid", nullable: false, isPrimary: false },
      { name: "body", type: "text", nullable: false, isPrimary: false },
      { name: "created_at", type: "timestamptz", nullable: false, isPrimary: false },
    ],
  },
];

export const MOCK_AUTH_PROVIDERS: AuthProvider[] = [
  { id: "email", name: "Email / Password", enabled: true, icon: "mail" },
  { id: "google", name: "Google", enabled: false, icon: "google" },
  { id: "github", name: "GitHub", enabled: false, icon: "github" },
];

export const MOCK_BUCKETS: StorageBucket[] = [
  { name: "avatars", isPublic: true, fileCount: 312, sizeBytes: 47_200_000 },
  { name: "uploads", isPublic: false, fileCount: 1024, sizeBytes: 524_288_000 },
];

export const MOCK_FUNCTIONS: EdgeFunction[] = [
  { name: "send-welcome-email", status: "active", lastInvoked: new Date(Date.now() - 300_000).toISOString() },
  { name: "process-payment", status: "active", lastInvoked: new Date(Date.now() - 7_200_000).toISOString() },
  { name: "generate-thumbnail", status: "inactive", lastInvoked: null },
];
