"use client";

import {
  Search, LayoutGrid, List, Filter, X, Star,
  Trash2, FolderInput, ChevronDown,
  Globe, AlertCircle, FileCode, ArrowRight,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Folder } from "@doable/shared";
import type { ViewMode, StatusFilter, SortKey } from "./dashboard-constants";
import { STATUS_STYLES } from "./dashboard-constants";

interface DashboardToolbarProps {
  activeTab: "recent" | "projects" | "templates";
  setActiveTab: (tab: "recent" | "projects" | "templates") => void;
  onBrowseTemplates: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (f: StatusFilter) => void;
  starredFilter: boolean;
  setStarredFilter: (v: boolean) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  folders: Folder[];
  onBulkMoveToFolder: (folderId: string | null) => void;
  onBulkDeleteConfirm: () => void;
}

const TABS = [
  { key: "recent" as const, label: "Recently viewed" },
  { key: "projects" as const, label: "My projects" },
  { key: "templates" as const, label: "Templates" },
];

export function DashboardToolbar({
  activeTab, setActiveTab, onBrowseTemplates,
  searchRef, searchQuery, setSearchQuery,
  statusFilter, setStatusFilter,
  starredFilter, setStarredFilter,
  viewMode, setViewMode,
  selectedIds, setSelectedIds,
  folders, onBulkMoveToFolder, onBulkDeleteConfirm,
}: DashboardToolbarProps) {
  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Row 1: Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pl-1 md:pl-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "text-foreground bg-secondary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {activeTab === "templates" && (
          <button
            onClick={onBrowseTemplates}
            className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse all
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Row 2: Search + Filters + View Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[140px] max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        {activeTab !== "templates" && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors">
              <Filter className="h-3.5 w-3.5" />
              {statusFilter === "all" ? "All status" : STATUS_STYLES[statusFilter]?.label}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter("all")}>
                All status
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("published")}>
                <Globe className="mr-2 h-3.5 w-3.5 text-emerald-400" /> Published
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("draft")}>
                <FileCode className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("error")}>
                <AlertCircle className="mr-2 h-3.5 w-3.5 text-red-400" /> Error
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Starred filter */}
        {activeTab !== "templates" && (
          <button
            onClick={() => setStarredFilter(!starredFilter)}
            className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
              starredFilter
                ? "border-yellow-600/40 bg-yellow-500/15 text-yellow-700 dark:border-yellow-500/30 dark:text-yellow-400"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${starredFilter ? "fill-yellow-400" : ""}`} />
            Starred
          </button>
        )}

        {/* View Mode */}
        {activeTab !== "templates" && (
          <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${
                viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${
                viewMode === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-500/30 bg-brand-500/5 px-4 py-2">
          <span className="text-sm text-brand-300 font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-foreground hover:bg-accent transition-colors">
                <FolderInput className="h-3.5 w-3.5" />
                Move to folder
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onBulkMoveToFolder(null)}>
                  Root (no folder)
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map((f) => (
                  <DropdownMenuItem key={f.id} onClick={() => onBulkMoveToFolder(f.id)}>
                    <FolderInput className="mr-2 h-3.5 w-3.5" />
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={onBulkDeleteConfirm}
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
