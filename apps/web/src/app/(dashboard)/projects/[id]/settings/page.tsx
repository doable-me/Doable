"use client";

import { use } from "react";
import { ProjectSettings } from "@/modules/settings/components/project-settings";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectSettingsPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your project configuration, domains, and environments.
        </p>
      </div>
      <ProjectSettings projectId={id} />
    </div>
  );
}
