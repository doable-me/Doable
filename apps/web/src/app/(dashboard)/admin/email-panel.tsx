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
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  RefreshCw,
  Clock,
  Inbox,
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

interface QueueItem {
  id: string;
  to_address: string;
  subject: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  from_address: string | null;
  template: string | null;
  created_at: string;
  sent_at: string | null;
  next_retry_at: string | null;
  updated_at: string;
  html?: string;
  text_body?: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
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
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/20">
                <Mail className="h-4 w-4 text-brand-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">{config.label}</h3>
                <p className="text-xs text-muted-foreground">{config.provider.toUpperCase()} — {config.from_address}</p>
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
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3">
              {Object.entries(config.credentials).map(([key, val]) => (
                <div key={key}>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{key}</span>
                  <p className="text-xs text-muted-foreground font-mono truncate">{val}</p>
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
            <Button onClick={handleVerify} disabled={verifying} variant="outline" className="gap-2 text-xs border-border text-foreground hover:bg-secondary">
              {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              Verify Connection
            </Button>
            <Button onClick={startEditing} variant="outline" className="text-xs border-border text-foreground hover:bg-secondary">
              Change Provider
            </Button>
            <Button onClick={handleDelete} disabled={deleting} variant="outline" className="text-xs border-red-800/50 text-red-400 hover:bg-red-900/20 hover:border-red-700/50">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
            </Button>
          </div>
        </div>
      ) : (
        /* Config Form */
        <div className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <Mail className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-medium text-foreground">
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
                    : "border-border hover:border-border/60 bg-muted"
                }`}
              >
                <span className="text-xs font-medium text-foreground">
                  {p === "smtp" ? "SMTP" : p === "resend" ? "Resend" : "Gmail (OAuth)"}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
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
              <p className="text-xs text-muted-foreground">
                Connect your Google account with one click. This uses OAuth so your password is never shared.
                Only the <code className="text-foreground">gmail.send</code> permission is requested.
              </p>
              {/* Google brand button — uses Google's official brand colors (intentional pure white). */}
              <Button onClick={handleGmailConnect} className="gap-2 bg-white text-zinc-900 hover:bg-zinc-100 text-sm font-medium">
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Connect Google Account
              </Button>
              {config && (
                <Button onClick={() => setEditing(false)} variant="outline" className="text-xs border-border text-muted-foreground hover:bg-secondary">
                  Cancel
                </Button>
              )}
            </div>
          ) : (
            /* SMTP / Resend form fields */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Label</label>
                  <input
                    type="text" value={formLabel} onChange={(e) => setFormLabel(e.target.value)}
                    placeholder={formProvider === "smtp" ? "Production SMTP" : "Resend Production"}
                    className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500 placeholder:text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">From Address</label>
                  <input
                    type="text" value={formFromAddress} onChange={(e) => setFormFromAddress(e.target.value)}
                    placeholder="Doable <noreply@yourdomain.com>"
                    className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500 placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              {formProvider === "smtp" && (
                <>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Service</label>
                    <select
                      value={smtpService} onChange={(e) => setSmtpService(e.target.value)}
                      className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500"
                    >
                      {SMTP_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {smtpService === "Custom (manual SMTP)" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">SMTP Host</label>
                        <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500 placeholder:text-muted-foreground" />
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Port</label>
                        <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Username</label>
                      <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="user@example.com" className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500 placeholder:text-muted-foreground" />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Password</label>
                      <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500 placeholder:text-muted-foreground" />
                    </div>
                  </div>
                </>
              )}

              {formProvider === "resend" && (
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">API Key</label>
                  <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_••••••••" className="w-full rounded-md bg-background border border-input text-sm text-foreground px-3 py-2 outline-none focus:border-brand-500 placeholder:text-muted-foreground" />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button onClick={handleSave} disabled={saving || !formLabel || !formFromAddress} className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                  Save & Encrypt
                </Button>
                {config && (
                  <Button onClick={() => setEditing(false)} variant="outline" className="text-xs border-border text-muted-foreground hover:bg-secondary">
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
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center space-y-3">
          <Mail className="h-8 w-8 text-muted-foreground mx-auto" />
          <div>
            <p className="text-sm text-muted-foreground">No email provider configured in the database</p>
            <p className="text-xs text-muted-foreground mt-1">
              {config === null ? "Using environment variable fallback (if configured)" : ""}
            </p>
          </div>
          <Button onClick={startEditing} className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm">
            <Mail className="h-3.5 w-3.5" /> Configure Email Provider
          </Button>
        </div>
      )}

      {/* Queue Stats & Management */}
      {stats && (
        <EmailQueueManager stats={stats} onStatsChange={loadStats} />
      )}

      {/* Info */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        All credentials are encrypted at rest using AES-256. The email queue retries failed sends with exponential backoff (up to 5 attempts).
        After exhausting retries, emails move to the dead-letter queue for manual review.
      </p>
    </div>
  );
}

// ─── Status Helpers ──────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  processing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  sent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  dead: "bg-muted text-muted-foreground border-border",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[status] ?? "bg-secondary text-muted-foreground border-border"}`}>
      {status === "dead" ? "dead letter" : status}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Email Queue Manager ─────────────────────────────────────

function EmailQueueManager({ stats, onStatsChange }: { stats: QueueStats; onStatsChange: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0 });
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const hasItems = stats.pending + stats.processing + stats.sent + stats.failed + stats.dead > 0;

  const loadQueue = useCallback(async (page = 1, status: string | null = filterStatus) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (status) params.set("status", status);
      const res = await apiFetch<{ data: QueueItem[]; pagination: Pagination }>(`/admin/email/queue?${params}`);
      setItems(res.data);
      setPagination(res.pagination);
    } catch (e) {
      console.error("Failed to load queue:", e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    if (expanded) loadQueue(1, filterStatus);
  }, [expanded, filterStatus, loadQueue]);

  async function handleRetry(id: string) {
    setActionLoading(id);
    try {
      await apiFetch(`/admin/email/queue/${id}/retry`, { method: "POST" });
      await loadQueue(pagination.page);
      onStatsChange();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetryAll(status: string) {
    if (!confirm(`Retry all ${status} emails? They will be reset to pending.`)) return;
    setActionLoading(`retry-all-${status}`);
    try {
      const res = await apiFetch<{ count: number }>(`/admin/email/queue/retry-all?status=${status}`, { method: "POST" });
      await loadQueue(1);
      onStatsChange();
      alert(`${res.count} email(s) queued for retry.`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this email permanently?")) return;
    setActionLoading(id);
    try {
      await apiFetch(`/admin/email/queue/${id}`, { method: "DELETE" });
      await loadQueue(pagination.page);
      onStatsChange();
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePurge(status: string) {
    const label = status === "dead" ? "dead letter" : status;
    if (!confirm(`Permanently delete ALL ${label} emails? This cannot be undone.`)) return;
    setActionLoading(`purge-${status}`);
    try {
      const res = await apiFetch<{ count: number }>(`/admin/email/queue?status=${status}`, { method: "DELETE" });
      await loadQueue(1);
      onStatsChange();
      alert(`${res.count} email(s) deleted.`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleViewDetail(id: string) {
    try {
      const res = await apiFetch<{ data: QueueItem }>(`/admin/email/queue/${id}`);
      setSelectedItem(res.data);
    } catch (e) {
      console.error("Failed to load email detail:", e);
    }
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Stats Bar */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5" /> Email Queue
          </h4>
          <div className="flex items-center gap-2">
            <Button onClick={onStatsChange} variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" />
            </Button>
            {hasItems && (
              <Button
                onClick={() => { setExpanded(!expanded); setSelectedItem(null); }}
                variant="ghost"
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? "Collapse" : "Manage"}
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {([
            { label: "Pending", value: stats.pending, color: "text-amber-400", key: "pending" },
            { label: "Processing", value: stats.processing, color: "text-blue-400", key: "processing" },
            { label: "Sent", value: stats.sent, color: "text-emerald-400", key: "sent" },
            { label: "Failed", value: stats.failed, color: "text-red-400", key: "failed" },
            { label: "Dead Letter", value: stats.dead, color: "text-muted-foreground", key: "dead" },
          ] as const).map((s) => (
            <button
              key={s.label}
              onClick={() => {
                if (!expanded) setExpanded(true);
                setFilterStatus(filterStatus === s.key ? null : s.key);
                setSelectedItem(null);
              }}
              className={`text-center rounded-md py-1 transition-colors ${
                filterStatus === s.key
                  ? "bg-secondary ring-1 ring-border"
                  : "hover:bg-muted"
              }`}
            >
              <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Expanded Queue Browser */}
      {expanded && (
        <div>
          {/* Detail View */}
          {selectedItem ? (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back to list
                </button>
                <div className="flex items-center gap-2">
                  {["failed", "dead"].includes(selectedItem.status) && (
                    <Button onClick={() => handleRetry(selectedItem.id)} disabled={actionLoading === selectedItem.id} variant="outline" className="h-7 text-xs gap-1 border-border text-foreground">
                      {actionLoading === selectedItem.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Retry
                    </Button>
                  )}
                  <Button onClick={() => handleDelete(selectedItem.id)} disabled={actionLoading === selectedItem.id} variant="outline" className="h-7 text-xs gap-1 border-red-800/50 text-red-400 hover:bg-red-900/20">
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedItem.status} />
                  <span className="text-xs text-muted-foreground">Attempt {selectedItem.attempts}/{selectedItem.max_attempts}</span>
                </div>
                <h3 className="text-sm font-medium text-foreground">{selectedItem.subject}</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">To:</span> <span className="text-foreground">{selectedItem.to_address}</span></div>
                  <div><span className="text-muted-foreground">From:</span> <span className="text-foreground">{selectedItem.from_address ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Created:</span> <span className="text-foreground">{new Date(selectedItem.created_at).toLocaleString()}</span></div>
                  {selectedItem.sent_at && <div><span className="text-muted-foreground">Sent:</span> <span className="text-foreground">{new Date(selectedItem.sent_at).toLocaleString()}</span></div>}
                  {selectedItem.next_retry_at && selectedItem.status === "failed" && (
                    <div><span className="text-muted-foreground">Next retry:</span> <span className="text-foreground">{new Date(selectedItem.next_retry_at).toLocaleString()}</span></div>
                  )}
                  {selectedItem.template && <div><span className="text-muted-foreground">Template:</span> <span className="text-foreground">{selectedItem.template}</span></div>}
                </div>
                {selectedItem.last_error && (
                  <div className="rounded-md bg-red-950/30 border border-red-900/30 p-2.5 text-xs text-red-300 font-mono break-all">
                    {selectedItem.last_error}
                  </div>
                )}
              </div>

              {/* HTML Preview */}
              {selectedItem.html && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</span>
                  <div className="rounded-md border border-border bg-white p-4 text-sm max-h-72 overflow-auto">
                    <iframe
                      srcDoc={selectedItem.html}
                      sandbox=""
                      className="w-full min-h-[120px] border-0"
                      title="Email preview"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* List View */
            <div>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {filterStatus ? `Showing ${filterStatus}` : "All emails"} · {pagination.total} total
                  </span>
                  {filterStatus && (
                    <button onClick={() => setFilterStatus(null)} className="text-[10px] text-muted-foreground hover:text-foreground underline">
                      clear filter
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {(stats.failed > 0 && (filterStatus === "failed" || !filterStatus)) && (
                    <Button
                      onClick={() => handleRetryAll("failed")}
                      disabled={actionLoading === "retry-all-failed"}
                      variant="outline"
                      className="h-6 text-[10px] gap-1 border-border text-muted-foreground px-2"
                    >
                      {actionLoading === "retry-all-failed" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                      Retry all failed
                    </Button>
                  )}
                  {(stats.dead > 0 && (filterStatus === "dead" || !filterStatus)) && (
                    <Button
                      onClick={() => handleRetryAll("dead")}
                      disabled={actionLoading === "retry-all-dead"}
                      variant="outline"
                      className="h-6 text-[10px] gap-1 border-border text-muted-foreground px-2"
                    >
                      {actionLoading === "retry-all-dead" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                      Retry all dead
                    </Button>
                  )}
                  {filterStatus && ["sent", "dead", "failed"].includes(filterStatus) && (
                    <Button
                      onClick={() => handlePurge(filterStatus)}
                      disabled={actionLoading === `purge-${filterStatus}`}
                      variant="outline"
                      className="h-6 text-[10px] gap-1 border-red-800/50 text-red-400 px-2 hover:bg-red-900/20"
                    >
                      {actionLoading === `purge-${filterStatus}` ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                      Purge all
                    </Button>
                  )}
                </div>
              </div>

              {/* Items */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Inbox className="h-6 w-6 mb-2" />
                  <span className="text-xs">No emails {filterStatus ? `with status "${filterStatus}"` : "in queue"}</span>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <div key={item.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <StatusBadge status={item.status} />
                          <span className="text-xs text-foreground font-medium truncate">{item.subject}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span>→ {item.to_address}</span>
                          <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {timeAgo(item.created_at)}</span>
                          {item.attempts > 0 && <span>{item.attempts}/{item.max_attempts} attempts</span>}
                        </div>
                        {item.last_error && (
                          <p className="text-[10px] text-red-400/80 mt-0.5 truncate">{item.last_error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => handleViewDetail(item.id)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                          title="View details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {["failed", "dead"].includes(item.status) && (
                          <button
                            onClick={() => handleRetry(item.id)}
                            disabled={actionLoading === item.id}
                            className="rounded p-1 text-muted-foreground hover:text-amber-400 hover:bg-secondary/80"
                            title="Retry"
                          >
                            {actionLoading === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={actionLoading === item.id}
                          className="rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-secondary/80"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    Page {pagination.page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => loadQueue(pagination.page - 1)}
                      disabled={pagination.page <= 1 || loading}
                      variant="ghost"
                      className="h-6 px-1.5 text-muted-foreground"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      onClick={() => loadQueue(pagination.page + 1)}
                      disabled={pagination.page >= totalPages || loading}
                      variant="ghost"
                      className="h-6 px-1.5 text-muted-foreground"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
