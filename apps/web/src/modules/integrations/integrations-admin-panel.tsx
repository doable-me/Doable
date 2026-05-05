"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Check,
  X,
  AlertTriangle,
  Key,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { CATEGORY_LABELS } from "./use-integration-catalog";

// ─── Types ──────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  displayName: string;
  description: string;
  logoUrl: string;
  category: string;
  authType: string;
  tier: string;
  connected: boolean;
  actionCount: number;
}

interface EnabledIntegration {
  id: string;
  workspace_id: string;
  integration_id: string;
  enabled: boolean;
  configured: boolean;
  enabled_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  oauth_app_id: string | null;
  oauth_client_id: string | null;
}

interface OAuthAppForm {
  integrationId: string;
  clientId: string;
  clientSecret: string;
}

// ─── Main Component ─────────────────────────────────────────

interface IntegrationsAdminPanelProps {
  workspaceId: string;
}

export function IntegrationsAdminPanel({ workspaceId }: IntegrationsAdminPanelProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [enabledMap, setEnabledMap] = useState<Map<string, EnabledIntegration>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [oauthForm, setOauthForm] = useState<OAuthAppForm | null>(null);
  const [oauthSaving, setOauthSaving] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "enabled" | "unconfigured">("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [catalogRes, enabledRes] = await Promise.all([
        apiFetch<{ data: CatalogItem[]; categories: string[] }>(
          `/integrations/catalog?workspaceId=${workspaceId}&showAll=true`
        ),
        apiFetch<{ data: EnabledIntegration[] }>(
          `/integrations/admin/enabled?workspaceId=${workspaceId}`
        ),
      ]);
      setCatalog(catalogRes.data);
      setCategories(catalogRes.categories);
      const map = new Map<string, EnabledIntegration>();
      for (const row of enabledRes.data) {
        map.set(row.integration_id, row);
      }
      setEnabledMap(map);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleIntegration = async (integrationId: string, enable: boolean) => {
    setSaving(integrationId);
    try {
      if (enable) {
        await apiFetch("/integrations/admin/enabled", {
          method: "POST",
          body: JSON.stringify({ workspaceId, integrationId, enabled: true }),
        });
      } else {
        await apiFetch(`/integrations/admin/enabled/${integrationId}?workspaceId=${workspaceId}`, {
          method: "DELETE",
        });
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(null);
    }
  };

  const saveOAuthApp = async () => {
    if (!oauthForm) return;
    setOauthSaving(true);
    setOauthError(null);
    try {
      await apiFetch("/integrations/admin/oauth-apps", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          integrationId: oauthForm.integrationId,
          clientId: oauthForm.clientId,
          clientSecret: oauthForm.clientSecret,
        }),
      });
      // Also enable the integration
      await apiFetch("/integrations/admin/enabled", {
        method: "POST",
        body: JSON.stringify({ workspaceId, integrationId: oauthForm.integrationId, enabled: true }),
      });
      setOauthForm(null);
      await fetchData();
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : "Failed to save OAuth credentials");
    } finally {
      setOauthSaving(false);
    }
  };

  // Filter and search
  const filtered = catalog.filter((item) => {
    if (search) {
      const q = search.toLowerCase();
      if (!item.displayName.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (category && item.category !== category) return false;
    if (filterMode === "enabled" && !enabledMap.has(item.id)) return false;
    if (filterMode === "unconfigured") {
      const entry = enabledMap.get(item.id);
      if (!entry || entry.configured) return false;
    }
    return true;
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const cat = item.category || "other";
    (acc[cat] ??= []).push(item);
    return acc;
  }, {});

  const enabledCount = enabledMap.size;
  const unconfiguredCount = [...enabledMap.values()].filter((e) => !e.configured).length;
  const oauthIntegrations = catalog.filter((i) => i.authType === "oauth2");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 bg-background">
          <div className="text-2xl font-bold text-foreground">{enabledCount}</div>
          <div className="text-xs text-muted-foreground">Enabled</div>
        </div>
        <div className="rounded-lg border p-3 bg-background">
          <div className="text-2xl font-bold text-foreground">{oauthIntegrations.length}</div>
          <div className="text-xs text-muted-foreground">Need OAuth Setup</div>
        </div>
        <div className={cn("rounded-lg border p-3 bg-background", unconfiguredCount > 0 && "border-yellow-500/50")}>
          <div className={cn("text-2xl font-bold", unconfiguredCount > 0 ? "text-yellow-600" : "text-foreground")}>
            {unconfiguredCount}
          </div>
          <div className="text-xs text-muted-foreground">Enabled but Unconfigured</div>
        </div>
      </div>

      {unconfiguredCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
          <div className="text-sm text-yellow-700 dark:text-yellow-400">
            <strong>{unconfiguredCount} integration(s)</strong> are enabled but missing OAuth credentials.
            Users will see a &quot;redirect_uri_mismatch&quot; or similar error when trying to connect.
            Configure the OAuth app credentials below to fix this.
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={category || ""}
          onChange={(e) => setCategory(e.target.value || null)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat] || cat}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-input overflow-hidden">
          {(["all", "enabled", "unconfigured"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors",
                filterMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {mode === "all" ? "All" : mode === "enabled" ? "Enabled" : "Needs Config"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Integration list grouped by category */}
      <div className="space-y-4">
        {Object.entries(grouped)
          .sort(([a], [b]) => (CATEGORY_LABELS[a] || a).localeCompare(CATEGORY_LABELS[b] || b))
          .map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {CATEGORY_LABELS[cat] || cat} ({items.length})
              </h3>
              <div className="space-y-1">
                {items.map((item) => {
                  const entry = enabledMap.get(item.id);
                  const isEnabled = !!entry;
                  const isConfigured = entry?.configured ?? false;
                  const isOAuth = item.authType === "oauth2";
                  const isExpanded = expandedId === item.id;
                  const isSaving = saving === item.id;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg border transition-colors",
                        isEnabled && !isConfigured && isOAuth && "border-yellow-500/40",
                        isEnabled && isConfigured && "border-green-500/30",
                        !isEnabled && "border-border"
                      )}
                    >
                      <div className="flex items-center gap-3 p-3">
                        {/* Logo */}
                        <img
                          src={item.logoUrl}
                          alt={item.displayName}
                          className="h-8 w-8 rounded-md object-contain bg-white p-0.5"
                        />
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{item.displayName}</span>
                            {isOAuth && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                OAuth
                              </span>
                            )}
                            {isEnabled && isConfigured && (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            )}
                            {isEnabled && !isConfigured && isOAuth && (
                              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isOAuth && (
                            <button
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedId(null);
                                  setOauthForm(null);
                                } else {
                                  setExpandedId(item.id);
                                  setOauthForm({
                                    integrationId: item.id,
                                    clientId: entry?.oauth_client_id || "",
                                    clientSecret: "",
                                  });
                                }
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs border hover:bg-muted transition-colors"
                              title="Configure OAuth credentials"
                            >
                              <Key className="h-3 w-3" />
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                          )}
                          <button
                            onClick={() => toggleIntegration(item.id, !isEnabled)}
                            disabled={!!isSaving}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                              isEnabled
                                ? "bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-400"
                                : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            )}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isEnabled ? (
                              "Enabled"
                            ) : (
                              "Enable"
                            )}
                          </button>
                        </div>
                      </div>

                      {/* OAuth Config Expanded */}
                      {isExpanded && oauthForm && (
                        <div className="border-t p-4 bg-muted/30 space-y-3">
                          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                            <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <div>
                              Create an OAuth app in the provider&apos;s developer console.
                              Set the redirect URI to:{" "}
                              <code className="text-[11px] bg-background px-1 py-0.5 rounded border">
                                {typeof window !== "undefined"
                                  ? `${window.location.origin.replace(/:\d+$/, ":4000")}/integrations/oauth/callback`
                                  : "/integrations/oauth/callback"}
                              </code>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-foreground">Client ID</label>
                            <input
                              type="text"
                              value={oauthForm.clientId}
                              onChange={(e) => setOauthForm({ ...oauthForm, clientId: e.target.value })}
                              placeholder="OAuth Client ID"
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-foreground">Client Secret</label>
                            <input
                              type="password"
                              value={oauthForm.clientSecret}
                              onChange={(e) => setOauthForm({ ...oauthForm, clientSecret: e.target.value })}
                              placeholder="OAuth Client Secret"
                              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          {entry?.oauth_client_id && (
                            <div className="text-xs text-green-600 flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Credentials already configured (Client ID: {entry.oauth_client_id.slice(0, 20)}...)
                            </div>
                          )}
                          {oauthError && (
                            <div className="text-xs text-red-600">{oauthError}</div>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={saveOAuthApp}
                              disabled={oauthSaving || !oauthForm.clientId || !oauthForm.clientSecret}
                              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {oauthSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                              Save Credentials
                            </button>
                            <button
                              onClick={() => {
                                setExpandedId(null);
                                setOauthForm(null);
                                setOauthError(null);
                              }}
                              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No integrations match your filters.
        </div>
      )}
    </div>
  );
}
