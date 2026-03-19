"use client";

import { useState } from "react";
import type { ApiAiProvider } from "@/lib/api";
import { Key, Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";

interface Props {
  workspaceId: string | null;
  providers: ApiAiProvider[];
  loading: boolean;
  onAdd: (data: {
    label: string;
    providerType: "openai" | "azure" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    azureApiVersion?: string;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onValidate: (id: string) => Promise<{ valid: boolean; error?: string }>;
}

const PROVIDER_DEFAULTS: { [K in "openai" | "azure" | "anthropic"]: { baseUrl: string; label: string } } = {
  openai: { baseUrl: "https://api.openai.com/v1", label: "OpenAI" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", label: "Anthropic" },
  azure: { baseUrl: "", label: "Azure OpenAI" },
};

export function CustomProvidersTab({ workspaceId, providers, loading, onAdd, onRemove, onValidate }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [providerType, setProviderType] = useState<"openai" | "azure" | "anthropic">("openai");
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULTS.openai.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [azureApiVersion, setAzureApiVersion] = useState("2024-02-15-preview");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState<string | null>(null);

  const handleTypeChange = (type: "openai" | "azure" | "anthropic") => {
    setProviderType(type);
    setBaseUrl(PROVIDER_DEFAULTS[type].baseUrl);
    if (!label) setLabel(PROVIDER_DEFAULTS[type].label);
  };

  const handleAdd = async () => {
    if (!label.trim() || !baseUrl.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await onAdd({
        label: label.trim(),
        providerType,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        azureApiVersion: providerType === "azure" ? azureApiVersion : undefined,
      });
      setLabel("");
      setApiKey("");
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add provider");
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
          <h2 className="text-lg font-semibold text-zinc-200">Custom AI Providers</h2>
          <p className="text-sm text-zinc-500">
            Bring your own API keys for OpenAI, Anthropic, or Azure OpenAI.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Provider
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          {/* Provider type selector */}
          <div className="flex gap-2">
            {(["openai", "anthropic", "azure"] as const).map((type) => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  providerType === type
                    ? "bg-orange-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {PROVIDER_DEFAULTS[type].label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500"
          />
          <input
            type="text"
            placeholder="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500"
          />
          <input
            type="password"
            placeholder="API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500"
          />
          {providerType === "azure" && (
            <input
              type="text"
              placeholder="API Version (e.g. 2024-02-15-preview)"
              value={azureApiVersion}
              onChange={(e) => setAzureApiVersion(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500"
            />
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={submitting || !label.trim() || !baseUrl.trim()}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Add Provider
            </button>
          </div>
        </div>
      )}

      {providers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 py-12 text-center">
          <Key className="mx-auto h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No custom providers configured.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Add your own API keys to use models from OpenAI, Anthropic, or Azure.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
                  <Key className="h-5 w-5 text-zinc-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{provider.label}</p>
                  <p className="text-xs text-zinc-500">
                    {provider.provider_type} &middot; {provider.base_url}
                  </p>
                </div>
                {provider.is_valid ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleValidate(provider.id)}
                  disabled={validating === provider.id}
                  className="rounded p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title="Test connection"
                >
                  {validating === provider.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => onRemove(provider.id)}
                  className="rounded p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  title="Remove provider"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
