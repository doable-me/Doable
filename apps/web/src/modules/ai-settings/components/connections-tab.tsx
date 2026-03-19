"use client";

import { useState } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import { Github, Key, Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";

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
}

const PROVIDER_DEFAULTS: { [K in "openai" | "azure" | "anthropic"]: { baseUrl: string; label: string } } = {
  openai: { baseUrl: "https://api.openai.com/v1", label: "OpenAI" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", label: "Anthropic" },
  azure: { baseUrl: "", label: "Azure OpenAI" },
};

export function ConnectionsTab({
  workspaceId, accounts, accountsLoading, providers, providersLoading,
  onAddAccount, onRemoveAccount, onValidateAccount,
  onAddProvider, onRemoveProvider, onValidateProvider,
}: Props) {
  // GitHub account form
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountLabel, setAccountLabel] = useState("");
  const [accountToken, setAccountToken] = useState("");
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [accountError, setAccountError] = useState("");

  // Provider form
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerLabel, setProviderLabel] = useState("");
  const [providerType, setProviderType] = useState<"openai" | "azure" | "anthropic">("openai");
  const [providerBaseUrl, setProviderBaseUrl] = useState(PROVIDER_DEFAULTS.openai.baseUrl);
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerAzureVersion, setProviderAzureVersion] = useState("2024-02-15-preview");
  const [providerSubmitting, setProviderSubmitting] = useState(false);
  const [providerError, setProviderError] = useState("");

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

  const handleAddProvider = async () => {
    if (!providerLabel.trim() || !providerBaseUrl.trim()) return;
    setProviderSubmitting(true);
    setProviderError("");
    try {
      await onAddProvider({
        label: providerLabel.trim(), providerType, baseUrl: providerBaseUrl.trim(),
        apiKey: providerApiKey.trim() || undefined,
        azureApiVersion: providerType === "azure" ? providerAzureVersion : undefined,
      });
      setProviderLabel(""); setProviderApiKey(""); setShowProviderForm(false);
    } catch (err: unknown) {
      setProviderError(err instanceof Error ? err.message : "Failed to add provider");
    } finally {
      setProviderSubmitting(false);
    }
  };

  const handleProviderTypeChange = (type: "openai" | "azure" | "anthropic") => {
    setProviderType(type);
    setProviderBaseUrl(PROVIDER_DEFAULTS[type].baseUrl);
    if (!providerLabel) setProviderLabel(PROVIDER_DEFAULTS[type].label);
  };

  const handleValidate = async (id: string, type: "account" | "provider") => {
    setValidating(id);
    try {
      if (type === "account") await onValidateAccount(id);
      else await onValidateProvider(id);
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
              <Github className="h-4 w-4" /> GitHub Copilot Accounts
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Connect GitHub accounts with Copilot subscriptions.</p>
          </div>
          <div className="flex gap-2">
            <a
              href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              <Github className="h-3.5 w-3.5" /> OAuth
            </a>
            <button
              onClick={() => setShowAccountForm(!showAccountForm)}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Token
            </button>
          </div>
        </div>

        {showAccountForm && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2 mb-3">
            <input type="text" placeholder="Label (e.g. 'Work Account')" value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500" />
            <input type="password" placeholder="GitHub Personal Access Token" value={accountToken}
              onChange={(e) => setAccountToken(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500" />
            {accountError && <p className="text-xs text-red-400">{accountError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAccountForm(false)} className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button onClick={handleAddAccount} disabled={accountSubmitting || !accountLabel.trim() || !accountToken.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-50">
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
                  <button onClick={() => handleValidate(a.id, "account")} disabled={validating === a.id}
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

      {/* ── Custom Providers ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <Key className="h-4 w-4" /> Custom Providers
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Bring your own API keys for OpenAI, Anthropic, or Azure.</p>
          </div>
          <button onClick={() => setShowProviderForm(!showProviderForm)}
            className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-500 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Provider
          </button>
        </div>

        {showProviderForm && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2 mb-3">
            <div className="flex gap-1.5">
              {(["openai", "anthropic", "azure"] as const).map((t) => (
                <button key={t} onClick={() => handleProviderTypeChange(t)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${providerType === t ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}>
                  {PROVIDER_DEFAULTS[t].label}
                </button>
              ))}
            </div>
            <input type="text" placeholder="Label" value={providerLabel} onChange={(e) => setProviderLabel(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500" />
            <input type="text" placeholder="Base URL" value={providerBaseUrl} onChange={(e) => setProviderBaseUrl(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500" />
            <input type="password" placeholder="API Key" value={providerApiKey} onChange={(e) => setProviderApiKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500" />
            {providerType === "azure" && (
              <input type="text" placeholder="API Version" value={providerAzureVersion} onChange={(e) => setProviderAzureVersion(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500" />
            )}
            {providerError && <p className="text-xs text-red-400">{providerError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowProviderForm(false)} className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
              <button onClick={handleAddProvider} disabled={providerSubmitting || !providerLabel.trim() || !providerBaseUrl.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-50">
                {providerSubmitting && <Loader2 className="h-3 w-3 animate-spin" />} Add
              </button>
            </div>
          </div>
        )}

        {providersLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-zinc-500" /></div>
        ) : providers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 py-6 text-center">
            <p className="text-xs text-zinc-500">No custom providers configured.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Key className="h-4 w-4 text-zinc-500" />
                  <span className="text-sm text-zinc-200">{p.label}</span>
                  <span className="text-xs text-zinc-500">{p.provider_type} &middot; {p.base_url}</span>
                  {p.is_valid ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleValidate(p.id, "provider")} disabled={validating === p.id}
                    className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Test">
                    {validating === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => onRemoveProvider(p.id)}
                    className="rounded p-1 text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors" title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
