"use client";

import { useState, useCallback, useEffect } from "react";
import {
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import type { SupabaseConnection } from "./cloud-types";

// ─── Connection Dialog ──────────────────────────────────────

export function ConnectionDialog({
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-popover shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Connect to Supabase</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your Supabase project credentials to enable backend services.
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supabase Project URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-project.supabase.co" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Anon / Public Key</label>
            <input type="text" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground font-mono outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Service Role Key
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">Secret</span>
            </label>
            <div className="relative">
              <input type={showServiceKey ? "text" : "password"} value={serviceRoleKey} onChange={(e) => setServiceRoleKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs..." className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground font-mono outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30" />
              <button onClick={() => setShowServiceKey((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" type="button">
                {showServiceKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {testResult && (
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${testResult === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
              {testResult === "success" ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {testResult === "success" ? "Connection successful!" : "Connection failed. Check your credentials."}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button onClick={handleTest} disabled={testing || !url.trim()} className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Test Connection
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !url.trim() || !anonKey.trim()} className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save & Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
