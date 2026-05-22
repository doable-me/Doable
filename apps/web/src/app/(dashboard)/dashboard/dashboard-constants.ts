import type { ApiProject } from "@/lib/api";

// ─── View / Filter Types ────────────────────────────────────

export type ViewMode = "grid" | "list";
export type StatusFilter = "all" | "published" | "draft" | "error";
export type SortKey = "name" | "updated_at" | "created_at" | "status";
export type SortDir = "asc" | "desc";

// ─── Constants ──────────────────────────────────────────────

export const VIEW_MODE_KEY = "doable_dashboard_view";

export const GREETINGS = [
  "Let's make it Doable",
  "What's Doable today",
  "Ready to get it done",
  "Dream it. Do it",
  "What will you ship",
];

export const PROJECT_GRADIENTS = [
  "from-brand-500/20 to-brand-600/20",
  "from-blue-500/20 to-cyan-600/20",
  "from-emerald-500/20 to-teal-600/20",
  "from-orange-500/20 to-amber-600/20",
  "from-pink-500/20 to-rose-600/20",
  "from-indigo-500/20 to-blue-600/20",
  "from-fuchsia-500/20 to-pink-600/20",
  "from-cyan-500/20 to-sky-600/20",
];

export const PROJECT_ACCENT_COLORS = [
  "bg-brand-500/30",
  "bg-blue-500/30",
  "bg-emerald-500/30",
  "bg-orange-500/30",
  "bg-pink-500/30",
  "bg-indigo-500/30",
  "bg-fuchsia-500/30",
  "bg-cyan-500/30",
];

export const TEMPLATE_CATEGORY_COLORS: Record<string, { bg: string; accent: string; highlight: string }> = {
  dashboard: { bg: "bg-blue-50", accent: "bg-blue-100", highlight: "bg-blue-200" },
  marketing: { bg: "bg-amber-50", accent: "bg-amber-100", highlight: "bg-amber-200" },
  ecommerce: { bg: "bg-emerald-50", accent: "bg-emerald-100", highlight: "bg-emerald-200" },
  blog: { bg: "bg-rose-50", accent: "bg-rose-100", highlight: "bg-rose-200" },
  social: { bg: "bg-brand-50", accent: "bg-brand-100", highlight: "bg-brand-200" },
  productivity: { bg: "bg-cyan-50", accent: "bg-cyan-100", highlight: "bg-cyan-200" },
  portfolio: { bg: "bg-indigo-50", accent: "bg-indigo-100", highlight: "bg-indigo-200" },
};

export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  published: {
    label: "Published",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  draft: {
    label: "Draft",
    className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
  creating: {
    label: "Creating",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  error: {
    label: "Error",
    className: "bg-red-500/10 text-red-400 border-red-500/20",
  },
};

export const DASHBOARD_SUGGESTIONS = [
  "Build a SaaS landing page with pricing...",
  "Create a portfolio website with animations...",
  "Design a task management app...",
  "Make an e-commerce store with checkout...",
  "Build a social media dashboard...",
  "Create a recipe sharing platform...",
  "Design a fitness tracking app...",
  "Build a blog with markdown support...",
  "Create a real-time chat application...",
  "Make an invoice management system...",
];

// ─── Helper Functions ───────────────────────────────────────

export function getProjectColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % PROJECT_GRADIENTS.length;
}

export function getTemplateCategoryColors(category: string) {
  return TEMPLATE_CATEGORY_COLORS[category] ?? { bg: "bg-gray-50", accent: "bg-gray-100", highlight: "bg-gray-200" };
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
