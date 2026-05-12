"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

type DnsMode = "per_publish" | "wildcard";

interface DnsModeResponse {
  mode: DnsMode;
  defaulted: boolean;
}

export function DnsConfigPanel() {
  const [mode, setMode] = useState<DnsMode>("per_publish");
  const [defaulted, setDefaulted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<DnsModeResponse>("/admin/dns-mode");
        if (cancelled) return;
        setMode(res.mode);
        setDefaulted(res.defaulted);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load DNS config");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function changeMode(next: DnsMode) {
    if (next === mode) return;
    setSaving(true);
    setError(null);
    const previous = mode;
    setMode(next);
    try {
      await apiFetch("/admin/dns-mode", {
        method: "PUT",
        body: JSON.stringify({ mode: next }),
      });
      setDefaulted(false);
      setSavedAt(Date.now());
    } catch (err) {
      setMode(previous);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Globe className="h-4 w-4 text-blue-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">DNS for Published Sites</h3>
          <p className="text-[11px] text-muted-foreground">
            Controls whether each publish creates its own Cloudflare CNAME, or trusts an admin-managed wildcard.
          </p>
        </div>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {savedAt && !saving && !error && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 py-4">
        <button
          onClick={() => changeMode("per_publish")}
          disabled={saving}
          className={`text-left rounded-lg border p-3 transition-colors ${
            mode === "per_publish"
              ? "border-blue-500 bg-blue-500/5"
              : "border-border bg-secondary hover:border-border/80"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <input type="radio" checked={mode === "per_publish"} readOnly className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-sm font-medium text-foreground">Per-publish CNAME</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">Default</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Every publish calls the Cloudflare API to create one CNAME per subdomain.
            Requires <code className="font-mono">CF_API_TOKEN</code>, <code className="font-mono">CF_ZONE_ID</code>, and <code className="font-mono">CLOUDFLARED_TUNNEL_ID</code>.
            Works on free SSL plans for single-level subdomains like <code className="font-mono">*.doable.me</code>.
          </p>
        </button>

        <button
          onClick={() => changeMode("wildcard")}
          disabled={saving}
          className={`text-left rounded-lg border p-3 transition-colors ${
            mode === "wildcard"
              ? "border-blue-500 bg-blue-500/5"
              : "border-border bg-secondary hover:border-border/80"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <input type="radio" checked={mode === "wildcard"} readOnly className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-sm font-medium text-foreground">Wildcard CNAME (admin-managed)</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Trust a wildcard CNAME you've added in Cloudflare yourself (e.g. <code className="font-mono">*.myapp.com</code> → tunnel).
            Publishes skip the per-subdomain API call. For multi-level wildcards like <code className="font-mono">*.staging.doable.me</code> you need <span className="text-foreground">Advanced Certificate Manager</span> on the zone.
          </p>
        </button>
      </div>

      {(defaulted || error) && (
        <div className="border-t border-border px-4 py-2.5">
          {defaulted && !error && (
            <p className="text-[11px] text-muted-foreground">
              No setting persisted yet — using the per-publish default.
              {" "}Selecting an option will save it for future publishes.
            </p>
          )}
          {error && (
            <p className="flex items-start gap-1.5 text-[11px] text-red-400">
              <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
              <span>
                {error}
                {error.includes("migration 081") && (
                  <> Run <code className="font-mono">migration 081_platform_settings.sql</code> against the DB.</>
                )}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
