import { Package, KeyRound, Code2, Lock } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low";

export interface Finding {
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

export interface ScanResult {
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

export interface ScanResponse {
  scan: ScanResult | null;
  findings: Finding[];
  filesScanned?: number;
  duration?: number;
}

export interface ScanCategory {
  id: string;
  label: string;
  icon: typeof Package;
  status: "pass" | "warn" | "fail";
  summary: string;
  details: string;
}

export type ScanPhase =
  | "dependencies"
  | "secrets"
  | "code-quality"
  | "https"
  | "complete";

// ─── Constants ──────────────────────────────────────────────

export const SEVERITY_CONFIG: Record<
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

export const SCAN_PHASES: { phase: ScanPhase; label: string; duration: number }[] = [
  { phase: "dependencies", label: "Scanning dependencies...", duration: 1200 },
  { phase: "secrets", label: "Checking for secrets...", duration: 900 },
  { phase: "code-quality", label: "Analyzing code quality...", duration: 800 },
  { phase: "https", label: "Verifying HTTPS config...", duration: 600 },
  { phase: "complete", label: "Scan complete", duration: 0 },
];

// ─── Helpers ────────────────────────────────────────────────

export function getSeverityCount(findings: Finding[], severity: Severity): number {
  return findings.filter((f) => f.severity === severity && !f.dismissed).length;
}

export function computeScore(findings: Finding[]): number {
  const active = findings.filter((f) => !f.dismissed);
  let score = 100;
  score -= active.filter((f) => f.severity === "critical").length * 15;
  score -= active.filter((f) => f.severity === "high").length * 10;
  score -= active.filter((f) => f.severity === "medium").length * 5;
  score -= active.filter((f) => f.severity === "low").length * 2;
  return Math.max(0, Math.min(100, score));
}

export function buildCategories(findings: Finding[]): ScanCategory[] {
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
