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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat } from "../hooks/use-chat";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
}

type Severity = "critical" | "high" | "medium" | "low";

interface Vulnerability {
  id: string;
  package: string;
  version: string;
  severity: Severity;
  title: string;
  description: string;
  fixAvailable: boolean;
  patchedVersion?: string;
}

interface SecretFinding {
  id: string;
  type: string;
  pattern: string;
  filePath: string;
  line: number;
  preview: string;
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

// ─── Mock Data ──────────────────────────────────────────────

const MOCK_VULNERABILITIES: Vulnerability[] = [
  {
    id: "vuln-1",
    package: "lodash",
    version: "4.17.19",
    severity: "critical",
    title: "Prototype Pollution",
    description:
      "Versions before 4.17.21 are vulnerable to prototype pollution via the template function. An attacker can inject properties onto Object.prototype through crafted template strings.",
    fixAvailable: true,
    patchedVersion: "4.17.21",
  },
  {
    id: "vuln-2",
    package: "axios",
    version: "0.21.1",
    severity: "high",
    title: "Server-Side Request Forgery",
    description:
      "An attacker can bypass the proxy configuration and send requests to arbitrary URLs by using a relative URL that starts with two slashes.",
    fixAvailable: true,
    patchedVersion: "0.21.4",
  },
  {
    id: "vuln-3",
    package: "node-fetch",
    version: "2.6.1",
    severity: "medium",
    title: "Exposure of Sensitive Information",
    description:
      "node-fetch forwards secure HTTP headers to untrusted destinations when following a redirect from HTTPS to HTTP.",
    fixAvailable: true,
    patchedVersion: "2.6.7",
  },
  {
    id: "vuln-4",
    package: "minimist",
    version: "1.2.5",
    severity: "low",
    title: "Prototype Pollution",
    description:
      "Minimist <=1.2.5 is vulnerable to prototype pollution when passing an object as the opts argument.",
    fixAvailable: true,
    patchedVersion: "1.2.6",
  },
  {
    id: "vuln-5",
    package: "jsonwebtoken",
    version: "8.5.1",
    severity: "high",
    title: "Unrestricted Key Type",
    description:
      "Versions before 9.0.0 could be tricked into interpreting insecure key types, allowing attackers to forge tokens with algorithms not intended by the developer.",
    fixAvailable: true,
    patchedVersion: "9.0.0",
  },
];

const MOCK_SECRETS: SecretFinding[] = [
  {
    id: "secret-1",
    type: "API Key",
    pattern: "STRIPE_SECRET_KEY",
    filePath: "src/lib/payments.ts",
    line: 12,
    preview: 'const key = "sk_live_51Hx...redacted";',
  },
  {
    id: "secret-2",
    type: "Database URL",
    pattern: "DATABASE_URL",
    filePath: "src/config/db.ts",
    line: 5,
    preview: 'const dbUrl = "postgresql://user:pass@host:5432/db";',
  },
  {
    id: "secret-3",
    type: "JWT Secret",
    pattern: "JWT_SECRET",
    filePath: "src/auth/token.ts",
    line: 3,
    preview: 'const secret = "my-super-secret-jwt-key-2024";',
  },
];

const MOCK_CATEGORIES: ScanCategory[] = [
  {
    id: "dependencies",
    label: "Dependencies",
    icon: Package,
    status: "fail",
    summary: "5 vulnerabilities found",
    details: "1 critical, 2 high, 1 medium, 1 low",
  },
  {
    id: "secrets",
    label: "Secrets Detection",
    icon: KeyRound,
    status: "fail",
    summary: "3 hardcoded secrets found",
    details: "API keys, database URLs, and JWT secrets detected in source code",
  },
  {
    id: "code-quality",
    label: "Code Quality",
    icon: Code2,
    status: "warn",
    summary: "TypeScript strict mode disabled",
    details:
      "2 unused variables, 1 any type usage, strict mode not enabled in tsconfig",
  },
  {
    id: "https",
    label: "HTTPS / SSL",
    icon: Lock,
    status: "pass",
    summary: "All endpoints use HTTPS",
    details: "SSL/TLS properly configured, HSTS headers present",
  },
];

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

function getSeverityCount(
  vulns: Vulnerability[],
  severity: Severity
): number {
  return vulns.filter((v) => v.severity === severity).length;
}

function computeScore(
  vulns: Vulnerability[],
  secrets: SecretFinding[],
  categories: ScanCategory[]
): number {
  let score = 100;
  // Deduct for vulnerabilities
  score -= getSeverityCount(vulns, "critical") * 15;
  score -= getSeverityCount(vulns, "high") * 10;
  score -= getSeverityCount(vulns, "medium") * 5;
  score -= getSeverityCount(vulns, "low") * 2;
  // Deduct for secrets
  score -= secrets.length * 8;
  // Deduct for warnings
  const warnings = categories.filter((c) => c.status === "warn").length;
  score -= warnings * 5;
  return Math.max(0, Math.min(100, score));
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
  const [expandedVulns, setExpandedVulns] = useState<Set<string>>(new Set());
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [scanDuration, setScanDuration] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { sendMessage } = useChat(projectId);

  const score = hasScanned
    ? computeScore(MOCK_VULNERABILITIES, MOCK_SECRETS, MOCK_CATEGORIES)
    : 0;

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

  // ─── Scan animation ─────────────────────────────────────

  const runScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setScanPhase("dependencies");

    const startTime = Date.now();
    let phaseIndex = 0;
    let elapsed = 0;
    const totalDuration = SCAN_PHASES.reduce((s, p) => s + p.duration, 0);

    const advancePhase = () => {
      if (phaseIndex >= SCAN_PHASES.length - 1) {
        setIsScanning(false);
        setHasScanned(true);
        setScanPhase("complete");
        setScanProgress(100);
        setLastScanTime(new Date());
        setScanDuration(Math.round((Date.now() - startTime) / 1000));
        return;
      }

      const currentPhase = SCAN_PHASES[phaseIndex]!;
      setScanPhase(currentPhase.phase);
      elapsed += currentPhase.duration;
      const pct = Math.round((elapsed / totalDuration) * 100);
      setScanProgress(Math.min(pct, 99));

      phaseIndex++;
      setTimeout(advancePhase, currentPhase.duration);
    };

    advancePhase();
  }, []);

  const toggleVuln = useCallback((id: string) => {
    setExpandedVulns((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFixVuln = useCallback(
    (vuln: Vulnerability) => {
      void sendMessage(
        `Fix vulnerability in ${vuln.package}@${vuln.version}: ${vuln.title}. ` +
          `Update to ${vuln.patchedVersion ?? "latest"} and verify no breaking changes.`
      );
    },
    [sendMessage]
  );

  const handleMoveToEnv = useCallback(
    (secret: SecretFinding) => {
      void sendMessage(
        `Move the hardcoded ${secret.type} (${secret.pattern}) found in ${secret.filePath}:${secret.line} ` +
          `to environment variables. Update the code to read from process.env and add the variable name to .env.example.`
      );
    },
    [sendMessage]
  );

  // ─── Render ─────────────────────────────────────────────

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

        {/* Empty state - before first scan */}
        {!hasScanned && !isScanning && (
          <EmptyState onRunScan={runScan} />
        )}

        {/* Results */}
        {hasScanned && !isScanning && (
          <div className="space-y-0">
            {/* Score */}
            <SecurityScore score={score} scoreColor={scoreColor} trackColor={scoreTrackColor} />

            {/* Category cards */}
            <div className="border-b border-border px-4 py-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Scan Results
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {MOCK_CATEGORIES.map((cat) => (
                  <CategoryCard key={cat.id} category={cat} />
                ))}
              </div>
            </div>

            {/* Vulnerability list */}
            <div className="border-b border-border px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vulnerabilities
                </h4>
                <div className="flex items-center gap-1.5">
                  <SeverityPill severity="critical" count={getSeverityCount(MOCK_VULNERABILITIES, "critical")} />
                  <SeverityPill severity="high" count={getSeverityCount(MOCK_VULNERABILITIES, "high")} />
                  <SeverityPill severity="medium" count={getSeverityCount(MOCK_VULNERABILITIES, "medium")} />
                  <SeverityPill severity="low" count={getSeverityCount(MOCK_VULNERABILITIES, "low")} />
                </div>
              </div>
              <div className="space-y-1.5">
                {MOCK_VULNERABILITIES.map((vuln) => (
                  <VulnerabilityRow
                    key={vuln.id}
                    vuln={vuln}
                    expanded={expandedVulns.has(vuln.id)}
                    onToggle={() => toggleVuln(vuln.id)}
                    onFix={() => handleFixVuln(vuln)}
                  />
                ))}
              </div>
            </div>

            {/* Secrets scanner */}
            <div className="border-b border-border px-4 py-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Secrets Detected
              </h4>
              <div className="space-y-1.5">
                {MOCK_SECRETS.map((secret) => (
                  <SecretRow
                    key={secret.id}
                    secret={secret}
                    onMoveToEnv={() => handleMoveToEnv(secret)}
                  />
                ))}
              </div>
            </div>

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
                    <span>47 files scanned</span>
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

function VulnerabilityRow({
  vuln,
  expanded,
  onToggle,
  onFix,
}: {
  vuln: Vulnerability;
  expanded: boolean;
  onToggle: () => void;
  onFix: () => void;
}) {
  const config = SEVERITY_CONFIG[vuln.severity];
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
          {vuln.package}
          <span className="ml-1 font-normal text-muted-foreground">
            @{vuln.version}
          </span>
        </span>
        {vuln.fixAvailable && (
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onFix();
            }}
            className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <Sparkles className="h-2.5 w-2.5" />
            Fix
          </button>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2.5">
          <p className="text-xs font-medium text-foreground">{vuln.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {vuln.description}
          </p>
          {vuln.patchedVersion && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              <ArrowUpRight className="h-3 w-3 text-emerald-400" />
              <span className="text-muted-foreground">Patched in</span>
              <span className="font-mono font-medium text-emerald-400">
                {vuln.patchedVersion}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SecretRow({
  secret,
  onMoveToEnv,
}: {
  secret: SecretFinding;
  onMoveToEnv: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 flex-none text-red-400" />
          <div>
            <span className="text-xs font-medium text-foreground">
              {secret.type}
            </span>
            <span className="ml-1.5 text-[11px] text-muted-foreground">
              {secret.pattern}
            </span>
          </div>
        </div>
        <button
          onClick={onMoveToEnv}
          className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Move to .env
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <FileSearch className="h-3 w-3" />
        <span className="font-mono">
          {secret.filePath}:{secret.line}
        </span>
      </div>
      <div className="mt-1.5 rounded bg-muted/50 px-2 py-1.5">
        <code className="text-[10px] text-red-400/80">{secret.preview}</code>
      </div>
    </div>
  );
}
