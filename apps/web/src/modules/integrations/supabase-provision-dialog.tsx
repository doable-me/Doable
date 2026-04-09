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

interface ExistingSupabaseProject {
  id: string;
  name: string;
  description?: string;
  meta?: {
    region?: string;
    organizationId?: string;
    projectRef?: string;
  };
}

interface ProvisionPhase {
  phase: string;
  message: string;
}

type DialogMode = "existing" | "new";

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
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Existing-project mode state
  const [mode, setMode] = useState<DialogMode>("existing");
  const [existingProjects, setExistingProjects] = useState<ExistingSupabaseProject[] | null>(null);
  const [connectingExistingRef, setConnectingExistingRef] = useState<string | null>(null);
  const [connectExistingError, setConnectExistingError] = useState<string | null>(null);

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
    setSigningIn(false);
    setSignInError(null);
    setMode("existing");
    setExistingProjects(null);
    setConnectingExistingRef(null);
    setConnectExistingError(null);
  }, [open, defaultName]);

  /**
   * Fetch the user's Supabase orgs. Extracted from the mount-time effect
   * so the inline "Sign in with Supabase" button can re-fetch orgs after
   * the popup completes without forcing a dialog remount. Returns true on
   * success, false if OAuth is still required.
   */
  const fetchOrgs = useCallback(async (): Promise<boolean> => {
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
      if (res.status === 412) {
        setOauthRequired(true);
        return false;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Failed to load orgs (${res.status})`);
      }
      const data = (await res.json()) as { data: SupabaseOrganization[] };
      setOauthRequired(false);
      setOrgs(data.data);
      const first = data.data[0];
      if (first) setOrgId(first.id);
      return true;
    } catch (err) {
      setOrgsError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setOrgsLoading(false);
    }
  }, [workspaceId]);

  /**
   * Fetch the user's existing Supabase projects across all orgs. Used
   * by the "Connect an existing project" mode of the dialog. Kept
   * separate from fetchOrgs() so the two lists are independent and the
   * dialog can show them side-by-side if we ever add a combined view.
   */
  const fetchExistingProjects = useCallback(async (): Promise<void> => {
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `${API_BASE}/api/integrations/supabase/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        },
      );
      if (res.status === 412) {
        // OAuth still required — fetchOrgs will surface the sign-in
        // branch; nothing to do here.
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to list projects (${res.status})`);
      }
      const data = (await res.json()) as { data: ExistingSupabaseProject[] };
      setExistingProjects(data.data);
    } catch (err) {
      setConnectExistingError(err instanceof Error ? err.message : String(err));
    }
  }, [workspaceId]);

  // Fetch the user's Supabase orgs + existing projects when the dialog
  // opens. Orgs drive the "Create new" form; existing projects drive
  // the "Connect existing" list. Both lists need the same supabase-mgmt
  // OAuth token, so if fetchOrgs reports oauth_required we skip the
  // existing-projects fetch (it would hit the same 412).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const orgsOk = await fetchOrgs();
      if (cancelled || !orgsOk) return;
      await fetchExistingProjects();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fetchOrgs, fetchExistingProjects]);

  /**
   * Kick off the enhanced-auth OAuth flow for Supabase Management API in
   * a popup window, then re-fetch orgs once the popup posts back
   * `doable:enhanced-auth-complete`. Keeps the user inside the provision
   * dialog instead of making them hunt the integrations panel.
   */
  const handleSignInWithSupabase = useCallback(async () => {
    if (signingIn) return;
    setSigningIn(true);
    setSignInError(null);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `${API_BASE}/integrations/enhanced-auth/supabase/authorize?workspaceId=${encodeURIComponent(workspaceId)}&scope=user`,
        {
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to start Supabase sign-in (${res.status})`);
      }
      const { authorizationUrl } = (await res.json()) as { authorizationUrl: string };

      // Open the OAuth popup. Fixed size so it doesn't eat the whole screen.
      const popup = window.open(
        authorizationUrl,
        "supabase-oauth",
        "width=540,height=720,scrollbars=yes,resizable=yes",
      );
      if (!popup) {
        throw new Error("Popup blocked — please allow popups for this site and try again.");
      }

      // Clear any stale completion marker from a previous flow before we
      // start listening for a fresh one. The marker is written by the
      // /complete callback HTML as a cross-origin-safe fallback channel
      // when COOP strips window.opener and postMessage can't deliver.
      try {
        localStorage.removeItem("doable_enhanced_auth_complete");
      } catch { /* storage may be blocked */ }

      // Wait for success via any of three signals:
      //   1. postMessage from the popup (primary; fast path)
      //   2. storage event from localStorage write in the /complete
      //      callback HTML (COOP-safe fallback)
      //   3. popup closes → re-run fetchOrgs() to detect success by DB
      //      state, regardless of whether postMessage/storage reached us
      //      (defense-in-depth; also catches browser extensions that
      //      swallow postMessage)
      // A cancellation only fires if (3) reports oauth still required
      // AFTER the popup closes — i.e. no sibling row was created.
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          window.removeEventListener("message", onMessage);
          window.removeEventListener("storage", onStorage);
          clearInterval(poll);
        };
        const markSuccess = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const markCancel = (msg: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(msg));
        };
        // Signal 1 — postMessage from the popup's opener reference
        const onMessage = (ev: MessageEvent) => {
          const data = ev.data as { type?: string; integrationId?: string; status?: string } | null;
          if (!data || data.type !== "doable:enhanced-auth-complete") return;
          if (data.integrationId !== "supabase") return;
          if (data.status === "success") markSuccess();
          else markCancel("Supabase sign-in was cancelled or failed.");
        };
        window.addEventListener("message", onMessage);
        // Signal 2 — storage event from localStorage write in another
        // window (same-origin, fires even when COOP severs window.opener)
        const onStorage = (ev: StorageEvent) => {
          if (ev.key !== "doable_enhanced_auth_complete" || !ev.newValue) return;
          try {
            const parsed = JSON.parse(ev.newValue) as { integrationId?: string; status?: string };
            if (parsed.integrationId !== "supabase") return;
            if (parsed.status === "success") markSuccess();
            else markCancel("Supabase sign-in was cancelled or failed.");
          } catch { /* ignore malformed */ }
        };
        window.addEventListener("storage", onStorage);
        // Signal 3 — popup closed. Do NOT reject immediately; give any
        // in-flight postMessage/storage events a 600ms grace to drain,
        // then re-fetch orgs. If orgs load successfully, the sibling row
        // was created — treat as success regardless of whether we
        // received a postMessage. Only if the fetch still reports
        // oauth_required do we treat it as a genuine cancel.
        const startedAt = Date.now();
        const poll = setInterval(() => {
          try {
            if (popup.closed && !settled) {
              // Stop polling immediately so we don't double-fire, but
              // delay the final decision so any pending postMessage can
              // still mark success synchronously before we hit the DB.
              clearInterval(poll);
              setTimeout(async () => {
                if (settled) return;
                const ok = await fetchOrgs();
                if (settled) return;
                if (ok) markSuccess();
                else markCancel("Supabase sign-in window was closed.");
              }, 600);
            }
          } catch { /* cross-origin while on provider's domain — ignore */ }
          if (Date.now() - startedAt > 120_000) {
            markCancel("Supabase sign-in timed out after 2 minutes.");
          }
        }, 500);
      });

      // If we reach here via postMessage or the storage fallback (not
      // the popup-close fetchOrgs recovery path), orgs haven't been
      // fetched yet. fetchOrgs() is idempotent and setting oauthRequired
      // = false a second time is harmless, so just call it
      // unconditionally.
      await fetchOrgs();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }, [signingIn, workspaceId, fetchOrgs]);

  /**
   * Connect an existing Supabase project (picked from the list) to this
   * Doable project. POSTs to /use-existing which pulls the picked
   * project's anon + service_role keys via the Management API and
   * writes an `integration_id="supabase"` row scoped to this project.
   * On success, closes the dialog with done=true (same path as the
   * Create new flow), which signals the AI chat to continue with the
   * newly-available env vars.
   */
  const handleConnectExisting = useCallback(
    async (picked: ExistingSupabaseProject) => {
      if (connectingExistingRef) return;
      setConnectingExistingRef(picked.id);
      setConnectExistingError(null);
      try {
        const accessToken = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/api/integrations/supabase/use-existing`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : {}),
            },
            body: JSON.stringify({
              projectRef: picked.id,
              projectId,
            }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed to connect (${res.status})`);
        }
        // Mirror the Create-new success path: close with done=true so
        // the page-level onClose handler nudges the AI to continue.
        onClose(true);
      } catch (err) {
        setConnectExistingError(err instanceof Error ? err.message : String(err));
      } finally {
        setConnectingExistingRef(null);
      }
    },
    [connectingExistingRef, projectId, onClose],
  );

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
          <DialogTitle>Connect Supabase</DialogTitle>
          <DialogDescription>
            {reason ??
              "Pick an existing Supabase project from your organization, or let Doable create a brand-new one. Either way the API keys are wired up automatically."}
          </DialogDescription>
        </DialogHeader>

        {oauthRequired ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm">
                Sign in with Supabase so Doable can create projects on your
                behalf. You&apos;ll be redirected briefly to Supabase to
                authorize, then come right back here.
              </p>
            </div>
            <Button
              onClick={handleSignInWithSupabase}
              disabled={signingIn}
              className="w-full"
            >
              {signingIn ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting for Supabase…
                </>
              ) : (
                "Sign in with Supabase"
              )}
            </Button>
            {signInError ? (
              <div className="flex items-start gap-2 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                <span>{signInError}</span>
              </div>
            ) : null}
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
            {/* Mode toggle — only show when the user actually has existing
                projects to pick from. If the list is empty (brand-new
                Supabase account), skip the toggle and go straight to the
                create-new form. */}
            {existingProjects && existingProjects.length > 0 ? (
              <div className="flex gap-1 rounded-md bg-muted/40 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  disabled={submitting || !!connectingExistingRef}
                  className={`flex-1 rounded px-3 py-1.5 font-medium transition-colors ${
                    mode === "existing"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Connect existing project
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  disabled={submitting || !!connectingExistingRef}
                  className={`flex-1 rounded px-3 py-1.5 font-medium transition-colors ${
                    mode === "new"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Create new
                </button>
              </div>
            ) : null}

            {/* ── Connect existing project mode ── */}
            {mode === "existing" && existingProjects && existingProjects.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Pick a project — Doable will fetch its API keys and wire them
                  into this app automatically.
                </p>
                <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
                  {existingProjects.map((p) => {
                    const busy = connectingExistingRef === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleConnectExisting(p)}
                        disabled={!!connectingExistingRef}
                        className="flex items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-muted/50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {p.name}
                          </div>
                          {p.meta?.region ? (
                            <div className="truncate text-xs text-muted-foreground">
                              {p.meta.region}
                            </div>
                          ) : null}
                        </div>
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Connect</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {connectExistingError ? (
                  <div className="flex items-start gap-2 text-xs text-red-600">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                    <span>{connectExistingError}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ── Create new project mode ── */}
            {(mode === "new" || !existingProjects || existingProjects.length === 0) ? (
              <>
            {existingProjects && existingProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                You don&apos;t have any Supabase projects yet — let&apos;s create
                your first one.
              </p>
            ) : null}
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
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onClose(false)}
            disabled={submitting || !!connectingExistingRef}
          >
            Cancel
          </Button>
          {mode === "new" || !existingProjects || existingProjects.length === 0 ? (
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
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
