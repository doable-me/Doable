"use client";

import {
  ExternalLink,
  Pencil,
  Copy,
  FolderInput,
  Star,
  Trash2,
} from "lucide-react";
import type { ApiProject } from "@/lib/api";
import type { ContextMenuState } from "./dashboard-hooks";

export function ContextMenuPortal({
  menu,
  project,
  onOpen,
  onStar,
  onDuplicate,
  onRename,
  onMoveToFolder,
  onDelete,
  onHide,
}: {
  menu: ContextMenuState;
  project: ApiProject | null;
  onOpen: () => void;
  onStar: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onMoveToFolder: () => void;
  onDelete: () => void;
  onHide: () => void;
}) {
  if (!menu.visible || !project) return null;

  return (
    <div
      className="fixed z-[100] min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg"
      style={{ top: menu.y, left: menu.x }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { onOpen(); onHide(); }}>
        <ExternalLink className="h-3.5 w-3.5" /> Open in editor
      </button>
      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { onRename(); onHide(); }}>
        <Pencil className="h-3.5 w-3.5" /> Rename
      </button>
      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { onDuplicate(); onHide(); }}>
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </button>
      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { onMoveToFolder(); onHide(); }}>
        <FolderInput className="h-3.5 w-3.5" /> Move to folder
      </button>
      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { onStar(); onHide(); }}>
        <Star className={`h-3.5 w-3.5 ${project.starred ? "fill-yellow-400 text-yellow-400" : ""}`} /> {project.starred ? "Unstar" : "Star"}
      </button>
      <div className="my-1 h-px bg-border" />
      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors" onClick={() => { onDelete(); onHide(); }}>
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
    </div>
  );
}
