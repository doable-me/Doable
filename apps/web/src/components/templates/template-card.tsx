"use client";

import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { CategoryPreview } from "./template-previews";

interface TemplateCardProps {
  template: {
    id: string;
    name: string;
    description: string;
    category: string;
    previewImageUrl: string | null;
    isOfficial: boolean;
    fileCount: number;
  };
  onClick: () => void;
}
// --- Category colors for the badge ---

function getCategoryBadgeClasses(category: string): string {
  const key = category.toLowerCase();
  if (key === "dashboard" || key === "saas-dashboard")
    return "bg-indigo-500/15 text-indigo-700 border-indigo-500/20 dark:text-indigo-400";
  if (key === "marketing" || key === "landing-page")
    return "bg-brand-500/15 text-brand-700 border-brand-500/20 dark:text-brand-400";
  if (key === "ecommerce" || key === "ecommerce-store")
    return "bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-400";
  if (key === "portfolio")
    return "bg-teal-500/15 text-teal-700 border-teal-500/20 dark:text-teal-400";
  if (key === "blog" || key === "content")
    return "bg-orange-500/15 text-orange-700 border-orange-500/20 dark:text-orange-400";
  if (key === "productivity" || key === "todo-app")
    return "bg-green-500/15 text-green-700 border-green-500/20 dark:text-green-400";
  return "bg-blue-500/15 text-blue-700 border-blue-500/20 dark:text-blue-400";
}

// --- Main component ---

export function TemplateCard({ template, onClick }: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all duration-200 hover:border-muted-foreground hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/10 cursor-pointer"
    >
      {/* Preview thumbnail area */}
      <div className="relative h-48 w-full overflow-hidden">
        {template.previewImageUrl ? (
          <img
            src={template.previewImageUrl}
            alt={`${template.name} preview`}
            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <CategoryPreview category={template.category} />
        )}

        {/* Official badge */}
        {template.isOfficial && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-foreground/45 backdrop-blur-sm border border-brand-500/30 px-2 py-0.5">
            <Shield className="h-3 w-3 text-brand-400" />
            <span className="text-[10px] font-medium text-brand-300">
              Official
            </span>
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-foreground transition-colors">
            {template.name}
          </h3>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {template.fileCount} {template.fileCount === 1 ? "file" : "files"}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {template.description}
        </p>

        <div className="mt-auto pt-1">
          <Badge
            variant="outline"
            className={`rounded-full border px-2 py-0 text-[10px] font-medium capitalize hover:bg-transparent ${getCategoryBadgeClasses(template.category)}`}
          >
            {template.category}
          </Badge>
        </div>
      </div>
    </button>
  );
}
