"use client";

import { useState } from "react";
import type { Project, ProjectStatus } from "@doable/shared";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Star,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FolderInput,
  ExternalLink,
  Compass,
} from "lucide-react";
import { ShareDialog } from "@/modules/discover/share-dialog";

type ProjectWithStar = Project & { starred: boolean };

interface ProjectCardProps {
  project: ProjectWithStar;
  onStar: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (project: ProjectWithStar) => void;
  onMove: (id: string) => void;
  /** Whether this project is currently shared to Discover. */
  isShared?: boolean;
  /** Called after a successful share/unshare so the dashboard can refresh. */
  onSharedChanged?: () => void;
}

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  creating: { label: "Creating", variant: "secondary" },
  draft: { label: "Draft", variant: "outline" },
  published: { label: "Published", variant: "default" },
  error: { label: "Error", variant: "destructive" },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProjectCard({
  project,
  onStar,
  onDuplicate,
  onDelete,
  onEdit,
  onMove,
  isShared = false,
  onSharedChanged,
}: ProjectCardProps) {
  const [imageError, setImageError] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const statusCfg = STATUS_CONFIG[project.status];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md">
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-muted">
        {project.thumbnailUrl && !imageError ? (
          <img
            src={`${project.thumbnailUrl}?v=${new Date(project.updatedAt).getTime()}`}
            alt={project.name}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <span className="text-3xl font-bold text-muted-foreground/30">
              {project.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Star button overlay */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStar(project.id);
          }}
          className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 data-[starred=true]:opacity-100"
          data-starred={project.starred}
          aria-label={project.starred ? "Unstar project" : "Star project"}
        >
          <Star
            className={`h-4 w-4 ${
              project.starred
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{project.name}</h3>
            {project.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
              aria-label="Project actions"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(project)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(project.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(project.id)}>
                <FolderInput className="mr-2 h-3.5 w-3.5" />
                Move to folder
              </DropdownMenuItem>
              {project.publishedUrl && (
                <DropdownMenuItem
                  onClick={() => window.open(project.publishedUrl!, "_blank")}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  View live
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShareDialogOpen(true)}>
                <Compass className="mr-2 h-3.5 w-3.5" />
                {isShared ? "Update Discover listing" : "Share to Discover"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete(project.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5">
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            {isShared && (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-400"
                title="Shared to Discover"
              >
                <Compass className="h-2.5 w-2.5 mr-1" />
                Discover
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(project.updatedAt)}
          </span>
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
