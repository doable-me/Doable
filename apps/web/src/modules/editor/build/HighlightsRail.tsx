"use client";

import type { ReactElement } from "react";

import { useBuildStore } from "./store/build-store";

export function HighlightsRail(): ReactElement {
  const errors = useBuildStore((s) => s.errors);

  if (errors.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs text-neutral-500">
        No errors yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="flex flex-col gap-2">
        {errors.map((err) => (
          <li
            key={err.id}
            className="rounded-md border border-red-700/60 bg-red-950/30 p-2 text-xs"
          >
            <div className="flex items-center gap-2 font-mono text-red-300">
              <span aria-hidden="true">x</span>
              <span>
                {err.file}
                {err.line != null ? `:${err.line}` : ""}
                {err.col != null ? `:${err.col}` : ""}
              </span>
            </div>
            <div className="mt-1 text-neutral-200">{err.message}</div>
            {err.resolved ? (
              <div className="mt-1 text-[10px] uppercase tracking-wide text-emerald-400">
                resolved
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
