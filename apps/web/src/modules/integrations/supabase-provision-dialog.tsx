"use client";

/**
 * Phase 2A — Supabase platform-managed provisioner dialog.
 *
 * Rendered by the chat surface when the AI tool `provision_supabase` fires.
 * Walks the user through picking a Supabase organization + region, then
 * POSTs to /api/integrations/supabase/provision and streams SSE progress
 * directly into the dialog body. When the server emits `phase === "done"`,
 * the dialog auto-dismisses and the chat hook sends a "continue" message
 * so the AI picks up with code generation against the new env vars.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Default regions the Supabase Management API accepts. The user can edit
// the region field directly if they need an uncommon one; we ship the most
// common ones as a dropdown for convenience.
const SUPABASE_REGIONS: Array<{ value: string; label: string }> = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "eu-west-1", label: "EU West (Ireland)" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
];

interface SupabaseOrganization {
  id: string;
  name: string;
}

interface ProvisionPhase {
  phase: string;
  message: string;
}

export interface SupabaseProvisionDialogProps {
  open: boolean;
  workspaceId: string;
  projectId: string;
  defaultName?: string;
  reason?: string;
  /** Called when the user cancels or the flow finishes. `done=true` means success. */
  onClose: (done: boolean) => void;
}

async function getAccessToken(): Promise<string | undefined> {
  const { getStoredTokens } = await import("@/lib/api");
  return getStoredTokens().accessToken ?? undefined;
}

export function SupabaseProvisionDialog({
  open,
  workspaceId,
  projectId,
  defaultName,
  reason,
  onClose,
}: SupabaseProvisionDialogProps) {
  const [orgs, setOrgs] = useState<SupabaseOrganization[] | null>(null);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [oauthRequired, setOauthRequired] = useState(false);

  const [orgId, setOrgId] = useState<string>("");
  const [region, setRegion] = useState<string>("us-east-1");
  const [name, setName] = useState<string>(defaultName ?? "");

  const [progress, setProgress] = useState<ProvisionPhase[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog is opened
  useEffect(() => {
    if (!open) return;
    setOrgs(null);
    setOrgsError(null);
    setOauthRequired(false);
    setOrgId("");
    setRegion("us-east-1");
    setName(defaultName ?? "");
    setProgress([]);
    setSubmitting(false);
    setError(null);
  }, [open, defaultName]);

  // Fetch the user's Supabase orgs when the dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setOrgsLoading(true);
      setOrgsError(null);
      try {
        const accessToken = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/api/integrations/supabase/orgs?workspaceId=${encodeURIComponent(workspaceId)}`,
          {
            headers: accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {},
          },
        );
        if (cancelled) return;
        if (res.status === 412) {
          setOauthRequired(true);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Failed to load orgs (${res.status})`);
        }
        const data = (await res.json()) as { data: SupabaseOrganization[] };
        if (cancelled) return;
        setOrgs(data.data);
        const first = data.data[0];
        if (first) setOrgId(first.id);
      } catch (err) {
        if (cancelled) return;
        setOrgsError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  const handleSubmit = useCallback(async () => {
    if (!orgId || !region || submitting) return;
    setSubmitting(true);
    setError(null);
    setProgress([]);

    try {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `${API_BASE}/api/integrations/supabase/provision`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
          },
          body: JSON.stringify({
            projectId,
            orgId,
            region,
            name: name.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Provisioning failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            finished = true;
            break;
          }
          try {
            const parsed = JSON.parse(data) as {
              type: string;
              data?: { phase?: string; message?: string };
            };
            if (parsed.type === "provision_progress" && parsed.data?.phase) {
              const phase = parsed.data.phase;
              const message = parsed.data.message ?? "";
              if (phase === "error") {
                setError(message || "Provisioning failed");
              } else {
                setProgress((prev) => [...prev, { phase, message }]);
                if (phase === "done") {
                  // Auto-dismiss shortly after so the user sees the final tick
                  setTimeout(() => onClose(true), 800);
                }
              }
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [orgId, region, name, projectId, submitting, onClose]);

  const disabled = submitting || orgsLoading || !orgId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't allow cancel during an in-flight request
        if (!next && submitting) return;
        if (!next) onClose(false);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a Supabase database</DialogTitle>
          <DialogDescription>
            {reason ??
              "Doable will create a brand-new Supabase project under your own Supabase organization, fetch the API keys, and connect them automatically."}
          </DialogDescription>
        </DialogHeader>

        {oauthRequired ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <p className="text-sm">
              You need to sign in with Supabase first so Doable can create
              projects on your behalf. Open the integrations panel, find
              <strong> Supabase</strong>, and pick &quot;Sign in with Supabase&quot;.
            </p>
          </div>
        ) : orgsLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your Supabase organizations...
          </div>
        ) : orgsError ? (
          <div className="flex items-start gap-2 py-4 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{orgsError}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Project name</label>
              <Input
                value={name}
                placeholder="e.g. My App"
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Supabase organization</label>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={orgId}
                disabled={submitting}
                onChange={(e) => setOrgId(e.target.value)}
              >
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Region</label>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={region}
                disabled={submitting}
                onChange={(e) => setRegion(e.target.value)}
              >
                {SUPABASE_REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {progress.length > 0 ? (
              <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3 text-xs">
                {progress.map((p, i) => {
                  const isLast = i === progress.length - 1;
                  const isDone = p.phase === "done";
                  return (
                    <div
                      key={`${p.phase}-${i}`}
                      className="flex items-center gap-2"
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : isLast && submitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>{p.message}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onClose(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={disabled || oauthRequired}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
