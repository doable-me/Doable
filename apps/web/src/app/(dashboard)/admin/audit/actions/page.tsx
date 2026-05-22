"use client";

/**
 * /admin/audit/actions — History of every admin read/write performed
 * against the audit surface (and any other action recorded via
 * `recordAdminAction`).
 */
import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, History, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ActionRow = {
  id: string;
  ts: string;
  actor_id: string;
  actor_email: string | null;
  actor_role: string | null;
  actor_display_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  target_user_id: string | null;
  target_workspace_id: string | null;
  target_project_id: string | null;
  details: unknown;
  client_ip: string | null;
  user_agent: string | null;
};

function AdminAuditActionsPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = params.toString();

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const path = queryString
          ? `/admin/audit/actions?${queryString}`
          : "/admin/audit/actions";
        const res = await apiFetch<{ actions: ActionRow[] }>(path);
        if (!cancelled) setRows(res.actions);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load action log");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isPlatformAdmin, queryString]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
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
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-2 flex items-center gap-3">
          <Link
            href="/admin/audit"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Audit search
          </Link>
        </div>
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-foreground">
          <History className="h-6 w-6 text-brand-400" />
          Admin action log
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Every search and view performed on the audit surface, with viewer
          identity, timestamps, and request metadata.
        </p>

        <div className="mb-6">
          <Filters />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <ActionsTable rows={rows} loading={loading} />
      </div>
    </div>
  );
}

export default function AdminAuditActionsPage() {
  return (
    <Suspense fallback={null}>
      <AdminAuditActionsPageInner />
    </Suspense>
  );
}

function Filters() {
  const router = useRouter();
  const params = useSearchParams();
  const [actorId, setActorId] = useState(params.get("actor_id") ?? "");
  const [action, setAction] = useState(params.get("action") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (actorId) next.set("actor_id", actorId);
    if (action) next.set("action", action);
    if (from) next.set("from", new Date(from).toISOString());
    if (to) next.set("to", new Date(to).toISOString());
    router.push(`/admin/audit/actions?${next.toString()}`);
  }
  function clear() {
    setActorId(""); setAction(""); setFrom(""); setTo("");
    router.push("/admin/audit/actions");
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Actor ID">
          <Input value={actorId} onChange={(e) => setActorId(e.target.value)} placeholder="uuid" />
        </Field>
        <Field label="Action">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">Any</option>
            <option value="audit.conversations.search">audit.conversations.search</option>
            <option value="audit.conversation.view">audit.conversation.view</option>
            <option value="audit.messages.search">audit.messages.search</option>
            <option value="audit.actions.search">audit.actions.search</option>
            <option value="audit.stats.view">audit.stats.view</option>
          </select>
        </Field>
        <Field label="From">
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm">
          <Search className="mr-1.5 h-3.5 w-3.5" /> Search
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={clear}>
          <X className="mr-1.5 h-3.5 w-3.5" /> Reset
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionsTable({ rows, loading }: { rows: ActionRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No admin actions recorded yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Target</th>
            <th className="px-3 py-2">Details</th>
            <th className="px-3 py-2">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-muted/30 align-top">
              <td className="px-3 py-2 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">
                  {r.actor_display_name || r.actor_email || r.actor_id.slice(0, 8)}
                </div>
                {r.actor_email && (
                  <div className="text-xs text-muted-foreground">{r.actor_email}</div>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
              <td className="px-3 py-2 text-xs">
                {r.resource_type && (
                  <div>
                    <span className="text-muted-foreground">{r.resource_type}:</span>{" "}
                    <span className="font-mono">{r.resource_id ?? "—"}</span>
                  </div>
                )}
                {r.target_user_id && (
                  <div className="text-muted-foreground">user: <span className="font-mono">{r.target_user_id}</span></div>
                )}
                {r.target_workspace_id && (
                  <div className="text-muted-foreground">ws: <span className="font-mono">{r.target_workspace_id}</span></div>
                )}
              </td>
              <td className="px-3 py-2 max-w-md">
                {r.details != null ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">view</summary>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {JSON.stringify(r.details, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.client_ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
