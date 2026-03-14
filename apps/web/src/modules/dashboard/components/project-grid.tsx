"use client";

import type { Project } from "@doable/shared";
import { ProjectCard } from "./project-card";
import { Skeleton } from "@/components/ui/skeleton";

type ProjectWithStar = Project & { starred: boolean };

interface ProjectGridProps {
  projects: ProjectWithStar[];
  loading: boolean;
  onStar: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (project: ProjectWithStar) => void;
  onMove: (id: string) => void;
}

function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="mt-2 flex items-center justify-between">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  );
}

export function ProjectGrid({
  projects,
  loading,
  onStar,
  onDuplicate,
  onDelete,
  onEdit,
  onMove,
}: ProjectGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          onStar={onStar}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onEdit={onEdit}
          onMove={onMove}
        />
      ))}
    </div>
  );
}
