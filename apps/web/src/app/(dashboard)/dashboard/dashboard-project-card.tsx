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
import { ShareDialog } from "@/modules/discover/share-dialog";
import {
  STATUS_STYLES,
  PROJECT_GRADIENTS,
  PROJECT_ACCENT_COLORS,
  getProjectColorIndex,
  formatRelativeTime,
} from "./dashboard-constants";

export function ProjectCard({
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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const statusStyle = STATUS_STYLES[project.status] ?? STATUS_STYLES.draft!;
  const [imgFailed, setImgFailed] = useState(false);
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const colorIdx = getProjectColorIndex(project.name);

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer ${
        selected
          ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500/30"
          : "border-border bg-card hover:border-border hover:bg-accent/30"
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PROJECT_DRAG_TYPE, project.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Thumbnail — real image with gradient fallback */}
      <div className={`relative h-36 rounded-t-xl overflow-hidden ${(!project.thumbnail_url || imgFailed) ? `bg-gradient-to-br ${PROJECT_GRADIENTS[colorIdx]}` : ''}`}>
        {project.thumbnail_url && !imgFailed ? (
          <img
            src={`${API_URL}${project.thumbnail_url}?v=${encodeURIComponent(project.updated_at)}`}
            alt={project.name}
            draggable={false}
            className="h-full w-full object-cover object-top rounded-t-xl"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <>
            <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
            <div className={`absolute -bottom-4 -right-4 h-24 w-24 rounded-full ${PROJECT_ACCENT_COLORS[colorIdx]} blur-xl`} />
            <div className={`absolute -top-2 -left-2 h-16 w-16 rounded-full ${PROJECT_ACCENT_COLORS[colorIdx]} blur-lg opacity-60`} />
            <div className="absolute inset-3 rounded-lg bg-white/[0.06] backdrop-blur-[1px] border border-white/[0.08] p-2.5">
              <div className="h-1.5 w-10 bg-white/10 rounded mb-1.5" />
              <div className="h-1.5 w-full bg-white/[0.06] rounded mb-1" />
              <div className="h-1.5 w-3/4 bg-white/[0.06] rounded mb-2.5" />
              <div className="flex gap-1.5 mb-1.5">
                <div className="h-5 w-5 bg-white/[0.08] rounded" />
                <div className="flex-1">
                  <div className="h-1.5 w-full bg-white/[0.06] rounded mb-0.5" />
                  <div className="h-1.5 w-2/3 bg-white/[0.06] rounded" />
                </div>
              </div>
            </div>
            <div className="absolute bottom-2 right-3 text-4xl font-bold text-white/[0.08] leading-none select-none">
              {project.name?.charAt(0)?.toUpperCase() ?? "P"}
            </div>
          </>
        )}

        {/* Selection checkbox */}
        <button
          className={`absolute top-2.5 left-2.5 flex h-6 w-6 items-center justify-center rounded transition-all ${
            selected
              ? "bg-brand-600 text-white opacity-100"
              : "bg-foreground/30 backdrop-blur-sm text-background opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(project.id, e.metaKey || e.ctrlKey);
          }}
        >
          {selected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>

        {/* Star button */}
        <button
          className={`absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full transition-all ${
            project.starred
              ? "bg-yellow-500/20 text-yellow-400 opacity-100"
              : "bg-foreground/30 backdrop-blur-sm text-background hover:bg-foreground/50 opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => { e.stopPropagation(); onStar(); }}
        >
          <Star className={`h-3.5 w-3.5 ${project.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
        </button>

        {/* Quick actions */}
        <div className="absolute bottom-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/40 backdrop-blur-sm text-background hover:bg-foreground/60 transition-all">
              <MoreHorizontal className="h-3.5 w-3.5" />
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
              <DropdownMenuItem onClick={() => onStar()}>
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
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center gap-2.5 p-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-white">
          {project.name?.charAt(0)?.toUpperCase() ?? "U"}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground leading-tight line-clamp-1">{project.name}</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">{formatRelativeTime(project.updated_at)}</span>
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${statusStyle.className}`}>
              {statusStyle.label}
            </span>
            {isShared && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-emerald-500/40 px-1.5 py-0 text-[10px] font-medium text-emerald-400"
                title="Shared to Discover"
              >
                <Compass className="h-2.5 w-2.5" />
                Discover
              </span>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
