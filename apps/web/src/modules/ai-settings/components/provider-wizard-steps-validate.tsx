"use client";

import {
  Loader2,
  XCircle,
  Zap,
  Eye,
  Wrench,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import type { ProviderPreset } from "@doable/shared";
import { ProviderIcon, PROVIDER_COLORS } from "./provider-icons";
import type { TestConnectionResult } from "../hooks/use-test-connection";
import { formatContextWindow } from "./provider-wizard-types";

// ─── Step 3: Validate ───────────────────────────────────────

export function StepValidate({
  preset,
  testing,
  result,
  onTest,
}: {
  preset: ProviderPreset;
  testing: boolean;
  result: TestConnectionResult | null;
  onTest: () => void;
}) {
  const brandColor = PROVIDER_COLORS[preset.id];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={brandColor ? { backgroundColor: `${brandColor}18` } : { backgroundColor: "rgba(113,113,122,0.15)" }}
        >
          <ProviderIcon providerId={preset.id} size={28} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{preset.name}</p>
          <p className="text-xs text-muted-foreground">Validate connection</p>
        </div>
      </div>

      <div className="flex flex-col items-center py-6">
        {!result && !testing && (
          <>
            <p className="mb-4 text-sm text-muted-foreground text-center">
              Test the connection to {preset.name} to verify your configuration.
            </p>
            <button
              onClick={onTest}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Test Connection
            </button>
          </>
        )}

        {testing && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            <p className="text-sm text-muted-foreground">Testing connection...</p>
          </div>
        )}

        {result && !testing && (
          <div className="w-full space-y-4">
            {result.ok ? (
              <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <CheckCircle className="h-6 w-6 shrink-0 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-300">Connection successful</p>
                  <p className="mt-0.5 text-xs text-green-400/80">
                    Latency: {result.latencyMs}ms
                    {result.models && result.models.length > 0 && (
                      <> — {result.models.length} model{result.models.length !== 1 ? "s" : ""} discovered</>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <XCircle className="h-6 w-6 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">Connection failed</p>
                  <p className="mt-0.5 text-xs text-red-400/80">{result.error || "Unknown error"}</p>
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={onTest}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Zap className="h-3 w-3" />
                Test Again
              </button>
            </div>
          </div>
        )}
      </div>

      {preset.warnings && preset.warnings.length > 0 && (
        <div className="space-y-2">
          {preset.warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
              <p className="text-xs text-yellow-300/80">{warning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Select Models ──────────────────────────────────

export function StepModels({
  displayModels,
  defaultModelId,
  onToggle,
  onSelectAll,
  onSetDefault,
  selectedCount,
  saveError,
}: {
  displayModels: {
    id: string;
    name: string;
    contextWindow?: number;
    supportsVision: boolean;
    supportsTools: boolean;
    tier?: string;
    selected: boolean;
  }[];
  defaultModelId: string | null;
  onToggle: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onSetDefault: (id: string) => void;
  selectedCount: number;
  saveError: string | null;
}) {
  if (displayModels.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No models available. The provider will be saved without model selections.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedCount} of {displayModels.length} models selected
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onSelectAll(true)}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={() => onSelectAll(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {displayModels.map((model, index) => (
          <div
            key={`${model.id}-${index}`}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              model.selected
                ? "border-border bg-secondary"
                : "border-border bg-card opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={model.selected}
              onChange={() => onToggle(model.id)}
              className="h-4 w-4 rounded border-input bg-background text-brand-500 focus:ring-brand-500 focus:ring-offset-0 accent-brand-500"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground truncate">{model.name}</span>
                {model.contextWindow && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {formatContextWindow(model.contextWindow)}
                  </span>
                )}
                {model.supportsVision && (
                  <span title="Vision">
                    <Eye className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </span>
                )}
                {model.supportsTools && (
                  <span title="Tool calling">
                    <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </span>
                )}
                {model.tier && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      model.tier === "powerful"
                        ? "bg-purple-500/15 text-purple-400"
                        : model.tier === "balanced"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-green-500/15 text-green-400"
                    }`}
                  >
                    {model.tier}
                  </span>
                )}
              </div>
            </div>

            {model.selected && (
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <input
                  type="radio"
                  name="defaultModel"
                  checked={defaultModelId === model.id}
                  onChange={() => onSetDefault(model.id)}
                  className="h-3.5 w-3.5 border-input bg-background text-brand-500 focus:ring-brand-500 focus:ring-offset-0 accent-brand-500"
                />
                <span className="text-[10px] text-muted-foreground">Default</span>
              </label>
            )}
          </div>
        ))}
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs text-red-400">{saveError}</p>
        </div>
      )}
    </div>
  );
}
