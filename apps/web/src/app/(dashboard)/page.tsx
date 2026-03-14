"use client";

import { useState, useMemo } from "react";
import { useProjects } from "@/modules/dashboard/hooks/use-projects";
import { useWorkspaces } from "@/modules/dashboard/hooks/use-workspaces";
import { ProjectGrid } from "@/modules/dashboard/components/project-grid";
import { ProjectList } from "@/modules/dashboard/components/project-list";
import { CreateProjectDialog } from "@/modules/dashboard/components/create-project-dialog";
import { Sidebar } from "@/modules/dashboard/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Project, ProjectStatus } from "@doable/shared";
import {
  Plus,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  FolderPlus,
  Rocket,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type ViewMode = "grid" | "list";
type ProjectWithStar = Project & { starred: boolean };

const STATUS_OPTIONS: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "creating", label: "Creating" },
  { value: "error", label: "Error" },
];

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspaces();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const {
    projects,
    pagination,
    loading,
    error,
    createProject,
    deleteProject,
    duplicateProject,
    toggleStar,
    moveProject,
  } = useProjects({
    workspaceId: activeWorkspace?.id ?? null,
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
  });

  const handleCreate = async (data: {
    name: string;
    slug: string;
    description?: string;
    prompt?: string;
    templateId?: string;
  }) => {
    await createProject(data);
  };

  const handleEdit = (project: ProjectWithStar) => {
    // Navigate to project editor
    window.location.href = `/projects/${project.id}`;
  };

  const handleMove = (id: string) => {
    // For now, move to root (no folder)
    moveProject(id, null);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <Sidebar
        projects={projects}
        loading={loading}
        workspaceId={activeWorkspace?.id ?? null}
      />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b px-6 py-3">
          <h1 className="text-lg font-semibold">Projects</h1>

          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="h-9 w-48 pl-8"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm hover:bg-accent">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setPage(1);
                    }}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Toggle */}
            <div className="flex items-center rounded-md border">
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-l-md p-2 ${
                  viewMode === "grid"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-r-md p-2 ${
                  viewMode === "list"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Create Button */}
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New project
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Empty State */}
          {!loading && projects.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Rocket className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">No projects yet</h2>
              <p className="mb-6 max-w-sm text-center text-sm text-muted-foreground">
                Create your first project to get started. You can start from
                scratch, describe what you want to build, or use a template.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first project
              </Button>
            </div>
          ) : viewMode === "grid" ? (
            <ProjectGrid
              projects={projects}
              loading={loading}
              onStar={toggleStar}
              onDuplicate={duplicateProject}
              onDelete={deleteProject}
              onEdit={handleEdit}
              onMove={handleMove}
            />
          ) : (
            <ProjectList
              projects={projects}
              loading={loading}
              onStar={toggleStar}
              onDuplicate={duplicateProject}
              onDelete={deleteProject}
              onEdit={handleEdit}
              onMove={handleMove}
            />
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
      />
    </div>
  );
}
