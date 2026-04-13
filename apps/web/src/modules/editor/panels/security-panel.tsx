"use client";

import { useState, useCallback, useRef } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  Play,
  Clock,
  FileSearch,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useChat } from "../hooks/use-chat";
import type { Finding, ScanPhase, ScanResponse } from "./security-panel-types";
import { computeScore, buildCategories, getSeverityCount, SCAN_PHASES } from "./security-panel-types";
import {
  EmptyState,
  ScanAnimation,
  SecurityScore,
  CategoryCard,
  SeverityPill,
  FindingRow,
  SecretFindingRow,
} from "./security-panel-components";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────
export function SecurityPanel({ projectId, onClose }: Props) {
  const [hasScanned, setHasScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [scanDuration, setScanDuration] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filesScanned, setFilesScanned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { sendMessage } = useChat(projectId);

  const activeFindings = findings.filter((f) => !f.dismissed);
  const score = hasScanned ? computeScore(findings) : 0;
  const categories = hasScanned ? buildCategories(findings) : [];

  const scoreColor =
    score >= 80
      ? "text-emerald-400"
      : score >= 60
        ? "text-amber-400"
        : "text-red-400";
  const scoreTrackColor =
    score >= 80
      ? "stroke-emerald-400"
      : score >= 60
        ? "stroke-amber-400"
        : "stroke-red-400";

  // ─── Scan animation + API call ────────────────────────────

  const runScan = useCallback(async () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanPhase("dependencies");
    setError(null);

    // Start progress animation
    let phaseIndex = 0;
    let elapsed = 0;
    const totalDuration = SCAN_PHASES.reduce((s, p) => s + p.duration, 0);

    const advancePhase = () => {
      if (phaseIndex >= SCAN_PHASES.length - 1) return;
      const currentPhase = SCAN_PHASES[phaseIndex]!;
      setScanPhase(currentPhase.phase);
      elapsed += currentPhase.duration;
      const pct = Math.round((elapsed / totalDuration) * 100);
      setScanProgress(Math.min(pct, 95));
      phaseIndex++;
      setTimeout(advancePhase, currentPhase.duration);
    };
    advancePhase();

    // Call the real API
    try {
      const result = await apiFetch<ScanResponse>(
        `/projects/${projectId}/security/scan`,
        { method: "POST" }
      );

      setFindings(result.findings);
      setFilesScanned(result.filesScanned ?? result.scan?.filesScanned ?? 0);
      setScanDuration(Math.round(((result.duration ?? result.scan?.duration ?? 0)) / 1000));
      setLastScanTime(new Date());
      setHasScanned(true);
    } catch (err) {
      console.error("[SecurityPanel] Scan failed:", err);
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setIsScanning(false);
      setScanPhase("complete");
      setScanProgress(100);
    }
  }, [projectId]);

  const toggleFinding = useCallback((id: string) => {
    setExpandedFindings((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFixFinding = useCallback(
    (finding: Finding) => {
      const msg = finding.fixSuggestion
        ? `Fix security issue: ${finding.title}. ${finding.fixSuggestion}`
        : `Fix security issue: ${finding.title} in ${finding.filePath ?? "the project"}.`;
      void sendMessage(msg);
    },
    [sendMessage]
  );

  const handleMoveToEnv = useCallback(
    (finding: Finding) => {
      void sendMessage(
        `Move the hardcoded secret found in ${finding.filePath ?? "source code"}${finding.lineNumber ? `:${finding.lineNumber}` : ""} ` +
          `to environment variables. Update the code to read from process.env and add the variable name to .env.example.`
      );
    },
    [sendMessage]
  );

  const handleDismiss = useCallback(
    async (findingId: string) => {
      try {
        await apiFetch(
          `/projects/${projectId}/security/dismiss/${findingId}`,
          { method: "POST" }
        );
        setFindings((prev) =>
          prev.map((f) =>
            f.id === findingId ? { ...f, dismissed: true } : f
          )
        );
      } catch (err) {
        console.error("[SecurityPanel] Dismiss failed:", err);
      }
    },
    [projectId]
  );

  // ─── Render ─────────────────────────────────────────────

  const depFindings = activeFindings.filter((f) => f.category === "dependency");
  const secretFindings = activeFindings.filter((f) => f.category === "secret");
  const codeFindings = activeFindings.filter((f) => f.category === "code-quality");

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-10 flex-none items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">
            Security
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={runScan}
            disabled={isScanning}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              isScanning
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <Play className="h-3 w-3" />
            {isScanning ? "Scanning..." : "Run scan"}
          </button>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Scanning animation */}
        {isScanning && (
          <div className="p-6">
            <ScanAnimation phase={scanPhase} progress={scanProgress} />
          </div>
        )}

        {/* Error state */}
        {error && !isScanning && (
          <div className="p-4">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
              <ShieldAlert className="mx-auto h-6 w-6 text-red-400" />
              <p className="mt-2 text-sm text-red-400">{error}</p>
              <button
                onClick={runScan}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Empty state - before first scan */}
        {!hasScanned && !isScanning && !error && (
          <EmptyState onRunScan={runScan} />
        )}

        {/* Results */}
        {hasScanned && !isScanning && !error && (
          <div className="space-y-0">
            {/* Score */}
            <SecurityScore score={score} scoreColor={scoreColor} trackColor={scoreTrackColor} />

            {/* Category cards */}
            <div className="border-b border-border px-4 py-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Scan Results
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => (
                  <CategoryCard key={cat.id} category={cat} />
                ))}
              </div>
            </div>

            {/* Dependency findings */}
            {depFindings.length > 0 && (
              <div className="border-b border-border px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vulnerabilities
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <SeverityPill severity="critical" count={getSeverityCount(findings, "critical")} />
                    <SeverityPill severity="high" count={getSeverityCount(findings, "high")} />
                    <SeverityPill severity="medium" count={getSeverityCount(findings, "medium")} />
                    <SeverityPill severity="low" count={getSeverityCount(findings, "low")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  {depFindings.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      expanded={expandedFindings.has(finding.id)}
                      onToggle={() => toggleFinding(finding.id)}
                      onFix={() => handleFixFinding(finding)}
                      onDismiss={() => handleDismiss(finding.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Secret findings */}
            {secretFindings.length > 0 && (
              <div className="border-b border-border px-4 py-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Secrets Detected
                </h4>
                <div className="space-y-1.5">
                  {secretFindings.map((finding) => (
                    <SecretFindingRow
                      key={finding.id}
                      finding={finding}
                      onMoveToEnv={() => handleMoveToEnv(finding)}
                      onDismiss={() => handleDismiss(finding.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Code quality findings */}
            {codeFindings.length > 0 && (
              <div className="border-b border-border px-4 py-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Code Quality Issues
                </h4>
                <div className="space-y-1.5">
                  {codeFindings.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      expanded={expandedFindings.has(finding.id)}
                      onToggle={() => toggleFinding(finding.id)}
                      onFix={() => handleFixFinding(finding)}
                      onDismiss={() => handleDismiss(finding.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All clear message */}
            {activeFindings.length === 0 && (
              <div className="px-4 py-8 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400" />
                <p className="mt-2 text-sm font-medium text-foreground">All clear!</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No security issues found in your project.
                </p>
              </div>
            )}

            {/* Last scan info */}
            {lastScanTime && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    <span>
                      Last scan:{" "}
                      {lastScanTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    <span>Duration: {scanDuration}s</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileSearch className="h-3 w-3" />
                    <span>{filesScanned} files scanned</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
