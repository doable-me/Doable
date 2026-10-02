"use client";
import { useUiText } from "@/i18n/use-ui-text";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, FolderIcon } from "lucide-react";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { UseTemplateDialog } from "@/components/templates/use-template-dialog";
import { ImportGitHubProjectDialog } from "@/modules/dashboard/components/import-github-project-dialog";
import type { ApiProject, ApiTemplate } from "@/lib/api";
import type { Folder } from "@doable/shared";

interface DashboardDialogsProps {
  // Delete
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  projects: ApiProject[];
  recentProjects: ApiProject[];
  onDelete: (id: string) => void;
  // Bulk delete
  bulkDeleteConfirm: boolean;
  setBulkDeleteConfirm: (v: boolean) => void;
  selectedIds: Set<string>;
  onBulkDelete: () => void;
  // Rename
  renamingProject: ApiProject | null;
  setRenamingProject: (p: ApiProject | null) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRename: () => void;
  // Move to folder
  moveToFolderProject: string | null;
  setMoveToFolderProject: (id: string | null) => void;
  folders: Folder[];
  onMoveToFolder: (projectId: string, folderId: string | null) => void;
  // Templates
  previewTemplate: ApiTemplate | null;
  setPreviewTemplate: (t: ApiTemplate | null) => void;
  remixTemplate: ApiTemplate | null;
  setRemixTemplate: (t: ApiTemplate | null) => void;
  onTemplateCreated: (projectId: string) => void;
  // GitHub import
  showImportGitHub: boolean;
  setShowImportGitHub: (v: boolean) => void;
}

export function DashboardDialogs({
  deleteConfirmId,
  setDeleteConfirmId,
  projects,
  recentProjects,
  onDelete,
  bulkDeleteConfirm,
  setBulkDeleteConfirm,
  selectedIds,
  onBulkDelete,
  renamingProject,
  setRenamingProject,
  renameValue,
  setRenameValue,
  onRename,
  moveToFolderProject,
  setMoveToFolderProject,
  folders,
  onMoveToFolder,
  previewTemplate,
  setPreviewTemplate,
  remixTemplate,
  setRemixTemplate,
  onTemplateCreated,
  showImportGitHub,
  setShowImportGitHub,
}: DashboardDialogsProps) {
  const ui = useUiText();

  const deleteName =
    projects.find((p) => p.id === deleteConfirmId)?.name ??
    recentProjects.find((p) => p.id === deleteConfirmId)?.name;

  return (
    <>
      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui("Delete project")}</DialogTitle>
            <DialogDescription>
              {" "}
              {ui("Are you sure you want to delete “")}
              {deleteName}
              {ui("”? This action cannot be undone.")}{" "}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              {ui("Cancel")}
            </Button>
            <Button
              onClick={() => deleteConfirmId && onDelete(deleteConfirmId)}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {ui("Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete */}
      <Dialog
        open={bulkDeleteConfirm}
        onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {ui("Delete {count} projects", { count: selectedIds.size })}
            </DialogTitle>
            <DialogDescription>
              {" "}
              {ui("Are you sure you want to delete")} {selectedIds.size}{" "}
              {ui("selected project")}
              {selectedIds.size !== 1 ? ui("s") : ""}
              {ui("? This action cannot be undone.")}{" "}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteConfirm(false)}
            >
              {ui("Cancel")}
            </Button>
            <Button
              onClick={onBulkDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {ui("Delete")} {selectedIds.size} {ui("project")}
              {selectedIds.size !== 1 ? ui("s") : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog
        open={!!renamingProject}
        onOpenChange={(open) => !open && setRenamingProject(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui("Rename project")}</DialogTitle>
          </DialogHeader>
          <div>
            <Input
              placeholder={ui("Project name")}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingProject(null)}>
              {ui("Cancel")}
            </Button>
            <Button
              onClick={onRename}
              disabled={!renameValue.trim()}
              className="bg-brand-600 text-white hover:bg-brand-500"
            >
              {ui("Rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Folder */}
      <Dialog
        open={!!moveToFolderProject}
        onOpenChange={(open) => !open && setMoveToFolderProject(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui("Move to folder")}</DialogTitle>
            <DialogDescription>
              {ui("Choose a folder for this project.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            <button
              onClick={() =>
                moveToFolderProject && onMoveToFolder(moveToFolderProject, null)
              }
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />{" "}
              {ui("Root (no folder)")}{" "}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() =>
                  moveToFolderProject &&
                  onMoveToFolder(moveToFolderProject, f.id)
                }
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <FolderIcon className="h-4 w-4 text-muted-foreground" />{" "}
                {f.name}
              </button>
            ))}
            {folders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {ui("No folders yet. Create one in the sidebar.")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Preview */}
      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onUseTemplate={() => {
          setRemixTemplate(previewTemplate);
          setPreviewTemplate(null);
        }}
      />

      {/* Use Template / Remix */}
      <UseTemplateDialog
        template={remixTemplate}
        onClose={() => setRemixTemplate(null)}
        onCreated={onTemplateCreated}
      />

      {/* Import from GitHub */}
      <ImportGitHubProjectDialog
        open={showImportGitHub}
        onOpenChange={setShowImportGitHub}
      />
    </>
  );
}
