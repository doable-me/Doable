"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiListProjects, type ApiProject } from "@/lib/api";

interface AddProjectsToFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
  folderName: string | null;
  workspaceId?: string;
  /** Move the selected projects into the folder. */
  onAdd: (projectIds: string[]) => Promise<void>;
}

/**
 * Lets the user move existing projects into the active folder from the folder's
 * empty state. The move mutation (PATCH /projects/:id { folderId }) already
 * exists; this is the missing UI. See doableinfo/folder_plus_button.md.
 */
export function AddProjectsToFolderDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
  workspaceId,
  onAdd,
}: AddProjectsToFolderDialogProps) {
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch the workspace's projects WITHOUT a folder filter so we can offer
      // the ones not already inside this folder.
      const res = await apiListProjects({ workspaceId, pageSize: 100 });
      setProjects(res.data.filter((p) => p.folder_id !== folderId));
    } catch (err) {
      console.error("Failed to load projects for folder:", err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, folderId]);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      load();
    }
  }, [open, load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setIsSaving(true);
    try {
      await onAdd(Array.from(selected));
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to add projects to folder:", err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add projects to {folderName ?? "this folder"}</DialogTitle>
          <DialogDescription>
            Select projects to move into this folder. You can move them back out
            at any time from each project&apos;s menu.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading projects…
            </div>
          ) : projects.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No other projects to add. Create one instead.
            </p>
          ) : (
            projects.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm text-foreground">{p.name}</span>
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={selected.size === 0 || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              `Add${selected.size > 0 ? ` ${selected.size} project${selected.size === 1 ? "" : "s"}` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
