"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Play,
  Zap,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { AuditPhase, AuditResults } from "./speed-panel-data";
import { MOCK_RESULTS, PHASE_LABELS, PHASE_ORDER } from "./speed-panel-data";
import { SpeedPanelResults } from "./speed-panel-results";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
  onSendMessage: (message: string) => void;
}

// ─── Main Component ─────────────────────────────────────────
export function SpeedPanel({ projectId, onClose, onSendMessage }: Props) {
  const [phase, setPhase] = useState<AuditPhase>("idle");
  const [results, setResults] = useState<AuditResults | null>(null);
  const [expandedRecs, setExpandedRecs] = useState<Set<string>>(new Set());
  const [phaseProgress, setPhaseProgress] = useState(0);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run audit simulation
  const runAudit = useCallback(() => {
    setResults(null);
    setExpandedRecs(new Set());
    setPhaseProgress(0);

    let phaseIndex = 0;

    const advancePhase = () => {
      if (phaseIndex < PHASE_ORDER.length) {
        const currentPhase = PHASE_ORDER[phaseIndex]!;
        setPhase(currentPhase);
        setPhaseProgress(((phaseIndex + 1) / PHASE_ORDER.length) * 100);
        phaseIndex++;
        phaseTimerRef.current = setTimeout(advancePhase, 800 + Math.random() * 600);
      } else {
        setPhase("done");
        setPhaseProgress(100);
        setResults(MOCK_RESULTS);
      }
    };

    advancePhase();
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, []);

  const toggleRec = (id: string) => {
    setExpandedRecs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAuditing = phase !== "idle" && phase !== "done";

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Zap className="h-4.5 w-4.5 text-amber-400" />
          <h2 className="text-sm font-semibold text-foreground">Speed</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runAudit}
            disabled={isAuditing}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[#1E52F1] px-3 text-xs font-medium text-[#F0F6FF] hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              boxShadow:
                "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(255,255,255,0.1) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px",
            }}
          >
            {isAuditing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {isAuditing ? "Running..." : "Run audit"}
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Idle state */}
        {phase === "idle" && !results && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 mb-4">
              <Zap className="h-8 w-8 text-amber-400" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">
              Performance Audit
            </h3>
            <p className="text-[13px] text-muted-foreground max-w-[300px] mb-5">
              Analyze your page speed, Core Web Vitals, bundle size, and get
              actionable recommendations to improve performance.
            </p>
            <button
              onClick={runAudit}
              className="flex items-center gap-2 rounded-lg bg-[#1E52F1] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 transition-colors"
              style={{
                boxShadow:
                  "rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(255,255,255,0.1) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px",
              }}
            >
              <Play className="h-4 w-4" />
              Run audit
            </button>
          </div>
        )}

        {/* Auditing animation */}
        {isAuditing && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            {/* Scanning animation */}
            <div className="relative mb-6">
              <div className="h-24 w-24 rounded-full border-4 border-border">
                <div
                  className="h-full w-full rounded-full animate-spin"
                  style={{
                    background: `conic-gradient(#1E52F1 ${phaseProgress}%, transparent ${phaseProgress}%)`,
                    animationDuration: "2s",
                  }}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-[88px] w-[88px] rounded-full bg-background flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#1E52F1]" />
                </div>
              </div>
            </div>

            {/* Phase label */}
            <p className="text-sm font-medium text-foreground mb-2">
              {PHASE_LABELS[phase as AuditPhase]}
            </p>

            {/* Phase progress indicators */}
            <div className="flex flex-col gap-2 w-64">
              {PHASE_ORDER.map((p, i) => {
                const currentIdx = PHASE_ORDER.indexOf(phase);
                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={p} className="flex items-center gap-2.5">
                    <div
                      className={`h-2 w-2 rounded-full flex-shrink-0 transition-colors ${
                        isDone
                          ? "bg-emerald-400"
                          : isCurrent
                            ? "bg-[#1E52F1] animate-pulse"
                            : "bg-border"
                      }`}
                    />
                    <span
                      className={`text-xs transition-colors ${
                        isDone
                          ? "text-muted-foreground"
                          : isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {PHASE_LABELS[p]}
                    </span>
                    {isDone && (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 ml-auto flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="w-64 mt-4 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[#1E52F1] transition-all duration-500"
                style={{ width: `${phaseProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Results */}
        {results && phase === "done" && (
          <SpeedPanelResults
            results={results}
            expandedRecs={expandedRecs}
            onToggleRec={toggleRec}
            onSendMessage={onSendMessage}
          />
        )}
      </div>
    </div>
  );
}
