"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot, Home, Search, FolderOpen, FolderPlus, Star, UserCircle, Users,
  ChevronDown, ChevronRight, Zap, Settings, LogOut, CreditCard, Check,
  ChevronsUpDown, Plus, Loader2, Shield, Compass, LayoutTemplate, Store, BarChart3, Server,
} from "lucide-react";
import type { Folder } from "@doable/shared";

// Re-export cross-component event system for backward compatibility
export { DASHBOARD_EVENTS, PROJECT_DRAG_TYPE, emitDashboardEvent } from "./sidebar-events";
export type { DashboardFilter } from "./sidebar-events";

import { DASHBOARD_EVENTS, PROJECT_DRAG_TYPE, emitDashboardEvent, type DashboardFilter } from "./sidebar-events";
import { NavItem, GitHubIcon, SectionHeader, FolderNode, buildFolderTree } from "./sidebar-components";

// ---- Main Sidebar Component ----
export function DashboardSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<ApiProject[]>([]);
  const [starredProjects, setStarredProjects] = useState<ApiProject[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);

  const [recentOpen, setRecentOpen] = useState(true);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>("all");
  const [allProjectsDragOver, setAllProjectsDragOver] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [wsSubmitting, setWsSubmitting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [folderSubmitting, setFolderSubmitting] = useState(false);

  // Refresh only workspace credits (lightweight — avoids full project reload)
  const refreshCredits = useCallback(async () => {
    try {
      const wsRes = await apiListWorkspaces();
      setWorkspaces(wsRes.data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const persisted = localStorage.getItem("doable_active_workspace_id");
        // Fetch workspaces first to validate the persisted ID belongs to this user
        const wsRes = await apiListWorkspaces();
        if (cancelled) return;
        setWorkspaces(wsRes.data);
        const found = wsRes.data.find((w) => w.id === persisted);
        const validWsId = found ? found.id : wsRes.data[0]?.id ?? undefined;
        if (wsRes.data.length > 0) {
          setActiveWorkspaceId(validWsId!);
          if (!found && validWsId) localStorage.setItem("doable_active_workspace_id", validWsId);
        }
        const projRes = await apiListProjects({ pageSize: 50, workspaceId: validWsId });
        if (cancelled) return;
        setRecentProjects([...projRes.data].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5));
        setTotalProjects(projRes.pagination.total);
        try { const starRes = await apiListStarredProjects(); if (!cancelled) setStarredProjects(starRes.data); } catch {}
      } catch (err) { console.error("Sidebar: failed to load data:", err); }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  // Refresh credits when tab/window regains focus (user returns from editor)
  useEffect(() => {
    const onFocus = () => { refreshCredits(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshCredits();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshCredits]);

  // Periodic credit refresh every 30 seconds while sidebar is mounted
  useEffect(() => {
    const interval = setInterval(refreshCredits, 30_000);
    return () => clearInterval(interval);
  }, [refreshCredits]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`).then(({ data }) => setFolders(data)).catch(() => setFolders([]));
  }, [activeWorkspaceId]);

  useEffect(() => {
    const handleProjectsChanged = () => {
      const wsId = localStorage.getItem("doable_active_workspace_id") ?? undefined;
      apiListProjects({ pageSize: 50, workspaceId: wsId }).then((res) => {
        setRecentProjects([...res.data].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5));
        setTotalProjects(res.pagination.total);
      }).catch(() => {});
      apiListStarredProjects().then((res) => setStarredProjects(res.data)).catch(() => {});
    };
    const handleFoldersChanged = () => {
      if (!activeWorkspaceId) return;
      apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`).then(({ data }) => setFolders(data)).catch(() => {});
    };
    window.addEventListener(DASHBOARD_EVENTS.PROJECTS_CHANGED, handleProjectsChanged);
    window.addEventListener(DASHBOARD_EVENTS.FOLDERS_CHANGED, handleFoldersChanged);
    return () => { window.removeEventListener(DASHBOARD_EVENTS.PROJECTS_CHANGED, handleProjectsChanged); window.removeEventListener(DASHBOARD_EVENTS.FOLDERS_CHANGED, handleFoldersChanged); };
  }, [activeWorkspaceId]);

  const handleFilterClick = (filter: DashboardFilter) => {
    setActiveFilter(filter); setActiveFolder(null);
    emitDashboardEvent(DASHBOARD_EVENTS.NAVIGATE_FILTER, filter);
    if (pathname !== "/dashboard") router.push("/dashboard");
    onNavigate?.();
  };

  const handleFolderSelect = (folderId: string) => {
    setActiveFolder(folderId); setActiveFilter("all");
    emitDashboardEvent(DASHBOARD_EVENTS.NAVIGATE_FOLDER, folderId);
    if (pathname !== "/dashboard") router.push("/dashboard");
    onNavigate?.();
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !activeWorkspaceId || folderSubmitting) return;
    setFolderSubmitting(true);
    try {
      await apiFetch("/folders", { method: "POST", body: JSON.stringify({ name: newFolderName.trim(), workspaceId: activeWorkspaceId }) });
      setNewFolderName(""); setCreateFolderOpen(false);
      emitDashboardEvent(DASHBOARD_EVENTS.FOLDERS_CHANGED);
      const { data } = await apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`);
      setFolders(data);
    } catch (err) { console.error("Failed to create folder:", err); }
    finally { setFolderSubmitting(false); }
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim() || folderSubmitting) return;
    setFolderSubmitting(true);
    try {
      await apiFetch(`/folders/${renamingFolder.id}`, { method: "PATCH", body: JSON.stringify({ name: renameValue.trim() }) });
      setRenamingFolder(null); setRenameValue("");
      emitDashboardEvent(DASHBOARD_EVENTS.FOLDERS_CHANGED);
      if (activeWorkspaceId) { const { data } = await apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`); setFolders(data); }
    } catch (err) { console.error("Failed to rename folder:", err); }
    finally { setFolderSubmitting(false); }
  };

  const handleDeleteFolder = async () => {
    if (!deletingFolder || folderSubmitting) return;
    setFolderSubmitting(true);
    try {
      await apiFetch(`/folders/${deletingFolder.id}`, { method: "DELETE" });
      setDeletingFolder(null);
      if (activeFolder === deletingFolder.id) { setActiveFolder(null); handleFilterClick("all"); }
      emitDashboardEvent(DASHBOARD_EVENTS.FOLDERS_CHANGED);
      if (activeWorkspaceId) { const { data } = await apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${activeWorkspaceId}`); setFolders(data); }
    } catch (err) { console.error("Failed to delete folder:", err); }
    finally { setFolderSubmitting(false); }
  };

  const handleSwitchWorkspace = (id: string) => { setActiveWorkspaceId(id); localStorage.setItem("doable_active_workspace_id", id); emitDashboardEvent(DASHBOARD_EVENTS.WORKSPACE_CHANGED, id); };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim() || wsSubmitting) return;
    setWsSubmitting(true); setWsError(null);
    try {
      const slug = newWsName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
      const res = await apiFetch<{ data: ApiWorkspace }>("/workspaces", { method: "POST", body: JSON.stringify({ name: newWsName.trim(), slug }) });
      setWorkspaces((prev) => [...prev, res.data]);
      setActiveWorkspaceId(res.data.id);
      localStorage.setItem("doable_active_workspace_id", res.data.id);
      setNewWsName(""); setCreateWsOpen(false);
    } catch (err) { setWsError(err instanceof Error ? err.message : "Failed to create workspace"); }
    finally { setWsSubmitting(false); }
  };

  const displayName = user?.displayName ?? "User";
  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const workspaceName = activeWorkspace?.name ?? `${displayName}'s workspace`;
  const workspacePlan = activeWorkspace?.plan ?? "free";
  const memberCount = (activeWorkspace as ApiWorkspace)?.memberCount ?? 1;
  const credits = (activeWorkspace as ApiWorkspace)?.credits;
  const planDefault = workspacePlan === "free" ? 5 : workspacePlan === "pro" ? 50 : 200;
  const dailyTotal = credits?.dailyTotal ?? planDefault;
  const creditsRemaining = Math.max(0, credits?.dailyRemaining ?? planDefault);
  const creditsUsed = dailyTotal - creditsRemaining;
  const isUnlimited = dailyTotal >= 2_000_000_000;
  const creditsUsedPercent = isUnlimited ? 0 : dailyTotal > 0 ? (creditsUsed / dailyTotal) * 100 : 0;
  // Per-workspace admin override (set via /admin/plans → max_projects_override)
  // takes precedence over the plan-tier default. Without this the sidebar
  // shows a stale "X / 3 (limit)" for any Free workspace that's been bumped
  // for testing or VIP usage, even though the API correctly allows the
  // higher count on create.
  const planMaxProjects = workspacePlan === "free" ? 3 : workspacePlan === "pro" ? 25 : workspacePlan === "business" ? 100 : Infinity;
  const override = (activeWorkspace as ApiWorkspace)?.max_projects_override;
  const maxProjects = typeof override === "number" && override > 0 ? override : planMaxProjects;
  const projectsAtLimit = maxProjects !== Infinity && totalProjects >= maxProjects;
  const folderTree = buildFolderTree(folders);

  return (
    <>
      <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-background">
        {/* Logo */}
        <a href="/dashboard" className="flex items-center gap-2.5 px-5 pt-5 pb-4 hover:opacity-80 transition-opacity cursor-pointer">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 border border-brand-600 dark:bg-gradient-to-br dark:from-brand-600 dark:to-brand-700 dark:border-transparent shadow-sm shadow-brand-700/20 dark:shadow-brand-900/30"><span className="text-sm font-bold text-brand-700 dark:text-white self-end mb-1">D</span><span className="h-2 w-2 rounded-full bg-violet-700 dark:bg-violet-400 self-end mb-2 ml-0.5 shrink-0" /></div>
          <span className="text-lg font-semibold tracking-tight text-foreground">Doable</span>
        </a>

        {/* Workspace Selector */}
        <div className="mb-4 border-b border-border px-3 pb-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="relative block w-full mb-2 outline-none group py-0.5 rounded-md hover:bg-brand-600/8 transition-colors duration-150 text-left pr-7">
              <p className="text-sm font-medium text-foreground break-words group-hover:text-brand-700 dark:group-hover:text-brand-300 transition-colors duration-150">{workspaceName}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{workspacePlan} plan{memberCount > 1 ? ` \u00b7 ${memberCount} members` : ""}</p>
              <span className="absolute right-0 top-0 shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-brand-600 group-hover:bg-brand-700 transition-all duration-150">
                <ChevronDown strokeWidth={3} className="h-3 w-3 text-white" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground">Workspaces</DropdownMenuLabel>
              {workspaces.map((ws) => (
                <DropdownMenuItem key={ws.id} className="focus:bg-accent focus:text-accent-foreground" onClick={() => handleSwitchWorkspace(ws.id)}>
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-600/20 text-xs font-semibold text-brand-700 dark:text-brand-400">{ws.name.charAt(0).toUpperCase()}</div>
                  <span className="ml-2 flex-1 truncate">{ws.name}</span>
                  {ws.id === activeWorkspaceId && <Check className="ml-auto h-3.5 w-3.5 text-brand-700 dark:text-brand-400" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground" onClick={() => setCreateWsOpen(true)}><Plus className="mr-2 h-4 w-4" />Create workspace</DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground" onClick={() => router.push("/workspace-settings")}><Settings className="mr-2 h-4 w-4" />Workspace settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Credits today</span><span className="text-muted-foreground">{isUnlimited ? "Unlimited" : `${creditsUsed} / ${dailyTotal} used`}</span></div>
              {!isUnlimited && (
                <div className="h-1.5 w-full rounded-full bg-muted"><div className={`h-1.5 rounded-full transition-all ${creditsUsedPercent >= 80 ? "bg-gradient-to-r from-orange-500 to-red-500" : "bg-gradient-to-r from-brand-600 to-brand-500"}`} style={{ width: `${Math.min(creditsUsedPercent, 100)}%` }} /></div>
              )}
            </div>
            {/* Render only AFTER workspaces load — `activeWorkspace` is null
             * on initial SSR/CSR render (workspaces fetch is async), and
             * rendering "X / 3 (limit)" with the plan-tier default before
             * the per-workspace max_projects_override is known leads to the
             * "Projects 6 / 3 (limit)" flicker/stale display investors flagged. */}
            {activeWorkspace && maxProjects !== Infinity && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Projects</span><span className={`text-muted-foreground ${projectsAtLimit ? "text-orange-400" : ""}`}>{totalProjects} / {maxProjects}{projectsAtLimit ? " (limit)" : ""}</span></div>
                <div className="h-1.5 w-full rounded-full bg-muted"><div className={`h-1.5 rounded-full transition-all ${projectsAtLimit ? "bg-gradient-to-r from-orange-500 to-red-500" : "bg-gradient-to-r from-brand-600 to-brand-500"}`} style={{ width: `${Math.min((totalProjects / maxProjects) * 100, 100)}%` }} /></div>
              </div>
            )}
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto px-2">
          <div className="space-y-0.5">
            <NavItem icon={Home} label="Home" active={pathname === "/dashboard" && activeFilter === "all" && !activeFolder} onClick={() => handleFilterClick("all")} />
            <NavItem icon={Search} label="Search" shortcut="\u2318K" onClick={() => emitDashboardEvent(DASHBOARD_EVENTS.SEARCH_FOCUS)} />
            <NavItem icon={LayoutTemplate} label="Templates" active={pathname === "/dashboard/templates"} onClick={() => { router.push("/dashboard/templates"); onNavigate?.(); }} />
            <NavItem icon={Compass} label="Discover" active={pathname === "/discover"} onClick={() => { router.push("/discover"); onNavigate?.(); }} />
            <NavItem icon={Store} label="Marketplace" active={pathname.startsWith("/marketplace")} onClick={() => { router.push("/marketplace"); onNavigate?.(); }} />
            <NavItem icon={Server} label="Running instances" active={pathname.startsWith("/runtime")} onClick={() => { router.push("/runtime"); onNavigate?.(); }} />
          </div>

          {/* Projects Section */}
          <SectionHeader label="Projects" />
          <div className="space-y-0.5">
            <div
              onDragOver={(e) => { if (e.dataTransfer.types.includes(PROJECT_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setAllProjectsDragOver(true); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAllProjectsDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setAllProjectsDragOver(false); const pid = e.dataTransfer.getData(PROJECT_DRAG_TYPE); if (pid) emitDashboardEvent(DASHBOARD_EVENTS.MOVE_PROJECT_TO_FOLDER, { projectId: pid, folderId: null }); }}
              className={allProjectsDragOver ? "rounded-lg ring-1 ring-brand-500/40 bg-brand-500/10" : ""}
            >
              <NavItem icon={FolderOpen} label="All projects" active={activeFilter === "all" && !activeFolder} onClick={() => handleFilterClick("all")} count={totalProjects} />
            </div>
            <NavItem icon={Star} label="Starred" active={activeFilter === "starred"} onClick={() => handleFilterClick("starred")} count={starredProjects.length} />
            <NavItem icon={UserCircle} label="Created by me" active={activeFilter === "created-by-me"} onClick={() => handleFilterClick("created-by-me")} />
            <NavItem icon={Users} label="Shared with me" active={activeFilter === "shared"} onClick={() => handleFilterClick("shared")} />
            <NavItem icon={GitHubIcon} label="Import project" onClick={() => emitDashboardEvent(DASHBOARD_EVENTS.IMPORT_GITHUB)} />
          </div>

          {/* Starred mini list */}
          {starredProjects.length > 0 && (
            <div className="mt-3">
              <button onClick={() => handleFilterClick("starred")} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"><Star className="h-3 w-3" />Starred</button>
              <div className="space-y-0.5 mt-0.5">
                {starredProjects.slice(0, 3).map((project) => (
                  <button key={project.id} draggable onDragStart={(e) => { e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id); e.dataTransfer.effectAllowed = "move"; }} onClick={() => { router.push(`/editor/${project.id}`); onNavigate?.(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" /><span className="truncate text-xs">{project.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent */}
          <div className="mt-3">
            <button onClick={() => setRecentOpen(!recentOpen)} className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
              {recentOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Recent
            </button>
            {recentOpen && (
              <div className="space-y-0.5 mt-0.5">
                {recentProjects.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">No recent projects</p>}
                {recentProjects.map((project) => (
                  <button key={project.id} draggable onDragStart={(e) => { e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id); e.dataTransfer.effectAllowed = "move"; }} onClick={() => { router.push(`/editor/${project.id}`); onNavigate?.(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] shrink-0">{project.name.charAt(0)}</div><span className="truncate text-xs">{project.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Folders */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <button onClick={() => setFoldersOpen(!foldersOpen)} className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                {foldersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}Folders
              </button>
              <button onClick={() => setCreateFolderOpen(true)} className="mr-2 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Create folder"><FolderPlus className="h-3.5 w-3.5" /></button>
            </div>
            {foldersOpen && (
              <div className="space-y-0.5 mt-0.5">
                {folderTree.length === 0 && <p className="px-3 py-2 text-[11px] text-muted-foreground">No folders yet</p>}
                {folderTree.map((folder) => (
                  <FolderNode key={folder.id} folder={folder} activeFolder={activeFolder} onSelect={handleFolderSelect} onRename={(f) => { setRenamingFolder(f); setRenameValue(f.name); }} onDelete={(f) => setDeletingFolder(f)} />
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Bottom Section */}
        <div className="mt-auto border-t border-border p-3 space-y-3">
          {workspacePlan === "free" && (
            <div className="rounded-lg bg-gradient-to-br from-brand-600/20 to-brand-600/10 border border-brand-500/20 p-3">
              <div className="flex items-center gap-2 mb-1.5"><Zap className="h-4 w-4 text-brand-500" /><span className="text-sm font-medium text-brand-700 dark:text-brand-300">Upgrade to Pro</span></div>
              <p className="text-[11px] text-muted-foreground mb-2.5">Get unlimited projects and priority AI generation.</p>
              <button onClick={() => router.push("/billing")} className="w-full rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors">Upgrade now</button>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent transition-colors outline-none">
              <Avatar className="h-8 w-8 ring-2 ring-brand-400 dark:ring-transparent"><AvatarFallback className="bg-brand-100 dark:bg-gradient-to-br dark:from-brand-500 dark:to-brand-600 text-xs font-bold text-brand-700 dark:text-white">{initials}</AvatarFallback></Avatar>
              <div className="flex-1 text-left min-w-0"><p className="text-sm font-medium text-foreground truncate">{displayName}</p><p className="text-[11px] text-muted-foreground truncate">{user?.email ?? "user@doable.dev"}</p></div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground" onClick={() => router.push("/settings")}><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground" onClick={() => router.push("/ai-settings")}><Bot className="mr-2 h-4 w-4" />AI Settings</DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground" onClick={() => router.push("/usage")}><BarChart3 className="mr-2 h-4 w-4" />Usage</DropdownMenuItem>
              <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground" onClick={() => router.push("/billing")}><CreditCard className="mr-2 h-4 w-4" />Billing</DropdownMenuItem>
              {user?.isPlatformAdmin && <DropdownMenuItem className="text-amber-800 font-bold dark:text-amber-400 dark:font-normal focus:bg-amber-500/10 focus:text-amber-700 dark:focus:text-amber-300" onClick={() => router.push("/admin")}><Shield className="mr-2 h-4 w-4" />System Admin</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-400" onClick={async () => { await logout(); router.push("/"); }}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Create Workspace */}
      <Dialog open={createWsOpen} onOpenChange={(open) => { setCreateWsOpen(open); if (!open) { setNewWsName(""); setWsError(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create workspace</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="mb-1 block text-sm font-medium text-foreground">Name</label><Input placeholder="My Team" value={newWsName} onChange={(e) => setNewWsName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()} autoFocus /></div>
            {wsError && <p className="text-xs text-red-400">{wsError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWsOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateWorkspace} disabled={wsSubmitting || !newWsName.trim()} className="bg-brand-600 text-white hover:bg-brand-500">{wsSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create folder</DialogTitle></DialogHeader>
          <div><Input placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()} autoFocus /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFolder} disabled={folderSubmitting || !newFolderName.trim()} className="bg-brand-600 text-white hover:bg-brand-500">{folderSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder */}
      <Dialog open={!!renamingFolder} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename folder</DialogTitle></DialogHeader>
          <div><Input placeholder="Folder name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()} autoFocus /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)}>Cancel</Button>
            <Button onClick={handleRenameFolder} disabled={folderSubmitting || !renameValue.trim()} className="bg-brand-600 text-white hover:bg-brand-500">{folderSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder */}
      <Dialog open={!!deletingFolder} onOpenChange={(open) => !open && setDeletingFolder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete folder</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete &ldquo;{deletingFolder?.name}&rdquo;? Projects inside this folder will be moved to the root level.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingFolder(null)}>Cancel</Button>
            <Button onClick={handleDeleteFolder} disabled={folderSubmitting} className="bg-red-600 text-white hover:bg-red-500">{folderSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
