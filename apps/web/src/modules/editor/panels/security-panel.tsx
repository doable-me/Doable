"use client";

import { useState, useCallback, useRef } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  Play,
  Package,
  KeyRound,
  Code2,
  Lock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Clock,
  FileSearch,
  Sparkles,
  ExternalLink,
  ArrowUpRight,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useChat } from "../hooks/use-chat";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
}

type Severity = "critical" | "high" | "medium" | "low";

interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  description: string | null;
  filePath: string | null;
  lineNumber: number | null;
  codeSnippet: string | null;
  fixSuggestion: string | null;
  dismissed: boolean;
  createdAt: string;
}

interface ScanResult {
  id: string;
  projectId: string;
  scanType?: string;
  status: string;
  findingsCount: number;
  filesScanned?: number;
  duration?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

interface ScanResponse {
  scan: ScanResult | null;
  findings: Finding[];
  filesScanned?: number;
  duration?: number;
}

interface ScanCategory {
  id: string;
  label: string;
  icon: typeof Package;
  status: "pass" | "warn" | "fail";
  summary: string;
  details: string;
}

type ScanPhase =
  | "dependencies"
  | "secrets"
  | "code-quality"
  | "https"
  | "complete";

// ─── Helpers ────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
  Severity,
  { color: string; bg: string; border: string; label: string }
> = {
  critical: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "CRITICAL",
  },
  high: {
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    label: "HIGH",
  },
  medium: {
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    label: "MEDIUM",
  },
  low: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    label: "LOW",
  },
};

function getSeverityCount(findings: Finding[], severity: Severity): number {
  return findings.filter((f) => f.severity === severity && !f.dismissed).length;
}

function computeScore(findings: Finding[]): number {
  const active = findings.filter((f) => !f.dismissed);
  let score = 100;
  score -= active.filter((f) => f.severity === "critical").length * 15;
  score -= active.filter((f) => f.severity === "high").length * 10;
  score -= active.filter((f) => f.severity === "medium").length * 5;
  score -= active.filter((f) => f.severity === "low").length * 2;
  return Math.max(0, Math.min(100, score));
}

function buildCategories(findings: Finding[]): ScanCategory[] {
  const active = findings.filter((f) => !f.dismissed);
  const deps = active.filter((f) => f.category === "dependency");
  const secrets = active.filter((f) => f.category === "secret");
  const codeQuality = active.filter((f) => f.category === "code-quality");

  return [
    {
      id: "dependencies",
      label: "Dependencies",
      icon: Package,
      status: deps.some((f) => f.severity === "critical" || f.severity === "high")
        ? "fail"
        : deps.length > 0
          ? "warn"
          : "pass",
      summary: deps.length > 0
        ? `${deps.length} ${deps.length === 1 ? "vulnerability" : "vulnerabilities"} found`
        : "No vulnerabilities found",
      details: deps.length > 0
        ? [
            getSeverityCount(findings, "critical") > 0 && `${getSeverityCount(findings, "critical")} critical`,
            getSeverityCount(findings, "high") > 0 && `${getSeverityCount(findings, "high")} high`,
            getSeverityCount(findings, "medium") > 0 && `${getSeverityCount(findings, "medium")} medium`,
            getSeverityCount(findings, "low") > 0 && `${getSeverityCount(findings, "low")} low`,
          ].filter(Boolean).join(", ")
        : "All dependencies are up to date",
    },
    {
      id: "secrets",
      label: "Secrets Detection",
      icon: KeyRound,
      status: secrets.length > 0 ? "fail" : "pass",
      summary: secrets.length > 0
        ? `${secrets.length} hardcoded ${secrets.length === 1 ? "secret" : "secrets"} found`
        : "No hardcoded secrets found",
      details: secrets.length > 0
        ? "API keys, passwords, or tokens detected in source code"
        : "No sensitive data found in source files",
    },
    {
      id: "code-quality",
      label: "Code Quality",
      icon: Code2,
      status: codeQuality.some((f) => f.severity === "high" || f.severity === "critical")
        ? "fail"
        : codeQuality.length > 0
          ? "warn"
          : "pass",
      summary: codeQuality.length > 0
        ? `${codeQuality.length} ${codeQuality.length === 1 ? "issue" : "issues"} found`
        : "No security anti-patterns found",
      details: codeQuality.length > 0
        ? "Review code for eval(), innerHTML, SQL injection, and other patterns"
        : "Code follows security best practices",
    },
    {
      id: "https",
      label: "HTTPS / SSL",
      icon: Lock,
      status: active.some((f) => f.title.includes("Insecure HTTP"))
        ? "warn"
        : "pass",
      summary: active.some((f) => f.title.includes("Insecure HTTP"))
        ? "Non-HTTPS URLs detected"
        : "All endpoints use HTTPS",
      details: active.some((f) => f.title.includes("Insecure HTTP"))
        ? "Some URLs use http:// instead of https://"
        : "SSL/TLS properly configured",
    },
  ];
}

const SCAN_PHASES: { phase: ScanPhase; label: string; duration: number }[] = [
  { phase: "dependencies", label: "Scanning dependencies...", duration: 1200 },
  { phase: "secrets", label: "Checking for secrets...", duration: 900 },
  { phase: "code-quality", label: "Analyzing code quality...", duration: 800 },
  { phase: "https", label: "Verifying HTTPS config...", duration: 600 },
  { phase: "complete", label: "Scan complete", duration: 0 },
];

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

// ─── Sub-components ─────────────────────────────────────────

function EmptyState({ onRunScan }: { onRunScan: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
        <ShieldCheck className="h-7 w-7 text-blue-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">
        Security Scanner
      </h3>
      <p className="mt-1.5 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
        Scan your project for dependency vulnerabilities, hardcoded secrets, code
        quality issues, and HTTPS configuration.
      </p>
      <button
        onClick={onRunScan}
        className="mt-5 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Play className="h-3.5 w-3.5" />
        Run Security Scan
      </button>
    </div>
  );
}

function ScanAnimation({
  phase,
  progress,
}: {
  phase: ScanPhase | null;
  progress: number;
}) {
  const phaseLabel =
    SCAN_PHASES.find((p) => p.phase === phase)?.label ?? "Initializing...";

  return (
    <div className="flex flex-col items-center py-8">
      {/* Animated shield */}
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldAlert className="h-8 w-8 animate-pulse text-primary" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{phaseLabel}</span>
          <span className="font-mono text-foreground">{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase checklist */}
      <div className="mt-6 space-y-2">
        {SCAN_PHASES.slice(0, -1).map((p) => {
          const current = SCAN_PHASES.findIndex((sp) => sp.phase === phase);
          const idx = SCAN_PHASES.findIndex((sp) => sp.phase === p.phase);
          const isDone = idx < current;
          const isActive = idx === current;

          return (
            <div
              key={p.phase}
              className={cn(
                "flex items-center gap-2 text-xs transition-opacity",
                isDone
                  ? "text-emerald-400"
                  : isActive
                    ? "text-foreground"
                    : "text-muted-foreground/40"
              )}
            >
              {isDone ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : isActive ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
              )}
              {p.label.replace("...", "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SecurityScore({
  score,
  scoreColor,
  trackColor,
}: {
  score: number;
  scoreColor: string;
  trackColor: string;
}) {
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center border-b border-border px-4 py-6">
      {/* SVG circular progress */}
      <div className="relative h-32 w-32">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          {/* Background track */}
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted/50"
          />
          {/* Progress arc */}
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={trackColor}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-bold tabular-nums", scoreColor)}>
            {score}
          </span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Your project security score
      </p>
    </div>
  );
}

function CategoryCard({ category }: { category: ScanCategory }) {
  const Icon = category.icon;
  const statusConfig = {
    pass: {
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      icon: ShieldCheck,
    },
    warn: {
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      icon: AlertTriangle,
    },
    fail: {
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      icon: ShieldAlert,
    },
  };

  const config = statusConfig[category.status];
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        config.border,
        config.bg
      )}
    >
      <div className="flex items-start justify-between">
        <Icon className={cn("h-4 w-4", config.color)} />
        <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
      </div>
      <p className="mt-2 text-xs font-medium text-foreground">
        {category.label}
      </p>
      <p className={cn("mt-0.5 text-[11px]", config.color)}>
        {category.summary}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        {category.details}
      </p>
    </div>
  );
}

function SeverityPill({
  severity,
  count,
}: {
  severity: Severity;
  count: number;
}) {
  if (count === 0) return null;
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        config.bg,
        config.color
      )}
    >
      {count} {config.label}
    </span>
  );
}

function FindingRow({
  finding,
  expanded,
  onToggle,
  onFix,
  onDismiss,
}: {
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
  onFix: () => void;
  onDismiss: () => void;
}) {
  const config = SEVERITY_CONFIG[finding.severity];
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        config.border,
        "bg-muted/20"
      )}
    >
      {/* Row header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Chevron className="h-3 w-3 flex-none text-muted-foreground" />
        <span
          className={cn(
            "inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
            config.bg,
            config.color
          )}
        >
          {config.label}
        </span>
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {finding.title}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {finding.fixSuggestion && (
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onFix();
              }}
              className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Sparkles className="h-2.5 w-2.5" />
              Fix
            </button>
          )}
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <EyeOff className="h-2.5 w-2.5" />
          </button>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2.5">
          {finding.description && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {finding.description}
            </p>
          )}
          {finding.filePath && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              <FileSearch className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-muted-foreground">
                {finding.filePath}
                {finding.lineNumber ? `:${finding.lineNumber}` : ""}
              </span>
            </div>
          )}
          {finding.codeSnippet && (
            <div className="mt-1.5 rounded bg-muted/50 px-2 py-1.5">
              <code className="text-[10px] text-foreground/80">{finding.codeSnippet}</code>
            </div>
          )}
          {finding.fixSuggestion && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
              <span className="text-muted-foreground">{finding.fixSuggestion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SecretFindingRow({
  finding,
  onMoveToEnv,
  onDismiss,
}: {
  finding: Finding;
  onMoveToEnv: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 flex-none text-red-400" />
          <div>
            <span className="text-xs font-medium text-foreground">
              {finding.title}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveToEnv}
            className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            Move to .env
          </button>
          <button
            onClick={onDismiss}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <EyeOff className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      {finding.filePath && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileSearch className="h-3 w-3" />
          <span className="font-mono">
            {finding.filePath}
            {finding.lineNumber ? `:${finding.lineNumber}` : ""}
          </span>
        </div>
      )}
      {finding.codeSnippet && (
        <div className="mt-1.5 rounded bg-muted/50 px-2 py-1.5">
          <code className="text-[10px] text-red-400/80">{finding.codeSnippet}</code>
        </div>
      )}
    </div>
  );
}
