"use client";

import { useState } from "react";
import { Loader2, Search, Plus, GitBranch, AlertCircle, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { ToastContainer } from "@/components/ui/toast-container";
import { TemplateCard as NewTemplateCard } from "@/components/templates/template-card";
import { DASHBOARD_EVENTS, emitDashboardEvent } from "@/components/dashboard/sidebar";
import type { SortKey } from "./dashboard-constants";
import { ChatInput } from "./dashboard-chat-input";
import { ProjectCard } from "./dashboard-project-card";
import { ProjectRow } from "./dashboard-project-row";
import { ContextMenuPortal } from "./dashboard-context-menu";
import { DashboardToolbar } from "./dashboard-toolbar";
import { DashboardDialogs } from "./dashboard-dialogs";
import { useDashboard } from "./use-dashboard";
import { ACCEPTED_EXTENSIONS } from "@/hooks/use-attachments";
import { useMyShared } from "@/modules/discover/use-my-shared";
import { CreateProjectDialog } from "@/modules/dashboard/components/create-project-dialog";
import { apiCreateProject } from "@/lib/api";

export default function DashboardPage() {
  const d = useDashboard();
  const shared = useMyShared();
  const [createOpen, setCreateOpen] = useState(false);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (d.sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" />;
    return d.sortDir === "asc"
      ? <ChevronUp className="ml-1 h-3 w-3 text-brand-400" />
      : <ChevronDown className="ml-1 h-3 w-3 text-brand-400" />;
  };

  return (
    <div className="relative min-h-screen">
      {/* Hero: Greeting + Chat Input */}
      {!d.activeFolderId && d.sidebarFilter === "all" && (
        <div className="relative w-full overflow-hidden" style={{ minHeight: "340px" }}>
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 animate-pulse-drift dashboard-hero-gradient" style={{
              width: "130%", height: "130%", top: "-15%", left: "-15%",
            }} />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 z-[1]" style={{
            background: "linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.88) 50%, transparent 100%)",
          }} />
          <div className="relative z-10 px-4 sm:px-8 py-16 max-w-7xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight transition-all duration-500">
                {d.greeting}
              </h1>
            </div>
            <div>
              <ChatInput
                value={d.prompt}
                onChange={d.setPrompt}
                onSubmit={d.handleSubmit}
                isCreating={d.isCreating}
                creatingStatus={d.creatingStatus}
                attachments={d.imageAttachments.attachments}
                onOpenFilePicker={d.imageAttachments.openFilePicker}
                onRemoveAttachment={d.imageAttachments.removeAttachment}
                isListening={d.speechRecognition.isListening}
                isMicSupported={d.speechRecognition.isSupported}
                onToggleMic={d.speechRecognition.toggle}
                startMode={d.startMode}
                onToggleMode={() => d.setStartMode((prev) => (prev === "agent" ? "plan" : "agent"))}
                frameworkId={d.frameworkId}
                onFrameworkChange={d.setFrameworkId}
              />
              <input
                ref={d.imageAttachments.fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                multiple
                className="hidden"
                onChange={d.imageAttachments.handleFileChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-3 sm:px-6 pt-0 pb-10">
        {/* Breadcrumb */}
        {(d.activeFolderId || d.sidebarFilter !== "all") && (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm">
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  d.setSidebarFilter("all");
                  d.setActiveFolderId(null);
                  d.setStarredFilter(false);
                  emitDashboardEvent(DASHBOARD_EVENTS.NAVIGATE_FILTER, "all");
                }}
              >
                Home
              </button>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground font-medium">
                {d.activeFolderName ?? (d.sidebarFilter === "starred" ? "Starred" : d.sidebarFilter === "created-by-me" ? "Created by me" : "Shared with me")}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-foreground mt-2">
              {d.activeFolderName ?? (d.sidebarFilter === "starred" ? "Starred Projects" : d.sidebarFilter === "created-by-me" ? "My Projects" : "Shared Projects")}
            </h1>
          </div>
        )}

        {/* Error */}
        {d.error && (
          <div className="mb-6 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {d.error}
            <button onClick={() => { d.setError(null); d.fetchProjects(); }} className="ml-auto underline hover:text-red-300">Retry</button>
          </div>
        )}

        {/* New Project button — opens the dialog with all 8 frameworks
            + template picker. Quick prompt entry above remains the
            fastest path; this is for users who want explicit control. */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New project
          </button>
        </div>

        {/* Toolbar */}
        <DashboardToolbar
          activeTab={d.activeTab}
          setActiveTab={d.setActiveTab}
          onBrowseTemplates={() => d.router.push("/dashboard/templates")}
          searchRef={d.searchRef}
          searchQuery={d.searchQuery}
          setSearchQuery={d.setSearchQuery}
          statusFilter={d.statusFilter}
          setStatusFilter={d.setStatusFilter}
          starredFilter={d.starredFilter}
          setStarredFilter={d.setStarredFilter}
          viewMode={d.viewMode}
          setViewMode={d.setViewMode}
          selectedIds={d.selectedIds}
          setSelectedIds={d.setSelectedIds}
          folders={d.folders}
          onBulkMoveToFolder={d.handleBulkMoveToFolder}
          onBulkDeleteConfirm={() => d.setBulkDeleteConfirm(true)}
        />

        {/* Loading */}
        {d.isLoading && d.activeTab !== "templates" && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Loading projects...</p>
          </div>
        )}

        {/* Grid View */}
        {!d.isLoading && d.activeTab !== "templates" && d.viewMode === "grid" && d.displayProjects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.displayProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                selected={d.selectedIds.has(project.id)}
                onSelect={d.handleSelect}
                onStar={() => d.toggleStar(project.id)}
                onClick={() => d.navigateToProject(project.id)}
                onDelete={() => d.setDeleteConfirmId(project.id)}
                onDuplicate={() => d.handleDuplicate(project.id)}
                onRename={() => { d.setRenamingProject(project); d.setRenameValue(project.name); }}
                onContextMenu={(e) => d.showContextMenu(e, project.id)}
                isShared={shared.sharedIds.has(project.id)}
                onSharedChanged={shared.refresh}
              />
            ))}
          </div>
        )}

        {/* List View */}
        {!d.isLoading && d.activeTab !== "templates" && d.viewMode === "list" && d.displayProjects.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr className="border-b border-border">
                  <th className="w-10 px-3 py-3" />
                  <th className="w-10 px-1 py-3" />
                  <th className="px-3 py-3 text-left">
                    <button className="inline-flex items-center font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => d.handleSort("name")}>
                      Name <SortIcon col="name" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button className="inline-flex items-center font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => d.handleSort("status")}>
                      Status <SortIcon col="status" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button className="inline-flex items-center font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => d.handleSort("updated_at")}>
                      Updated <SortIcon col="updated_at" />
                    </button>
                  </th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {d.displayProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    selected={d.selectedIds.has(project.id)}
                    onSelect={d.handleSelect}
                    onStar={() => d.toggleStar(project.id)}
                    onClick={() => d.navigateToProject(project.id)}
                    onDelete={() => d.setDeleteConfirmId(project.id)}
                    onDuplicate={() => d.handleDuplicate(project.id)}
                    onRename={() => { d.setRenamingProject(project); d.setRenameValue(project.name); }}
                    onContextMenu={(e) => d.showContextMenu(e, project.id)}
                    isShared={shared.sharedIds.has(project.id)}
                    onSharedChanged={shared.refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Templates */}
        {d.activeTab === "templates" && (
          d.isLoadingTemplates ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">Loading templates...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {d.templates
                .filter((t) => d.searchQuery.trim()
                  ? t.name.toLowerCase().includes(d.searchQuery.toLowerCase()) || t.description.toLowerCase().includes(d.searchQuery.toLowerCase())
                  : true
                )
                .map((template) => (
                  <NewTemplateCard key={template.id} template={template} onClick={() => d.setPreviewTemplate(template)} />
                ))}
              {d.templates.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-muted-foreground">No templates available.</p>
                </div>
              )}
            </div>
          )
        )}

        {/* Empty State */}
        {!d.isLoading && d.activeTab !== "templates" && d.displayProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              {d.searchQuery || d.statusFilter !== "all" || d.starredFilter
                ? <Search className="h-8 w-8 text-muted-foreground" />
                : <Plus className="h-8 w-8 text-muted-foreground" />}
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {d.searchQuery ? "No projects found"
                : d.statusFilter !== "all" || d.starredFilter ? "No matching projects"
                : d.activeFolderId ? "This folder is empty"
                : "No projects yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {d.searchQuery ? `No projects match "${d.searchQuery}". Try a different search.`
                : d.statusFilter !== "all" || d.starredFilter ? "Try adjusting your filters."
                : "Describe what you want to build in the chat above, or import an existing project from GitHub."}
            </p>
            {!d.searchQuery && d.statusFilter === "all" && !d.starredFilter && !d.activeFolderId && (
              <button onClick={() => d.setShowImportGitHub(true)} className="mt-4 flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors">
                <GitBranch className="h-3.5 w-3.5" /> Import from GitHub
              </button>
            )}
            {(d.searchQuery || d.statusFilter !== "all" || d.starredFilter) && (
              <button onClick={() => { d.setSearchQuery(""); d.setStatusFilter("all"); d.setStarredFilter(false); }} className="mt-4 text-sm text-brand-400 hover:text-brand-300 transition-colors">
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Load More */}
        {!d.isLoading && d.activeTab !== "templates" && d.displayProjects.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-3">
            {d.hasMore && (
              <button
                onClick={d.loadMore}
                disabled={d.isLoadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {d.isLoadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</> : "Load more"}
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              Showing {d.displayProjects.length} of {d.activeTab === "recent" ? d.totalRecent : d.totalProjects} project{(d.activeTab === "recent" ? d.totalRecent : d.totalProjects) !== 1 ? "s" : ""}
              {d.searchQuery && ` matching "${d.searchQuery}"`}
            </span>
          </div>
        )}
      </div>

      {/* Context Menu */}
      <ContextMenuPortal
        menu={d.contextMenu}
        project={d.contextProject}
        onOpen={() => d.contextMenu.projectId && d.navigateToProject(d.contextMenu.projectId)}
        onStar={() => d.contextMenu.projectId && d.toggleStar(d.contextMenu.projectId)}
        onDuplicate={() => d.contextMenu.projectId && d.handleDuplicate(d.contextMenu.projectId)}
        onRename={() => { if (d.contextProject) { d.setRenamingProject(d.contextProject); d.setRenameValue(d.contextProject.name); } }}
        onMoveToFolder={() => { if (d.contextMenu.projectId) d.setMoveToFolderProject(d.contextMenu.projectId); }}
        onDelete={() => { if (d.contextMenu.projectId) d.setDeleteConfirmId(d.contextMenu.projectId); }}
        onHide={d.hideContextMenu}
      />

      {/* Dialogs */}
      <DashboardDialogs
        deleteConfirmId={d.deleteConfirmId}
        setDeleteConfirmId={d.setDeleteConfirmId}
        projects={d.projects}
        recentProjects={d.recentProjects}
        onDelete={d.handleDelete}
        bulkDeleteConfirm={d.bulkDeleteConfirm}
        setBulkDeleteConfirm={d.setBulkDeleteConfirm}
        selectedIds={d.selectedIds}
        onBulkDelete={d.handleBulkDelete}
        renamingProject={d.renamingProject}
        setRenamingProject={d.setRenamingProject}
        renameValue={d.renameValue}
        setRenameValue={d.setRenameValue}
        onRename={d.handleRename}
        moveToFolderProject={d.moveToFolderProject}
        setMoveToFolderProject={d.setMoveToFolderProject}
        folders={d.folders}
        onMoveToFolder={d.handleMoveToFolder}
        previewTemplate={d.previewTemplate}
        setPreviewTemplate={d.setPreviewTemplate}
        remixTemplate={d.remixTemplate}
        setRemixTemplate={d.setRemixTemplate}
        onTemplateCreated={(projectId) => { d.setRemixTemplate(null); d.router.push(`/editor/${projectId}`); }}
        showImportGitHub={d.showImportGitHub}
        setShowImportGitHub={d.setShowImportGitHub}
      />

      <ToastContainer toasts={d.toasts} onDismiss={d.dismissToast} />

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (input) => {
          const activeWsId = typeof window !== "undefined"
            ? localStorage.getItem("doable_active_workspace_id") ?? undefined
            : undefined;
          const res = await apiCreateProject({
            name: input.name,
            slug: input.slug,
            description: input.description,
            prompt: input.prompt,
            templateId: input.templateId,
            frameworkId: input.frameworkId,
            workspaceId: activeWsId,
          });
          d.router.push(`/editor/${res.data.id}`);
        }}
      />
    </div>
  );
}
