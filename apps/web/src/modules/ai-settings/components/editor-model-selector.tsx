"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Bot, ChevronDown, ExternalLink, Lock, Eye, Wrench, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────

export interface ModelOption {
  id: string;
  label: string;
  group: "copilot" | "custom";
  providerId?: string;
  copilotAccountId?: string;
  /** Provider display name (e.g. "OpenAI", "Ollama") */
  providerName?: string;
  /** Provider health status from last health check */
  healthStatus?: "healthy" | "degraded" | "down" | "unknown";
  /** Latency from last health check (ms) */
  healthLatencyMs?: number;
  /** Whether this is a local provider */
  isLocal?: boolean;
  /** Model supports vision input */
  supportsVision?: boolean;
  /** Model supports tool calling */
  supportsTools?: boolean;
}

interface Props {
  selectedModelId: string;
  selectedProviderId: string | null;
  selectedCopilotAccountId: string | null;
  onSelect: (modelId: string, providerId: string | null, copilotAccountId: string | null) => void;
  models: ModelOption[];
  disabled?: boolean;
  enforcedLabel?: string;
}

const DEFAULT_MODELS: ModelOption[] = [
  { id: "claude-sonnet-4", label: "Claude Sonnet 4", group: "copilot" },
  { id: "gpt-4o", label: "GPT-4o", group: "copilot" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", group: "copilot" },
  { id: "gpt-4.1", label: "GPT-4.1", group: "copilot" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", group: "copilot" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", group: "copilot" },
  { id: "o3-mini", label: "o3-mini", group: "copilot" },
  { id: "o4-mini", label: "o4-mini", group: "copilot" },
  { id: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash", group: "copilot" },
];

// ─── Health Status Dot ─────────────────────────────────────

function HealthDot({ status }: { status?: "healthy" | "degraded" | "down" | "unknown" }) {
  const color =
    status === "healthy"
      ? "bg-green-500"
      : status === "degraded"
        ? "bg-yellow-500"
        : status === "down"
          ? "bg-red-500"
          : "bg-zinc-500";

  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
  );
}

// ─── Capability Badges ─────────────────────────────────────

function CapabilityBadges({
  supportsVision,
  supportsTools,
}: {
  supportsVision?: boolean;
  supportsTools?: boolean;
}) {
  if (!supportsVision && !supportsTools) return null;
  return (
    <span className="inline-flex items-center gap-0.5 ml-auto">
      {supportsVision && (
        <span title="Vision">
          <Eye className="h-2.5 w-2.5 text-muted-foreground" />
        </span>
      )}
      {supportsTools && (
        <span title="Tool calling">
          <Wrench className="h-2.5 w-2.5 text-muted-foreground" />
        </span>
      )}
    </span>
  );
}

// ─── Provider Group ────────────────────────────────────────

interface ProviderGroup {
  name: string;
  healthStatus?: "healthy" | "degraded" | "down" | "unknown";
  healthLatencyMs?: number;
  isLocal?: boolean;
  models: ModelOption[];
}

function groupByProvider(models: ModelOption[]): ProviderGroup[] {
  const map = new Map<string, ProviderGroup>();

  for (const m of models) {
    const key = m.providerName ?? m.providerId ?? "__default__";
    let group = map.get(key);
    if (!group) {
      group = {
        name: m.providerName ?? (m.providerId ? "Custom Provider" : ""),
        healthStatus: m.healthStatus,
        healthLatencyMs: m.healthLatencyMs,
        isLocal: m.isLocal,
        models: [],
      };
      map.set(key, group);
    }
    group.models.push(m);
  }

  return Array.from(map.values());
}

// ─── Latency Hint ──────────────────────────────────────────

function LatencyHint({ ms }: { ms?: number }) {
  if (ms == null || ms <= 0) return null;
  const label = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  return (
    <span className="text-[9px] text-muted-foreground ml-1" title="Last health check latency">
      {label}
    </span>
  );
}

// ─── Main Component ────────────────────────────────────────

export function EditorModelSelector({
  selectedModelId,
  selectedProviderId,
  selectedCopilotAccountId,
  onSelect,
  models,
  disabled,
  enforcedLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const allModels = models.length > 0 ? models : DEFAULT_MODELS;
  const copilotModels = allModels.filter((m) => m.group === "copilot");
  const customModels = allModels.filter((m) => m.group === "custom");

  // Group custom models by provider
  const providerGroups = useMemo(() => groupByProvider(customModels), [customModels]);
  const hasProviderGroups = providerGroups.length > 0 && providerGroups.some((g) => g.models.length > 0);

  // When disabled (enforcement active), render a locked indicator.
  // Must come AFTER all hook calls to keep hook order stable across renders.
  if (disabled) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 h-7 text-[12px] text-muted-foreground cursor-not-allowed">
        <Lock className="h-3 w-3" />
        <span className="max-w-[100px] truncate">{enforcedLabel || "Locked"}</span>
      </div>
    );
  }

  const displayLabel = selectedModelId || "Auto";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 h-7 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Bot className="h-3 w-3" />
        <span className="max-w-[100px] truncate">{displayLabel}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 w-64 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl py-1">
          {/* Copilot Models */}
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Copilot Models
          </div>
          {copilotModels.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onSelect(m.id, null, m.copilotAccountId ?? null);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                selectedModelId === m.id && !selectedProviderId
                  ? "bg-brand-600/20 text-brand-300"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <span className="truncate">{m.label}</span>
              <CapabilityBadges supportsVision={m.supportsVision} supportsTools={m.supportsTools} />
            </button>
          ))}

          {/* Custom Provider Models — grouped by provider */}
          {hasProviderGroups && (
            <>
              <div className="mx-2 my-1 border-t border-border" />
              {providerGroups.map((group) => (
                <div key={group.name}>
                  {/* Provider group header */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <HealthDot status={group.healthStatus} />
                    <span className="truncate">{group.name}</span>
                    {group.isLocal && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-px text-[8px] font-medium text-muted-foreground normal-case tracking-normal">
                        <Wifi className="h-2 w-2" />
                        Local
                      </span>
                    )}
                    <LatencyHint ms={group.healthLatencyMs} />
                  </div>
                  {/* Models within this provider */}
                  {group.models.map((m) => (
                    <button
                      key={`${m.providerId}-${m.id}`}
                      onClick={() => {
                        onSelect(m.id, m.providerId ?? null, null);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 pl-5 py-1.5 text-sm transition-colors ${
                        selectedModelId === m.id && selectedProviderId === m.providerId
                          ? "bg-brand-600/20 text-brand-300"
                          : "text-foreground hover:bg-accent"
                      }`}
                    >
                      <span className="truncate">{m.label}</span>
                      <CapabilityBadges supportsVision={m.supportsVision} supportsTools={m.supportsTools} />
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}

          {/* Manage link */}
          <div className="mx-2 my-1 border-t border-border" />
          <button
            onClick={() => {
              router.push("/ai-settings");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Manage AI Settings
          </button>
        </div>
      )}
    </div>
  );
}
