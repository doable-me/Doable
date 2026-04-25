"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiListTemplates, type ApiTemplate } from "@/lib/api";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { UseTemplateDialog } from "@/components/templates/use-template-dialog";
import { Loader2, Search, Sparkles, FileCode, BarChart3, Layout, ShoppingBag, BookOpen, User, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof FileCode }> = {
  all: { label: "All Templates", icon: Sparkles },
  starter: { label: "Starters", icon: FileCode },
  dashboard: { label: "Dashboards", icon: BarChart3 },
  marketing: { label: "Marketing", icon: Layout },
  ecommerce: { label: "E-commerce", icon: ShoppingBag },
  content: { label: "Content", icon: BookOpen },
  personal: { label: "Personal", icon: User },
  productivity: { label: "Productivity", icon: CheckSquare },
};

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Preview modal state
  const [previewTemplate, setPreviewTemplate] = useState<ApiTemplate | null>(null);

  // Use template dialog state
  const [remixTemplate, setRemixTemplate] = useState<ApiTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiListTemplates({
        search: searchQuery || undefined,
      });
      setTemplates(res.data.templates.filter((t) => t.id !== "blank"));
      setCategories(res.data.categories);
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates =
    activeCategory === "all"
      ? templates
      : templates.filter((t) => t.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Templates</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Start from a template to build your next project
            </p>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-border pb-px">
          {["all", ...categories].map((cat) => {
            const config = CATEGORY_CONFIG[cat] ?? {
              label: cat.charAt(0).toUpperCase() + cat.slice(1),
              icon: FileCode,
            };
            const Icon = config.icon;

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                  activeCategory === cat
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {config.label}
              </button>
            );
          })}
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Loading templates...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? `No templates matching "${searchQuery}"`
                : "No templates in this category yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onClick={() => setPreviewTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={() => {
          setRemixTemplate(previewTemplate);
          setPreviewTemplate(null);
        }}
      />

      {/* Use Template / Remix Dialog */}
      <UseTemplateDialog
        template={remixTemplate}
        onClose={() => setRemixTemplate(null)}
        onCreated={(projectId) => {
          setRemixTemplate(null);
          router.push(`/editor/${projectId}`);
        }}
      />
    </div>
  );
}
