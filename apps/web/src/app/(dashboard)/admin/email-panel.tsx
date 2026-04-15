"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Shield,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────

interface EmailConfig {
  id: string;
  provider: string;
  label: string;
  from_address: string;
  is_active: boolean;
  verified: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
  credentials: Record<string, string>;
}

interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  dead: number;
}

type ProviderType = "smtp" | "resend" | "google";

const SMTP_SERVICES = [
  "Custom (manual SMTP)",
  "Gmail",
  "SendGrid",
  "Mailgun",
  "SES",
  "Zoho",
  "Outlook365",
  "Fastmail",
  "Postmark",
  "Mandrill",
  "SparkPost",
  "Yahoo",
  "iCloud",
  "AOL",
  "Godaddy",
  "1und1",
  "DynectEmail",
  "Hotmail",
  "QQ",
  "QQex",
  "126",
  "163",
];

// ─── Email Settings Panel ────────────────────────────────────

export function EmailPanel() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Form state
  const [formProvider, setFormProvider] = useState<ProviderType>("smtp");
  const [formLabel, setFormLabel] = useState("");
  const [formFromAddress, setFormFromAddress] = useState("");
  // SMTP fields
  const [smtpService, setSmtpService] = useState("Gmail");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  // Resend fields
  const [resendApiKey, setResendApiKey] = useState("");
  // Form editing mode
  const [editing, setEditing] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: EmailConfig | null }>("/admin/email/config");
      setConfig(res.data);
    } catch (e) {
      console.error("Failed to load email config:", e);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: QueueStats }>("/admin/email/queue-stats");
      setStats(res.data);
    } catch (e) {
      console.error("Failed to load queue stats:", e);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadConfig(), loadStats()]).finally(() => setLoading(false));
  }, [loadConfig, loadStats]);

  // Check URL params for Gmail OAuth success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      setTestResult({ ok: true, message: "Gmail connected successfully via OAuth!" });
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail");
      url.searchParams.delete("tab");
      window.history.replaceState({}, "", url.toString());
      loadConfig();
    }
  }, [loadConfig]);

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = {
        provider: formProvider,
        label: formLabel,
        fromAddress: formFromAddress,
      };

      if (formProvider === "smtp") {
        const isCustom = smtpService === "Custom (manual SMTP)";
        body.credentials = {
          ...(isCustom ? { host: smtpHost, port: smtpPort } : { service: smtpService }),
          user: smtpUser,
          pass: smtpPass,
        };
      } else if (formProvider === "resend") {
        body.credentials = { apiKey: resendApiKey };
      }

      await apiFetch("/admin/email/config", { method: "POST", body: JSON.stringify(body) });
      setTestResult({ ok: true, message: "Email provider saved! Send a test email to verify." });
      setEditing(false);
      await loadConfig();
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ success: boolean }>("/admin/email/test", { method: "POST" });
      setTestResult({ ok: res.success, message: res.success ? "Test email sent! Check your inbox." : "Failed to send test email." });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ verified: boolean; error?: string; message?: string }>("/admin/email/verify", { method: "POST" });
      if (res.verified) {
        setTestResult({ ok: true, message: res.message ?? "Provider connection verified!" });
      } else {
        setTestResult({ ok: false, message: res.error ?? "Verification failed" });
      }
      await loadConfig();
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Verification failed" });
    } finally {
      setVerifying(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove email configuration? The system will fall back to environment variable settings.")) return;
    setDeleting(true);
    setTestResult(null);
    try {
      await apiFetch("/admin/email/config", { method: "DELETE" });
      setConfig(null);
      setEditing(false);
      setTestResult({ ok: true, message: "Configuration removed. Falling back to environment variables." });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Failed to delete" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleGmailConnect() {
    try {
      const res = await apiFetch<{ url: string }>("/admin/email/google/auth-url");
      window.location.href = res.url;
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Failed to start Gmail OAuth" });
    }
  }

  function startEditing() {
    setEditing(true);
    setTestResult(null);
    if (config) {
      setFormProvider(config.provider as ProviderType);
      setFormLabel(config.label);
      setFormFromAddress(config.from_address);
    } else {
      setFormProvider("smtp");
      setFormLabel("");
      setFormFromAddress("");
    }
    // Always clear credential fields for security
    setSmtpService("Gmail");
    setSmtpHost("");
    setSmtpPort(587);
    setSmtpUser("");
    setSmtpPass("");
    setResendApiKey("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {testResult && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
          testResult.ok
            ? "border-emerald-600/30 bg-emerald-600/5 text-emerald-300"
            : "border-red-600/30 bg-red-600/5 text-red-300"
        }`}>
          {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {testResult.message}
        </div>
      )}

      {/* Current Config Display */}
      {config && !editing ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/20">
                <Mail className="h-4 w-4 text-brand-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">{config.label}</h3>
                <p className="text-xs text-zinc-500">{config.provider.toUpperCase()} — {config.from_address}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config.verified ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Not verified
                </span>
              )}
            </div>
          </div>

          {/* Masked credentials preview */}
          {config.credentials && Object.keys(config.credentials).length > 0 && (
            <div className="grid grid-cols-2 gap-2 rounded-md bg-zinc-800/50 p-3">
              {Object.entries(config.credentials).map(([key, val]) => (
                <div key={key}>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">{key}</span>
                  <p className="text-xs text-zinc-400 font-mono truncate">{val}</p>
                </div>
              ))}
            </div>
          )}

          {config.last_error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <XCircle className="h-3.5 w-3.5 shrink-0" /> {config.last_error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={handleTest} disabled={testing} className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send Test Email
            </Button>
            <Button onClick={handleVerify} disabled={verifying} variant="outline" className="gap-2 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              Verify Connection
            </Button>
            <Button onClick={startEditing} variant="outline" className="text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Change Provider
            </Button>
            <Button onClick={handleDelete} disabled={deleting} variant="outline" className="text-xs border-red-800/50 text-red-400 hover:bg-red-900/20 hover:border-red-700/50">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
            </Button>
          </div>
        </div>
      ) : (
        /* Config Form */
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <Mail className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-medium text-white">
              {config ? "Update Email Provider" : "Configure Email Provider"}
            </h3>
          </div>

          {/* Provider Selection */}
          <div className="grid grid-cols-3 gap-2">
            {(["smtp", "resend", "google"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setFormProvider(p); setTestResult(null); }}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  formProvider === p
                    ? "border-brand-500 bg-brand-600/10"
                    : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
                }`}
              >
                <span className="text-xs font-medium text-white">
                  {p === "smtp" ? "SMTP" : p === "resend" ? "Resend" : "Gmail (OAuth)"}
                </span>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {p === "smtp" ? "Gmail, SendGrid, Mailgun, SES, and 20+ providers"
                    : p === "resend" ? "Modern email API with great deliverability"
                    : "One-click Google account connection"}
                </p>
              </button>
            ))}
          </div>

          {/* Gmail OAuth — just a connect button */}
          {formProvider === "google" ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Connect your Google account with one click. This uses OAuth so your password is never shared.
                Only the <code className="text-zinc-300">gmail.send</code> permission is requested.
              </p>
              <Button onClick={handleGmailConnect} className="gap-2 bg-white text-zinc-900 hover:bg-zinc-100 text-sm font-medium">
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Connect Google Account
              </Button>
              {config && (
                <Button onClick={() => setEditing(false)} variant="outline" className="text-xs border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                  Cancel
                </Button>
              )}
            </div>
          ) : (
            /* SMTP / Resend form fields */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Label</label>
                  <input
                    type="text" value={formLabel} onChange={(e) => setFormLabel(e.target.value)}
                    placeholder={formProvider === "smtp" ? "Production SMTP" : "Resend Production"}
                    className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">From Address</label>
                  <input
                    type="text" value={formFromAddress} onChange={(e) => setFormFromAddress(e.target.value)}
                    placeholder="Doable <noreply@yourdomain.com>"
                    className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500 placeholder:text-zinc-600"
                  />
                </div>
              </div>

              {formProvider === "smtp" && (
                <>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Service</label>
                    <select
                      value={smtpService} onChange={(e) => setSmtpService(e.target.value)}
                      className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500"
                    >
                      {SMTP_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {smtpService === "Custom (manual SMTP)" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">SMTP Host</label>
                        <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500 placeholder:text-zinc-600" />
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Port</label>
                        <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Username</label>
                      <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@example.com" className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500 placeholder:text-zinc-600" />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Password</label>
                      <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500 placeholder:text-zinc-600" />
                    </div>
                  </div>
                </>
              )}

              {formProvider === "resend" && (
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">API Key</label>
                  <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_••••••••" className="w-full rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 px-3 py-2 outline-none focus:border-brand-500 placeholder:text-zinc-600" />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button onClick={handleSave} disabled={saving || !formLabel || !formFromAddress} className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                  Save & Encrypt
                </Button>
                {config && (
                  <Button onClick={() => setEditing(false)} variant="outline" className="text-xs border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No config hint */}
      {!config && !editing && (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 p-6 text-center space-y-3">
          <Mail className="h-8 w-8 text-zinc-600 mx-auto" />
          <div>
            <p className="text-sm text-zinc-400">No email provider configured in the database</p>
            <p className="text-xs text-zinc-600 mt-1">
              {config === null ? "Using environment variable fallback (if configured)" : ""}
            </p>
          </div>
          <Button onClick={startEditing} className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm">
            <Mail className="h-3.5 w-3.5" /> Configure Email Provider
          </Button>
        </div>
      )}

      {/* Queue Stats */}
      {stats && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Email Queue</h4>
            <Button onClick={loadStats} variant="ghost" className="h-7 px-2 text-zinc-500 hover:text-zinc-300">
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {([
              { label: "Pending", value: stats.pending, color: "text-amber-400" },
              { label: "Processing", value: stats.processing, color: "text-blue-400" },
              { label: "Sent", value: stats.sent, color: "text-emerald-400" },
              { label: "Failed", value: stats.failed, color: "text-red-400" },
              { label: "Dead Letter", value: stats.dead, color: "text-zinc-500" },
            ] as const).map((s) => (
              <div key={s.label} className="text-center">
                <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-zinc-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <p className="text-[11px] text-zinc-600 leading-relaxed">
        All credentials are encrypted at rest using AES-256. The email queue retries failed sends with exponential backoff (up to 5 attempts).
        After exhausting retries, emails move to the dead-letter queue for manual review.
      </p>
    </div>
  );
}
