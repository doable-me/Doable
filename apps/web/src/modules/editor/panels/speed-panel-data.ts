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

// ─── Mock Data ──────────────────────────────────────────────

export const MOCK_RESULTS: AuditResults = {
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
