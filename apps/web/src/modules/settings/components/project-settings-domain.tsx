"use client";

import { useState, useEffect } from "react";
import {
  Globe,
  ExternalLink,
  Trash2,
  Loader2,
  Check,
  Copy,
  Plus,
  Crown,
  AlertCircle,
  ShieldCheck,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  apiListCustomDomains,
  apiAddCustomDomain,
  apiRemoveCustomDomain,
  apiVerifyCustomDomain,
  type ApiProject,
  type ApiCustomDomain,
} from "@/lib/api";
import { SectionCard } from "./project-settings-shared";

// ═══════════════════════════════════════════════════════════════
// CUSTOM DOMAIN TAB
// ═══════════════════════════════════════════════════════════════

export function DomainTab({
  project,
  addToast,
}: {
  project: ApiProject;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [customDomains, setCustomDomains] = useState<ApiCustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isPro = true;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiListCustomDomains(project.id);
        if (!cancelled) setCustomDomains(res.data);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [project.id]);

  useEffect(() => {
    const hasPending = customDomains.some(
      (d) => d.status === "pending" || d.status === "verifying" || d.status === "ssl_pending"
    );
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiListCustomDomains(project.id);
        setCustomDomains(res.data);
      } catch {
        // ignore
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [project.id, customDomains]);

  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    setAdding(true);
    try {
      const res = await apiAddCustomDomain(project.id, domain);
      setCustomDomains((prev) => [res.data, ...prev]);
      setNewDomain("");
      addToast("success", `Domain ${domain} added. Configure your DNS records below.`);
    } catch (err: any) {
      addToast("error", err?.body?.error ?? "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (domainId: string) => {
    setVerifyingId(domainId);
    try {
      const res = await apiVerifyCustomDomain(domainId);
      setCustomDomains((prev) =>
        prev.map((d) => (d.id === domainId ? res.data : d))
      );
      if (res.data.status === "active") {
        addToast("success", `${res.data.domain} is now active!`);
      } else if (res.data.status === "failed") {
        addToast("error", res.data.verification_errors ?? "Verification failed");
      }
    } catch (err: any) {
      addToast("error", err?.body?.error ?? "Verification check failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRemove = async (domainId: string) => {
    setRemovingId(domainId);
    try {
      await apiRemoveCustomDomain(domainId);
      setCustomDomains((prev) => prev.filter((d) => d.id !== domainId));
      addToast("success", "Domain removed");
    } catch (err: any) {
      addToast("error", err?.body?.error ?? "Failed to remove domain");
    } finally {
      setRemovingId(null);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  type StatusInfo = { label: string; color: string; icon: React.ReactNode };
  const defaultStatus: StatusInfo = {
    label: "Waiting for DNS",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    icon: <Clock className="h-3 w-3" />,
  };
  const statusConfig: Record<string, StatusInfo> = {
    pending: defaultStatus,
    verifying: {
      label: "Verifying",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    ssl_pending: {
      label: "SSL Provisioning",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    active: {
      label: "Active",
      color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
      icon: <ShieldCheck className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    removing: {
      label: "Removing",
      color: "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
  };

  return (
    <div className="space-y-6">
      {/* Default Domain */}
      <SectionCard title="Default Domain" description="Your project is always accessible at its .doable.me subdomain.">
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Default URL</p>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">
              {project.slug}.doable.me
            </p>
          </div>
          <a
            href={`https://${project.slug}.doable.me`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Visit
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </SectionCard>

      {/* Custom Domain */}
      <SectionCard title="Custom Domain" description="Serve your published site from your own domain name.">
        {!isPro ? (
          <div className="flex flex-col items-center rounded-lg border-2 border-dashed p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <Crown className="h-6 w-6 text-amber-600 dark:text-amber-300" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Pro+ Feature</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Custom domains are available on the Pro plan and above. Upgrade
              your workspace to connect your own domain.
            </p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Crown className="h-4 w-4" />
              Upgrade to Pro
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Add domain form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !adding && handleAddDomain()}
                placeholder="app.example.com"
                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                onClick={handleAddDomain}
                disabled={!newDomain.trim() || adding}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Domain
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && customDomains.length === 0 && (
              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                <Globe className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No custom domains configured. Add one above to get started.
                </p>
              </div>
            )}

            {!loading &&
              customDomains.map((d) => {
                const status = statusConfig[d.status] ?? defaultStatus;
                const isVerifying = verifyingId === d.id;
                const isRemoving = removingId === d.id;

                return (
                  <div key={d.id} className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <p className="font-mono text-sm font-medium">{d.domain}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.status === "active" && (
                          <a
                            href={`https://${d.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            Visit
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {d.status !== "active" && d.status !== "removing" && (
                          <button
                            onClick={() => handleVerify(d.id)}
                            disabled={isVerifying}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            {isVerifying ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Verify
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(d.id)}
                          disabled={isRemoving}
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {isRemoving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {d.status !== "active" && d.status !== "removing" && (
                      <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium">Configure DNS</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Add this CNAME record in your Cloudflare DNS dashboard with the proxy (orange cloud) enabled.
                          </p>
                        </div>
                        <div className="overflow-hidden rounded-md border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="px-3 py-2 text-left font-medium">Type</th>
                                <th className="px-3 py-2 text-left font-medium">Name</th>
                                <th className="px-3 py-2 text-left font-medium">Target</th>
                                <th className="w-10 px-2 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="px-3 py-2 font-mono">CNAME</td>
                                <td className="px-3 py-2 font-mono">{d.domain}</td>
                                <td className="px-3 py-2 font-mono text-xs break-all">{d.cname_target}</td>
                                <td className="px-2 py-2">
                                  <button
                                    onClick={() => copyToClipboard(d.cname_target, `cname-${d.id}`)}
                                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                    title="Copy target"
                                  >
                                    {copiedField === `cname-${d.id}` ? (
                                      <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Your domain must be on Cloudflare DNS (free). The CNAME must be proxied (orange cloud ON).
                          After adding the record, click Verify above.
                        </p>
                      </div>
                    )}

                    {d.verification_errors && d.status === "failed" && (
                      <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-xs text-destructive">{d.verification_errors}</p>
                      </div>
                    )}

                    {d.status === "active" && (
                      <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                        <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-xs font-medium text-green-700 dark:text-green-300">
                            Domain Active — SSL and routing configured via Cloudflare
                          </p>
                          <p className="text-xs text-green-600/70 dark:text-green-400/70">
                            HTTPS certificate managed by Cloudflare. Auto-renews.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
