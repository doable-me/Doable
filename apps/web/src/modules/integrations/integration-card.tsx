"use client";

import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, type CatalogItem } from "./use-integration-catalog";

// ─── Integration Card ──────────────────────────────────────

interface IntegrationCardProps {
  item: CatalogItem;
  onSelect: (item: CatalogItem) => void;
  onConnect: (item: CatalogItem) => void;
}

export function IntegrationCard({ item, onSelect, onConnect }: IntegrationCardProps) {
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-background p-4 transition-all",
        "hover:border-foreground/20 hover:shadow-sm cursor-pointer"
      )}
      onClick={() => onSelect(item)}
    >
      {/* Header: Logo + Status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0 overflow-hidden">
          {item.logoUrl ? (
            <img
              src={item.logoUrl}
              alt={item.displayName}
              className="h-6 w-6 object-contain"
              onError={(e) => {
                // Fallback to first letter on image error
                const target = e.currentTarget;
                target.style.display = "none";
                const parent = target.parentElement;
                if (parent) {
                  const span = document.createElement("span");
                  span.className = "text-sm font-bold text-muted-foreground";
                  span.textContent = item.displayName.charAt(0).toUpperCase();
                  parent.appendChild(span);
                }
              }}
            />
          ) : (
            <span className="text-sm font-bold text-muted-foreground">
              {item.displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Status dot */}
        <span
          className={cn(
            "mt-1 h-2 w-2 rounded-full shrink-0",
            item.connected ? "bg-emerald-500" : "bg-muted-foreground/30"
          )}
          title={item.connected ? "Connected" : "Available"}
        />
      </div>

      {/* Name + Description */}
      <h3 className="text-sm font-semibold truncate mb-1">{item.displayName}</h3>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">
        {item.description || "No description available."}
      </p>

      {/* Footer: Category + Actions */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <Badge
          variant="secondary"
          className="text-[10px] font-medium px-2 py-0.5 truncate max-w-[120px]"
        >
          {categoryLabel}
        </Badge>

        <div className="flex items-center gap-2">
          {item.actionCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3" />
              {item.actionCount}
            </span>
          )}
        </div>
      </div>

      {/* Connect/Manage button overlay */}
      <div className="absolute inset-x-0 bottom-0 p-4 pt-8 bg-gradient-to-t from-background via-background/80 to-transparent rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (item.connected) {
              onSelect(item);
            } else {
              onConnect(item);
            }
          }}
          className={cn(
            "w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            item.connected
              ? "border border-input text-foreground hover:bg-accent"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {item.connected ? "Manage" : "Connect"}
        </button>
      </div>
    </div>
  );
}
