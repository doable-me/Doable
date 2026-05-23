"use client";

import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Zap,
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Image,
  FileText,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

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

export interface AuditResults {
  score: number;
  webVitals: WebVital[];
  additionalMetrics: AdditionalMetric[];
  bundle: BundleBreakdown;
  recommendations: Recommendation[];
}

// ─── Helpers ────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 90) return "#0cce6b";
  if (score >= 50) return "#ffa400";
  return "#ff4e42";
}

function ratingColor(rating: Rating): string {
  switch (rating) {
    case "good": return "#0cce6b";
    case "needs-improvement": return "#ffa400";
    case "poor": return "#ff4e42";
  }
}

function ratingLabel(rating: Rating): string {
  switch (rating) {
    case "good": return "Good";
    case "needs-improvement": return "Needs Improvement";
    case "poor": return "Poor";
  }
}

function ratingBg(rating: Rating): string {
  switch (rating) {
    case "good": return "bg-emerald-500/10";
    case "needs-improvement": return "bg-amber-500/10";
    case "poor": return "bg-red-500/10";
  }
}

function impactColor(impact: "high" | "medium" | "low"): string {
  switch (impact) {
    case "high": return "text-red-400 bg-red-500/10 border-red-500/20";
    case "medium": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "low": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  }
}

function bundleTypeColor(type: string): string {
  switch (type) {
    case "js": return "#f7df1e";
    case "css": return "#264de4";
    case "html": return "#e34c26";
    case "images": case "image": return "#0cce6b";
    case "fonts": case "font": return "#a855f7";
    default: return "#6b7280";
  }
}

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function fileIcon(type: string) {
  switch (type) {
    case "js": return <FileCode2 className="h-3.5 w-3.5 text-yellow-400" />;
    case "css": return <FileCode2 className="h-3.5 w-3.5 text-blue-400" />;
    case "html": return <FileText className="h-3.5 w-3.5 text-orange-400" />;
    case "image": return <Image className="h-3.5 w-3.5 text-emerald-400" />;
    case "font": return <FileText className="h-3.5 w-3.5 text-purple-400" />;
    default: return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ─── Circular Gauge ─────────────────────────────────────────

export function CircularGauge({
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
    if (!animated) { setDisplayScore(score); return; }
    let frame: number;
    let start: number | null = null;
    const duration = 1200;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(eased * score));
      if (t < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score, animated]);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - progress} style={{ transition: animated ? "none" : "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>{displayScore}</span>
        <span className="text-[11px] text-muted-foreground mt-0.5">Performance</span>
      </div>
    </div>
  );
}

// ─── Speed Panel Results ────────────────────────────────────

export function SpeedPanelResults({
  results,
  expandedRecs,
  onToggleRec,
  onSendMessage,
}: {
  results: AuditResults;
  expandedRecs: Set<string>;
  onToggleRec: (id: string) => void;
  onSendMessage: (message: string) => void;
}) {
  return (
    <div className="p-4 space-y-6">
      {/* Performance Score */}
      <div className="flex flex-col items-center py-4">
        <CircularGauge score={results.score} animated />
        <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />90-100</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />50-89</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" />0-49</span>
        </div>
      </div>

      {/* Core Web Vitals */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Core Web Vitals</h3>
        <div className="grid grid-cols-1 gap-2">
          {results.webVitals.map((vital) => (
            <div key={vital.shortName} className={`rounded-lg border border-border p-3 ${ratingBg(vital.rating)}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{vital.shortName}</span>
                  <span className="text-[11px] text-muted-foreground">{vital.name}</span>
                </div>
                <span className="text-[11px] font-medium rounded-full px-2 py-0.5" style={{ color: ratingColor(vital.rating), backgroundColor: `${ratingColor(vital.rating)}15` }}>
                  {ratingLabel(vital.rating)}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold tabular-nums" style={{ color: ratingColor(vital.rating) }}>{vital.value}</span>
                <span className="text-xs text-muted-foreground">{vital.unit}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Target: {vital.target}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Additional Metrics */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Additional Metrics</h3>
        <div className="grid grid-cols-2 gap-2">
          {results.additionalMetrics.map((metric) => {
            const pct = Math.min((metric.value / metric.maxValue) * 100, 100);
            return (
              <div key={metric.name} className="rounded-lg border border-border bg-card p-3">
                <div className="text-[11px] text-muted-foreground mb-1.5 truncate">{metric.name}</div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-lg font-bold tabular-nums" style={{ color: ratingColor(metric.rating) }}>{metric.value}</span>
                  <span className="text-[11px] text-muted-foreground">{metric.unit}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: ratingColor(metric.rating) }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bundle Analysis */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Bundle Analysis</h3>
        <div className="rounded-lg border border-border bg-card p-3 mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-muted-foreground">Total Bundle Size</span>
            <span className="text-sm font-bold text-foreground">{formatSize(results.bundle.total)}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex">
            {([
              { key: "js", label: "JS", value: results.bundle.js },
              { key: "css", label: "CSS", value: results.bundle.css },
              { key: "html", label: "HTML", value: results.bundle.html },
              { key: "images", label: "Images", value: results.bundle.images },
              { key: "fonts", label: "Fonts", value: results.bundle.fonts },
              { key: "other", label: "Other", value: results.bundle.other },
            ] as const).map((seg) => {
              const pct = (seg.value / results.bundle.total) * 100;
              if (pct < 0.5) return null;
              return (
                <div key={seg.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${pct}%`, backgroundColor: bundleTypeColor(seg.key) }} title={`${seg.label}: ${formatSize(seg.value)}`} />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2.5">
            {([
              { key: "js", label: "JS", value: results.bundle.js },
              { key: "css", label: "CSS", value: results.bundle.css },
              { key: "html", label: "HTML", value: results.bundle.html },
              { key: "images", label: "Images", value: results.bundle.images },
              { key: "fonts", label: "Fonts", value: results.bundle.fonts },
              { key: "other", label: "Other", value: results.bundle.other },
            ] as const).map((seg) => (
              <div key={seg.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: bundleTypeColor(seg.key) }} />
                <span className="text-[10px] text-foreground">{seg.label}</span>
                <span className="text-[10px] text-muted-foreground">{formatSize(seg.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Largest files */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-[11px] font-medium text-foreground">Largest Files</span>
          </div>
          <div className="divide-y divide-border">
            {results.bundle.files
              .sort((a, b) => b.size - a.size)
              .slice(0, 6)
              .map((file) => (
                <div key={file.name} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors">
                  {fileIcon(file.type)}
                  <span className="text-[12px] text-foreground flex-1 truncate">{file.name}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">{formatSize(file.size)}</span>
                  <div className="w-16 h-1 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    <div className="h-full rounded-full" style={{ width: `${(file.size / results.bundle.files[0]!.size) * 100}%`, backgroundColor: bundleTypeColor(file.type) }} />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Tree-shaking suggestion */}
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-medium text-amber-300">Tree-shaking opportunity</p>
            <p className="text-[11px] text-foreground mt-0.5">
              The vendor bundle contains unused exports from large libraries. Consider importing only the specific modules you need (e.g.{" "}
              <code className="rounded bg-secondary px-1 py-0.5 text-[10px] text-amber-300">
                import {"{"} debounce {"}"} from &apos;lodash/debounce&apos;
              </code>{" "}
              instead of importing the entire library).
            </p>
          </div>
        </div>
      </section>

      {/* Recommendations */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recommendations</h3>
        <div className="space-y-2">
          {results.recommendations.map((rec) => {
            const isExpanded = expandedRecs.has(rec.id);
            return (
              <div key={rec.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <button onClick={() => onToggleRec(rec.id)} className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted transition-colors">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className="text-[12px] font-medium text-foreground flex-1">{rec.title}</span>
                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${impactColor(rec.impact)}`}>{rec.impact} impact</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{rec.savings}</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-border">
                    <p className="text-[12px] text-foreground leading-relaxed mt-2.5 mb-3">{rec.description}</p>
                    <button onClick={() => onSendMessage(rec.fixPrompt)} className="flex items-center gap-1.5 rounded-md bg-brand-600/20 border border-brand-500/30 px-3 py-1.5 text-[11px] font-medium text-brand-300 hover:bg-brand-600/30 transition-colors">
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

      <div className="text-center pb-2">
        <p className="text-[10px] text-muted-foreground">Measured from your live preview (transfer-size based).</p>
      </div>
    </div>
  );
}
