import { FileCode2, FileText, Image } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

export type AuditPhase =
  | "idle"
  | "loading-page"
  | "analyzing-performance"
  | "checking-accessibility"
  | "generating-report"
  | "done";

export type Rating = "good" | "needs-improvement" | "poor";

export interface WebVital {
  name: string;
  shortName: string;
  value: number;
  unit: string;
  target: string;
  rating: Rating;
}

export interface AdditionalMetric {
  name: string;
  value: number;
  unit: string;
  maxValue: number;
  rating: Rating;
}

export interface BundleFile {
  name: string;
  size: number;
  type: "js" | "css" | "html" | "image" | "font" | "other";
}

export interface BundleBreakdown {
  js: number;
  css: number;
  html: number;
  images: number;
  fonts: number;
  other: number;
  total: number;
  files: BundleFile[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  savings: string;
  fixPrompt: string;
}

export interface AuditResults {
  score: number;
  webVitals: WebVital[];
  additionalMetrics: AdditionalMetric[];
  bundle: BundleBreakdown;
  recommendations: Recommendation[];
}

// ─── Phase Labels ───────────────────────────────────────────

export const PHASE_LABELS: Record<AuditPhase, string> = {
  idle: "",
  "loading-page": "Loading page...",
  "analyzing-performance": "Analyzing performance...",
  "checking-accessibility": "Checking accessibility...",
  "generating-report": "Generating report...",
  done: "",
};

export const PHASE_ORDER: AuditPhase[] = [
  "loading-page",
  "analyzing-performance",
  "checking-accessibility",
  "generating-report",
];

// ─── Helpers ────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 90) return "#0cce6b";
  if (score >= 50) return "#ffa400";
  return "#ff4e42";
}

export function ratingColor(rating: Rating): string {
  switch (rating) {
    case "good":
      return "#0cce6b";
    case "needs-improvement":
      return "#ffa400";
    case "poor":
      return "#ff4e42";
  }
}

export function ratingLabel(rating: Rating): string {
  switch (rating) {
    case "good":
      return "Good";
    case "needs-improvement":
      return "Needs Improvement";
    case "poor":
      return "Poor";
  }
}

export function ratingBg(rating: Rating): string {
  switch (rating) {
    case "good":
      return "bg-emerald-500/10";
    case "needs-improvement":
      return "bg-amber-500/10";
    case "poor":
      return "bg-red-500/10";
  }
}

export function impactColor(impact: "high" | "medium" | "low"): string {
  switch (impact) {
    case "high":
      return "text-red-400 bg-red-500/10 border-red-500/20";
    case "medium":
      return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "low":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  }
}

export function bundleTypeColor(type: string): string {
  switch (type) {
    case "js":
      return "#f7df1e";
    case "css":
      return "#264de4";
    case "html":
      return "#e34c26";
    case "images":
    case "image":
      return "#0cce6b";
    case "fonts":
    case "font":
      return "#a855f7";
    default:
      return "#6b7280";
  }
}

export function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export function fileIcon(type: string) {
  switch (type) {
    case "js":
      return FileCode2;
    case "css":
      return FileCode2;
    case "html":
      return FileText;
    case "image":
      return Image;
    case "font":
      return FileText;
    default:
      return FileText;
  }
}

export const FILE_ICON_COLORS: Record<string, string> = {
  js: "text-yellow-400",
  css: "text-blue-400",
  html: "text-orange-400",
  image: "text-emerald-400",
  font: "text-brand-400",
};
