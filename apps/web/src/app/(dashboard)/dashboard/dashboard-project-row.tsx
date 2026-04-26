"use client";

import { useState } from "react";
import {
  MoreHorizontal,
  Copy,
  Trash2,
  ExternalLink,
  Star,
  Pencil,
  CheckSquare,
  Square,
  Compass,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ApiProject } from "@/lib/api";
import { PROJECT_DRAG_TYPE } from "@/components/dashboard/sidebar";
import { STATUS_STYLES, formatRelativeTime } from "./dashboard-constants";
import { ShareDialog } from "@/modules/discover/share-dialog";

export function ProjectRow({
  project,
  selected,
  onSelect,
  onStar,
  onClick,
  onDelete,
  onDuplicate,
  onRename,
  onContextMenu,
  isShared = false,
  onSharedChanged,
}: {
  project: ApiProject;
  selected: boolean;
  onSelect: (id: string, add: boolean) => void;
  onStar: () => void;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isShared?: boolean;
  onSharedChanged?: () => void;
}) {
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES.draft!;
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  return (
    <tr
      className={`group border-b border-border transition-colors cursor-pointer ${
        selected ? "bg-brand-500/5" : "hover:bg-accent"
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Checkbox */}
      <td className="w-10 px-3 py-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(project.id, e.metaKey || e.ctrlKey);
          }}
          className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
            selected
              ? "bg-brand-600 text-white"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {selected ? (
            <CheckSquare className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </td>

      {/* Star */}
      <td className="w-10 px-1 py-3">
        <button onClick={(e) => { e.stopPropagation(); onStar(); }} className="rounded p-0.5">
          <Star className={`h-4 w-4 transition-colors ${
            project.starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-foreground"
          }`} />
        </button>
      </td>

      {/* Name */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-medium text-secondary-foreground">
            {project.name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground line-clamp-1">{project.name}</span>
            {project.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{project.description}</p>
            )}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyle.className}`}>
            {statusStyle.label}
          </span>
          {isShared && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
              title="Shared to Discover"
            >
              <Compass className="h-2.5 w-2.5" />
              Discover
            </span>
          )}
        </div>
      </td>

      {/* Updated */}
      <td className="px-3 py-3 text-sm text-muted-foreground">{formatRelativeTime(project.updated_at)}</td>

      {/* Actions */}
      <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-all">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onClick}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open in editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onStar}>
              <Star className="mr-2 h-3.5 w-3.5" /> {project.starred ? "Unstar" : "Star"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShareDialogOpen(true)}>
              <Compass className="mr-2 h-3.5 w-3.5" />
              {isShared ? "Update Discover listing" : "Share to Discover"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-400 focus:bg-red-500/10 focus:text-red-400" onClick={onDelete}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          projectId={project.id}
          projectName={project.name}
          projectDescription={project.description}
          alreadyShared={isShared}
          initialTitle={project.name}
          onChanged={onSharedChanged}
        />
      </td>
    </tr>
  );
}
