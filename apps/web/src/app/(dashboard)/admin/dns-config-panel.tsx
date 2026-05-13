"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";

type DnsMode = "per_publish" | "wildcard";

interface DnsModeResponse {
  mode: DnsMode;
  defaulted: boolean;
}

interface DnsDiagnostics {
  zoneName: string;
  plan: string;
  hasAcm: boolean;
  publishDomain: string;
  domainDepth: number;
  recommendedWildcard: string;
  existingWildcard: { hostname: string; target: string } | null;
  canAutoSetup: boolean;
  reason: "ok" | "no-cf-creds" | "no-tunnel-id" | "no-publish-domain" | "free-plan-multilevel" | "zone-lookup-failed";
  message: string;
  multiServerNote: string;
}

interface AutoWildcardResponse {
  mode: "wildcard";
  wildcardHostname: string;
  target: string;
  created: boolean;
  updated: boolean;
  diagnostics: DnsDiagnostics;
}

function planLabel(plan: string): string {
  switch (plan) {
    case "free": return "Free";
    case "pro": return "Pro";
    case "business": return "Business";
    case "enterprise": return "Enterprise";
    default: return "Unknown";
  }
}

export function DnsConfigPanel() {
  const [mode, setMode] = useState<DnsMode>("per_publish");
  const [defaulted, setDefaulted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [diagnostics, setDiagnostics] = useState<DnsDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [autoSetupRunning, setAutoSetupRunning] = useState(false);
  const [autoSetupResult, setAutoSetupResult] = useState<AutoWildcardResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [modeRes, diagRes] = await Promise.allSettled([
          apiFetch<DnsModeResponse>("/admin/dns-mode"),
          apiFetch<DnsDiagnostics>("/admin/dns-mode/diagnostics"),
        ]);
        if (cancelled) return;
        if (modeRes.status === "fulfilled") {
          setMode(modeRes.value.mode);
          setDefaulted(modeRes.value.defaulted);
        } else {
          setError(modeRes.reason instanceof Error ? modeRes.reason.message : "Failed to load DNS config");
        }
        if (diagRes.status === "fulfilled") {
          setDiagnostics(diagRes.value);
        } else {
          setDiagnosticsError(diagRes.reason instanceof Error ? diagRes.reason.message : "Failed to load DNS diagnostics");
        }
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

  async function runAutoWildcard() {
    if (!diagnostics?.canAutoSetup) return;
    setAutoSetupRunning(true);
    setError(null);
    setAutoSetupResult(null);
    try {
      const res = await apiFetch<AutoWildcardResponse>("/admin/dns-mode/auto-wildcard", {
        method: "POST",
      });
      setAutoSetupResult(res);
      setMode("wildcard");
      setDefaulted(false);
      setSavedAt(Date.now());
      setDiagnostics(res.diagnostics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-configure failed");
    } finally {
      setAutoSetupRunning(false);
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
            Each publish either gets its own Cloudflare CNAME, or rides on a wildcard CNAME we set up for you.
          </p>
        </div>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {savedAt && !saving && !error && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>

      {diagnostics && (
        <div className="border-b border-border bg-secondary/40 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Zone:</span>
            <code className="font-mono text-foreground">{diagnostics.zoneName || "—"}</code>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-foreground/80">{planLabel(diagnostics.plan)}</span>
            <span className={`rounded px-1.5 py-0.5 ${diagnostics.hasAcm ? "bg-emerald-500/10 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>{diagnostics.hasAcm ? "ACM enabled" : "No ACM"}</span>
            <span className="text-muted-foreground">Publish domain:</span>
            <code className="font-mono text-foreground">{diagnostics.publishDomain || "—"}</code>
            {diagnostics.existingWildcard && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> {diagnostics.existingWildcard.hostname} → {diagnostics.existingWildcard.target}
              </span>
            )}
          </div>
        </div>
      )}

      {diagnosticsError && (
        <div className="border-b border-border px-4 py-2.5 text-[11px] text-amber-400">
          Could not load Cloudflare zone diagnostics: {diagnosticsError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-4 py-4">
        <button
          onClick={() => changeMode("per_publish")}
          disabled={saving || autoSetupRunning}
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
            Lets multiple doable servers coexist under the same zone using
            {" "}<code className="font-mono">{"<env>-<slug>.<zone>"}</code> hostnames covered by Universal SSL.
            Requires <code className="font-mono">CF_API_TOKEN</code>, <code className="font-mono">CF_ZONE_ID</code>, and <code className="font-mono">CLOUDFLARED_TUNNEL_ID</code>.
          </p>
        </button>

        <div
          className={`text-left rounded-lg border p-3 transition-colors ${
            mode === "wildcard"
              ? "border-blue-500 bg-blue-500/5"
              : "border-border bg-secondary"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <input type="radio" checked={mode === "wildcard"} readOnly className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-sm font-medium text-foreground">Wildcard CNAME (auto-configured)</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            Skip the per-publish API call — all publishes resolve via a single
            {" "}<code className="font-mono">{diagnostics?.recommendedWildcard || "*.<zone>"}</code> CNAME pointing to your tunnel.
            We&apos;ll create the record on your zone with the Cloudflare token from
            {" "}<code className="font-mono">cloudflared tunnel login</code>.
          </p>

          <button
            type="button"
            onClick={runAutoWildcard}
            disabled={!diagnostics?.canAutoSetup || autoSetupRunning || saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-500 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary disabled:text-muted-foreground"
          >
            {autoSetupRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {autoSetupRunning
              ? "Configuring…"
              : mode === "wildcard" && diagnostics?.existingWildcard
                ? "Re-verify wildcard"
                : "Auto-configure wildcard"}
          </button>

          {diagnostics && !diagnostics.canAutoSetup && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
              <span>{diagnostics.message}</span>
            </p>
          )}
          {autoSetupResult && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" />
              <span>
                {autoSetupResult.created ? "Created" : autoSetupResult.updated ? "Updated" : "Confirmed"}
                {" "}<code className="font-mono">{autoSetupResult.wildcardHostname}</code> → <code className="font-mono">{autoSetupResult.target}</code>
              </span>
            </p>
          )}
        </div>
      </div>

      {diagnostics?.multiServerNote && (
        <div className="border-t border-border bg-secondary/30 px-4 py-2.5">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Heads up:</span> {diagnostics.multiServerNote}
          </p>
        </div>
      )}

      {(defaulted || error) && (
        <div className="border-t border-border px-4 py-2.5">
          {defaulted && !error && !autoSetupResult && (
            <p className="text-[11px] text-muted-foreground">
              No setting persisted yet — using the per-publish default.
              {" "}Selecting an option or auto-configuring wildcard will save it for future publishes.
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
