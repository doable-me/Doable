"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileCode,
  Rocket,
  Layout,
  BarChart3,
  Sparkles,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  previewImageUrl: string | null;
  isOfficial: boolean;
  fileCount: number;
}

interface TemplateGalleryProps {
  apiBaseUrl?: string;
  onSelectTemplate: (templateId: string) => void;
}

// ─── Category Config ────────────────────────────────────────

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: typeof FileCode }
> = {
  all: { label: "All", icon: Sparkles },
  starter: { label: "Starters", icon: FileCode },
  dashboard: { label: "Dashboards", icon: BarChart3 },
  marketing: { label: "Marketing", icon: Layout },
};

// ─── Component ──────────────────────────────────────────────

export const TemplateGallery = ({
  apiBaseUrl = "/api",
  onSelectTemplate,
}: TemplateGalleryProps) => {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [scaffolding, setScaffolding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Fetch templates ────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/templates`);
      if (!res.ok) throw new Error("Failed to load templates");
      const json = (await res.json()) as {
        data: { templates: TemplateSummary[]; categories: string[] };
      };
      setTemplates(json.data.templates);
      setCategories(json.data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  // ─── Filter ─────────────────────────────────────────────

  const filteredTemplates =
    activeCategory === "all"
      ? templates
      : templates.filter((t) => t.category === activeCategory);

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Start a Project</h2>
        <p className="text-muted-foreground mt-1">
          Choose a template or start from scratch.
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 border-b">
        {["all", ...categories].map((cat) => {
          const config = CATEGORY_CONFIG[cat] ?? {
            label: capitalize(cat),
            icon: FileCode,
          };
          const Icon = config.icon;

          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeCategory === cat
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* Template grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isScaffolding={scaffolding === template.id}
              onSelect={() => {
                setScaffolding(template.id);
                onSelectTemplate(template.id);
              }}
            />
          ))}

          {filteredTemplates.length === 0 && (
            <div className="col-span-full flex items-center justify-center h-32 text-sm text-muted-foreground">
              No templates in this category yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Template Card ──────────────────────────────────────────

interface TemplateCardProps {
  template: TemplateSummary;
  isScaffolding: boolean;
  onSelect: () => void;
}

const TemplateCard = ({
  template,
  isScaffolding,
  onSelect,
}: TemplateCardProps) => {
  const CategoryIcon =
    CATEGORY_CONFIG[template.category]?.icon ?? FileCode;

  return (
    <div className="group rounded-lg border bg-card overflow-hidden transition-shadow hover:shadow-md">
      {/* Preview area */}
      <div className="relative h-36 bg-muted flex items-center justify-center">
        {template.previewImageUrl ? (
          <img
            src={template.previewImageUrl}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <CategoryIcon className="h-10 w-10 text-muted-foreground/40" />
        )}
        {template.isOfficial && (
          <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Official
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{template.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {template.description}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {template.fileCount} files
          </span>
          <button
            onClick={onSelect}
            disabled={isScaffolding}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isScaffolding
                ? "bg-muted text-muted-foreground cursor-wait"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isScaffolding ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Rocket className="h-3 w-3" />
                Use Template
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
