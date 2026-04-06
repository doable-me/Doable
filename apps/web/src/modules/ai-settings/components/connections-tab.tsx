"use client";

import { useState } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import { Github, Key, Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { CustomProvidersTab } from "./custom-providers-tab";

interface Props {
  workspaceId: string | null;
  accounts: ApiGitHubCopilotAccount[];
  accountsLoading: boolean;
  providers: ApiAiProvider[];
  providersLoading: boolean;
  onAddAccount: (label: string, token: string) => Promise<void>;
  onRemoveAccount: (id: string) => Promise<void>;
  onValidateAccount: (id: string) => Promise<boolean>;
  onAddProvider: (data: {
    label: string;
    providerType: "openai" | "azure" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    azureApiVersion?: string;
  }) => Promise<void>;
  onRemoveProvider: (id: string) => Promise<void>;
  onValidateProvider: (id: string) => Promise<{ valid: boolean; error?: string }>;
  onRefreshProviders?: () => void;
}

export function ConnectionsTab({
  workspaceId, accounts, accountsLoading, providers, providersLoading,
  onAddAccount, onRemoveAccount, onValidateAccount,
  onAddProvider, onRemoveProvider, onValidateProvider, onRefreshProviders,
}: Props) {
  // GitHub account form
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountLabel, setAccountLabel] = useState("");
  const [accountToken, setAccountToken] = useState("");
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountError, setAccountError] = useState("");

  const [validating, setValidating] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  const handleAddAccount = async () => {
    if (!accountLabel.trim() || !accountToken.trim()) return;
    setAccountSubmitting(true);
    setAccountError("");
    try {
      await onAddAccount(accountLabel.trim(), accountToken.trim());
      setAccountLabel(""); setAccountToken(""); setShowAccountForm(false);
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

  return (
    <div className="space-y-8">
      {/* ── GitHub Copilot Accounts ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <Github className="h-4 w-4" /> GitHub AI Accounts
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Connect GitHub accounts that have AI access (Copilot subscription) to use GitHub-hosted models.</p>
          </div>
          <div className="flex gap-2">
            <a
              href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              title="Sign in with GitHub to connect your account automatically"
            >
              <Github className="h-3.5 w-3.5" /> Sign in with GitHub
            </a>
            <button
              onClick={() => setShowAccountForm(!showAccountForm)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
              title="Add an account using a personal access token"
            >
              <Plus className="h-3.5 w-3.5" /> Add with Token
            </button>
          </div>
        </div>

        {showAccountForm && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2 mb-3">
            <input type="text" placeholder="Label (e.g. 'Work Account')" value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500" />
            <input type="password" placeholder="Paste your GitHub access token here" value={accountToken}
              onChange={(e) => setAccountToken(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500" />
            {accountError && <p className="text-xs text-red-400">{accountError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAccountForm(false)} className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button onClick={handleAddAccount} disabled={accountSubmitting || !accountLabel.trim() || !accountToken.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50">
                {accountSubmitting && <Loader2 className="h-3 w-3 animate-spin" />} Add
              </button>
            </div>
          </div>
        )}

        {accountsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
        ) : accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 py-6 text-center">
            <p className="text-xs text-zinc-500">No GitHub accounts connected.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Github className="h-4 w-4 text-zinc-500" />
                  <span className="text-sm text-zinc-200">{a.label}</span>
                  <span className="text-xs text-zinc-500">@{a.github_login}</span>
                  {a.is_valid ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleValidateAccount(a.id)} disabled={validating === a.id}
                    className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Test">
                    {validating === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => onRemoveAccount(a.id)}
                    className="rounded p-1 text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors" title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-zinc-800" />

      {/* ── Custom Providers (new wizard-based UI with 61 providers) ── */}
      <section>
        <CustomProvidersTab
          workspaceId={workspaceId}
          providers={providers}
          loading={providersLoading}
          onAdd={onAddProvider}
          onRemove={onRemoveProvider}
          onValidate={onValidateProvider}
          onRefresh={onRefreshProviders}
        />
      </section>
    </div>
  );
}
