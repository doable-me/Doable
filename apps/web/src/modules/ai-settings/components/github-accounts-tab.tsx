"use client";

import { useState } from "react";
import type { ApiGitHubCopilotAccount } from "@/lib/api";
import { Github, Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw, Star } from "lucide-react";

interface Props {
  workspaceId: string | null;
  accounts: ApiGitHubCopilotAccount[];
  loading: boolean;
  activeAccountId: string | null;
  onAdd: (label: string, token: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onValidate: (id: string) => Promise<boolean>;
  onSetActive: (id: string | null) => Promise<void>;
}

export function GitHubAccountsTab({ workspaceId, accounts, loading, activeAccountId, onAdd, onRemove, onValidate, onSetActive }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState<string | null>(null);
  const [settingActive, setSettingActive] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  const handleAdd = async () => {
    if (!label.trim() || !token.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await onAdd(label.trim(), token.trim());
      setLabel("");
      setToken("");
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setSubmitting(false);
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

  const handleSetActive = async (id: string) => {
    setSettingActive(id);
    try {
      await onSetActive(activeAccountId === id ? null : id);
    } finally {
      setSettingActive(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">GitHub Copilot Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Connect GitHub accounts with Copilot subscriptions for AI model access.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
            className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Github className="h-4 w-4" />
            Connect via OAuth
          </a>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Token
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <input
            type="text"
            placeholder="Label (e.g. 'Work Account')"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
          />
          <input
            type="password"
            placeholder="GitHub Personal Access Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting || !label.trim() || !token.trim()}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Add Account
            </button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Github className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No GitHub accounts connected yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Connect a GitHub account with a Copilot subscription to use Copilot models.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => {
            const isActive = activeAccountId === account.id;
            return (
              <div
                key={account.id}
                className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                  isActive
                    ? "border-brand-500/50 bg-brand-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    isActive ? "bg-brand-600/20" : "bg-secondary"
                  }`}>
                    <Github className={`h-5 w-5 ${isActive ? "text-brand-400" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{account.label}</p>
                      {isActive && (
                        <span className="rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] font-semibold text-brand-300 uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">@{account.github_login}</p>
                  </div>
                  {account.is_valid ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleSetActive(account.id)}
                    disabled={settingActive === account.id}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-brand-600/20 text-brand-300 hover:bg-brand-600/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                    title={isActive ? "Remove as default" : "Set as default"}
                  >
                    {settingActive === account.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Star className={`h-3.5 w-3.5 ${isActive ? "fill-brand-400" : ""}`} />
                    )}
                    {isActive ? "Default" : "Set default"}
                  </button>
                  <button
                    onClick={() => handleValidate(account.id)}
                    disabled={validating === account.id}
                    className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Test connection"
                  >
                    {validating === account.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => onRemove(account.id)}
                    className="rounded p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    title="Remove account"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
