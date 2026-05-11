"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useAttachments } from "@/hooks/use-attachments";
import {
  apiListProjects, apiListSharedProjects, apiListRecentlyViewed,
  apiRecordProjectView, apiCreateProject, apiToggleStarProject,
  apiDeleteProject, apiDuplicateProject, apiUpdateProject,
  apiListTemplates, apiFetch, getStoredTokens, apiListWorkspaces,
  type ApiProject, type ApiTemplate,
} from "@/lib/api";
import { startBridge, onBridgeStatus, type BridgeStatus } from "@/lib/prompt-bridge";
import { useToasts } from "@/hooks/use-toasts";
import { DASHBOARD_EVENTS, emitDashboardEvent, type DashboardFilter } from "@/components/dashboard/sidebar";
import type { Folder } from "@doable/shared";
import type { ViewMode, StatusFilter, SortKey, SortDir } from "./dashboard-constants";
import { VIEW_MODE_KEY } from "./dashboard-constants";
import { useRotatingGreeting, useContextMenu } from "./dashboard-hooks";

const PAGE_SIZE = 12;
const WS_KEY = "doable_active_workspace_id";

export function useDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { toasts, addToast, dismissToast } = useToasts();
  const speechRecognition = useSpeechRecognition((transcript: string) => {
    setPrompt((prev) => (prev ? prev + " " + transcript : transcript));
  });
  const imageAttachments = useAttachments();

  // Data
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [recentProjects, setRecentProjects] = useState<ApiProject[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProjects, setTotalProjects] = useState(0);
  const [recentPage, setRecentPage] = useState(1);
  const [totalRecent, setTotalRecent] = useState(0);
  const [sharedProjects, setSharedProjects] = useState<ApiProject[]>([]);
  const [sharedPage, setSharedPage] = useState(1);
  const [totalShared, setTotalShared] = useState(0);

  // UI state
  const [prompt, setPrompt] = useState("");
  // null = use server-side detection chain (prompt text → workspace admin
  // default → vite-react). Picked explicitly via the ChatInput dropdown.
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<"agent" | "plan">("agent");
  const [activeTab, setActiveTab] = useState<"recent" | "projects" | "templates">("recent");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) ?? "grid";
    return "grid";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [starredFilter, setStarredFilter] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [previewTemplate, setPreviewTemplate] = useState<ApiTemplate | null>(null);
  const [remixTemplate, setRemixTemplate] = useState<ApiTemplate | null>(null);
  const [showImportGitHub, setShowImportGitHub] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sidebarFilter, setSidebarFilter] = useState<DashboardFilter>("all");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [renamingProject, setRenamingProject] = useState<ApiProject | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveToFolderProject, setMoveToFolderProject] = useState<string | null>(null);

  const { menu: contextMenu, show: showContextMenu, hide: hideContextMenu } = useContextMenu();
  const searchRef = useRef<HTMLInputElement>(null);
  const firstName = user?.displayName?.split(" ")[0] ?? "there";
  const greeting = useRotatingGreeting(firstName);

  // ── Auto-open import dialog after GitHub OAuth redirect ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") === "1") {
      setShowImportGitHub(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("import");
      url.searchParams.delete("github_connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

  // ── Auto-submit prompt from URL ──
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (autoSubmitRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const urlPrompt = params.get("prompt");
    if (!urlPrompt) return;
    autoSubmitRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("prompt");
    window.history.replaceState({}, "", url.toString());
    setPrompt(urlPrompt);
    setTimeout(() => { handleSubmit(urlPrompt); }, 50);
     
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Data fetching ──
  const fetchProjects = useCallback(async (page = 1, append = false) => {
    try {
      if (!append) setError(null);
      if (page > 1) setIsLoadingMore(true);
      const activeWsId = typeof window !== "undefined" ? localStorage.getItem(WS_KEY) : null;
      const res = await apiListProjects({ page, pageSize: PAGE_SIZE, status: statusFilter !== "all" ? statusFilter : undefined, search: debouncedSearch.trim() || undefined, folderId: activeFolderId ?? undefined, workspaceId: activeWsId ?? undefined });
      setProjects((prev) => (append ? [...prev, ...res.data] : res.data));
      setCurrentPage(page);
      setTotalProjects(res.pagination.total);
    } catch { if (!append) { setError("Failed to load projects"); setProjects([]); }
    } finally { setIsLoading(false); setIsLoadingMore(false); }
  }, [statusFilter, debouncedSearch, activeFolderId]);

  const fetchRecentlyViewed = useCallback(async (page = 1, append = false) => {
    try {
      if (page > 1) setIsLoadingMore(true);
      const activeWsId = typeof window !== "undefined" ? localStorage.getItem(WS_KEY) : null;
      const res = await apiListRecentlyViewed({ page, pageSize: PAGE_SIZE, workspaceId: activeWsId ?? undefined });
      setRecentProjects((prev) => (append ? [...prev, ...res.data] : res.data));
      setRecentPage(page); setTotalRecent(res.pagination.total);
    } catch { if (!append) setRecentProjects([]); }
    finally { setIsLoading(false); setIsLoadingMore(false); }
  }, []);

  const fetchSharedProjects = useCallback(async (page = 1, append = false) => {
    try {
      if (page > 1) setIsLoadingMore(true);
      const res = await apiListSharedProjects({ page, pageSize: PAGE_SIZE });
      setSharedProjects((prev) => (append ? [...prev, ...res.data] : res.data));
      setSharedPage(page); setTotalShared(res.pagination.total);
    } catch { if (!append) setSharedProjects([]); }
    finally { setIsLoading(false); setIsLoadingMore(false); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try { const res = await apiListTemplates(); setTemplates(res.data.templates.filter((t) => t.id !== "blank")); }
    catch {} finally { setIsLoadingTemplates(false); }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const wsId = typeof window !== "undefined" ? localStorage.getItem(WS_KEY) : null;
      if (!wsId) { setFolders([]); return; }
      const res = await apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${wsId}`);
      setFolders(res.data);
    } catch { setFolders([]); }
  }, []);

  // Validate workspace ID before fetching — prevents stale IDs from causing
  // 403 (projects) or empty results (recently-viewed, folders) on initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wsId = typeof window !== "undefined" ? localStorage.getItem(WS_KEY) : null;
      if (wsId) {
        try {
          const wsRes = await apiListWorkspaces();
          if (cancelled) return;
          if (!wsRes.data.some(w => w.id === wsId)) {
            const valid = wsRes.data[0];
            if (valid) localStorage.setItem(WS_KEY, valid.id);
            else localStorage.removeItem(WS_KEY);
          }
        } catch {
          // Validation failed (token expired mid-request, network error, etc.)
          // Clear the potentially stale workspace ID to prevent 403 errors
          // when fetching projects — the API will use the user's default workspace.
          localStorage.removeItem(WS_KEY);
        }
      }
      if (!cancelled) { fetchProjects(); fetchRecentlyViewed(); fetchFolders(); }
    })();
    return () => { cancelled = true; };
  }, [fetchProjects, fetchRecentlyViewed, fetchFolders]);
  useEffect(() => { if (activeTab === "templates" && templates.length === 0 && !isLoadingTemplates) fetchTemplates(); }, [activeTab, templates.length, isLoadingTemplates, fetchTemplates]);

  // ── Sidebar events ──
  useEffect(() => {
    const handleFilter = (e: Event) => {
      const filter = (e as CustomEvent<DashboardFilter>).detail;
      setSidebarFilter(filter); setActiveFolderId(null);
      setActiveTab(filter === "all" ? "recent" : "projects");
      setStarredFilter(filter === "starred");
      if (filter === "shared") fetchSharedProjects();
    };
    const handleFolder = (e: Event) => { setActiveFolderId((e as CustomEvent<string>).detail); setSidebarFilter("all"); setActiveTab("projects"); setStarredFilter(false); };
    const handleSearchFocus = () => { searchRef.current?.focus(); };
    const handleImportGitHub = () => { setShowImportGitHub(true); };
    const handleWorkspaceChanged = () => { fetchProjects(); fetchRecentlyViewed(); fetchFolders(); };
    window.addEventListener(DASHBOARD_EVENTS.NAVIGATE_FILTER, handleFilter);
    window.addEventListener(DASHBOARD_EVENTS.NAVIGATE_FOLDER, handleFolder);
    window.addEventListener(DASHBOARD_EVENTS.SEARCH_FOCUS, handleSearchFocus);
    window.addEventListener(DASHBOARD_EVENTS.IMPORT_GITHUB, handleImportGitHub);
    window.addEventListener(DASHBOARD_EVENTS.WORKSPACE_CHANGED, handleWorkspaceChanged);
    return () => { window.removeEventListener(DASHBOARD_EVENTS.NAVIGATE_FILTER, handleFilter); window.removeEventListener(DASHBOARD_EVENTS.NAVIGATE_FOLDER, handleFolder); window.removeEventListener(DASHBOARD_EVENTS.SEARCH_FOCUS, handleSearchFocus); window.removeEventListener(DASHBOARD_EVENTS.IMPORT_GITHUB, handleImportGitHub); window.removeEventListener(DASHBOARD_EVENTS.WORKSPACE_CHANGED, handleWorkspaceChanged); };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setSelectedIds(new Set()); setSearchQuery(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Drag-and-drop folder move ──
  const moveToFolderRef = useRef<((projectId: string, folderId: string | null) => void) | null>(null);
  useEffect(() => {
    const handler = (e: Event) => { const { projectId, folderId } = (e as CustomEvent<{ projectId: string; folderId: string | null }>).detail; if (projectId) moveToFolderRef.current?.(projectId, folderId); };
    window.addEventListener(DASHBOARD_EVENTS.MOVE_PROJECT_TO_FOLDER, handler);
    return () => window.removeEventListener(DASHBOARD_EVENTS.MOVE_PROJECT_TO_FOLDER, handler);
  }, []);

  // ── Actions ──
  const updateBothArrays = (updater: (prev: ApiProject[]) => ApiProject[]) => { setProjects(updater); setRecentProjects(updater); };

  const handleSubmit = async (textOverride?: string | unknown) => {
    const inputText = typeof textOverride === "string" ? textOverride : prompt;
    const hasContent = inputText.trim() || imageAttachments.attachments.length > 0;
    if (!hasContent || isCreating) return;
    setIsCreating(true); setCreatingStatus("Creating project…");
    try {
      const text = inputText.trim() || "See attached file(s)";
      const activeWsId = typeof window !== "undefined" ? localStorage.getItem("doable_active_workspace_id") ?? undefined : undefined;
      // API caps: name ≤100, description ≤500, prompt ≤5000. Slice each so
      // long prompts don't trip validation on the server.
      const res = await apiCreateProject({
        name: text.slice(0, 100),
        description: text.slice(0, 500),
        prompt: text.slice(0, 5000),
        workspaceId: activeWsId,
        frameworkId: frameworkId ?? undefined,
      });
      const projectId = res.data.id;
      sessionStorage.setItem(`doable_initial_prompt_${projectId}`, JSON.stringify({ prompt: text, attachments: imageAttachments.attachments }));
      setCreatingStatus("Connecting to AI…");
      const mode = startMode === "plan" ? "plan" : "agent";
      const { accessToken } = getStoredTokens();
      const bridgeAttachments = imageAttachments.attachments.map((a) => ({ type: a.mimeType, data: a.data, name: a.name }));
      startBridge(projectId, text, mode, accessToken, bridgeAttachments.length > 0 ? bridgeAttachments : undefined);
      const unsub = onBridgeStatus((_status: BridgeStatus, msg: string) => { setCreatingStatus(msg); });
      imageAttachments.clearAll();
      // Only put a truncated hint in the URL — the full prompt lives in
      // sessionStorage and the in-flight bridge. Long prompts in the URL
      // break browser/Next.js URL length limits (typically ~8 KB).
      const urlPromptHint = text.length > 500 ? text.slice(0, 500) : text;
      router.push(`/editor/${projectId}?prompt=${encodeURIComponent(urlPromptHint)}${startMode === "plan" ? "&mode=plan" : ""}`);
      setTimeout(unsub, 5000);
    } catch (err) {
      console.error("[dashboard] handleSubmit failed", err);
      const message = err instanceof Error
        ? `Failed to create project: ${err.message}`
        : "Failed to create project. Please try again.";
      setError(message);
      setIsCreating(false);
      setCreatingStatus("");
    }
  };

  const toggleStar = async (id: string) => {
    updateBothArrays((prev) => prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)));
    try { await apiToggleStarProject(id); emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED); }
    catch { updateBothArrays((prev) => prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p))); }
  };

  const handleDelete = async (id: string) => {
    const name = projects.find((p) => p.id === id)?.name || recentProjects.find((p) => p.id === id)?.name || "Project";
    updateBothArrays((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setDeleteConfirmId(null);
    try { await apiDeleteProject(id); emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED); addToast("success", `"${name}" deleted`); }
    catch { addToast("error", `Failed to delete "${name}"`); fetchProjects(); fetchRecentlyViewed(); }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    updateBothArrays((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set()); setBulkDeleteConfirm(false);
    try { await Promise.all(ids.map((id) => apiDeleteProject(id))); emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED); addToast("success", `${ids.length} project${ids.length === 1 ? "" : "s"} deleted`); }
    catch { addToast("error", "Failed to delete some projects"); fetchProjects(); fetchRecentlyViewed(); }
  };

  const handleDuplicate = async (id: string) => {
    try { const res = await apiDuplicateProject(id); setProjects((prev) => [res.data, ...prev]); setTotalProjects((t) => t + 1); emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED); } catch {}
  };

  const handleRename = async () => {
    if (!renamingProject || !renameValue.trim()) return;
    try { const res = await apiUpdateProject(renamingProject.id, { name: renameValue.trim() }); updateBothArrays((prev) => prev.map((p) => (p.id === renamingProject.id ? { ...p, ...res.data } : p))); setRenamingProject(null); setRenameValue(""); emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED); } catch {}
  };

  const handleMoveToFolder = async (projectId: string, folderId: string | null) => {
    try { await apiUpdateProject(projectId, { folderId }); updateBothArrays((prev) => prev.map((p) => (p.id === projectId ? { ...p, folder_id: folderId } : p))); setMoveToFolderProject(null); emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED); } catch {}
  };
  moveToFolderRef.current = handleMoveToFolder;

  const handleBulkMoveToFolder = async (folderId: string | null) => {
    const ids = Array.from(selectedIds);
    try { await Promise.all(ids.map((id) => apiUpdateProject(id, { folderId }))); updateBothArrays((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, folder_id: folderId } : p))); setSelectedIds(new Set()); setMoveToFolderProject(null); emitDashboardEvent(DASHBOARD_EVENTS.PROJECTS_CHANGED); } catch {}
  };

  const navigateToProject = (id: string) => { apiRecordProjectView(id).catch(() => {}); router.push(`/editor/${id}`); };

  const handleSelect = (id: string, add: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (add) { if (next.has(id)) next.delete(id); else next.add(id); }
      else { if (next.has(id) && next.size === 1) next.clear(); else { next.clear(); next.add(id); } }
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  // ── Display projects ──
  const sourceProjects = sidebarFilter === "shared" ? sharedProjects : activeTab === "recent" ? recentProjects : projects;
  const displayProjects = useMemo(() => {
    let filtered = [...sourceProjects];
    if (sidebarFilter === "starred" || starredFilter) filtered = filtered.filter((p) => p.starred);
    // Client-side search filter for tabs without server-side search (recent, shared)
    if (debouncedSearch.trim() && activeTab !== "projects") {
      const q = debouncedSearch.trim().toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") filtered = filtered.filter((p) => p.status === statusFilter);
    filtered.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name) * dir;
        case "status": return a.status.localeCompare(b.status) * dir;
        case "created_at": return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
        default: return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
      }
    });
    return filtered;
  }, [sourceProjects, sidebarFilter, starredFilter, sortKey, sortDir, debouncedSearch, activeTab, statusFilter]);

  const hasMore = sidebarFilter === "shared" ? sharedProjects.length < totalShared : activeTab === "recent" ? recentProjects.length < totalRecent : projects.length < totalProjects;
  const loadMore = () => {
    if (isLoadingMore) return;
    if (sidebarFilter === "shared") fetchSharedProjects(sharedPage + 1, true);
    else if (activeTab === "recent") fetchRecentlyViewed(recentPage + 1, true);
    else fetchProjects(currentPage + 1, true);
  };

  const contextProject = contextMenu.projectId ? (projects.find((p) => p.id === contextMenu.projectId) ?? recentProjects.find((p) => p.id === contextMenu.projectId) ?? null) : null;
  const activeFolderName = activeFolderId ? folders.find((f) => f.id === activeFolderId)?.name ?? "Folder" : null;

  return {
    // Auth
    user, router, greeting,
    // Data
    projects, recentProjects, templates, folders, displayProjects,
    isLoading, isLoadingMore, isLoadingTemplates, isCreating, creatingStatus, error,
    totalProjects, totalRecent, hasMore,
    // UI state
    prompt, setPrompt, startMode, setStartMode, frameworkId, setFrameworkId,
    activeTab, setActiveTab, viewMode, setViewMode,
    searchQuery, setSearchQuery, statusFilter, setStatusFilter,
    starredFilter, setStarredFilter, sortKey, sortDir,
    previewTemplate, setPreviewTemplate, remixTemplate, setRemixTemplate,
    showImportGitHub, setShowImportGitHub,
    selectedIds, setSelectedIds,
    sidebarFilter, setSidebarFilter, activeFolderId, setActiveFolderId,
    deleteConfirmId, setDeleteConfirmId,
    bulkDeleteConfirm, setBulkDeleteConfirm,
    renamingProject, setRenamingProject, renameValue, setRenameValue,
    moveToFolderProject, setMoveToFolderProject,
    contextMenu, showContextMenu, hideContextMenu, contextProject,
    activeFolderName, searchRef,
    // Hooks
    speechRecognition, imageAttachments, toasts, addToast, dismissToast,
    // Actions
    handleSubmit, toggleStar, handleDelete, handleBulkDelete,
    handleDuplicate, handleRename, handleMoveToFolder, handleBulkMoveToFolder,
    navigateToProject, handleSelect, handleSort, loadMore,
    fetchProjects, fetchRecentlyViewed, setError,
    emitDashboardEvent,
  };
}
