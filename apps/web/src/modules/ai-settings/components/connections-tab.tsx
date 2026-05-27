"use client";

import { useState, useMemo } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import { Github, Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw, User as UserIcon, Users as UsersIcon, Lock } from "lucide-react";
import { CustomProvidersTab } from "./custom-providers-tab";

interface Props {
  workspaceId: string | null;
  /** Whether the current user is owner/admin of the active workspace. Controls "Add for workspace" visibility. */
  isWorkspaceAdmin: boolean;
  /** Current user's id, used to detect ownership of personal rows the API returns. */
  currentUserId: string | null;
  accounts: ApiGitHubCopilotAccount[];
  accountsLoading: boolean;
  providers: ApiAiProvider[];
  providersLoading: boolean;
  onAddAccount: (label: string, token: string, scope?: "user" | "workspace") => Promise<void>;
  onRemoveAccount: (id: string) => Promise<void>;
  onValidateAccount: (id: string) => Promise<boolean>;
  onAddProvider: (data: {
    label: string;
    providerType: "openai" | "azure" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    azureApiVersion?: string;
    scope?: "user" | "workspace";
  }) => Promise<void>;
  onRemoveProvider: (id: string) => Promise<void>;
  onValidateProvider: (id: string) => Promise<{ valid: boolean; error?: string }>;
  /** Promote a personal provider to workspace-shared (admin-only). */
  onPromoteProvider?: (id: string) => Promise<void>;
  onRefreshProviders?: () => void;
}

export function ConnectionsTab({
  workspaceId, isWorkspaceAdmin, currentUserId,
  accounts, accountsLoading, providers, providersLoading,
  onAddAccount, onRemoveAccount, onValidateAccount,
  onAddProvider, onRemoveProvider, onValidateProvider, onPromoteProvider, onRefreshProviders,
}: Props) {
  // GitHub account form state — one form, two scopes selected at submit time
  const [showAccountForm, setShowAccountForm] = useState<null | "user" | "workspace">(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [accountToken, setAccountToken] = useState("");
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [validating, setValidating] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  // Partition accounts by scope. Server already filters out other users'
  // personal rows, so any account with scope='user' here is the caller's
  // own — but we still cross-check against currentUserId in case scope is
  // missing (legacy rows pre-072 default to 'workspace').
  const { personalAccounts, workspaceAccounts } = useMemo(() => {
    const mine: ApiGitHubCopilotAccount[] = [];
    const shared: ApiGitHubCopilotAccount[] = [];
    for (const a of accounts) {
      if (a.scope === "user" && (currentUserId == null || a.owner_user_id === currentUserId)) {
        mine.push(a);
      } else {
        shared.push(a);
      }
    }
    return { personalAccounts: mine, workspaceAccounts: shared };
  }, [accounts, currentUserId]);

  const handleAddAccount = async () => {
    if (!showAccountForm || !accountLabel.trim() || !accountToken.trim()) return;
    setAccountSubmitting(true);
    setAccountError("");
    try {
      await onAddAccount(accountLabel.trim(), accountToken.trim(), showAccountForm);
      setAccountLabel(""); setAccountToken(""); setShowAccountForm(null);
    } catch (err: unknown) {
      setAccountError(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setAccountSubmitting(false);
    }
  };

  const handleValidateAccount = async (id: string) => {
    setValidating(id);
    try {
      await onValidateAccount(id);
    } finally {
      setValidating(null);
    }
  };

  // ─── Render helpers ─────────────────────────────────────
  const renderAccountRow = (a: ApiGitHubCopilotAccount, canRemove: boolean) => (
    <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <Github className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-foreground truncate">{a.label}</span>
        <span className="text-xs text-muted-foreground truncate">@{a.github_login}</span>
        {a.is_valid ? <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => handleValidateAccount(a.id)} disabled={validating === a.id}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Test">
          {validating === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
        {canRemove && (
          <button onClick={() => onRemoveAccount(a.id)}
            className="rounded p-1 text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors" title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  const renderAddForm = (scope: "user" | "workspace") => (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2 mb-3">
      <input type="text" placeholder={scope === "user" ? "Label (e.g. 'My personal account')" : "Label (e.g. 'Team account')"} value={accountLabel}
        onChange={(e) => setAccountLabel(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500" />
      <input type="password" placeholder="Paste your GitHub access token here" value={accountToken}
        onChange={(e) => setAccountToken(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500" />
      {accountError && <p className="text-xs text-red-400">{accountError}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={() => { setShowAccountForm(null); setAccountError(""); }}
          className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={handleAddAccount} disabled={accountSubmitting || !accountLabel.trim() || !accountToken.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50">
          {accountSubmitting && <Loader2 className="h-3 w-3 animate-spin" />} Add
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ── GitHub AI Accounts (Copilot) ── */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Github className="h-4 w-4" /> GitHub AI Accounts
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Connect GitHub accounts that have Copilot access. Personal accounts are visible only to you.</p>
        </div>

        {accountsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Personal section — any member can add */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">My personal accounts</h3>
                  <Lock className="h-3 w-3 text-muted-foreground" aria-label="Only you can see these" />
                </div>
                <div className="flex gap-2">
                  <a
                    href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}&scope=user` : "?scope=user"}`}
                    className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                    title="Sign in with GitHub to connect a personal account"
                  >
                    <Github className="h-3.5 w-3.5" /> Sign in with GitHub
                  </a>
                  <button
                    onClick={() => { setShowAccountForm(showAccountForm === "user" ? null : "user"); setAccountError(""); }}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
                    title="Add a personal account using a GitHub access token"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add personal
                  </button>
                </div>
              </div>
              {showAccountForm === "user" && renderAddForm("user")}
              {personalAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-5 text-center">
                  <p className="text-xs text-muted-foreground">No personal accounts. Add one to use your own Copilot subscription privately.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {personalAccounts.map((a) => renderAccountRow(a, true))}
                </div>
              )}
            </div>

            {/* Workspace section — admin-only Add */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">Workspace shared accounts</h3>
                  <span className="text-[10px] text-muted-foreground">visible to all members</span>
                </div>
                {isWorkspaceAdmin && (
                  <div className="flex gap-2">
                    <a
                      href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}&scope=workspace` : "?scope=workspace"}`}
                      className="flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                      title="Sign in with GitHub to share a workspace account"
                    >
                      <Github className="h-3.5 w-3.5" /> Sign in with GitHub
                    </a>
                    <button
                      onClick={() => { setShowAccountForm(showAccountForm === "workspace" ? null : "workspace"); setAccountError(""); }}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
                      title="Add a workspace-shared account using a token"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add for workspace
                    </button>
                  </div>
                )}
              </div>
              {showAccountForm === "workspace" && renderAddForm("workspace")}
              {workspaceAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-5 text-center">
                  <p className="text-xs text-muted-foreground">
                    {isWorkspaceAdmin
                      ? "No workspace-shared accounts. Add one to provide a Copilot account every member can use."
                      : "No workspace-shared accounts available. Ask a workspace admin to share one."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {workspaceAccounts.map((a) => renderAccountRow(a, isWorkspaceAdmin))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <div className="border-t border-border" />

      {/* ── Custom Providers (BYOK) ── */}
      <section>
        <CustomProvidersTab
          workspaceId={workspaceId}
          isWorkspaceAdmin={isWorkspaceAdmin}
          currentUserId={currentUserId}
          providers={providers}
          loading={providersLoading}
          onAdd={onAddProvider}
          onRemove={onRemoveProvider}
          onValidate={onValidateProvider}
          onPromote={onPromoteProvider}
          onRefresh={onRefreshProviders}
        />
      </section>
    </div>
  );
}
