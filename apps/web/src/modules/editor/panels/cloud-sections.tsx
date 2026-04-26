"use client";

import { useState, useCallback } from "react";
import {
  X,
  ChevronRight,
  ChevronDown,
  Plus,
  Play,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  Upload,
  Folder,
  ToggleLeft,
  ToggleRight,
  Database,
  Shield,
  Zap,
} from "lucide-react";
import {
  type SupabaseConnection,
  type DatabaseTable,
  type AuthProvider,
  type StorageBucket,
  type EdgeFunction,
  formatBytes,
  formatTimestamp,
} from "./cloud-types";
export { ConnectionDialog } from "./cloud-connection-dialog";

// ─── Section Header ─────────────────────────────────────────

export function SectionHeader({
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
    zinc: "bg-muted-foreground",
  };

  return (
    <button onClick={onToggle} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted transition-colors">
      {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-foreground flex-1">{title}</span>
      {statusColor && <span className={`h-2 w-2 rounded-full ${colors[statusColor]} flex-shrink-0`} />}
      {badge && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground flex-shrink-0">{badge}</span>}
    </button>
  );
}

// ─── Database Section ───────────────────────────────────────

export function DatabaseSection({
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
    await new Promise((r) => setTimeout(r, 800));
    setSqlResult(
      JSON.stringify(
        { rows: [{ id: "a1b2c3", email: "alice@example.com", name: "Alice" }, { id: "d4e5f6", email: "bob@example.com", name: "Bob" }], rowCount: 2 },
        null, 2
      )
    );
    setRunning(false);
  }, [sqlQuery]);

  if (!connected) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Connect to Supabase to view your database tables.</div>;
  }

  return (
    <div className="pb-2">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tables</span>
          <span className="text-[11px] text-muted-foreground">{tables.length} tables</span>
        </div>
        <div className="space-y-0.5">
          {tables.map((table) => (
            <div key={table.name}>
              <button onClick={() => setExpandedTable((v) => (v === table.name ? null : table.name))} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-muted transition-colors">
                {expandedTable === table.name ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                <Database className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-[13px] text-foreground flex-1 font-mono">{table.name}</span>
                <span className="text-[11px] text-muted-foreground">{table.rowCount.toLocaleString()} rows</span>
              </button>
              {expandedTable === table.name && (
                <div className="ml-7 mt-1 mb-2 rounded-md border border-border bg-card overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-2.5 py-1.5 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    <span>Column</span><span>Type</span><span>Null</span>
                  </div>
                  {table.columns.map((col) => (
                    <div key={col.name} className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-2.5 py-1 border-b border-border last:border-0 text-[12px]">
                      <span className="flex items-center gap-1.5 font-mono text-foreground">
                        {col.isPrimary && <span className="text-amber-500 text-[10px]" title="Primary Key">PK</span>}
                        {col.name}
                      </span>
                      <span className="font-mono text-brand-400/80">{col.type}</span>
                      <span className="text-muted-foreground">{col.nullable ? "YES" : "NO"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 pt-2 pb-1 border-t border-border">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">SQL Query</span>
        <div className="mt-2 relative">
          <textarea value={sqlQuery} onChange={(e) => setSqlQuery(e.target.value)} placeholder="SELECT * FROM users LIMIT 10;" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-brand-500/50" />
          <button onClick={handleRunQuery} disabled={running || !sqlQuery.trim()} className="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-brand-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Run
          </button>
        </div>
        {sqlResult && (
          <div className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-card">
            <pre className="p-2.5 text-[11px] font-mono text-emerald-400/80 leading-relaxed">{sqlResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Auth Section ───────────────────────────────────────────

export function AuthSection({
  connected,
  providers,
  onToggleProvider,
}: {
  connected: boolean;
  providers: AuthProvider[];
  onToggleProvider: (id: string) => void;
}) {
  if (!connected) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Connect to Supabase to manage authentication.</div>;
  }

  const userCount = 1247;
  const recentSignups = [
    { email: "alice@example.com", time: "2m ago" },
    { email: "bob@example.org", time: "18m ago" },
    { email: "carol@work.co", time: "1h ago" },
  ];

  return (
    <div className="pb-2">
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Total Users</span>
        <span className="text-sm font-semibold text-foreground">{userCount.toLocaleString()}</span>
      </div>
      <div className="px-4 space-y-1">
        {providers.map((provider) => (
          <div key={provider.id} className="flex items-center justify-between rounded-md px-2.5 py-2 hover:bg-muted transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                {provider.id === "email" && <span className="text-xs">@</span>}
                {provider.id === "google" && <span className="text-xs font-bold">G</span>}
                {provider.id === "github" && <span className="text-xs font-bold">GH</span>}
              </div>
              <span className="text-[13px] text-foreground">{provider.name}</span>
            </div>
            <button onClick={() => onToggleProvider(provider.id)} className="transition-colors" title={provider.enabled ? "Disable" : "Enable"}>
              {provider.enabled ? <ToggleRight className="h-5 w-5 text-emerald-500" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
            </button>
          </div>
        ))}
      </div>
      <div className="px-4 pt-3">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Recent Signups</span>
        <div className="mt-1.5 space-y-0.5">
          {recentSignups.map((signup, i) => (
            <div key={i} className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12px]">
              <span className="text-muted-foreground truncate">{signup.email}</span>
              <span className="text-muted-foreground flex-shrink-0 ml-2">{signup.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Storage Section ────────────────────────────────────────

export function StorageSection({
  connected,
  buckets,
}: {
  connected: boolean;
  buckets: StorageBucket[];
}) {
  if (!connected) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Connect to Supabase to manage file storage.</div>;
  }

  const totalUsed = buckets.reduce((sum, b) => sum + b.sizeBytes, 0);
  const totalLimit = 1_073_741_824;
  const usagePct = Math.round((totalUsed / totalLimit) * 100);

  return (
    <div className="pb-2">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Storage Usage</span>
          <span className="text-[11px] text-muted-foreground">{formatBytes(totalUsed)} / {formatBytes(totalLimit)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${Math.min(100, usagePct)}%` }} />
        </div>
      </div>
      <div className="px-4 space-y-0.5">
        {buckets.map((bucket) => (
          <div key={bucket.name} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-muted transition-colors">
            <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-mono text-foreground truncate">{bucket.name}</span>
                {bucket.isPublic && <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">PUBLIC</span>}
              </div>
              <span className="text-[11px] text-muted-foreground">{bucket.fileCount} files - {formatBytes(bucket.sizeBytes)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pt-3">
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-4 text-center cursor-pointer hover:border-border hover:bg-secondary transition-colors">
          <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-1.5 text-[11px] text-muted-foreground">Drop files here or click to upload</p>
        </div>
      </div>
    </div>
  );
}

// ─── Edge Functions Section ─────────────────────────────────

export function EdgeFunctionsSection({
  connected,
  functions,
}: {
  connected: boolean;
  functions: EdgeFunction[];
}) {
  if (!connected) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Connect to Supabase to manage edge functions.</div>;
  }

  return (
    <div className="pb-2">
      <div className="px-4 space-y-0.5">
        {functions.map((fn) => (
          <div key={fn.name} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-muted transition-colors">
            <Zap className={`h-3.5 w-3.5 flex-shrink-0 ${fn.status === "active" ? "text-emerald-500" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-mono text-foreground truncate block">{fn.name}</span>
              <span className="text-[11px] text-muted-foreground">{fn.status === "active" ? "Active" : "Inactive"} - Last invoked {formatTimestamp(fn.lastInvoked)}</span>
            </div>
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${fn.status === "active" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
          </div>
        ))}
      </div>
      <div className="px-4 pt-3">
        <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-[12px] text-muted-foreground hover:border-border hover:text-foreground transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Create New Function
        </button>
      </div>
    </div>
  );
}
