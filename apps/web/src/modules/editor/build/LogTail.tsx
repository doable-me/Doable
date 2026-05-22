"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { useBuildStore } from "./store/build-store";

const COLLAPSED_HEIGHT_CLASS = "max-h-24";
const EXPANDED_HEIGHT_CLASS = "max-h-96";

export function LogTail(): ReactElement {
  const lines = useBuildStore((s) => s.rawLogLines);
  const [expanded, setExpanded] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!stickToBottom) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, stickToBottom, expanded]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setStickToBottom(atBottom);
  };

  return (
    <div className="border-t border-neutral-800">
      <div className="flex items-center justify-between px-3 py-1 text-xs text-neutral-400">
        <span>Logs ({lines.length})</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:bg-neutral-800"
        >
          {expanded ? "collapse" : "expand"}
        </button>
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className={`overflow-y-auto bg-neutral-950 px-3 py-1 font-mono text-[11px] leading-tight text-neutral-300 ${
          expanded ? EXPANDED_HEIGHT_CLASS : COLLAPSED_HEIGHT_CLASS
        }`}
      >
        {lines.length === 0 ? (
          <div className="text-neutral-600">No log output yet.</div>
        ) : (
          lines.map((line) => {
            const tagColour =
              line.source === "stderr"
                ? "text-red-400"
                : line.source === "system"
                  ? "text-amber-400"
                  : "text-neutral-500";
            return (
              <div key={line.id} className="whitespace-pre-wrap break-words">
                <span className={tagColour}>[{line.source}]</span>{" "}
                <span>{line.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
