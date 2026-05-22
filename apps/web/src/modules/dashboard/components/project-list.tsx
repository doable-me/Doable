"use client";

import { useState } from "react";
import type { Project, ProjectStatus } from "@doable/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

type ProjectWithStar = Project & { starred: boolean };

type SortKey = "name" | "status" | "updatedAt";
type SortDir = "asc" | "desc";

interface ProjectListProps {
  projects: ProjectWithStar[];
  loading: boolean;
  onStar: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (project: ProjectWithStar) => void;
  onMove: (id: string) => void;
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
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RowSkeleton() {
  return (
    <tr className="border-b">
      <td className="p-3"><Skeleton className="h-4 w-4" /></td>
      <td className="p-3"><Skeleton className="h-4 w-48" /></td>
      <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
      <td className="p-3"><Skeleton className="h-4 w-24" /></td>
      <td className="p-3"><Skeleton className="h-4 w-4" /></td>
    </tr>
  );
}

export function ProjectList({
  projects,
  loading,
  onStar,
  onDuplicate,
  onDelete,
  onEdit,
  onMove,
}: ProjectListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...projects].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
    if (sortKey === "status") return a.status.localeCompare(b.status) * dir;
    return (
      (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir
    );
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 h-3 w-3" />
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-10 p-3" />
            <th className="p-3 text-left">
              <button
                className="inline-flex items-center font-medium"
                onClick={() => handleSort("name")}
              >
                Name <SortIcon col="name" />
              </button>
            </th>
            <th className="p-3 text-left">
              <button
                className="inline-flex items-center font-medium"
                onClick={() => handleSort("status")}
              >
                Status <SortIcon col="status" />
              </button>
            </th>
            <th className="p-3 text-left">
              <button
                className="inline-flex items-center font-medium"
                onClick={() => handleSort("updatedAt")}
              >
                Updated <SortIcon col="updatedAt" />
              </button>
            </th>
            <th className="w-10 p-3" />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
            : sorted.map((project) => {
                const statusCfg = STATUS_CONFIG[project.status];
                return (
                  <tr
                    key={project.id}
                    className="group border-b transition-colors hover:bg-muted/30"
                  >
                    <td className="p-3">
                      <button
                        onClick={() => onStar(project.id)}
                        className="rounded p-0.5"
                        aria-label="Toggle star"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            project.starred
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="p-3">
                      <div>
                        <span className="font-medium">{project.name}</span>
                        {project.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant={statusCfg.variant}>
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(project.updatedAt)}
                    </td>
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="rounded p-1 opacity-0 hover:bg-accent group-hover:opacity-100"
                          aria-label="Actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(project)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDuplicate(project.id)}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onDelete(project.id)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
