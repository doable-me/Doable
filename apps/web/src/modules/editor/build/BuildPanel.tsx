"use client";

import type { ReactElement } from "react";

import { useBuildEvents } from "./hooks/useBuildEvents";
import { HighlightsRail } from "./HighlightsRail";
import { LogTail } from "./LogTail";
import { StepLadder } from "./StepLadder";
import { useBuildStore } from "./store/build-store";

export interface BuildPanelProps {
  projectId: string;
}

export function BuildPanel({ projectId }: BuildPanelProps): ReactElement {
  useBuildEvents(projectId);
  const status = useBuildStore((s) => s.status);

  return (
    <div className="flex h-full flex-col bg-neutral-900 text-neutral-100">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h2 className="text-sm font-semibold">Live build</h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
          {status}
        </span>
      </div>
      <StepLadder />
      <HighlightsRail />
      <LogTail />
    </div>
  );
}
