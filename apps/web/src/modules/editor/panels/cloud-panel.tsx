"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Database, Shield, HardDrive, Zap } from "lucide-react";
import type { CloudSection, SupabaseConnection } from "./cloud-types";
import {
  API_URL,
  authHeaders,
  MOCK_TABLES,
  MOCK_AUTH_PROVIDERS,
  MOCK_BUCKETS,
  MOCK_FUNCTIONS,
} from "./cloud-types";
import type { CloudPanelProps, DatabaseTable, AuthProvider, StorageBucket, EdgeFunction } from "./cloud-types";
import {
  ConnectionDialog,
  SectionHeader,
  DatabaseSection,
  AuthSection,
  StorageSection,
  EdgeFunctionsSection,
} from "./cloud-sections";

// ─── Main Cloud Panel ───────────────────────────────────────

export function CloudPanel({ projectId, onClose }: CloudPanelProps) {
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<SupabaseConnection | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<CloudSection>>(
    new Set(["database"])
  );

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

      try {
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

        const cleaned = existingContent.replace(
          /\n?## Supabase Connection\n(?:- .+\n)*/g,
          ""
        );

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
      <div className="flex h-full flex-col bg-background text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-brand-400" />
            <h2 className="text-sm font-semibold text-foreground">Cloud</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Connection Status */}
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-emerald-500" : "bg-muted-foreground"
                }`}
              />
              <span className="text-xs text-muted-foreground">
                {connected ? "Connected to Supabase" : "Not connected"}
              </span>
            </div>
            {connected ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowDialog(true)}
                  className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
            <div className="mt-2 rounded-md bg-muted px-2.5 py-1.5">
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                {connection.url}
              </p>
            </div>
          )}
        </div>

        {/* Scrollable sections */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="border-b border-border">
            <SectionHeader icon={Database} title="Database" expanded={expandedSections.has("database")} onToggle={() => toggleSection("database")} badge={connected ? `${tables.length}` : undefined} statusColor={connected ? "green" : "zinc"} />
            {expandedSections.has("database") && <DatabaseSection connected={connected} tables={tables} />}
          </div>

          <div className="border-b border-border">
            <SectionHeader icon={Shield} title="Authentication" expanded={expandedSections.has("auth")} onToggle={() => toggleSection("auth")} badge={connected ? `${authProviders.filter((p) => p.enabled).length} active` : undefined} statusColor={connected ? "green" : "zinc"} />
            {expandedSections.has("auth") && <AuthSection connected={connected} providers={authProviders} onToggleProvider={handleToggleProvider} />}
          </div>

          <div className="border-b border-border">
            <SectionHeader icon={HardDrive} title="Storage" expanded={expandedSections.has("storage")} onToggle={() => toggleSection("storage")} badge={connected ? `${buckets.length} buckets` : undefined} statusColor={connected ? "green" : "zinc"} />
            {expandedSections.has("storage") && <StorageSection connected={connected} buckets={buckets} />}
          </div>

          <div className="border-b border-border">
            <SectionHeader icon={Zap} title="Edge Functions" expanded={expandedSections.has("functions")} onToggle={() => toggleSection("functions")} badge={connected ? `${functions.filter((f) => f.status === "active").length} active` : undefined} statusColor={connected ? functions.some((f) => f.status === "active") ? "green" : "amber" : "zinc"} />
            {expandedSections.has("functions") && <EdgeFunctionsSection connected={connected} functions={functions} />}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Powered by Supabase</span>
            {connected && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-500/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
      </div>

      <ConnectionDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnect={handleConnect}
        initialValues={connection}
      />
    </>
  );
}
