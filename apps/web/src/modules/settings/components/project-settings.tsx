"use client";

import { useState } from "react";
import {
  Settings,
  Globe,
  Server,
  AlertTriangle,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSettingsProps {
  projectId: string;
}

type Tab = "general" | "domain" | "environments" | "danger";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "domain", label: "Domain", icon: Globe },
  { id: "environments", label: "Environments", icon: Server },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [description, setDescription] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="space-y-6 rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Project Details</h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Project Name
              </label>
              <input
                id="name"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Project"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="slug" className="text-sm font-medium">
                Slug
              </label>
              <input
                id="slug"
                type="text"
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value)}
                placeholder="my-project"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Used in the project URL: {projectSlug || "my-project"}.doable.app
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="A brief description of your project"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Domain Tab */}
      {activeTab === "domain" && (
        <div className="space-y-6 rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Custom Domain</h2>
          <p className="text-sm text-muted-foreground">
            Connect a custom domain to your project. Your project is always
            available at its .doable.app subdomain.
          </p>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Default Domain</p>
                  <p className="mt-0.5 text-sm font-mono text-muted-foreground">
                    {projectSlug || "your-project"}.doable.app
                  </p>
                </div>
                <a
                  href={`https://${projectSlug || "your-project"}.doable.app`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="domain" className="text-sm font-medium">
                Custom Domain
              </label>
              <input
                id="domain"
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="app.example.com"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Add a CNAME record pointing to cname.doable.app
              </p>
            </div>

            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Add Domain
            </button>
          </div>
        </div>
      )}

      {/* Environments Tab */}
      {activeTab === "environments" && (
        <div className="space-y-6 rounded-xl border p-6">
          <h2 className="text-lg font-semibold">Environments</h2>
          <p className="text-sm text-muted-foreground">
            Manage deployment environments and their configurations.
          </p>

          <div className="space-y-3">
            {[
              {
                name: "Production",
                status: "active",
                url: `${projectSlug || "project"}.doable.app`,
              },
              {
                name: "Preview",
                status: "inactive",
                url: `preview-${projectSlug || "project"}.doable.app`,
              },
            ].map((env) => (
              <div
                key={env.name}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{env.name}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        env.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {env.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-mono text-muted-foreground">
                    {env.url}
                  </p>
                </div>
                <a
                  href={`https://${env.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danger Zone Tab */}
      {activeTab === "danger" && (
        <div className="space-y-6 rounded-xl border border-destructive/30 p-6">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>

          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 p-4">
              <h3 className="text-sm font-medium">Delete Project</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently delete this project and all its deployments. This
                action cannot be undone.
              </p>

              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <label htmlFor="delete-confirm" className="text-sm font-medium">
                    Type the project name to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={projectName || "project-name"}
                    className="flex h-10 w-full rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  />
                </div>

                <button
                  disabled={deleteConfirm !== projectName || !projectName}
                  className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
