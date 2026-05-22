"use client";

import { useState, useEffect } from "react";
import { Gauge, Save, Loader2, RotateCcw, Infinity } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-core";
import { SectionCard } from "./project-settings-shared";

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING TAB
// ═══════════════════════════════════════════════════════════════

interface ConnectorSettings {
  rateLimitPerMinute: number | null;
}

export function RateLimitingTab({
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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="MCP & Integration Rate Limiting"
        description="Control how many MCP tool calls and integration requests this project can make per minute. Applies to all modes: preview, standalone, and published."
      >
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
      </SectionCard>

      {/* Info Card */}
      <SectionCard title="How it works" description="Understanding the rate limiting architecture">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Rate limiting applies to all MCP tool calls and integration actions made by this project,
            regardless of how the app is accessed (editor preview, standalone URL, or published site).
          </p>
          <p>
            All requests flow through a <strong className="text-foreground">single endpoint</strong>:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/__doable/connector-proxy/mcp/:toolName</code>
          </p>
          <ul className="list-inside list-disc space-y-1 pl-2">
            <li>Preview &amp; standalone: authenticated via short-lived JWT (15 min)</li>
            <li>Published apps: authenticated via project API key (dpk_*)</li>
            <li>Rate limit is shared across all auth modes for this project</li>
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}
