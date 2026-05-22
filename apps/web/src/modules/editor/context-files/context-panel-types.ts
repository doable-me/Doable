import {
  FileText,
  BookOpen,
  Brain,
  Lightbulb,
  Heart,
  Clock,
  User,
  Map,
  Rocket,
  Wrench,
  Activity,
  Zap,
  Palette,
  Database,
  Building2,
  Globe,
  Bot,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

export interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

export interface ContextStats {
  totalFiles: number;
  totalChars: number;
  estimatedTokens: number;
  budgetUsedPercent: number;
}

export type Scope = "project" | "workspace" | "user";

export interface ContextPanelProps {
  projectId: string;
  workspaceId?: string;
  apiBaseUrl?: string;
}

// ─── Icon Map ───────────────────────────────────────────────

export const FILE_ICONS: Record<string, typeof FileText> = {
  "identity.md": BookOpen,
  "knowledge.md": Brain,
  "instructions.md": Lightbulb,
  "soul.md": Heart,
  "memory.md": Clock,
  "user.md": User,
  "plan.md": Map,
  "boot.md": Rocket,
  "tools.md": Wrench,
  "heartbeat.md": Activity,
  "bootstrap.md": Zap,
  "design-system.md": Palette,
  "schema.md": Database,
  "architecture.md": Building2,
  "api-reference.md": Globe,
  "agents.md": Bot,
};

// ─── Category Definitions ───────────────────────────────────

export interface Category {
  key: string;
  label: string;
  filenames: string[];
}

export const CATEGORIES: Category[] = [
  {
    key: "core",
    label: "Core",
    filenames: [
      "identity.md",
      "soul.md",
      "user.md",
      "instructions.md",
      "knowledge.md",
      "plan.md",
      "memory.md",
    ],
  },
  {
    key: "session",
    label: "Session",
    filenames: ["boot.md", "tools.md", "heartbeat.md", "bootstrap.md"],
  },
  {
    key: "architecture",
    label: "Architecture",
    filenames: [
      "design-system.md",
      "schema.md",
      "architecture.md",
      "api-reference.md",
    ],
  },
  {
    key: "agents",
    label: "Agents",
    filenames: ["agents.md"],
  },
];

// ─── Scope Tab Config ───────────────────────────────────────

export const SCOPE_TABS: { key: Scope; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "workspace", label: "Workspace" },
  { key: "user", label: "User" },
];

// ─── Helpers ────────────────────────────────────────────────

export function groupFilesByCategory(
  files: ContextFile[]
): { category: Category | null; files: ContextFile[] }[] {
  const grouped: { category: Category | null; files: ContextFile[] }[] = [];
  const placed = new Set<string>();

  for (const cat of CATEGORIES) {
    const matched = files.filter(
      (f) => cat.filenames.includes(f.filename) && !placed.has(f.filename)
    );
    if (matched.length > 0) {
      // Sort by the order defined in the category
      matched.sort(
        (a, b) =>
          cat.filenames.indexOf(a.filename) -
          cat.filenames.indexOf(b.filename)
      );
      grouped.push({ category: cat, files: matched });
      matched.forEach((f) => placed.add(f.filename));
    }
  }

  // Custom files — anything not in a known category
  const custom = files.filter((f) => !placed.has(f.filename));
  if (custom.length > 0) {
    grouped.push({
      category: { key: "custom", label: "Custom", filenames: [] },
      files: custom,
    });
  }

  return grouped;
}
