"use client";

import type { ProviderPreset } from "@doable/shared";

// ─── Color mapping for provider icon circles ───────────────
const ICON_COLORS: Record<string, string> = {
  a: "bg-purple-600",
  b: "bg-blue-600",
  c: "bg-cyan-600",
  d: "bg-amber-600",
  e: "bg-emerald-600",
  f: "bg-fuchsia-600",
  g: "bg-green-600",
  h: "bg-rose-600",
  i: "bg-indigo-600",
  j: "bg-yellow-600",
  k: "bg-sky-600",
  l: "bg-lime-600",
  m: "bg-pink-600",
  n: "bg-orange-600",
  o: "bg-teal-600",
  p: "bg-violet-600",
  q: "bg-red-600",
  r: "bg-blue-500",
  s: "bg-emerald-500",
  t: "bg-purple-500",
  u: "bg-amber-500",
  v: "bg-cyan-500",
  w: "bg-rose-500",
  x: "bg-indigo-500",
  y: "bg-green-500",
  z: "bg-fuchsia-500",
};

function getIconColor(name: string): string {
  const letter = name.charAt(0).toLowerCase();
  return ICON_COLORS[letter] ?? "bg-zinc-600";
}

interface ProviderCardProps {
  preset: ProviderPreset;
  onClick: () => void;
}

export function ProviderCard({ preset, onClick }: ProviderCardProps) {
  const firstLetter = preset.name.charAt(0).toUpperCase();
  const iconColor = getIconColor(preset.name);

  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/70 w-full"
    >
      {/* Icon circle */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconColor} text-white font-bold text-sm`}
      >
        {firstLetter}
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
