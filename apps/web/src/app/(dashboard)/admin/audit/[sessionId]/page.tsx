"use client";

/**
 * /admin/audit/[sessionId] — Full conversation transcript.
 *
 * Surfaces every user prompt, assistant response, tool call, and reasoning
 * (if persisted) for one session. Viewing this page is itself audited.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck, User as UserIcon, Bot, Wrench, Brain } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";

type SessionInfo = {
  session_id: string;
  project_id: string;
  project_name: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  mode: string;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  role: string;
  content: string | null;
  tool_calls: unknown;
  tool_actions: unknown;
  thinking_content: string | null;
  had_tool_calls: boolean | null;
  version_sha: string | null;
  sent_by_user_id: string | null;
  display_name: string | null;
  user_color: string | null;
  created_at: string;
};

export default function AdminAuditConversationPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlatformAdmin || !sessionId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<{ session: SessionInfo; messages: Message[] }>(
          `/admin/audit/conversations/${sessionId}`,
        );
        if (!cancelled) {
          setSession(res.session);
          setMessages(res.messages);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load conversation");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isPlatformAdmin, sessionId]);

  if (adminLoading || loading) {
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
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="mb-2 flex items-center gap-3">
          <Link
            href="/admin/audit"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Audit search
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {session && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <h1 className="mb-2 text-xl font-semibold text-foreground">
              Conversation transcript
            </h1>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <Info label="User" value={session.user_display_name || session.user_email || session.user_id} />
              <Info label="Email" value={session.user_email ?? "—"} />
              <Info label="Mode" value={session.mode} />
              <Info label="Workspace" value={session.workspace_name ?? "—"} />
              <Info label="Project" value={session.project_name ?? "—"} />
              <Info label="Updated" value={new Date(session.updated_at).toLocaleString()} />
              <Info label="Session ID" value={session.session_id} mono />
              <Info label="User ID" value={session.user_id} mono />
              <Info label="Project ID" value={session.project_id} mono />
            </dl>
          </div>
        )}

        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              This session has no recorded messages.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`text-foreground ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const role = message.role;
  const Icon = role === "user" ? UserIcon : role === "assistant" ? Bot : Wrench;
  const tone =
    role === "user"
      ? "border-brand-500/40 bg-brand-500/5"
      : role === "assistant"
      ? "border-border bg-card"
      : "border-amber-500/40 bg-amber-500/5";

  const hasToolCalls =
    Array.isArray(message.tool_calls) && (message.tool_calls as unknown[]).length > 0;

  return (
    <div className={`rounded-lg border ${tone} p-4`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {role}
          {message.display_name && (
            <span className="text-foreground">· {message.display_name}</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {new Date(message.created_at).toLocaleString()}
        </div>
      </div>

      {message.thinking_content && (
        <details className="mb-2 rounded border border-border bg-background/40 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            <Brain className="mr-1 inline h-3 w-3" /> Thinking
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">{message.thinking_content}</pre>
        </details>
      )}

      {message.content && (
        <pre className="whitespace-pre-wrap break-words text-sm text-foreground">{message.content}</pre>
      )}

      {hasToolCalls && (
        <details className="mt-2 rounded border border-border bg-background/40 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            <Wrench className="mr-1 inline h-3 w-3" /> Tool calls
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(message.tool_calls, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
