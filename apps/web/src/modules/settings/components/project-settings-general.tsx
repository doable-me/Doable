"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useState, useCallback } from "react";
import {
  Eye,
  EyeOff,
  Save,
  Loader2,
  Hash,
  Calendar,
  Clock,
  Link2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiUpdateProject, type ApiProject } from "@/lib/api";
import { IntegrationsPanel } from "@/modules/integrations/integrations-panel";
import { GitHubSettings } from "@/modules/settings/components/github-settings";
import { useAuth } from "@/hooks/use-auth";
import { getGitHubConnectUrl, getStoredTokens } from "@/lib/api";
import { SectionCard, InfoItem } from "./project-settings-shared";

// ═══════════════════════════════════════════════════════════════
// GENERAL TAB
// ═══════════════════════════════════════════════════════════════

export function GeneralTab({
  project,
  onUpdate,
  addToast,
}: {
  project: ApiProject;
  onUpdate: (p: ApiProject) => void;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const ui = useUiText();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [visibility, setVisibility] = useState(project.visibility);
  const [saving, setSaving] = useState(false);
  const hasChanges =
    name !== project.name ||
    description !== (project.description ?? "") ||
    visibility !== project.visibility;

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const { data } = await apiUpdateProject(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
      });
      onUpdate(data);
      addToast("success", ui("Project settings saved"));
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : ui("Failed to save"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Details */}
      <SectionCard title={ui("Project Details")}>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="settings-name" className="text-sm font-medium">
              {" "}
              {ui("Project Name")}{" "}
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ui("My Project")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="settings-description"
              className="text-sm font-medium"
            >
              {" "}
              {ui("Description")}{" "}
            </label>
            <textarea
              id="settings-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={ui("A brief description of your project")}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{ui("Visibility")}</label>
            <div className="flex gap-3">
              <button
                onClick={() => setVisibility("public")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors flex-1",
                  visibility === "public"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground",
                )}
              >
                <Eye className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">{ui("Public")}</div>
                  <div className="text-xs text-muted-foreground">
                    {ui("Anyone can view")}
                  </div>
                </div>
              </button>
              <button
                onClick={() => setVisibility("private")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors flex-1",
                  visibility === "private"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground",
                )}
              >
                <EyeOff className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">{ui("Private")}</div>
                  <div className="text-xs text-muted-foreground">
                    {ui("Only you can access")}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              {hasChanges && ui("You have unsaved changes")}
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={!hasChanges || saving}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                hasChanges
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? ui("Saving...") : ui("Save Changes")}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Project Info */}
      <SectionCard
        title={ui("Project Information")}
        description={ui("Read-only metadata about your project.")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoItem
            icon={Hash}
            label={ui("Project ID")}
            value={project.id}
            mono
          />
          <InfoItem
            icon={Calendar}
            label={ui("Created")}
            value={new Date(project.created_at).toLocaleDateString(ui.locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          <InfoItem
            icon={Clock}
            label={ui("Last Updated")}
            value={new Date(project.updated_at).toLocaleDateString(ui.locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
          <InfoItem
            icon={Link2}
            label={ui("Project URL")}
            value={`${project.slug}.doable.me`}
            mono
          />
          <InfoItem
            icon={Shield}
            label={ui("Status")}
            value={project.status}
            badge
          />
          <InfoItem
            icon={Eye}
            label={ui("Visibility")}
            value={project.visibility}
            badge
          />
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INTEGRATIONS TAB
// ═══════════════════════════════════════════════════════════════

export function IntegrationsPanelWrapper({ projectId }: { projectId: string }) {
  const ui = useUiText();

  const { user } = useAuth();
  const { accessToken } = getStoredTokens();
  const workspaceId =
    typeof window !== "undefined"
      ? (localStorage.getItem("doable_active_workspace_id") ?? "")
      : "";

  const handleGitHubConnect = useCallback(() => {
    if (!user?.id) return;
    const returnUrl = `${window.location.origin}/projects/${projectId}/settings?tab=integrations`;
    window.location.href = getGitHubConnectUrl(user.id, returnUrl);
  }, [user, projectId]);

  return (
    <div className="space-y-4">
      <SectionCard
        title={ui("Integrations")}
        description={ui(
          "Connect third-party services and AI tools to extend your project.",
        )}
      >
        <IntegrationsPanel
          workspaceId={workspaceId}
          projectId={projectId}
          variant="settings"
          onGitHubConnect={handleGitHubConnect}
        />
      </SectionCard>

      {/* Full GitHub push/pull controls when connected */}
      {accessToken && (
        <SectionCard
          title={ui("GitHub Sync")}
          description={ui(
            "Push and pull code changes to keep your project in sync.",
          )}
        >
          <GitHubSettings projectId={projectId} accessToken={accessToken} />
        </SectionCard>
      )}
    </div>
  );
}
