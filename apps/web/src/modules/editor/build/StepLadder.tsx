"use client";

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useBuildStore } from "./store/build-store";

function statusGlyph(status: string): string {
  switch (status) {
    case "active":
      return "*";
    case "done":
      return "v";
    case "failed":
      return "x";
    default:
      return "o";
  }
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StepLadder(): ReactElement {
  const phases = useBuildStore((s) => s.phases);
  const currentPhase = useBuildStore((s) => s.currentPhase);
  const status = useBuildStore((s) => s.status);
  const startedAt = useBuildStore((s) => s.startedAt);
  const elapsedMs = useBuildStore((s) => s.elapsedMs);
  const setElapsed = useBuildStore((s) => s.setElapsed);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (status !== "running" || !startedAt) return;
    const handle = window.setInterval(() => {
      setElapsed(Date.now() - startedAt);
      setTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(handle);
  }, [status, startedAt, setElapsed]);

  return (
    <div className="flex flex-col gap-2 border-b border-neutral-800 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {phases.map((p) => {
          const active = p.id === currentPhase;
          const colour =
            p.status === "failed"
              ? "border-red-500 text-red-400"
              : p.status === "done"
                ? "border-emerald-600 text-emerald-300"
                : active
                  ? "border-blue-500 text-blue-300"
                  : "border-neutral-700 text-neutral-500";
          return (
            <span
              key={p.id}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${colour}`}
            >
              <span aria-hidden="true">{statusGlyph(p.status)}</span>
              <span>{p.label}</span>
              {active ? (
                <span className="ml-1 font-mono text-[10px] text-neutral-400">
                  {formatElapsed(elapsedMs)}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {currentPhase ? (
        <div className="text-xs text-neutral-400">
          {phases.find((p) => p.id === currentPhase)?.subLine ?? null}
        </div>
      ) : null}
    </div>
  );
}
