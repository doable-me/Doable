"use client";

import { useState, useEffect } from "react";
import type { Project, Folder } from "@doable/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import {
  Star,
  Clock,
  FolderIcon,
  ChevronRight,
  ChevronDown,
  FolderPlus,
} from "lucide-react";

type ProjectWithStar = Project & { starred: boolean };

interface SidebarProps {
  projects: ProjectWithStar[];
  loading: boolean;
  workspaceId: string | null;
  onCreateFolder?: () => void;
}

interface FolderTreeItem extends Folder {
  children: FolderTreeItem[];
}

function buildTree(folders: Folder[]): FolderTreeItem[] {
  const map = new Map<string, FolderTreeItem>();
  const roots: FolderTreeItem[] = [];

  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }

  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function FolderNode({ folder, depth = 0 }: { folder: FolderTreeItem; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = folder.children.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <FolderIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded &&
        folder.children.map((child) => (
          <FolderNode key={child.id} folder={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export function Sidebar({
  projects,
  loading,
  workspaceId,
  onCreateFolder,
}: SidebarProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    setFoldersLoading(true);
    apiFetch<{ data: Folder[] }>(`/folders?workspaceId=${workspaceId}`)
      .then(({ data }) => setFolders(data))
      .catch(() => setFolders([]))
      .finally(() => setFoldersLoading(false));
  }, [workspaceId]);

  const starredProjects = projects.filter((p) => p.starred);
  const recentProjects = [...projects]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

  const folderTree = buildTree(folders);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {/* Recent */}
        <div className="mb-2">
          <h3 className="mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Recent
          </h3>
          {loading ? (
            <div className="space-y-1.5 px-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No projects yet</p>
          ) : (
            recentProjects.map((p) => (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">{p.name}</span>
              </a>
            ))
          )}
        </div>

        {/* Starred */}
        <div className="mb-2">
          <h3 className="mb-1 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Star className="h-3.5 w-3.5" />
            Starred
          </h3>
          {loading ? (
            <div className="space-y-1.5 px-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : starredProjects.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">
              No starred projects
            </p>
          ) : (
            starredProjects.map((p) => (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <span className="truncate">{p.name}</span>
              </a>
            ))
          )}
        </div>

        {/* Folders */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FolderIcon className="h-3.5 w-3.5" />
              Folders
            </h3>
            {onCreateFolder && (
              <button
                onClick={onCreateFolder}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Create folder"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {foldersLoading ? (
            <div className="space-y-1.5 px-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : folderTree.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No folders</p>
          ) : (
            folderTree.map((f) => <FolderNode key={f.id} folder={f} />)
          )}
        </div>
      </div>
    </aside>
  );
}
