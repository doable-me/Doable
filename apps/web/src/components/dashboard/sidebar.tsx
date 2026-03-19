"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  apiListWorkspaces,
  apiListProjects,
  apiListStarredProjects,
  apiFetch,
  type ApiWorkspace,
  type ApiProject,
} from "@/lib/api";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot,
  Home,
  Search,
  BookOpen,
  FolderOpen,
  FolderPlus,
  FolderIcon,
  Star,
  UserCircle,
  Users,
  ChevronDown,
  ChevronRight,
  Zap,
  Settings,
  LogOut,
  CreditCard,
  Check,
  ChevronsUpDown,
  Plus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Folder } from "@doable/shared";

// ---- Events for cross-component communication ----
export const DASHBOARD_EVENTS = {
  NAVIGATE_FILTER: "dashboard:navigate-filter",
  NAVIGATE_FOLDER: "dashboard:navigate-folder",
  SEARCH_FOCUS: "dashboard:search-focus",
  FOLDERS_CHANGED: "dashboard:folders-changed",
  PROJECTS_CHANGED: "dashboard:projects-changed",
  MOVE_PROJECT_TO_FOLDER: "dashboard:move-project-to-folder",
} as const;

export const PROJECT_DRAG_TYPE = "application/x-doable-project";

export type DashboardFilter = "all" | "starred" | "created-by-me" | "shared";

export function emitDashboardEvent(event: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

// ---- Folder tree types ----
interface FolderTreeItem extends Folder {
  children: FolderTreeItem[];
}

function buildFolderTree(folders: Folder[]): FolderTreeItem[] {
  const map = new Map<string, FolderTreeItem>();
  const roots: FolderTreeItem[] = [];

  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }

  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort by position
  const sortNodes = (nodes: FolderTreeItem[]) => {
    nodes.sort((a, b) => a.position - b.position);
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

// ---- Navigation Item ----
function NavItem({
  icon: Icon,
  label,
  shortcut,
  active,
  onClick,
  count,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] text-zinc-500 tabular-nums">{count}</span>
      )}
      {shortcut && (
        <kbd className="hidden lg:inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

// ---- Section Header ----
function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-5 pb-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {action}
    </div>
  );
}

// ---- Folder Node ----
function FolderNode({
  folder,
  depth = 0,
  activeFolder,
  onSelect,
  onRename,
  onDelete,
}: {
  folder: FolderTreeItem;
  depth?: number;
  activeFolder: string | null;
  onSelect: (folderId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const hasChildren = folder.children.length > 0;
  const isActive = activeFolder === folder.id;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the element itself (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const projectId = e.dataTransfer.getData(PROJECT_DRAG_TYPE);
    if (projectId) {
      emitDashboardEvent(DASHBOARD_EVENTS.MOVE_PROJECT_TO_FOLDER, {
        projectId,
        folderId: folder.id,
      });
    }
  }, [folder.id]);

  return (
    <div>
      <div
        className="group relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          onClick={() => {
            onSelect(folder.id);
            if (hasChildren) setExpanded(!expanded);
          }}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
            isDragOver
              ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
              : isActive
                ? "bg-white/10 text-white"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
            )
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="truncate">{folder.name}</span>
        </button>
        {/* Context actions on hover */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors">
              <MoreHorizontal className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white text-xs"
                onClick={() => onRename(folder)}
              >
                <Pencil className="mr-2 h-3 w-3" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                className="text-red-400 focus:bg-red-500/10 focus:text-red-400 text-xs"
                onClick={() => onDelete(folder)}
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {expanded &&
        folder.children.map((child) => (
          <FolderNode
            key={child.id}
            folder={child}
            depth={depth + 1}
            activeFolder={activeFolder}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

// ---- Main Sidebar Component ----
export function DashboardSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Data state
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<ApiProject[]>([]);
  const [starredProjects, setStarredProjects] = useState<ApiProject[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);

  // UI state
  const [recentOpen, setRecentOpen] = useState(true);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>("all");
  const [allProjectsDragOver, setAllProjectsDragOver] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Folder management
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [folderSubmitting, setFolderSubmitting] = useState(false);

  // Load data
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [wsRes, projRes] = await Promise.all([
          apiListWorkspaces(),
          apiListProjects({ pageSize: 50 }),
        ]);
        if (cancelled) return;

        setWorkspaces(wsRes.data);
        if (wsRes.data.length > 0) {
          const persisted = localStorage.getItem("doable_active_workspace_id");
          const found = wsRes.data.find((w) => w.id === persisted);
          setActiveWorkspaceId(found ? found.id : wsRes.data[0]!.id);
        }

        setRecentProjects(
          [...projRes.data]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 5)
        );
        setTotalProjects(projRes.pagination.total);

        // Fetch starred
        try {
          const starRes = await apiListStarredProjects();
          if (!cancelled) setStarredProjects(starRes.data);
        } catch {
          // starred endpoint might not exist yet
        }
      } catch (err) {
        console.error("Sidebar: failed to load data:", err);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  // Load folders when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return;

    apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`)
      .then(({ data }) => setFolders(data))
      .catch(() => setFolders([]));
  }, [activeWorkspaceId]);

  // Listen for projects/folders changed events
  useEffect(() => {
    const handleProjectsChanged = () => {
      apiListProjects({ pageSize: 50 }).then((res) => {
        setRecentProjects(
          [...res.data]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 5)
        );
        setTotalProjects(res.pagination.total);
      }).catch(() => {});
      apiListStarredProjects().then((res) => setStarredProjects(res.data)).catch(() => {});
    };
    const handleFoldersChanged = () => {
      if (!activeWorkspaceId) return;
      apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`)
        .then(({ data }) => setFolders(data))
        .catch(() => {});
    };

    window.addEventListener(DASHBOARD_EVENTS.PROJECTS_CHANGED, handleProjectsChanged);
    window.addEventListener(DASHBOARD_EVENTS.FOLDERS_CHANGED, handleFoldersChanged);
    return () => {
      window.removeEventListener(DASHBOARD_EVENTS.PROJECTS_CHANGED, handleProjectsChanged);
      window.removeEventListener(DASHBOARD_EVENTS.FOLDERS_CHANGED, handleFoldersChanged);
    };
  }, [activeWorkspaceId]);

  const handleFilterClick = (filter: DashboardFilter) => {
    setActiveFilter(filter);
    setActiveFolder(null);
    emitDashboardEvent(DASHBOARD_EVENTS.NAVIGATE_FILTER, filter);
    if (pathname !== "/dashboard") router.push("/dashboard");
  };

  const handleFolderSelect = (folderId: string) => {
    setActiveFolder(folderId);
    setActiveFilter("all");
    emitDashboardEvent(DASHBOARD_EVENTS.NAVIGATE_FOLDER, folderId);
    if (pathname !== "/dashboard") router.push("/dashboard");
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !activeWorkspaceId || folderSubmitting) return;
    setFolderSubmitting(true);
    try {
      await apiFetch("/folders", {
        method: "POST",
        body: JSON.stringify({
          name: newFolderName.trim(),
          workspaceId: activeWorkspaceId,
        }),
      });
      setNewFolderName("");
      setCreateFolderOpen(false);
      emitDashboardEvent(DASHBOARD_EVENTS.FOLDERS_CHANGED);
      // Refresh folders
      const { data } = await apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`);
      setFolders(data);
    } catch (err) {
      console.error("Failed to create folder:", err);
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim() || folderSubmitting) return;
    setFolderSubmitting(true);
    try {
      await apiFetch(`/folders/${renamingFolder.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setRenamingFolder(null);
      setRenameValue("");
      emitDashboardEvent(DASHBOARD_EVENTS.FOLDERS_CHANGED);
      if (activeWorkspaceId) {
        const { data } = await apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`);
        setFolders(data);
      }
    } catch (err) {
      console.error("Failed to rename folder:", err);
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!deletingFolder || folderSubmitting) return;
    setFolderSubmitting(true);
    try {
      await apiFetch(`/folders/${deletingFolder.id}`, { method: "DELETE" });
      setDeletingFolder(null);
      if (activeFolder === deletingFolder.id) {
        setActiveFolder(null);
        handleFilterClick("all");
      }
      emitDashboardEvent(DASHBOARD_EVENTS.FOLDERS_CHANGED);
      if (activeWorkspaceId) {
        const { data } = await apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`);
        setFolders(data);
      }
    } catch (err) {
      console.error("Failed to delete folder:", err);
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleSwitchWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    localStorage.setItem("doable_active_workspace_id", id);
  };

  const displayName = user?.displayName ?? "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const workspaceName = activeWorkspace?.name ?? `${displayName}'s workspace`;
  const workspacePlan = activeWorkspace?.plan ?? "free";
  const memberCount = (activeWorkspace as ApiWorkspace)?.memberCount ?? 1;
  const dailyCredits = (activeWorkspace as ApiWorkspace)?.credits?.dailyRemaining ?? 0;
  const dailyTotal = workspacePlan === "free" ? 5 : workspacePlan === "pro" ? 50 : 200;
  const creditsUsed = dailyTotal - dailyCredits;
  const creditsPercent = dailyTotal > 0 ? (creditsUsed / dailyTotal) * 100 : 0;

  const folderTree = buildFolderTree(folders);

  return (
    <>
      <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-zinc-800 bg-[#0a0a0a]">
        {/* Logo */}
        <a href="/dashboard" className="flex items-center gap-2.5 px-5 pt-5 pb-4 hover:opacity-80 transition-opacity cursor-pointer">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 shadow-sm shadow-violet-900/30">
            <span className="text-sm font-bold text-white">D</span>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            Doable
          </span>
        </a>

        {/* Workspace Selector */}
        <div className="mx-3 mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center justify-between mb-2 outline-none">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate text-left">
                  {workspaceName}
                </p>
                <p className="text-[11px] text-zinc-500 capitalize text-left">
                  {workspacePlan} plan{memberCount > 1 ? ` \u00b7 ${memberCount} members` : ""}
                </p>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-zinc-800">
              <DropdownMenuLabel className="text-zinc-500">Workspaces</DropdownMenuLabel>
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  className="text-zinc-300 focus:bg-white/5 focus:text-white"
                  onClick={() => handleSwitchWorkspace(ws.id)}
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-violet-600/20 text-xs font-semibold text-violet-400">
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="ml-2 flex-1 truncate">{ws.name}</span>
                  {ws.id === activeWorkspaceId && (
                    <Check className="ml-auto h-3.5 w-3.5 text-violet-400" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Credits today</span>
              <span className="text-zinc-400">
                {creditsUsed}/{dailyTotal}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800">
              <div
                className="h-1.5 rounded-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all"
                style={{ width: `${Math.min(creditsPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto px-2">
          <div className="space-y-0.5">
            <NavItem
              icon={Home}
              label="Home"
              active={pathname === "/dashboard" && activeFilter === "all" && !activeFolder}
              onClick={() => handleFilterClick("all")}
            />
            <NavItem
              icon={Search}
              label="Search"
              shortcut="\u2318K"
              onClick={() => emitDashboardEvent(DASHBOARD_EVENTS.SEARCH_FOCUS)}
            />
            <NavItem icon={BookOpen} label="Resources" />
          </div>

          {/* Projects Section */}
          <SectionHeader label="Projects" />
          <div className="space-y-0.5">
            <div
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setAllProjectsDragOver(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setAllProjectsDragOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setAllProjectsDragOver(false);
                const projectId = e.dataTransfer.getData(PROJECT_DRAG_TYPE);
                if (projectId) {
                  emitDashboardEvent(DASHBOARD_EVENTS.MOVE_PROJECT_TO_FOLDER, {
                    projectId,
                    folderId: null,
                  });
                }
              }}
              className={allProjectsDragOver ? "rounded-lg ring-1 ring-violet-500/40 bg-violet-500/10" : ""}
            >
              <NavItem
                icon={FolderOpen}
                label="All projects"
                active={activeFilter === "all" && !activeFolder}
                onClick={() => handleFilterClick("all")}
                count={totalProjects}
              />
            </div>
            <NavItem
              icon={Star}
              label="Starred"
              active={activeFilter === "starred"}
              onClick={() => handleFilterClick("starred")}
              count={starredProjects.length}
            />
            <NavItem
              icon={UserCircle}
              label="Created by me"
              active={activeFilter === "created-by-me"}
              onClick={() => handleFilterClick("created-by-me")}
            />
            <NavItem
              icon={Users}
              label="Shared with me"
              active={activeFilter === "shared"}
              onClick={() => handleFilterClick("shared")}
            />
          </div>

          {/* Starred Projects (mini list) */}
          {starredProjects.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => handleFilterClick("starred")}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                <Star className="h-3 w-3" />
                Starred
              </button>
              <div className="space-y-0.5 mt-0.5">
                {starredProjects.slice(0, 3).map((project) => (
                  <button
                    key={project.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => router.push(`/editor/${project.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors"
                  >
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
                    <span className="truncate text-xs">{project.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent Projects */}
          <div className="mt-3">
            <button
              onClick={() => setRecentOpen(!recentOpen)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              {recentOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Recent
            </button>
            {recentOpen && (
              <div className="space-y-0.5 mt-0.5">
                {recentProjects.length === 0 && (
                  <p className="px-3 py-2 text-[11px] text-zinc-600">
                    No recent projects
                  </p>
                )}
                {recentProjects.map((project) => (
                  <button
                    key={project.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => router.push(`/editor/${project.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors"
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 text-[10px] shrink-0">
                      {project.name.charAt(0)}
                    </div>
                    <span className="truncate text-xs">{project.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Folders */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setFoldersOpen(!foldersOpen)}
                className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                {foldersOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Folders
              </button>
              <button
                onClick={() => setCreateFolderOpen(true)}
                className="mr-2 rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                title="Create folder"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            {foldersOpen && (
              <div className="space-y-0.5 mt-0.5">
                {folderTree.length === 0 && (
                  <p className="px-3 py-2 text-[11px] text-zinc-600">
                    No folders yet
                  </p>
                )}
                {folderTree.map((folder) => (
                  <FolderNode
                    key={folder.id}
                    folder={folder}
                    activeFolder={activeFolder}
                    onSelect={handleFolderSelect}
                    onRename={(f) => {
                      setRenamingFolder(f);
                      setRenameValue(f.name);
                    }}
                    onDelete={(f) => setDeletingFolder(f)}
                  />
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Bottom Section */}
        <div className="mt-auto border-t border-zinc-800 p-3 space-y-3">
          {/* Upgrade Card */}
          {workspacePlan === "free" && (
            <div className="rounded-lg bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/20 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Zap className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-medium text-violet-300">
                  Upgrade to Pro
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-2.5">
                Get unlimited projects and priority AI generation.
              </p>
              <button
                onClick={() => router.push("/billing")}
                className="w-full rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 transition-colors"
              >
                Upgrade now
              </button>
            </div>
          )}

          {/* User Avatar + Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors outline-none">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-medium text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {displayName}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {user?.email ?? "user@doable.dev"}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 bg-zinc-900 border-zinc-800 bottom-full mb-2"
            >
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={() => router.push("/settings")}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={() => router.push("/ai-settings")}
              >
                <Bot className="mr-2 h-4 w-4" />
                AI Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-white/5 focus:text-white"
                onClick={() => router.push("/billing")}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                onClick={() => {
                  logout();
                  router.push("/");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200">Create folder</DialogTitle>
          </DialogHeader>
          <div>
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
              className="bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateFolderOpen(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={folderSubmitting || !newFolderName.trim()}
              className="bg-violet-600 text-white hover:bg-violet-500"
            >
              {folderSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!renamingFolder} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200">Rename folder</DialogTitle>
          </DialogHeader>
          <div>
            <Input
              placeholder="Folder name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
              autoFocus
              className="bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenamingFolder(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={folderSubmitting || !renameValue.trim()}
              className="bg-violet-600 text-white hover:bg-violet-500"
            >
              {folderSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirmation */}
      <Dialog open={!!deletingFolder} onOpenChange={(open) => !open && setDeletingFolder(null)}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200">Delete folder</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            Are you sure you want to delete &ldquo;{deletingFolder?.name}&rdquo;?
            Projects inside this folder will be moved to the root level.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingFolder(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteFolder}
              disabled={folderSubmitting}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {folderSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
