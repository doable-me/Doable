"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Loader2, Globe, Atom } from "lucide-react";

interface FrameworkInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  isDefault: boolean;
}

const FRAMEWORK_ICONS: Record<string, typeof Globe> = {
  "vite-react": Atom,
  "nextjs-app": Globe,
};

export function FrameworksPanel() {
  const [frameworks, setFrameworks] = useState<FrameworkInfo[]>([]);
  const [defaultFramework, setDefaultFramework] = useState<string>("vite-react");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ frameworks: FrameworkInfo[]; defaultFramework: string }>("/admin/frameworks");
      setFrameworks(res.frameworks);
      setDefaultFramework(res.defaultFramework);
    } catch (err) {
      setError("Failed to load framework settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = useCallback(async (id: string) => {
    const updated = frameworks.map((f) =>
      f.id === id ? { ...f, enabled: !f.enabled } : f
    );
    // Must have at least one enabled
    if (updated.filter((f) => f.enabled).length === 0) {
      setError("At least one framework must remain enabled");
      setTimeout(() => setError(null), 3000);
      return;
    }
    setFrameworks(updated);
    await save(updated, defaultFramework);
  }, [frameworks, defaultFramework]);

  const handleSetDefault = useCallback(async (id: string) => {
    // Can only set default to an enabled framework
    const fw = frameworks.find((f) => f.id === id);
    if (!fw?.enabled) return;
    setDefaultFramework(id);
    await save(frameworks, id);
  }, [frameworks]);

  const save = async (fws: FrameworkInfo[], defFw: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const enabled = fws.filter((f) => f.enabled).map((f) => f.id);
      await apiFetch("/admin/frameworks", {
        method: "PUT",
        body: JSON.stringify({
          enabledFrameworks: enabled,
          defaultFramework: defFw,
        }),
      });
      setSuccess("Framework settings saved");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Failed to save framework settings");
    } finally {
      setSaving(false);
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Project Frameworks</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Control which project types users can create. Disabled frameworks won&apos;t appear in the project creation dialog.
          </p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-brand-400" />}
      </div>

      {error && (
        <div className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-800/50 bg-green-900/20 px-3 py-2 text-xs text-green-400">
          {success}
        </div>
      )}

      <div className="space-y-2">
        {frameworks.map((fw) => {
          const Icon = FRAMEWORK_ICONS[fw.id] ?? Globe;
          return (
            <div
              key={fw.id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                fw.enabled
                  ? "border-border bg-card"
                  : "border-border/50 bg-muted/30 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-5 w-5 ${fw.enabled ? "text-brand-400" : "text-muted-foreground"}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{fw.name}</span>
                    <span className="text-xs text-muted-foreground">({fw.category})</span>
                    {fw.isDefault && fw.enabled && (
                      <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-medium text-brand-400">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{fw.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {fw.enabled && !fw.isDefault && (
                  <button
                    onClick={() => handleSetDefault(fw.id)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Set as default
                  </button>
                )}
                <button
                  onClick={() => handleToggle(fw.id)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    fw.enabled ? "bg-brand-500" : "bg-muted-foreground/30"
                  }`}
                  aria-label={`${fw.enabled ? "Disable" : "Enable"} ${fw.name}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      fw.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground/70 pt-2">
        Changes take effect immediately. Existing projects using a disabled framework will continue to work,
        but new projects cannot be created with it.
      </p>
    </div>
  );
}
