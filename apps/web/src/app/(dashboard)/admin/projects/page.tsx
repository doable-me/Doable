"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, RotateCw, RefreshCw, FolderKanban, AlertTriangle,
  MessageSquare, Search, ChevronLeft, ChevronRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";

interface Project {
  projectId: string;
  projectName: string;
  projectSlug: string;
  frameworkId: string;
  status: string;
  visibility: string;
  workspaceName: string;
  ownerEmail: string | null;
  runtimeState: string | null;
  runtimeKind: string | null;
  listenAddr: string | null;
  sessionsCount: number;
  messagesCount: number;
  createdAt: string;
  updatedAt: string;
  sandboxUser: string;
}

const PAGE_SIZE = 100;

function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function StatusBadge({ status, runtimeState }: { status: string; runtimeState: string | null }) {
  const live = runtimeState === "running";
  const cls = live
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : status === "published"
    ? "bg-brand-500/15 text-brand-300 border-brand-500/30"
    : status === "draft"
    ? "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
    : "bg-amber-500/15 text-amber-300 border-amber-500/30";
  const label = live ? "running" : status;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

export default function ProjectsAdminPage() {
  const router = useRouter();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (search) params.set("search", search);
      const r = await apiFetch<{ data: { projects: Project[]; total: number } }>(
        `/admin/projects?${params.toString()}`,
      );
      setProjects(r.data.projects);
      setTotal(r.data.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [offset, search]);

  useEffect(() => {
    if (isPlatformAdmin) load();
  }, [isPlatformAdmin, load]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
        <h1 className="text-xl font-semibold mb-2">Platform admin required</h1>
        <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <FolderKanban className="h-5 w-5 text-brand-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">All Projects ({total})</h1>
            <p className="text-sm text-muted-foreground">
              Every project on the platform — drafts, published, and live runtime — with framework, owner, chat activity.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by name, slug, owner email, framework, workspace…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setOffset(0);
                setSearch(searchInput);
              }
            }}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-background"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOffset(0);
            setSearch(searchInput);
          }}
        >
          Search
        </Button>
        {search && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setOffset(0);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Owner / Workspace</th>
              <th className="px-3 py-2 font-medium">Framework</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Listen</th>
              <th className="px-3 py-2 font-medium text-right">Sessions</th>
              <th className="px-3 py-2 font-medium text-right">Messages</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {loading && projects.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                No projects match your filter.
              </td></tr>
            ) : projects.map((p) => (
              <tr key={p.projectId} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link href={`/editor/${p.projectId}`} className="text-foreground hover:text-brand-400 font-medium">
                    {p.projectName}
                  </Link>
                  <div className="text-[10px] text-muted-foreground font-mono">{p.projectSlug}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{p.ownerEmail ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{p.workspaceName}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[11px]">{p.frameworkId}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={p.status} runtimeState={p.runtimeState} />
                  {p.visibility !== "restricted" && (
                    <div className="text-[9px] text-muted-foreground mt-0.5">{p.visibility}</div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[11px]">
                  {p.listenAddr ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono">{p.sessionsCount}</td>
                <td className="px-3 py-2 text-right font-mono">{p.messagesCount}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtAge(p.updatedAt)}</td>
                <td className="px-3 py-2 text-right">
                  {p.sessionsCount > 0 && (
                    <Link
                      href={`/admin/chat?projectId=${p.projectId}`}
                      className="inline-flex items-center gap-1 text-[10px] text-brand-400 hover:text-brand-300"
                      title="View chat sessions for this project"
                    >
                      <MessageSquare className="h-3 w-3" /> chat
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Showing {offset + 1}-{offset + projects.length} of {total}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="h-7 px-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="h-7 px-2"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
