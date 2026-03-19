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
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-200">GitHub Copilot Accounts</h2>
          <p className="text-sm text-zinc-500">
            Connect GitHub accounts with Copilot subscriptions for AI model access.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <Github className="h-4 w-4" />
            Connect via OAuth
          </a>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Token
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <input
            type="text"
            placeholder="Label (e.g. 'Work Account')"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500"
          />
          <input
            type="password"
            placeholder="GitHub Personal Access Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting || !label.trim() || !token.trim()}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Add Account
            </button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 py-12 text-center">
          <Github className="mx-auto h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No GitHub accounts connected yet.</p>
          <p className="text-xs text-zinc-500 mt-1">
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
                    ? "border-orange-500/50 bg-orange-500/5"
                    : "border-zinc-800 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    isActive ? "bg-orange-600/20" : "bg-zinc-800"
                  }`}>
                    <Github className={`h-5 w-5 ${isActive ? "text-orange-400" : "text-zinc-400"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-200">{account.label}</p>
                      {isActive && (
                        <span className="rounded-full bg-orange-600/20 px-2 py-0.5 text-[10px] font-semibold text-orange-300 uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">@{account.github_login}</p>
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
                        ? "bg-orange-600/20 text-orange-300 hover:bg-orange-600/30"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    }`}
                    title={isActive ? "Remove as default" : "Set as default"}
                  >
                    {settingActive === account.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Star className={`h-3.5 w-3.5 ${isActive ? "fill-orange-400" : ""}`} />
                    )}
                    {isActive ? "Default" : "Set default"}
                  </button>
                  <button
                    onClick={() => handleValidate(account.id)}
                    disabled={validating === account.id}
                    className="rounded p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
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
