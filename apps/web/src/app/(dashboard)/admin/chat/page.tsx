"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Loader2, RotateCw, MessageSquare, AlertTriangle,
  Search, ChevronLeft, ChevronRight, Shield, X, User as UserIcon, Bot, Wrench,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";

interface Session {
  sessionId: string;
  userId: string;
  userEmail: string | null;
  projectId: string;
  projectName: string | null;
  projectSlug: string | null;
  mode: string;
  copilotSessionId: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: string;
  content: string | null;
  toolCalls: unknown;
  thinkingContent: string | null;
  hadToolCalls: boolean;
  displayName: string | null;
  createdAt: string;
}

interface ThreadData {
  session: {
    sessionId: string; userId: string; userEmail: string | null;
    projectId: string; projectName: string | null; projectSlug: string | null;
    mode: string; createdAt: string;
  };
  messages: Message[];
  redacted: boolean;
  note: string;
}

const PAGE_SIZE = 50;

function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function fmtAbs(iso: string): string {
  return new Date(iso).toLocaleString();
}

function ChatAdminInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [mode, setMode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threadFor, setThreadFor] = useState<Session | null>(null);
  const projectIdFilter = searchParams.get("projectId") ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (search) params.set("search", search);
      if (mode) params.set("mode", mode);
      if (projectIdFilter) params.set("projectId", projectIdFilter);
      const r = await apiFetch<{ data: { sessions: Session[]; total: number } }>(
        `/admin/chat-sessions?${params.toString()}`,
      );
      setSessions(r.data.sessions);
      setTotal(r.data.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chat sessions");
    } finally {
      setLoading(false);
    }
  }, [offset, search, mode, projectIdFilter]);

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
            <MessageSquare className="h-5 w-5 text-brand-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Chat Sessions ({total})</h1>
            <p className="text-sm text-muted-foreground">
              Every AI conversation across the platform — for training, audit, abuse review.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {projectIdFilter && (
          <div className="mt-3 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-md bg-brand-500/10 border border-brand-500/30 text-brand-300">
            Filtered to project {projectIdFilter.slice(0, 8)}…
            <button onClick={() => router.push("/admin/chat")} className="hover:text-brand-200">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Privacy notice */}
      <div className="mb-4 p-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[12px] text-emerald-300 flex items-start gap-2">
        <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Read-only audit view.</strong> Message content is auto-redacted (passwords, JWTs, API keys, hex blobs, DB URLs).
          Every thread you open is recorded in the admin audit log with your name + timestamp.
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by project name or user email…"
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
        <select
          value={mode}
          onChange={(e) => { setMode(e.target.value); setOffset(0); }}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">All modes</option>
          <option value="chat">chat</option>
          <option value="agent">agent</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => { setOffset(0); setSearch(searchInput); }}>
          Search
        </Button>
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
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Mode</th>
              <th className="px-3 py-2 font-medium text-right">Messages</th>
              <th className="px-3 py-2 font-medium">Last activity</th>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && sessions.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                No chat sessions match your filter.
              </td></tr>
            ) : sessions.map((s) => (
              <tr
                key={s.sessionId}
                className="border-b border-border last:border-b-0 hover:bg-muted/20 cursor-pointer"
                onClick={() => setThreadFor(s)}
              >
                <td className="px-3 py-2">{s.userEmail ?? <span className="text-muted-foreground font-mono text-[10px]">{s.userId.slice(0, 12)}…</span>}</td>
                <td className="px-3 py-2">
                  {s.projectName ?? <span className="text-muted-foreground">—</span>}
                  {s.projectSlug && <div className="text-[10px] text-muted-foreground font-mono">{s.projectSlug}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted border border-border">
                    {s.mode}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">{s.messageCount}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtAge(s.lastMessageAt)}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtAge(s.createdAt)}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Showing {offset + 1}-{offset + sessions.length} of {total}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="h-7 px-2">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)} className="h-7 px-2">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {threadFor && <ThreadDrawer session={threadFor} onClose={() => setThreadFor(null)} />}
    </div>
  );
}

function ThreadDrawer({ session, onClose }: { session: Session; onClose: () => void }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: ThreadData }>(`/admin/chat-sessions/${session.sessionId}/messages`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load thread"))
      .finally(() => setLoading(false));
  }, [session.sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[800px] max-w-full bg-background border-l border-border flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-[11px] text-muted-foreground">Thread</div>
            <div className="text-base font-semibold mt-0.5">
              {session.projectName ?? "(no project)"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {session.userEmail ?? session.userId} · mode={session.mode} · {session.messageCount} messages
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {data?.redacted && (
          <div className="px-5 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            {data.note}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-muted/10 p-4 space-y-3">
          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading thread…
            </div>
          )}
          {error && (
            <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
              {error}
            </div>
          )}
          {data?.messages.map((m) => <MessageCard key={m.id} m={m} />)}
          {data?.messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              This session has no messages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageCard({ m }: { m: Message }) {
  const Icon = m.role === "user" ? UserIcon : m.role === "assistant" ? Bot : Wrench;
  const tone =
    m.role === "user" ? "border-brand-500/30 bg-brand-500/5"
    : m.role === "assistant" ? "border-zinc-500/20 bg-zinc-500/5"
    : "border-amber-500/30 bg-amber-500/5";
  const [expanded, setExpanded] = useState(false);
  const content = m.content ?? "";
  const isLong = content.length > 2000;
  const display = expanded || !isLong ? content : content.slice(0, 2000) + "…";

  return (
    <div className={`rounded-md border ${tone} p-3`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3" />
          <span className="font-medium uppercase tracking-wide">{m.role}</span>
          {m.displayName && <span>· {m.displayName}</span>}
          {m.hadToolCalls && (
            <span className="px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[9px]">tools</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{fmtAbs(m.createdAt)}</span>
      </div>

      {content && (
        <div className="text-sm whitespace-pre-wrap break-words">
          {display}
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-2 text-[11px] text-brand-400 hover:text-brand-300"
            >
              {expanded ? "show less" : "show more"}
            </button>
          )}
        </div>
      )}

      {m.thinkingContent && (
        <details className="mt-2">
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
            thinking
          </summary>
          <pre className="mt-1 p-2 bg-black/30 rounded text-[10px] font-mono whitespace-pre-wrap">
            {m.thinkingContent}
          </pre>
        </details>
      )}

      {m.toolCalls != null && (
        <details className="mt-2">
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
            tool_calls
          </summary>
          <pre className="mt-1 p-2 bg-black/30 rounded text-[10px] font-mono overflow-x-auto whitespace-pre">
            {JSON.stringify(m.toolCalls, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export default function ChatAdminPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <ChatAdminInner />
    </Suspense>
  );
}
