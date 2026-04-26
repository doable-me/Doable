"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  AlertTriangle,
  Flag,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Inbox,
  ListChecks,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";

/**
 * Marketplace moderation queue + reports inbox. Two tabs:
 *
 *  - Queue: listings auto-flagged on publish (e.g. third-party MCP connectors)
 *  - Reports: community-filed flags on already-published listings
 *
 * All actions go through the moderation API and are append-only logged in
 * marketplace_admin_actions.
 */

type Tab = "queue" | "reports";

interface QueueItem {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_slug: string;
  publisher_name: string;
  version: string;
  reason: string;
  status: string;
  submitted_at: string;
  manifest_summary: {
    skills?: number;
    rules?: number;
    knowledge?: number;
    connectors?: number;
    permissions?: string[];
    requiresReview?: boolean;
    reviewReason?: string;
  } | null;
}

interface ReportItem {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_slug: string;
  reporter_name: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
}

export default function ModerationPage() {
  const router = useRouter();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [tab, setTab] = useState<Tab>("queue");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [q, r] = await Promise.all([
        apiFetch<{ data: QueueItem[]; total: number }>("/admin/marketplace/moderation/queue?status=pending"),
        apiFetch<{ data: ReportItem[]; total: number }>("/admin/marketplace/reports?status=open"),
      ]);
      setQueue(q.data);
      setReports(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPlatformAdmin) refresh();
  }, [isPlatformAdmin, refresh]);

  async function decideQueueItem(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    try {
      await apiFetch(`/admin/marketplace/moderation/queue/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: decisionNotes[id] }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function resolveReport(id: string, decision: "actioned" | "dismissed") {
    setBusyId(id);
    try {
      await apiFetch(`/admin/marketplace/reports/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <ShieldCheck className="h-12 w-12" />
        <p className="font-medium text-foreground">Platform admin access required</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Admin
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand-400" />
          Marketplace moderation
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Review listings flagged for moderator approval and respond to community reports.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 mb-6 w-fit">
          {([
            { id: "queue", label: "Review queue", Icon: Inbox, badge: queue.length },
            { id: "reports", label: "Reports", Icon: Flag, badge: reports.length },
          ] as const).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.badge > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "queue" ? (
          queue.length === 0 ? (
            <EmptyState Icon={ListChecks} title="No listings awaiting review" />
          ) : (
            <ul className="space-y-4">
              {queue.map((item) => (
                <li key={item.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-foreground truncate">
                          {item.listing_title}
                        </h3>
                        <Link
                          href={`/marketplace/${item.listing_slug}`}
                          target="_blank"
                          className="text-muted-foreground hover:text-foreground"
                          title="Open listing in new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        by {item.publisher_name} · v{item.version} · submitted{" "}
                        {new Date(item.submitted_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                      <AlertTriangle className="h-3 w-3" /> Needs review
                    </div>
                  </div>

                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200 mb-3">
                    {item.reason}
                  </div>

                  {item.manifest_summary && (
                    <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <Stat label="Skills" value={item.manifest_summary.skills ?? 0} />
                      <Stat label="Rules" value={item.manifest_summary.rules ?? 0} />
                      <Stat label="Knowledge" value={item.manifest_summary.knowledge ?? 0} />
                      <Stat label="Connectors" value={item.manifest_summary.connectors ?? 0} />
                    </div>
                  )}

                  {item.manifest_summary?.permissions && item.manifest_summary.permissions.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Permissions:</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {item.manifest_summary.permissions.map((p) => (
                          <li key={p} className="flex items-start gap-1.5">
                            <span className="text-amber-400">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Textarea
                    rows={2}
                    placeholder="Optional decision note (sent to publisher on rejection)…"
                    value={decisionNotes[item.id] ?? ""}
                    onChange={(e) => setDecisionNotes((s) => ({ ...s, [item.id]: e.target.value }))}
                    className="mb-3 text-xs"
                  />

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => decideQueueItem(item.id, "approve")}
                      disabled={busyId === item.id}
                    >
                      {busyId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      )}
                      Approve & publish
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => decideQueueItem(item.id, "reject")}
                      disabled={busyId === item.id}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : reports.length === 0 ? (
          <EmptyState Icon={Flag} title="No open reports" />
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-2 py-0.5 text-[10px] font-medium uppercase">
                      {r.reason}
                    </span>
                    <Link
                      href={`/marketplace/${r.listing_slug}`}
                      target="_blank"
                      className="font-medium text-foreground hover:text-brand-300 truncate"
                    >
                      {r.listing_title}
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    by {r.reporter_name} · {new Date(r.created_at).toLocaleString()}
                  </p>
                  {r.detail && <p className="mt-2 text-sm text-muted-foreground">{r.detail}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => resolveReport(r.id, "actioned")}
                    disabled={busyId === r.id}
                  >
                    Take action
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolveReport(r.id, "dismissed")}
                    disabled={busyId === r.id}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ Icon, title }: { Icon: typeof Inbox; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Icon className="h-10 w-10" />
      <p className="text-sm">{title}</p>
    </div>
  );
}
