"use client";

import type { ProviderPreset } from "@doable/shared";
import { ProviderIcon, PROVIDER_COLORS } from "./provider-icons";

interface ProviderCardProps {
  preset: ProviderPreset;
  onClick: () => void;
}

export function ProviderCard({ preset, onClick }: ProviderCardProps) {
  const brandColor = PROVIDER_COLORS[preset.id];

  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/70 w-full"
    >
      {/* Provider icon */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
        style={brandColor ? { backgroundColor: `${brandColor}18` } : { backgroundColor: "rgba(113,113,122,0.15)" }}
      >
        <ProviderIcon providerId={preset.id} size={24} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">
            {preset.name}
          </span>
          {preset.freeTier && (
            <span className="shrink-0 rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
              Free
            </span>
          )}
          {preset.category === "local" && (
            <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
              Local
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">
          {preset.description}
        </p>
      </div>
    </button>
  );
}
