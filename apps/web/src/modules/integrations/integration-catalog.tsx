"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, Filter, Plug, ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useIntegrationCatalog,
  CATEGORY_LABELS,
  type CatalogItem,
} from "./use-integration-catalog";
import { IntegrationCard } from "./integration-card";
import { IntegrationDetailSheet } from "./integration-detail-sheet";
import { ConnectFlow } from "./connect-flow";

// ─── Integration Catalog ───────────────────────────────────

interface IntegrationCatalogProps {
  workspaceId: string;
  projectId?: string;
}

export function IntegrationCatalog({
  workspaceId,
  projectId,
}: IntegrationCatalogProps) {
  const {
    catalog,
    categories,
    connections,
    loading,
    error,
    search,
    setSearch,
    category,
    setCategory,
    connectedItems,
    availableItems,
    connect,
    disconnect,
    testConnection,
    getAuthorizationUrl,
    getActions,
    refresh,
  } = useIntegrationCatalog(workspaceId);

  // UI state
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [connectItem, setConnectItem] = useState<CatalogItem | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  // Category pill scroll container
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((item: CatalogItem) => {
    setSelectedItem(item);
    setSheetOpen(true);
  }, []);

  const handleConnect = useCallback((item: CatalogItem) => {
    setConnectItem(item);
    setConnectOpen(true);
  }, []);

  const handleConnectComplete = useCallback(
    async (
      integrationId: string,
      data: {
        scope?: string;
        credentials?: Record<string, unknown>;
        displayName?: string;
        projectId?: string;
      }
    ) => {
      await connect(integrationId, { ...data, projectId });
    },
    [connect, projectId]
  );

  const handleDisconnect = useCallback(
    (connectionId: string) => {
      void disconnect(connectionId);
    },
    [disconnect]
  );

  const handleConnectFlowClose = useCallback(
    (open: boolean) => {
      setConnectOpen(open);
      if (!open) {
        refresh();
      }
    },
    [refresh]
  );

  const handleSheetClose = useCallback(() => {
    setSheetOpen(false);
    // Slight delay to allow animation
    setTimeout(() => setSelectedItem(null), 200);
  }, []);

  // Search debounce
  const [searchInput, setSearchInput] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchInput, setSearch]);

  // All category pills
  const allCategories = [
    { key: null, label: "All" },
    ...categories.map((c) => ({
      key: c,
      label: CATEGORY_LABELS[c] ?? c,
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search integrations..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-input bg-background pl-9 pr-8 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            "transition-colors"
          )}
        />
        {searchInput && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearch("");
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Category Pills */}
      {categories.length > 0 && (
        <div
          ref={scrollRef}
          className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1"
        >
          {allCategories.map((cat) => (
            <button
              key={cat.key ?? "all"}
              onClick={() => setCategory(cat.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                category === cat.key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && catalog.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-2 w-2 rounded-full" />
              </div>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <div className="flex justify-between pt-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-8" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connected Section */}
      {!loading && connectedItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Connected
            </h4>
            <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted rounded-full px-1.5 py-0.5">
              {connectedItems.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {connectedItems.map((item) => (
              <IntegrationCard
                key={item.id}
                item={item}
                onSelect={handleSelect}
                onConnect={handleConnect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available Section */}
      {!loading && availableItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Available
            </h4>
            <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted rounded-full px-1.5 py-0.5">
              {availableItems.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availableItems.map((item) => (
              <IntegrationCard
                key={item.id}
                item={item}
                onSelect={handleSelect}
                onConnect={handleConnect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && catalog.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Plug className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {search || category
              ? "No integrations match your search"
              : "No integrations available"}
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-[240px]">
            {search || category
              ? "Try adjusting your search or filters."
              : "Native integrations will appear here once configured."}
          </p>
        </div>
      )}

      {/* Detail Sheet */}
      <IntegrationDetailSheet
        item={selectedItem}
        connections={connections}
        open={sheetOpen}
        onClose={handleSheetClose}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onTestConnection={testConnection}
        onGetActions={getActions}
      />

      {/* Connect Flow */}
      <ConnectFlow
        item={connectItem}
        open={connectOpen}
        onOpenChange={handleConnectFlowClose}
        onConnect={handleConnectComplete}
        onGetAuthorizationUrl={getAuthorizationUrl}
        projectId={projectId}
      />
    </div>
  );
}
