"use client";

import { useState, useEffect, useRef } from "react";
import { Bot, ChevronDown, ExternalLink, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

export interface ModelOption {
  id: string;
  label: string;
  group: "copilot" | "custom";
  providerId?: string;
  copilotAccountId?: string;
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

  // When disabled (enforcement active), render a locked indicator
  if (disabled) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-zinc-600/40 px-2.5 h-7 text-[12px] text-zinc-500 cursor-not-allowed">
        <Lock className="h-3 w-3" />
        <span className="max-w-[100px] truncate">{enforcedLabel || "Locked"}</span>
      </div>
    );
  }

  const allModels = models.length > 0 ? models : DEFAULT_MODELS;
  const copilotModels = allModels.filter((m) => m.group === "copilot");
  const customModels = allModels.filter((m) => m.group === "custom");

  const displayLabel = selectedModelId || "Auto";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-600/40 px-2.5 h-7 text-[12px] text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200 transition-colors"
      >
        <Bot className="h-3 w-3" />
        <span className="max-w-[100px] truncate">{displayLabel}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-50 w-56 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl py-1">
          {/* Copilot Models */}
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
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
                  : "text-zinc-300 hover:bg-white/5"
              }`}
            >
              {m.label}
            </button>
          ))}

          {/* Custom Provider Models */}
          {customModels.length > 0 && (
            <>
              <div className="mx-2 my-1 border-t border-zinc-800" />
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Custom Providers
              </div>
              {customModels.map((m) => (
                <button
                  key={`${m.providerId}-${m.id}`}
                  onClick={() => {
                    onSelect(m.id, m.providerId ?? null, null);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    selectedModelId === m.id && selectedProviderId === m.providerId
                      ? "bg-brand-600/20 text-brand-300"
                      : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </>
          )}

          {/* Manage link */}
          <div className="mx-2 my-1 border-t border-zinc-800" />
          <button
            onClick={() => {
              router.push("/ai-settings");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Manage AI Settings
          </button>
        </div>
      )}
    </div>
  );
}
