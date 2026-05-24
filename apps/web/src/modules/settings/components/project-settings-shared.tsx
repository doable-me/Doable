"use client";

import type React from "react";
import {
  Settings,
  Globe,
  Server,
  AlertTriangle,
  Plug,
  Brain,
  Terminal,
  FileText,
  BookOpen,
  Lightbulb,
  Heart,
  Clock,
  User,
  Map,
  Shield,
  Database,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

export interface ProjectSettingsProps {
  projectId: string;
}

export type Tab =
  | "general"
  | "integrations"
  | "mcp"
  | "skills"
  | "context"
  | "security"
  | "doable-ai"
  | "domain"
  | "environments"
  | "database"
  | "danger";

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

// ─── Constants ──────────────────────────────────────────────

export const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "database", label: "Database", icon: Database },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "mcp", label: "MCP Servers", icon: Terminal },
  { id: "skills", label: "Skills & Rules", icon: Brain },
  { id: "context", label: "Knowledge", icon: Brain },
  { id: "doable-ai", label: "Doable AI", icon: Sparkles },
  { id: "security", label: "Security", icon: Shield },
  { id: "domain", label: "Custom Domain", icon: Globe },
  { id: "environments", label: "Environments", icon: Server },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export const FILE_ICONS: Record<string, typeof FileText> = {
  "identity.md": BookOpen,
  "knowledge.md": Brain,
  "instructions.md": Lightbulb,
  "soul.md": Heart,
  "memory.md": Clock,
  "user.md": User,
  "plan.md": Map,
};

// ─── Section Card ───────────────────────────────────────────

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-6", className)}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Info Item ──────────────────────────────────────────────

export function InfoItem({
  icon: Icon,
  label,
  value,
  mono,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {badge ? (
          <span className="mt-0.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
            {value}
          </span>
        ) : (
          <p
            className={cn(
              "mt-0.5 text-sm truncate",
              mono && "font-mono text-xs"
            )}
            title={value}
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

export function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="space-y-4 rounded-xl border p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}
