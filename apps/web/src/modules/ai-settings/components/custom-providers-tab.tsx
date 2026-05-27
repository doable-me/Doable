"use client";

import { useState, useMemo } from "react";
import type { ApiAiProvider } from "@/lib/api";
import { Key, Plus, Trash2, Loader2, RefreshCw, User as UserIcon, Users as UsersIcon, Lock, ArrowUpToLine } from "lucide-react";
import { ProviderWizard } from "./provider-wizard";
import { ProviderHealthBadge } from "./provider-health-badge";

interface Props {
  workspaceId: string | null;
  /** Whether the caller is owner/admin of this workspace. Controls "Add for workspace". */
  isWorkspaceAdmin: boolean;
  /** Caller's user id, for cross-checking ownership of personal rows. */
  currentUserId: string | null;
  providers: ApiAiProvider[];
  loading: boolean;
  onAdd: (data: {
    label: string;
    providerType: "openai" | "azure" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    azureApiVersion?: string;
    scope?: "user" | "workspace";
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onValidate: (id: string) => Promise<{ valid: boolean; error?: string }>;
  /** Promote a personal provider to workspace-shared (admin-only). */
  onPromote?: (id: string) => Promise<void>;
  onRefresh?: () => void;
}

export function CustomProvidersTab({
  workspaceId, isWorkspaceAdmin, currentUserId,
  providers, loading, onRemove, onValidate, onPromote, onRefresh,
}: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardScope, setWizardScope] = useState<"user" | "workspace">("user");
  const [validating, setValidating] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const handlePromote = async (id: string) => {
    if (!onPromote) return;
    setPromoting(id);
    setPromoteError(null);
    try {
      await onPromote(id);
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : "Failed to make provider available to workspace");
    } finally {
      setPromoting(null);
    }
  };

  const handleValidate = async (id: string) => {
    setValidating(id);
    try {
      await onValidate(id);
    } finally {
      setValidating(null);
    }
  };

  const handleProviderAdded = () => {
    onRefresh?.();
  };

  const openWizard = (scope: "user" | "workspace") => {
    setWizardScope(scope);
    setWizardOpen(true);
  };

  // Partition: server already filters out other users' personal rows.
  const { personalProviders, workspaceProviders } = useMemo(() => {
    const mine: ApiAiProvider[] = [];
    const shared: ApiAiProvider[] = [];
    for (const p of providers) {
      if (p.scope === "user" && (currentUserId == null || p.owner_user_id === currentUserId)) {
        mine.push(p);
      } else {
        shared.push(p);
      }
    }
    return { personalProviders: mine, workspaceProviders: shared };
  }, [providers, currentUserId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderRow = (p: ApiAiProvider, canRemove: boolean, canPromote = false) => (
    <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary shrink-0">
          <Key className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{p.label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {p.provider_type} &middot; {p.base_url}
          </p>
        </div>
        <ProviderHealthBadge status={p.is_valid ? "healthy" : "down"} />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {canPromote && onPromote && (
          <button
            onClick={() => handlePromote(p.id)}
            disabled={promoting === p.id}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 transition-colors"
            title="Share this provider with everyone in the workspace"
          >
            {promoting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpToLine className="h-3.5 w-3.5" />}
            Make available to workspace
          </button>
        )}
        <button
          onClick={() => handleValidate(p.id)}
          disabled={validating === p.id}
          className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Test connection & refresh models"
        >
          {validating === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
        {canRemove && (
          <button
            onClick={() => onRemove(p.id)}
            className="rounded p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            title="Remove provider"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Custom AI Providers</h2>
        <p className="text-sm text-muted-foreground">
          Bring your own API keys for OpenAI, Anthropic, local models, and 50+ more. Personal providers are visible only to you.
        </p>
      </div>

      {/* Personal providers — any member can add */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">My personal providers</h3>
            <Lock className="h-3 w-3 text-muted-foreground" aria-label="Only you can see these" />
          </div>
          <button
            onClick={() => openWizard("user")}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add personal
          </button>
        </div>
        {promoteError && <p className="text-xs text-red-400">{promoteError}</p>}
        {personalProviders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-6 text-center">
            <p className="text-xs text-muted-foreground">No personal providers. Add your own API key for private use.</p>
          </div>
        ) : (
          <div className="space-y-2">{personalProviders.map((p) => renderRow(p, true, isWorkspaceAdmin))}</div>
        )}
      </section>

      {/* Workspace providers — admin-only Add */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Workspace shared providers</h3>
            <span className="text-[10px] text-muted-foreground">visible to all members</span>
          </div>
          {isWorkspaceAdmin && (
            <button
              onClick={() => openWizard("workspace")}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add for workspace
            </button>
          )}
        </div>
        {workspaceProviders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-6 text-center">
            <Key className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {isWorkspaceAdmin
                ? "No workspace providers. Add one to share an API key with every member."
                : "No workspace providers available. Ask a workspace admin to share one."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">{workspaceProviders.map((p) => renderRow(p, isWorkspaceAdmin))}</div>
        )}
      </section>

      {/* Provider Setup Wizard */}
      <ProviderWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        workspaceId={workspaceId}
        onProviderAdded={handleProviderAdded}
        scope={wizardScope}
        isWorkspaceAdmin={isWorkspaceAdmin}
      />
    </div>
  );
}
