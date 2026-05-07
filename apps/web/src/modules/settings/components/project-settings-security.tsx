"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Gauge,
  Save,
  Loader2,
  RotateCcw,
  Infinity,
  ChevronDown,
  ChevronRight,
  Shield,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Globe,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-core";
import { SectionCard } from "./project-settings-shared";

// ═══════════════════════════════════════════════════════════════
// SECURITY TAB — combines Rate Limiting + API Key Management
// ═══════════════════════════════════════════════════════════════

interface ApiKeyEntry {
  id: string;
  key_prefix: string;
  tier: "client" | "server";
  label: string | null;
  allowed_tools: string[] | null;
  allowed_origins: string[] | null;
  created_at: string;
  last_used_at: string | null;
}

interface ConnectorSettings {
  rateLimitPerMinute: number | null;
}

// ─── Collapsible Section ────────────────────────────────────

function CollapsibleSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-muted/30"
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

// ─── API Keys Section ───────────────────────────────────────

function ApiKeysSection({
  projectId,
  addToast,
}: {
  projectId: string;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const { keys: data } = await apiFetch<{ keys: ApiKeyEntry[] }>(
        `/projects/${projectId}/api-keys`
      );
      setKeys(data);
    } catch {
      addToast("error", "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [projectId, addToast]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async (tier: "client" | "server") => {
    setCreating(true);
    try {
      const result = await apiFetch<{ key: string; prefix: string; tier: string }>(
        `/projects/${projectId}/api-keys`,
        {
          method: "POST",
          body: JSON.stringify({ tier, label: `Manual ${tier} key` }),
        }
      );
      setNewKeyValue(result.key);
      await loadKeys();
      addToast("success", "API key created — copy it now, it won't be shown again");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    try {
      await apiFetch(`/projects/${projectId}/api-keys/${keyId}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      addToast("success", "Key revoked");
    } catch {
      addToast("error", "Failed to revoke key");
    }
  };

  const handleCopy = async () => {
    if (!newKeyValue) return;
    await navigator.clipboard.writeText(newKeyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Newly created key (show once) */}
      {newKeyValue && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200">Save this key — it won't be shown again</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono break-all">
                  {newKeyValue}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 rounded-md border p-2 hover:bg-muted"
                >
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <button
                onClick={() => setNewKeyValue(null)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing keys */}
      {keys.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Key className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            No API keys yet. Keys are auto-provisioned on first publish,
            or you can create one manually below.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{k.key_prefix}•••</code>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                        k.tier === "server"
                          ? "bg-purple-500/20 text-purple-300"
                          : "bg-blue-500/20 text-blue-300"
                      )}
                    >
                      {k.tier}
                    </span>
                  </div>
                  {k.label && (
                    <p className="mt-1 text-xs text-muted-foreground">{k.label}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {k.allowed_tools && (
                      <span className="flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {k.allowed_tools.length} tool{k.allowed_tools.length !== 1 ? "s" : ""} allowed
                      </span>
                    )}
                    {!k.allowed_tools && (
                      <span className="flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        All tools
                      </span>
                    )}
                    {k.allowed_origins && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {k.allowed_origins.join(", ")}
                      </span>
                    )}
                    {!k.allowed_origins && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        Any origin
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(k.id)}
                  className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Revoke key"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => handleCreate("client")}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
          Create Client Key
        </button>
        <button
          onClick={() => handleCreate("server")}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
          Create Server Key
        </button>
      </div>

      {/* Explanation */}
      <div className="rounded-lg bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
        <p><strong className="text-foreground">Client keys</strong> (dpk_c_*): For browser apps. Origin-bound, lower rate limits (600/min).</p>
        <p><strong className="text-foreground">Server keys</strong> (dpk_s_*): For backend apps. No origin check, higher rate limits (1200/min).</p>
        <p><strong className="text-foreground">Auto-provisioned:</strong> When you publish, a client key is automatically created and scoped to exactly the MCP tools your app uses.</p>
      </div>
    </div>
  );
}

// ─── Rate Limiting Section ──────────────────────────────────

function RateLimitSection({
  projectId,
  addToast,
}: {
  projectId: string;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [settings, setSettings] = useState<ConnectorSettings>({ rateLimitPerMinute: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"default" | "custom" | "disabled">("default");
  const [customValue, setCustomValue] = useState(600);

  useEffect(() => {
    apiFetch<{ data: ConnectorSettings }>(`/projects/${projectId}/connector-settings`)
      .then(({ data }) => {
        setSettings(data);
        if (data.rateLimitPerMinute === null) {
          setMode("default");
        } else if (data.rateLimitPerMinute === 0) {
          setMode("disabled");
        } else {
          setMode("custom");
          setCustomValue(data.rateLimitPerMinute);
        }
      })
      .catch(() => addToast("error", "Failed to load rate limit settings"))
      .finally(() => setLoading(false));
  }, [projectId, addToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const value = mode === "default" ? null : mode === "disabled" ? 0 : customValue;
      const { data } = await apiFetch<{ data: ConnectorSettings }>(
        `/projects/${projectId}/connector-settings`,
        {
          method: "PUT",
          body: JSON.stringify({ rateLimitPerMinute: value }),
        }
      );
      setSettings(data);
      addToast("success", "Rate limiting settings saved");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = (() => {
    const currentDbValue = settings.rateLimitPerMinute;
    const newValue = mode === "default" ? null : mode === "disabled" ? 0 : customValue;
    return currentDbValue !== newValue;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Rate Limit Mode</label>
        <div className="grid gap-3">
          {/* Default */}
          <button
            type="button"
            onClick={() => setMode("default")}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
              mode === "default"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            )}
          >
            <Gauge className={cn("mt-0.5 h-5 w-5 shrink-0", mode === "default" ? "text-primary" : "text-muted-foreground")} />
            <div>
              <p className="text-sm font-medium">System Default</p>
              <p className="text-xs text-muted-foreground">
                600 calls/min for preview, 1200 calls/min for published apps with API keys
              </p>
            </div>
          </button>

          {/* Custom */}
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
              mode === "custom"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            )}
          >
            <RotateCcw className={cn("mt-0.5 h-5 w-5 shrink-0", mode === "custom" ? "text-primary" : "text-muted-foreground")} />
            <div className="flex-1">
              <p className="text-sm font-medium">Custom Limit</p>
              <p className="text-xs text-muted-foreground">
                Set a specific calls-per-minute limit for this project
              </p>
              {mode === "custom" && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={customValue}
                    onChange={(e) => setCustomValue(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                    className="w-24 rounded-md border bg-background px-3 py-1.5 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">calls / minute</span>
                </div>
              )}
            </div>
          </button>

          {/* Disabled */}
          <button
            type="button"
            onClick={() => setMode("disabled")}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
              mode === "disabled"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            )}
          >
            <Infinity className={cn("mt-0.5 h-5 w-5 shrink-0", mode === "disabled" ? "text-primary" : "text-muted-foreground")} />
            <div>
              <p className="text-sm font-medium">Unlimited (No Rate Limiting)</p>
              <p className="text-xs text-muted-foreground">
                Disable rate limiting entirely. Use with caution — external MCP servers may still apply their own limits.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Security Tab ──────────────────────────────────────

export function SecurityTab({
  projectId,
  addToast,
}: {
  projectId: string;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="API Keys"
        description="Manage authentication keys for published apps. Auto-provisioned on first publish with tool-scoping and origin-binding."
        icon={Key}
        defaultOpen={true}
      >
        <ApiKeysSection projectId={projectId} addToast={addToast} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Rate Limiting"
        description="Control how many MCP tool calls and integration requests this project can make per minute."
        icon={Gauge}
        defaultOpen={true}
      >
        <RateLimitSection projectId={projectId} addToast={addToast} />
      </CollapsibleSection>
    </div>
  );
}
