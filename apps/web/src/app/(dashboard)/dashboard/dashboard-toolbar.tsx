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
                ? "text-white bg-zinc-800"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {activeTab === "templates" && (
          <button
            onClick={onBrowseTemplates}
            className="ml-auto flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition-colors"
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 pl-9 pr-8 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        {activeTab !== "templates" && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors">
              <Filter className="h-3.5 w-3.5" />
              {statusFilter === "all" ? "All status" : STATUS_STYLES[statusFilter]?.label}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
              <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white" onClick={() => setStatusFilter("all")}>
                All status
              </DropdownMenuItem>
              <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white" onClick={() => setStatusFilter("published")}>
                <Globe className="mr-2 h-3.5 w-3.5 text-emerald-400" /> Published
              </DropdownMenuItem>
              <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white" onClick={() => setStatusFilter("draft")}>
                <FileCode className="mr-2 h-3.5 w-3.5 text-zinc-400" /> Draft
              </DropdownMenuItem>
              <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white" onClick={() => setStatusFilter("error")}>
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
                ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${starredFilter ? "fill-yellow-400" : ""}`} />
            Starred
          </button>
        )}

        {/* View Mode */}
        {activeTab !== "templates" && (
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/80 overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${
                viewMode === "grid" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${
                viewMode === "list" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
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
              <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-300 hover:bg-white/5 transition-colors">
                <FolderInput className="h-3.5 w-3.5" />
                Move to folder
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                <DropdownMenuItem className="text-zinc-300 focus:bg-white/5 focus:text-white" onClick={() => onBulkMoveToFolder(null)}>
                  Root (no folder)
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator className="bg-zinc-800" />}
                {folders.map((f) => (
                  <DropdownMenuItem key={f.id} className="text-zinc-300 focus:bg-white/5 focus:text-white" onClick={() => onBulkMoveToFolder(f.id)}>
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
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-zinc-400 hover:bg-white/5 transition-colors"
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
