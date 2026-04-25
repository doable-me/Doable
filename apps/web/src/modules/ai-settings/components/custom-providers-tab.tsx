"use client";

import { useState } from "react";
import type { ApiAiProvider } from "@/lib/api";
import { Key, Plus, Trash2, Loader2, RefreshCw } from "lucide-react";
import { ProviderWizard } from "./provider-wizard";
import { ProviderHealthBadge } from "./provider-health-badge";

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
  onRefresh?: () => void;
}

export function CustomProvidersTab({ workspaceId, providers, loading, onAdd, onRemove, onValidate, onRefresh }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);

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
          <h2 className="text-lg font-semibold text-foreground">Custom AI Providers</h2>
          <p className="text-sm text-muted-foreground">
            Bring your own API keys for OpenAI, Anthropic, local models, and 50+ more.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Provider
        </button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Key className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No custom providers configured.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your own API keys to use models from OpenAI, Anthropic, local engines, and 50+ more.
          </p>
          <button
            onClick={() => setWizardOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add your first provider
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  <Key className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{provider.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {provider.provider_type} &middot; {provider.base_url}
                  </p>
                </div>
                <ProviderHealthBadge
                  status={provider.is_valid ? "healthy" : "down"}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleValidate(provider.id)}
                  disabled={validating === provider.id}
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="Test connection &amp; refresh models"
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

      {/* Provider Setup Wizard */}
      <ProviderWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        workspaceId={workspaceId}
        onProviderAdded={handleProviderAdded}
      />
    </div>
  );
}
