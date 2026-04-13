"use client";

import { useState, useEffect } from "react";
import {
  Server,
  ExternalLink,
  Loader2,
  ArrowRightLeft,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  apiFetch,
  apiDeleteProject,
  type ApiProject,
} from "@/lib/api";
import { SectionCard } from "./project-settings-shared";

// ═══════════════════════════════════════════════════════════════
// ENVIRONMENTS TAB
// ═══════════════════════════════════════════════════════════════

export function EnvironmentsTab({ project }: { project: ApiProject }) {
  const [environments, setEnvironments] = useState<Array<{
    id: string; name: string; icon: string; color: string; description: string;
    is_template: boolean; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [projectEnvId, setProjectEnvId] = useState<string | null>(null);
  const [savingProjectEnv, setSavingProjectEnv] = useState(false);

  const workspaceId = project.workspace_id;

  useEffect(() => {
    if (!workspaceId) { setLoading(false); return; }
    Promise.all([
      apiFetch<{ data: typeof environments }>(`/workspaces/${workspaceId}/environments`),
      apiFetch<{ data: { environment_id: string } | null }>(`/projects/${project.id}/environment`),
    ])
      .then(([envRes, projEnvRes]) => {
        setEnvironments(envRes.data);
        setProjectEnvId(projEnvRes.data?.environment_id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, project.id]);

  const COLOR_MAP: Record<string, string> = {
    blue: "bg-blue-500", green: "bg-green-500", purple: "bg-purple-500",
    orange: "bg-orange-500", pink: "bg-pink-500", yellow: "bg-yellow-500",
    red: "bg-red-500", teal: "bg-teal-500",
  };

  const deployEnvs = [
    {
      name: "Production",
      status: "active" as const,
      url: `${project.slug}.doable.me`,
      description: "Live site accessible to all visitors",
      lastDeployed: project.updated_at,
    },
    {
      name: "Preview",
      status: "active" as const,
      url: `preview-${project.slug}.doable.me`,
      description: "Test changes before publishing to production",
      lastDeployed: null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Per-Project Environment Override */}
      <SectionCard
        title="Project Environment"
        description="Override the workspace default environment for this project. The AI will use this environment's skills, rules, knowledge, and connectors."
      >
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : environments.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No environments in this workspace yet. Create one from the Environments panel.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <select
                value={projectEnvId ?? ""}
                disabled={savingProjectEnv}
                onChange={async (e) => {
                  const envId = e.target.value;
                  setSavingProjectEnv(true);
                  try {
                    if (envId) {
                      await apiFetch(`/projects/${project.id}/environment`, {
                        method: "PUT",
                        body: JSON.stringify({ environmentId: envId }),
                      });
                      setProjectEnvId(envId);
                    } else {
                      await apiFetch(`/projects/${project.id}/environment`, { method: "DELETE" });
                      setProjectEnvId(null);
                    }
                  } catch (err) {
                    console.error("Failed to set project environment:", err);
                  } finally {
                    setSavingProjectEnv(false);
                  }
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Use workspace default</option>
                {environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.icon} {env.name}
                  </option>
                ))}
              </select>
              {projectEnvId && (
                <p className="text-xs text-muted-foreground">
                  This project uses a custom environment override. The workspace default is bypassed.
                </p>
              )}
              {!projectEnvId && (
                <p className="text-xs text-muted-foreground">
                  Inheriting from workspace default. Select an environment above to override.
                </p>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Environment Presets */}
      <SectionCard
        title="Environment Presets"
        description="Reusable bundles of skills, instructions, MCPs, and integrations applied to this workspace."
      >
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : environments.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border-2 border-dashed p-8 text-center">
            <Server className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No environment presets</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create environment presets from the editor&apos;s Environments panel.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {environments.map((env) => (
              <div key={env.id} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-lg text-white", COLOR_MAP[env.color] ?? "bg-blue-500")}>
                  {env.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{env.name}</p>
                  {env.description && <p className="text-xs text-muted-foreground truncate">{env.description}</p>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(env.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Deployment Environments */}
      <SectionCard
        title="Deployment"
        description="Deployment environments for publishing your project."
      >
        <div className="space-y-3">
          {deployEnvs.map((env) => (
            <div
              key={env.name}
              className="rounded-lg border p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{env.name}</h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        env.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {env.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {env.description}
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                    {env.url}
                  </p>
                  {env.lastDeployed && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last deployed:{" "}
                      {new Date(env.lastDeployed).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <a
                  href={`https://${env.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Visit
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export { DangerTab } from "./project-settings-danger";
