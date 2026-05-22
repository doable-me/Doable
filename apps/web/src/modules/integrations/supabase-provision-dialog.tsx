"use client";

/**
 * Phase 2A — Supabase platform-managed provisioner dialog.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  SupabaseOrganization,
  ExistingSupabaseProject,
  ProvisionPhase,
  DialogMode,
  SupabaseProvisionDialogProps,
} from "./supabase-provision-types";
import { API_BASE, getAccessToken, openSupabaseOAuthPopup } from "./supabase-provision-types";
import {
  OAuthRequiredSection,
  ExistingProjectsSection,
  CreateNewFormSection,
  ModeToggle,
} from "./supabase-provision-views";

export type { SupabaseProvisionDialogProps };

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

  const [mode, setMode] = useState<DialogMode>("existing");
  const [existingProjects, setExistingProjects] = useState<ExistingSupabaseProject[] | null>(null);
  const [connectingExistingRef, setConnectingExistingRef] = useState<string | null>(null);
  const [connectExistingError, setConnectExistingError] = useState<string | null>(null);

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

  const fetchOrgs = useCallback(async (): Promise<boolean> => {
    setOrgsLoading(true);
    setOrgsError(null);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `${API_BASE}/integrations/supabase/orgs?workspaceId=${encodeURIComponent(workspaceId)}`,
        { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
      );
      if (res.status === 412) { setOauthRequired(true); return false; }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
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

  const fetchExistingProjects = useCallback(async (): Promise<void> => {
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `${API_BASE}/integrations/supabase/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
        { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
      );
      if (res.status === 412) return;
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const orgsOk = await fetchOrgs();
      if (cancelled || !orgsOk) return;
      await fetchExistingProjects();
    })();
    return () => { cancelled = true; };
  }, [open, fetchOrgs, fetchExistingProjects]);

  const handleSignInWithSupabase = useCallback(async () => {
    if (signingIn) return;
    setSigningIn(true);
    setSignInError(null);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `${API_BASE}/integrations/enhanced-auth/supabase/authorize?workspaceId=${encodeURIComponent(workspaceId)}&scope=user`,
        { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to start Supabase sign-in (${res.status})`);
      }
      const { authorizationUrl } = (await res.json()) as { authorizationUrl: string };
      await openSupabaseOAuthPopup(authorizationUrl, fetchOrgs);
      await fetchOrgs();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }, [signingIn, workspaceId, fetchOrgs]);

  const handleConnectExisting = useCallback(
    async (picked: ExistingSupabaseProject) => {
      if (connectingExistingRef) return;
      setConnectingExistingRef(picked.id);
      setConnectExistingError(null);
      try {
        const accessToken = await getAccessToken();
        const res = await fetch(`${API_BASE}/integrations/supabase/use-existing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ projectRef: picked.id, projectId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed to connect (${res.status})`);
        }
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
      const res = await fetch(`${API_BASE}/integrations/supabase/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ projectId, orgId, region, name: name.trim() || undefined }),
      });
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
          if (data === "[DONE]") { finished = true; break; }
          try {
            const parsed = JSON.parse(data) as { type: string; data?: { phase?: string; message?: string } };
            if (parsed.type === "provision_progress" && parsed.data?.phase) {
              const phase = parsed.data.phase;
              const message = parsed.data.message ?? "";
              if (phase === "error") { setError(message || "Provisioning failed"); }
              else {
                setProgress((prev) => [...prev, { phase, message }]);
                if (phase === "done") setTimeout(() => onClose(true), 800);
              }
            }
          } catch { /* Ignore malformed SSE lines */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [orgId, region, name, projectId, submitting, onClose]);

  const disabled = submitting || orgsLoading || !orgId;
  const showCreateNew = mode === "new" || !existingProjects || existingProjects.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
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
          <OAuthRequiredSection
            signingIn={signingIn}
            signInError={signInError}
            onSignIn={handleSignInWithSupabase}
          />
        ) : orgsLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your Supabase organizations...
          </div>
        ) : orgsError ? (
          <div className="flex items-start gap-2 py-4 text-sm text-red-600">
            <span>{orgsError}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {existingProjects && existingProjects.length > 0 ? (
              <ModeToggle
                mode={mode}
                submitting={submitting}
                connectingExistingRef={connectingExistingRef}
                onModeChange={setMode}
              />
            ) : null}

            {mode === "existing" && existingProjects && existingProjects.length > 0 ? (
              <ExistingProjectsSection
                existingProjects={existingProjects}
                connectingExistingRef={connectingExistingRef}
                connectExistingError={connectExistingError}
                onConnect={handleConnectExisting}
              />
            ) : null}

            {showCreateNew ? (
              <CreateNewFormSection
                name={name}
                orgId={orgId}
                region={region}
                orgs={orgs}
                submitting={submitting}
                progress={progress}
                error={error}
                existingProjects={existingProjects}
                onNameChange={setName}
                onOrgChange={setOrgId}
                onRegionChange={setRegion}
              />
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
          {showCreateNew ? (
            <Button onClick={handleSubmit} disabled={disabled || oauthRequired}>
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
