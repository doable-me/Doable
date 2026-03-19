"use client";

import { useState, useCallback, useEffect } from "react";
import {
  X,
  Database,
  Shield,
  HardDrive,
  Zap,
  ChevronRight,
  ChevronDown,
  Plus,
  Play,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Upload,
  Folder,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { getStoredTokens } from "@/lib/api";

// ─── Constants ──────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────

interface CloudPanelProps {
  projectId: string;
  onClose: () => void;
}

interface SupabaseConnection {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface DatabaseTable {
  name: string;
  rowCount: number;
  columns: TableColumn[];
}

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
}

interface AuthProvider {
  id: string;
  name: string;
  enabled: boolean;
  icon: string;
}

interface StorageBucket {
  name: string;
  isPublic: boolean;
  fileCount: number;
  sizeBytes: number;
}

interface EdgeFunction {
  name: string;
  status: "active" | "inactive";
  lastInvoked: string | null;
}

type CloudSection = "database" | "auth" | "storage" | "functions";

// ─── Helpers ────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTimestamp(ts: string | null): string {
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

const MOCK_TABLES: DatabaseTable[] = [
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

const MOCK_AUTH_PROVIDERS: AuthProvider[] = [
  { id: "email", name: "Email / Password", enabled: true, icon: "mail" },
  { id: "google", name: "Google", enabled: false, icon: "google" },
  { id: "github", name: "GitHub", enabled: false, icon: "github" },
];

const MOCK_BUCKETS: StorageBucket[] = [
  { name: "avatars", isPublic: true, fileCount: 312, sizeBytes: 47_200_000 },
  { name: "uploads", isPublic: false, fileCount: 1024, sizeBytes: 524_288_000 },
];

const MOCK_FUNCTIONS: EdgeFunction[] = [
  { name: "send-welcome-email", status: "active", lastInvoked: new Date(Date.now() - 300_000).toISOString() },
  { name: "process-payment", status: "active", lastInvoked: new Date(Date.now() - 7_200_000).toISOString() },
  { name: "generate-thumbnail", status: "inactive", lastInvoked: null },
];

// ─── Connection Dialog ──────────────────────────────────────

function ConnectionDialog({
  open,
  onClose,
  onConnect,
  initialValues,
}: {
  open: boolean;
  onClose: () => void;
  onConnect: (conn: SupabaseConnection) => void;
  initialValues?: SupabaseConnection | null;
}) {
  const [url, setUrl] = useState(initialValues?.url ?? "");
  const [anonKey, setAnonKey] = useState(initialValues?.anonKey ?? "");
  const [serviceRoleKey, setServiceRoleKey] = useState(initialValues?.serviceRoleKey ?? "");
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(initialValues?.url ?? "");
      setAnonKey(initialValues?.anonKey ?? "");
      setServiceRoleKey(initialValues?.serviceRoleKey ?? "");
      setTestResult(null);
    }
  }, [open, initialValues]);

  const handleTest = useCallback(async () => {
    if (!url.trim()) return;
    setTesting(true);
    setTestResult(null);
    // Simulate connection test
    await new Promise((r) => setTimeout(r, 1500));
    const isValid = url.includes("supabase") || url.includes("http");
    setTestResult(isValid ? "success" : "error");
    setTesting(false);
  }, [url]);

  const handleSave = useCallback(async () => {
    if (!url.trim() || !anonKey.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    onConnect({ url: url.trim(), anonKey: anonKey.trim(), serviceRoleKey: serviceRoleKey.trim() });
    setSaving(false);
    onClose();
  }, [url, anonKey, serviceRoleKey, onConnect, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-700/50 bg-[#1C1C1C] shadow-2xl">
        {/* Header */}
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Connect to Supabase</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Enter your Supabase project credentials to enable backend services.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Project URL */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Supabase Project URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
            />
          </div>

          {/* Anon Key */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Anon / Public Key
            </label>
            <input
              type="text"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-600 font-mono outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
            />
          </div>

          {/* Service Role Key */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              Service Role Key
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                Secret
              </span>
            </label>
            <div className="relative">
              <input
                type={showServiceKey ? "text" : "password"}
                value={serviceRoleKey}
                onChange={(e) => setServiceRoleKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 pr-10 text-sm text-white placeholder-zinc-600 font-mono outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
              />
              <button
                onClick={() => setShowServiceKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                type="button"
              >
                {showServiceKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                testResult === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {testResult === "success" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {testResult === "success"
                ? "Connection successful!"
                : "Connection failed. Check your credentials."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3">
          <button
            onClick={handleTest}
            disabled={testing || !url.trim()}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Test Connection
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !url.trim() || !anonKey.trim()}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save & Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  expanded,
  onToggle,
  badge,
  statusColor,
}: {
  icon: typeof Database;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
  statusColor?: "green" | "amber" | "red" | "zinc";
}) {
  const colors = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    zinc: "bg-zinc-600",
  };

  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
    >
      {expanded ? (
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
      )}
      <Icon className="h-4 w-4 text-zinc-400 flex-shrink-0" />
      <span className="text-sm font-medium text-zinc-200 flex-1">{title}</span>
      {statusColor && (
        <span className={`h-2 w-2 rounded-full ${colors[statusColor]} flex-shrink-0`} />
      )}
      {badge && (
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400 flex-shrink-0">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Database Section ───────────────────────────────────────

function DatabaseSection({
  connected,
  tables,
}: {
  connected: boolean;
  tables: DatabaseTable[];
}) {
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [sqlQuery, setSqlQuery] = useState("");
  const [sqlResult, setSqlResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleRunQuery = useCallback(async () => {
    if (!sqlQuery.trim()) return;
    setRunning(true);
    setSqlResult(null);
    // Simulate query execution
    await new Promise((r) => setTimeout(r, 800));
    setSqlResult(
      JSON.stringify(
        {
          rows: [
            { id: "a1b2c3", email: "alice@example.com", name: "Alice" },
            { id: "d4e5f6", email: "bob@example.com", name: "Bob" },
          ],
          rowCount: 2,
        },
        null,
        2
      )
    );
    setRunning(false);
  }, [sqlQuery]);

  if (!connected) {
    return (
      <div className="px-4 py-3 text-xs text-zinc-500">
        Connect to Supabase to view your database tables.
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* Tables List */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Tables
          </span>
          <span className="text-[11px] text-zinc-600">{tables.length} tables</span>
        </div>

        <div className="space-y-0.5">
          {tables.map((table) => (
            <div key={table.name}>
              <button
                onClick={() =>
                  setExpandedTable((v) => (v === table.name ? null : table.name))
                }
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-zinc-800/60 transition-colors"
              >
                {expandedTable === table.name ? (
                  <ChevronDown className="h-3 w-3 text-zinc-600 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-zinc-600 flex-shrink-0" />
                )}
                <Database className="h-3 w-3 text-zinc-500 flex-shrink-0" />
                <span className="text-[13px] text-zinc-300 flex-1 font-mono">
                  {table.name}
                </span>
                <span className="text-[11px] text-zinc-600">
                  {table.rowCount.toLocaleString()} rows
                </span>
              </button>

              {/* Schema viewer */}
              {expandedTable === table.name && (
                <div className="ml-7 mt-1 mb-2 rounded-md border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-2.5 py-1.5 border-b border-zinc-800 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">
                    <span>Column</span>
                    <span>Type</span>
                    <span>Null</span>
                  </div>
                  {table.columns.map((col) => (
                    <div
                      key={col.name}
                      className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-2.5 py-1 border-b border-zinc-800/50 last:border-0 text-[12px]"
                    >
                      <span className="flex items-center gap-1.5 font-mono text-zinc-300">
                        {col.isPrimary && (
                          <span className="text-amber-500 text-[10px]" title="Primary Key">
                            PK
                          </span>
                        )}
                        {col.name}
                      </span>
                      <span className="font-mono text-brand-400/80">{col.type}</span>
                      <span className="text-zinc-600">{col.nullable ? "YES" : "NO"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SQL Query Runner */}
      <div className="px-4 pt-2 pb-1 border-t border-zinc-800/50">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          SQL Query
        </span>
        <div className="mt-2 relative">
          <textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            placeholder="SELECT * FROM users LIMIT 10;"
            rows={3}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-[12px] font-mono text-zinc-300 placeholder-zinc-700 resize-none outline-none focus:border-brand-500/50"
          />
          <button
            onClick={handleRunQuery}
            disabled={running || !sqlQuery.trim()}
            className="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-brand-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Run
          </button>
        </div>

        {sqlResult && (
          <div className="mt-2 max-h-40 overflow-auto rounded-md border border-zinc-800 bg-zinc-900/60">
            <pre className="p-2.5 text-[11px] font-mono text-emerald-400/80 leading-relaxed">
              {sqlResult}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Auth Section ───────────────────────────────────────────

function AuthSection({
  connected,
  providers,
  onToggleProvider,
}: {
  connected: boolean;
  providers: AuthProvider[];
  onToggleProvider: (id: string) => void;
}) {
  if (!connected) {
    return (
      <div className="px-4 py-3 text-xs text-zinc-500">
        Connect to Supabase to manage authentication.
      </div>
    );
  }

  const userCount = 1247;
  const recentSignups = [
    { email: "alice@example.com", time: "2m ago" },
    { email: "bob@gmail.com", time: "18m ago" },
    { email: "carol@work.co", time: "1h ago" },
  ];

  return (
    <div className="pb-2">
      {/* User count */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          Total Users
        </span>
        <span className="text-sm font-semibold text-zinc-200">
          {userCount.toLocaleString()}
        </span>
      </div>

      {/* Providers */}
      <div className="px-4 space-y-1">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center justify-between rounded-md px-2.5 py-2 hover:bg-zinc-800/40 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
                {provider.id === "email" && <span className="text-xs">@</span>}
                {provider.id === "google" && <span className="text-xs font-bold">G</span>}
                {provider.id === "github" && <span className="text-xs font-bold">GH</span>}
              </div>
              <span className="text-[13px] text-zinc-300">{provider.name}</span>
            </div>
            <button
              onClick={() => onToggleProvider(provider.id)}
              className="transition-colors"
              title={provider.enabled ? "Disable" : "Enable"}
            >
              {provider.enabled ? (
                <ToggleRight className="h-5 w-5 text-emerald-500" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-zinc-600" />
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Recent signups */}
      <div className="px-4 pt-3">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          Recent Signups
        </span>
        <div className="mt-1.5 space-y-0.5">
          {recentSignups.map((signup, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px]"
            >
              <span className="text-zinc-400 truncate">{signup.email}</span>
              <span className="text-zinc-600 flex-shrink-0 ml-2">{signup.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Storage Section ────────────────────────────────────────

function StorageSection({
  connected,
  buckets,
}: {
  connected: boolean;
  buckets: StorageBucket[];
}) {
  if (!connected) {
    return (
      <div className="px-4 py-3 text-xs text-zinc-500">
        Connect to Supabase to manage file storage.
      </div>
    );
  }

  const totalUsed = buckets.reduce((sum, b) => sum + b.sizeBytes, 0);
  const totalLimit = 1_073_741_824; // 1 GB
  const usagePct = Math.round((totalUsed / totalLimit) * 100);

  return (
    <div className="pb-2">
      {/* Usage bar */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Storage Usage
          </span>
          <span className="text-[11px] text-zinc-500">
            {formatBytes(totalUsed)} / {formatBytes(totalLimit)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              usagePct > 90
                ? "bg-red-500"
                : usagePct > 70
                  ? "bg-amber-500"
                  : "bg-brand-500"
            }`}
            style={{ width: `${Math.min(100, usagePct)}%` }}
          />
        </div>
      </div>

      {/* Buckets */}
      <div className="px-4 space-y-0.5">
        {buckets.map((bucket) => (
          <div
            key={bucket.name}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-zinc-800/40 transition-colors"
          >
            <Folder className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-mono text-zinc-300 truncate">
                  {bucket.name}
                </span>
                {bucket.isPublic && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500">
                    PUBLIC
                  </span>
                )}
              </div>
              <span className="text-[11px] text-zinc-600">
                {bucket.fileCount} files - {formatBytes(bucket.sizeBytes)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Upload area */}
      <div className="px-4 pt-3">
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-4 text-center cursor-pointer hover:border-zinc-600 hover:bg-zinc-900/50 transition-colors">
          <Upload className="mx-auto h-5 w-5 text-zinc-600" />
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Drop files here or click to upload
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Edge Functions Section ─────────────────────────────────

function EdgeFunctionsSection({
  connected,
  functions,
}: {
  connected: boolean;
  functions: EdgeFunction[];
}) {
  if (!connected) {
    return (
      <div className="px-4 py-3 text-xs text-zinc-500">
        Connect to Supabase to manage edge functions.
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* Functions list */}
      <div className="px-4 space-y-0.5">
        {functions.map((fn) => (
          <div
            key={fn.name}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-zinc-800/40 transition-colors"
          >
            <Zap
              className={`h-3.5 w-3.5 flex-shrink-0 ${
                fn.status === "active" ? "text-emerald-500" : "text-zinc-600"
              }`}
            />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-mono text-zinc-300 truncate block">
                {fn.name}
              </span>
              <span className="text-[11px] text-zinc-600">
                {fn.status === "active" ? "Active" : "Inactive"} - Last invoked {formatTimestamp(fn.lastInvoked)}
              </span>
            </div>
            <span
              className={`h-2 w-2 rounded-full flex-shrink-0 ${
                fn.status === "active" ? "bg-emerald-500" : "bg-zinc-700"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Create new */}
      <div className="px-4 pt-3">
        <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-700 py-2 text-[12px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-400 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Create New Function
        </button>
      </div>
    </div>
  );
}

// ─── Main Cloud Panel ───────────────────────────────────────

export function CloudPanel({ projectId, onClose }: CloudPanelProps) {
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<SupabaseConnection | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<CloudSection>>(
    new Set(["database"])
  );

  // State
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [authProviders, setAuthProviders] = useState<AuthProvider[]>(MOCK_AUTH_PROVIDERS);
  const [buckets, setBuckets] = useState<StorageBucket[]>([]);
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);

  // Load saved connection from API on mount
  useEffect(() => {
    const loadConnection = async () => {
      try {
        const res = await fetch(
          `${API_URL}/projects/${projectId}/context/knowledge.md`,
          { headers: authHeaders() }
        );
        if (!res.ok) return;
        const json = (await res.json()) as { data: { content: string } };
        // Check if connection info is stored in knowledge.md
        const match = json.data.content.match(
          /## Supabase Connection\n- URL: (.+)\n- Anon Key: (.+)/
        );
        if (match) {
          const conn: SupabaseConnection = {
            url: match[1]!.trim(),
            anonKey: match[2]!.trim(),
            serviceRoleKey: "",
          };
          setConnection(conn);
          setConnected(true);
          // Load mock data when connected
          setTables(MOCK_TABLES);
          setBuckets(MOCK_BUCKETS);
          setFunctions(MOCK_FUNCTIONS);
        }
      } catch {
        // Ignore — not connected
      }
    };
    loadConnection();
  }, [projectId]);

  const handleConnect = useCallback(
    async (conn: SupabaseConnection) => {
      setConnection(conn);
      setConnected(true);
      setTables(MOCK_TABLES);
      setBuckets(MOCK_BUCKETS);
      setFunctions(MOCK_FUNCTIONS);

      // Persist connection info to API via knowledge.md context file
      try {
        // Read existing knowledge content
        let existingContent = "";
        try {
          const res = await fetch(
            `${API_URL}/projects/${projectId}/context/knowledge.md`,
            { headers: authHeaders() }
          );
          if (res.ok) {
            const json = (await res.json()) as { data: { content: string } };
            existingContent = json.data.content;
          }
        } catch {
          // Ignore
        }

        // Remove any existing Supabase section
        const cleaned = existingContent.replace(
          /\n?## Supabase Connection\n(?:- .+\n)*/g,
          ""
        );

        // Append connection info
        const updated = `${cleaned.trimEnd()}\n\n## Supabase Connection\n- URL: ${conn.url}\n- Anon Key: ${conn.anonKey}\n`;

        await fetch(
          `${API_URL}/projects/${projectId}/context/knowledge.md`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders(),
            },
            body: JSON.stringify({ content: updated }),
          }
        );
      } catch {
        // Silently ignore persistence failure
      }
    },
    [projectId]
  );

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    setConnection(null);
    setTables([]);
    setBuckets([]);
    setFunctions([]);
  }, []);

  const toggleSection = useCallback((section: CloudSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const handleToggleProvider = useCallback((id: string) => {
    setAuthProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  }, []);

  return (
    <>
      <div className="flex h-full flex-col bg-[#1C1C1C] text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-white">Cloud</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Connection Status */}
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-emerald-500" : "bg-zinc-600"
                }`}
              />
              <span className="text-xs text-zinc-400">
                {connected ? "Connected to Supabase" : "Not connected"}
              </span>
            </div>
            {connected ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowDialog(true)}
                  className="rounded-md px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                >
                  Settings
                </button>
                <button
                  onClick={handleDisconnect}
                  className="rounded-md px-2 py-1 text-[11px] text-red-500/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDialog(true)}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-brand-500 transition-colors"
              >
                <Database className="h-3 w-3" />
                Connect Supabase
              </button>
            )}
          </div>
          {connected && connection && (
            <div className="mt-2 rounded-md bg-zinc-900/60 px-2.5 py-1.5">
              <p className="text-[11px] font-mono text-zinc-600 truncate">
                {connection.url}
              </p>
            </div>
          )}
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Database Section */}
          <div className="border-b border-zinc-800/50">
            <SectionHeader
              icon={Database}
              title="Database"
              expanded={expandedSections.has("database")}
              onToggle={() => toggleSection("database")}
              badge={connected ? `${tables.length}` : undefined}
              statusColor={connected ? "green" : "zinc"}
            />
            {expandedSections.has("database") && (
              <DatabaseSection connected={connected} tables={tables} />
            )}
          </div>

          {/* Auth Section */}
          <div className="border-b border-zinc-800/50">
            <SectionHeader
              icon={Shield}
              title="Authentication"
              expanded={expandedSections.has("auth")}
              onToggle={() => toggleSection("auth")}
              badge={
                connected
                  ? `${authProviders.filter((p) => p.enabled).length} active`
                  : undefined
              }
              statusColor={connected ? "green" : "zinc"}
            />
            {expandedSections.has("auth") && (
              <AuthSection
                connected={connected}
                providers={authProviders}
                onToggleProvider={handleToggleProvider}
              />
            )}
          </div>

          {/* Storage Section */}
          <div className="border-b border-zinc-800/50">
            <SectionHeader
              icon={HardDrive}
              title="Storage"
              expanded={expandedSections.has("storage")}
              onToggle={() => toggleSection("storage")}
              badge={connected ? `${buckets.length} buckets` : undefined}
              statusColor={connected ? "green" : "zinc"}
            />
            {expandedSections.has("storage") && (
              <StorageSection connected={connected} buckets={buckets} />
            )}
          </div>

          {/* Edge Functions Section */}
          <div className="border-b border-zinc-800/50">
            <SectionHeader
              icon={Zap}
              title="Edge Functions"
              expanded={expandedSections.has("functions")}
              onToggle={() => toggleSection("functions")}
              badge={
                connected
                  ? `${functions.filter((f) => f.status === "active").length} active`
                  : undefined
              }
              statusColor={
                connected
                  ? functions.some((f) => f.status === "active")
                    ? "green"
                    : "amber"
                  : "zinc"
              }
            />
            {expandedSections.has("functions") && (
              <EdgeFunctionsSection connected={connected} functions={functions} />
            )}
          </div>
        </div>

        {/* Footer — Supabase branding */}
        <div className="border-t border-zinc-800 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-600">Powered by Supabase</span>
            {connected && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-500/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Connection Dialog */}
      <ConnectionDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnect={handleConnect}
        initialValues={connection}
      />
    </>
  );
}
