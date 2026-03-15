"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Play,
  ChevronDown,
  ChevronRight,
  Zap,
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Image,
  FileText,
  Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
  onSendMessage: (message: string) => void;
}

type AuditPhase =
  | "idle"
  | "loading-page"
  | "analyzing-performance"
  | "checking-accessibility"
  | "generating-report"
  | "done";

type Rating = "good" | "needs-improvement" | "poor";

interface WebVital {
  name: string;
  shortName: string;
  value: number;
  unit: string;
  target: string;
  rating: Rating;
}

interface AdditionalMetric {
  name: string;
  value: number;
  unit: string;
  maxValue: number;
  rating: Rating;
}

interface BundleFile {
  name: string;
  size: number;
  type: "js" | "css" | "html" | "image" | "font" | "other";
}

interface BundleBreakdown {
  js: number;
  css: number;
  html: number;
  images: number;
  fonts: number;
  other: number;
  total: number;
  files: BundleFile[];
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  savings: string;
  fixPrompt: string;
}

interface AuditResults {
  score: number;
  webVitals: WebVital[];
  additionalMetrics: AdditionalMetric[];
  bundle: BundleBreakdown;
  recommendations: Recommendation[];
}

// ─── Mock Data ──────────────────────────────────────────────

const MOCK_RESULTS: AuditResults = {
  score: 74,
  webVitals: [
    {
      name: "Largest Contentful Paint",
      shortName: "LCP",
      value: 2.1,
      unit: "s",
      target: "< 2.5s",
      rating: "good",
    },
    {
      name: "First Input Delay",
      shortName: "FID",
      value: 45,
      unit: "ms",
      target: "< 100ms",
      rating: "good",
    },
    {
      name: "Cumulative Layout Shift",
      shortName: "CLS",
      value: 0.14,
      unit: "",
      target: "< 0.1",
      rating: "needs-improvement",
    },
  ],
  additionalMetrics: [
    { name: "First Contentful Paint", value: 1.2, unit: "s", maxValue: 4, rating: "good" },
    { name: "Time to Interactive", value: 3.8, unit: "s", maxValue: 8, rating: "needs-improvement" },
    { name: "Total Blocking Time", value: 280, unit: "ms", maxValue: 600, rating: "needs-improvement" },
    { name: "Speed Index", value: 2.4, unit: "s", maxValue: 6, rating: "good" },
  ],
  bundle: {
    js: 245,
    css: 38,
    html: 12,
    images: 184,
    fonts: 62,
    other: 8,
    total: 549,
    files: [
      { name: "vendor.bundle.js", size: 142, type: "js" },
      { name: "hero-banner.webp", size: 98, type: "image" },
      { name: "app.bundle.js", size: 78, type: "js" },
      { name: "product-gallery.jpg", size: 86, type: "image" },
      { name: "inter-var.woff2", size: 62, type: "font" },
      { name: "styles.css", size: 38, type: "css" },
      { name: "app.bundle.js.map", size: 25, type: "js" },
      { name: "index.html", size: 12, type: "html" },
    ],
  },
  recommendations: [
    {
      id: "unused-css",
      title: "Remove unused CSS",
      description:
        "Over 62% of CSS rules are unused on the initial page load. Removing dead CSS can reduce the stylesheet size by approximately 24 KB.",
      impact: "high",
      savings: "~24 KB",
      fixPrompt:
        "Audit all CSS files and remove unused rules. Use PurgeCSS or Tailwind's purge config to tree-shake unused styles. Keep only styles actually referenced in the rendered components.",
    },
    {
      id: "optimize-images",
      title: "Optimize images",
      description:
        "Several images are served in uncompressed formats or at excessive resolutions. Converting to WebP and resizing could save significant bandwidth.",
      impact: "high",
      savings: "~120 KB",
      fixPrompt:
        "Convert all JPEG and PNG images to WebP format. Add width and height attributes to all <img> tags. Use responsive srcset for images wider than 800px. Compress all images to quality 80.",
    },
    {
      id: "code-splitting",
      title: "Enable code splitting",
      description:
        "The main JavaScript bundle includes code for routes that are not needed on the initial page load. Lazy loading these routes can improve Time to Interactive.",
      impact: "medium",
      savings: "~45 KB initial",
      fixPrompt:
        "Add code splitting using React.lazy() and Suspense for route-level components. The About and Contact page components should be lazy-loaded since they are not needed on the initial page.",
    },
    {
      id: "preload-fonts",
      title: "Preload key fonts",
      description:
        "Web fonts are discovered late in the rendering pipeline, causing a flash of unstyled text (FOUT). Preloading the primary font can eliminate this delay.",
      impact: "low",
      savings: "~200ms FCP",
      fixPrompt:
        'Add <link rel="preload" as="font" type="font/woff2" crossorigin> for the primary Inter font in the HTML head. This will start the font download earlier and reduce FOUT.',
    },
    {
      id: "reduce-layout-shift",
      title: "Fix layout shifts",
      description:
        "Images and dynamically injected content cause layout shifts during page load. Setting explicit dimensions and using CSS aspect-ratio can eliminate CLS.",
      impact: "medium",
      savings: "CLS to < 0.05",
      fixPrompt:
        "Add explicit width and height attributes to all <img> elements. Use CSS aspect-ratio for media containers. Ensure any dynamically loaded content has reserved space using min-height or skeleton placeholders.",
    },
  ],
};

// ─── Audit Phase Labels ─────────────────────────────────────

const PHASE_LABELS: Record<AuditPhase, string> = {
  idle: "",
  "loading-page": "Loading page...",
  "analyzing-performance": "Analyzing performance...",
  "checking-accessibility": "Checking accessibility...",
  "generating-report": "Generating report...",
  done: "",
};

const PHASE_ORDER: AuditPhase[] = [
  "loading-page",
  "analyzing-performance",
  "checking-accessibility",
  "generating-report",
];

// ─── Helpers ────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return "#0cce6b";
  if (score >= 50) return "#ffa400";
  return "#ff4e42";
}

function ratingColor(rating: Rating): string {
  switch (rating) {
    case "good":
      return "#0cce6b";
    case "needs-improvement":
      return "#ffa400";
    case "poor":
      return "#ff4e42";
  }
}

function ratingLabel(rating: Rating): string {
  switch (rating) {
    case "good":
      return "Good";
    case "needs-improvement":
      return "Needs Improvement";
    case "poor":
      return "Poor";
  }
}

function ratingBg(rating: Rating): string {
  switch (rating) {
    case "good":
      return "bg-emerald-500/10";
    case "needs-improvement":
      return "bg-amber-500/10";
    case "poor":
      return "bg-red-500/10";
  }
}

function impactColor(impact: "high" | "medium" | "low"): string {
  switch (impact) {
    case "high":
      return "text-red-400 bg-red-500/10 border-red-500/20";
    case "medium":
      return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "low":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  }
}

function bundleTypeColor(type: string): string {
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

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function fileIcon(type: string) {
  switch (type) {
    case "js":
      return <FileCode2 className="h-3.5 w-3.5 text-yellow-400" />;
    case "css":
      return <FileCode2 className="h-3.5 w-3.5 text-blue-400" />;
    case "html":
      return <FileText className="h-3.5 w-3.5 text-orange-400" />;
    case "image":
      return <Image className="h-3.5 w-3.5 text-emerald-400" />;
    case "font":
      return <FileText className="h-3.5 w-3.5 text-purple-400" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-zinc-400" />;
  }
}

// ─── Circular Gauge Component ───────────────────────────────

function CircularGauge({
  score,
  size = 160,
  strokeWidth = 10,
  animated = false,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  animated?: boolean;
}) {
  const [displayScore, setDisplayScore] = useState(animated ? 0 : score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayScore / 100) * circumference;
  const color = scoreColor(displayScore);

  useEffect(() => {
    if (!animated) {
      setDisplayScore(score);
      return;
    }
    let frame: number;
    let start: number | null = null;
    const duration = 1200;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(eased * score));
      if (t < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score, animated]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: animated ? "none" : "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ color }}
        >
          {displayScore}
        </span>
        <span className="text-[11px] text-zinc-500 mt-0.5">Performance</span>
      </div>
    </div>
  );
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
    <div className="flex h-full flex-col bg-[#1C1C1C] text-zinc-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Zap className="h-4.5 w-4.5 text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Speed</h2>
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
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
            <h3 className="text-sm font-medium text-zinc-300 mb-1">
              Performance Audit
            </h3>
            <p className="text-[13px] text-zinc-600 max-w-[300px] mb-5">
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
              <div className="h-24 w-24 rounded-full border-4 border-zinc-800">
                <div
                  className="h-full w-full rounded-full animate-spin"
                  style={{
                    background: `conic-gradient(#1E52F1 ${phaseProgress}%, transparent ${phaseProgress}%)`,
                    animationDuration: "2s",
                  }}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-[88px] w-[88px] rounded-full bg-[#1C1C1C] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#1E52F1]" />
                </div>
              </div>
            </div>

            {/* Phase label */}
            <p className="text-sm font-medium text-zinc-300 mb-2">
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
                            : "bg-zinc-700"
                      }`}
                    />
                    <span
                      className={`text-xs transition-colors ${
                        isDone
                          ? "text-zinc-400"
                          : isCurrent
                            ? "text-zinc-200"
                            : "text-zinc-600"
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
            <div className="w-64 mt-4 h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#1E52F1] transition-all duration-500"
                style={{ width: `${phaseProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Results */}
        {results && phase === "done" && (
          <div className="p-4 space-y-6">
            {/* ── Performance Score ─────────────────────── */}
            <div className="flex flex-col items-center py-4">
              <CircularGauge score={results.score} animated />
              <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  90-100
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  50-89
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  0-49
                </span>
              </div>
            </div>

            {/* ── Core Web Vitals ──────────────────────── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Core Web Vitals
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {results.webVitals.map((vital: WebVital) => (
                  <div
                    key={vital.shortName}
                    className={`rounded-lg border border-zinc-800/60 p-3 ${ratingBg(vital.rating)}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-300">
                          {vital.shortName}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {vital.name}
                        </span>
                      </div>
                      <span
                        className="text-[11px] font-medium rounded-full px-2 py-0.5"
                        style={{
                          color: ratingColor(vital.rating),
                          backgroundColor: `${ratingColor(vital.rating)}15`,
                        }}
                      >
                        {ratingLabel(vital.rating)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-xl font-bold tabular-nums"
                        style={{ color: ratingColor(vital.rating) }}
                      >
                        {vital.value}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {vital.unit}
                      </span>
                      <span className="text-[10px] text-zinc-600 ml-auto">
                        Target: {vital.target}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Additional Metrics ──────────────────── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Additional Metrics
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {results.additionalMetrics.map((metric: AdditionalMetric) => {
                  const pct = Math.min(
                    (metric.value / metric.maxValue) * 100,
                    100
                  );
                  return (
                    <div
                      key={metric.name}
                      className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3"
                    >
                      <div className="text-[11px] text-zinc-500 mb-1.5 truncate">
                        {metric.name}
                      </div>
                      <div className="flex items-baseline gap-1 mb-2">
                        <span
                          className="text-lg font-bold tabular-nums"
                          style={{ color: ratingColor(metric.rating) }}
                        >
                          {metric.value}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {metric.unit}
                        </span>
                      </div>
                      {/* Bar indicator */}
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: ratingColor(metric.rating),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Bundle Analysis ─────────────────────── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Bundle Analysis
              </h3>

              {/* Total size */}
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] text-zinc-500">
                    Total Bundle Size
                  </span>
                  <span className="text-sm font-bold text-zinc-200">
                    {formatSize(results.bundle.total)}
                  </span>
                </div>

                {/* Colored segment bar */}
                <div className="h-3 rounded-full overflow-hidden flex">
                  {(
                    [
                      { key: "js", label: "JS", value: results.bundle.js },
                      { key: "css", label: "CSS", value: results.bundle.css },
                      { key: "html", label: "HTML", value: results.bundle.html },
                      { key: "images", label: "Images", value: results.bundle.images },
                      { key: "fonts", label: "Fonts", value: results.bundle.fonts },
                      { key: "other", label: "Other", value: results.bundle.other },
                    ] as const
                  ).map((seg) => {
                    const pct = (seg.value / results.bundle.total) * 100;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={seg.key}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: bundleTypeColor(seg.key),
                        }}
                        title={`${seg.label}: ${formatSize(seg.value)}`}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-2.5">
                  {(
                    [
                      { key: "js", label: "JS", value: results.bundle.js },
                      { key: "css", label: "CSS", value: results.bundle.css },
                      { key: "html", label: "HTML", value: results.bundle.html },
                      { key: "images", label: "Images", value: results.bundle.images },
                      { key: "fonts", label: "Fonts", value: results.bundle.fonts },
                      { key: "other", label: "Other", value: results.bundle.other },
                    ] as const
                  ).map((seg) => (
                    <div key={seg.key} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: bundleTypeColor(seg.key) }}
                      />
                      <span className="text-[10px] text-zinc-400">
                        {seg.label}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {formatSize(seg.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Largest files */}
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-zinc-800/60">
                  <span className="text-[11px] font-medium text-zinc-400">
                    Largest Files
                  </span>
                </div>
                <div className="divide-y divide-zinc-800/40">
                  {results.bundle.files
                    .sort((a: BundleFile, b: BundleFile) => b.size - a.size)
                    .slice(0, 6)
                    .map((file: BundleFile) => (
                      <div
                        key={file.name}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800/30 transition-colors"
                      >
                        {fileIcon(file.type)}
                        <span className="text-[12px] text-zinc-300 flex-1 truncate">
                          {file.name}
                        </span>
                        <span className="text-[11px] text-zinc-500 tabular-nums flex-shrink-0">
                          {formatSize(file.size)}
                        </span>
                        {/* Size bar */}
                        <div className="w-16 h-1 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(file.size / results.bundle.files[0]!.size) * 100}%`,
                              backgroundColor: bundleTypeColor(file.type),
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Tree-shaking suggestion */}
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-medium text-amber-300">
                    Tree-shaking opportunity
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    The vendor bundle contains unused exports from large
                    libraries. Consider importing only the specific modules you
                    need (e.g.{" "}
                    <code className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-amber-300">
                      import {"{"} debounce {"}"} from &apos;lodash/debounce&apos;
                    </code>{" "}
                    instead of importing the entire library).
                  </p>
                </div>
              </div>
            </section>

            {/* ── Recommendations ─────────────────────── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Recommendations
              </h3>
              <div className="space-y-2">
                {results.recommendations.map((rec: Recommendation) => {
                  const isExpanded = expandedRecs.has(rec.id);
                  return (
                    <div
                      key={rec.id}
                      className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 overflow-hidden"
                    >
                      {/* Collapsed header */}
                      <button
                        onClick={() => toggleRec(rec.id)}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-zinc-800/30 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                        )}
                        <span className="text-[12px] font-medium text-zinc-200 flex-1">
                          {rec.title}
                        </span>
                        <span
                          className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${impactColor(rec.impact)}`}
                        >
                          {rec.impact} impact
                        </span>
                        <span className="text-[10px] text-zinc-500 tabular-nums flex-shrink-0">
                          {rec.savings}
                        </span>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t border-zinc-800/40">
                          <p className="text-[12px] text-zinc-400 leading-relaxed mt-2.5 mb-3">
                            {rec.description}
                          </p>
                          <button
                            onClick={() => onSendMessage(rec.fixPrompt)}
                            className="flex items-center gap-1.5 rounded-md bg-purple-600/20 border border-purple-500/30 px-3 py-1.5 text-[11px] font-medium text-purple-300 hover:bg-purple-600/30 transition-colors"
                          >
                            <Zap className="h-3 w-3" />
                            Fix with AI
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Footer note */}
            <div className="text-center pb-2">
              <p className="text-[10px] text-zinc-700">
                Simulated audit results. Real Lighthouse integration coming soon.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
