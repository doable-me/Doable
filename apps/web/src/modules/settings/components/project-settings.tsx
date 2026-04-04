"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Settings,
  Globe,
  Server,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Plug,
  FileText,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Check,
  X,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Lock,
  Shield,
  Calendar,
  Hash,
  Link2,
  BookOpen,
  Brain,
  Lightbulb,
  Heart,
  Clock,
  User,
  Map,
  Crown,
  ArrowRightLeft,
  Copy,
  AlertCircle,
  ShieldCheck,
  Plus,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  apiFetch,
  apiGetProject,
  apiUpdateProject,
  apiDeleteProject,
  apiListCustomDomains,
  apiAddCustomDomain,
  apiRemoveCustomDomain,
  apiVerifyCustomDomain,
  type ApiProject,
  type ApiCustomDomain,
} from "@/lib/api";
import { IntegrationsPanel } from "@/modules/integrations/integrations-panel";
import { SkillsRulesPanel } from "@/modules/settings/components/skills-rules-panel";
import { McpPanel } from "@/modules/settings/components/mcp-panel";
import { GitHubSettings } from "@/modules/settings/components/github-settings";
import { useAuth } from "@/hooks/use-auth";
import { getGitHubConnectUrl, getStoredTokens } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

interface ProjectSettingsProps {
  projectId: string;
}

type Tab =
  | "general"
  | "integrations"
  | "mcp"
  | "skills"
  | "context"
  | "domain"
  | "environments"
  | "danger";

interface ContextFile {
  filename: string;
  content: string;
  updatedAt: string;
}

interface ContextStats {
  totalFiles: number;
  totalChars: number;
  estimatedTokens: number;
  budgetUsedPercent: number;
}

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

// ─── Constants ──────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "mcp", label: "MCP Servers", icon: Terminal },
  { id: "skills", label: "Skills & Rules", icon: Brain },
  { id: "context", label: "Knowledge", icon: Brain },
  { id: "domain", label: "Custom Domain", icon: Globe },
  { id: "environments", label: "Environments", icon: Server },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

const FILE_ICONS: Record<string, typeof FileText> = {
  "identity.md": BookOpen,
  "knowledge.md": Brain,
  "instructions.md": Lightbulb,
  "soul.md": Heart,
  "memory.md": Clock,
  "user.md": User,
  "plan.md": Map,
};

// ─── Toast System ───────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all animate-in slide-in-from-bottom-2",
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          )}
        >
          {toast.type === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <X className="h-4 w-4 shrink-0" />
          )}
          <span className="text-sm">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-2 shrink-0 opacity-60 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

// ─── Section Card ───────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-6", className)}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "general";
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const validTabs: Tab[] = ["general", "integrations", "mcp", "skills", "context", "domain", "environments", "danger"];
    return validTabs.includes(tab as Tab) ? (tab as Tab) : "general";
  });
  const [project, setProject] = useState<ApiProject | null>(null);
  const [loading, setLoading] = useState(true);
  const { toasts, addToast, dismissToast } = useToasts();

  // Load project data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiGetProject(projectId)
      .then(({ data }) => {
        if (!cancelled) {
          setProject(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          addToast("error", err instanceof Error ? err.message : "Failed to load project");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, addToast]);

  if (loading) {
    return <SettingsLoadingSkeleton />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">Project not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The project may have been deleted or you don't have access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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

      {/* Tab Content */}
      {activeTab === "general" && (
        <GeneralTab
          project={project}
          onUpdate={(updated) => setProject(updated)}
          addToast={addToast}
        />
      )}
      {activeTab === "integrations" && (
        <IntegrationsPanelWrapper projectId={projectId} />
      )}
      {activeTab === "mcp" && project.workspace_id && (
        <McpPanel
          workspaceId={project.workspace_id}
        />
      )}
      {activeTab === "skills" && project.workspace_id && (
        <SectionCard title="Skills & Rules" description="Manage reusable skills and rules that shape how the AI works across your workspace.">
          <SkillsRulesPanel workspaceId={project.workspace_id} />
        </SectionCard>
      )}
      {activeTab === "context" && (
        <ContextFilesTab projectId={projectId} addToast={addToast} />
      )}
      {activeTab === "domain" && (
        <DomainTab project={project} addToast={addToast} />
      )}
      {activeTab === "environments" && (
        <EnvironmentsTab project={project} />
      )}
      {activeTab === "danger" && (
        <DangerTab project={project} addToast={addToast} />
      )}
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="space-y-4 rounded-xl border p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-10 animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GENERAL TAB
// ═══════════════════════════════════════════════════════════════

function GeneralTab({
  project,
  onUpdate,
  addToast,
}: {
  project: ApiProject;
  onUpdate: (p: ApiProject) => void;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
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
      addToast("success", "Project settings saved");
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Details */}
      <SectionCard title="Project Details">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="settings-name" className="text-sm font-medium">
              Project Name
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="settings-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="settings-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="A brief description of your project"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Visibility</label>
            <div className="flex gap-3">
              <button
                onClick={() => setVisibility("public")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors flex-1",
                  visibility === "public"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground"
                )}
              >
                <Eye className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Public</div>
                  <div className="text-xs text-muted-foreground">Anyone can view</div>
                </div>
              </button>
              <button
                onClick={() => setVisibility("private")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors flex-1",
                  visibility === "private"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-input text-muted-foreground hover:text-foreground"
                )}
              >
                <EyeOff className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Private</div>
                  <div className="text-xs text-muted-foreground">Only you can access</div>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              {hasChanges && "You have unsaved changes"}
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={!hasChanges || saving}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                hasChanges
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Project Info */}
      <SectionCard title="Project Information" description="Read-only metadata about your project.">
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoItem
            icon={Hash}
            label="Project ID"
            value={project.id}
            mono
          />
          <InfoItem
            icon={Calendar}
            label="Created"
            value={new Date(project.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          <InfoItem
            icon={Clock}
            label="Last Updated"
            value={new Date(project.updated_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
          <InfoItem
            icon={Link2}
            label="Project URL"
            value={`${project.slug}.doable.me`}
            mono
          />
          <InfoItem
            icon={Shield}
            label="Status"
            value={project.status}
            badge
          />
          <InfoItem
            icon={Eye}
            label="Visibility"
            value={project.visibility}
            badge
          />
        </div>
      </SectionCard>
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
  mono,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {badge ? (
          <span className="mt-0.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
            {value}
          </span>
        ) : (
          <p
            className={cn(
              "mt-0.5 text-sm truncate",
              mono && "font-mono text-xs"
            )}
            title={value}
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INTEGRATIONS TAB (uses unified IntegrationsPanel)
// ═══════════════════════════════════════════════════════════════

function IntegrationsPanelWrapper({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { accessToken } = getStoredTokens();
  const workspaceId =
    typeof window !== "undefined"
      ? localStorage.getItem("doable_active_workspace_id") ?? ""
      : "";

  const handleGitHubConnect = useCallback(() => {
    if (!user?.id) return;
    const returnUrl = `${window.location.origin}/projects/${projectId}/settings?tab=integrations`;
    window.location.href = getGitHubConnectUrl(user.id, returnUrl);
  }, [user, projectId]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Integrations"
        description="Connect third-party services and AI tools to extend your project."
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
          title="GitHub Sync"
          description="Push and pull code changes to keep your project in sync."
        >
          <GitHubSettings
            projectId={projectId}
            accessToken={accessToken}
          />
        </SectionCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT FILES TAB
// ═══════════════════════════════════════════════════════════════

function ContextFilesTab({
  projectId,
  addToast,
}: {
  projectId: string;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFile, setEditingFile] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        data: { files: ContextFile[]; stats: ContextStats };
      }>(`/projects/${projectId}/context`);
      setFiles(res.data.files);
      setStats(res.data.stats);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to load context files");
    } finally {
      setLoading(false);
    }
  }, [projectId, addToast]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const handleSave = async (filename: string, content: string) => {
    try {
      await apiFetch(`/projects/${projectId}/context/${filename}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      setFiles((prev) =>
        prev.map((f) =>
          f.filename === filename
            ? { ...f, content, updatedAt: new Date().toISOString() }
            : f
        )
      );
      addToast("success", `Saved ${filename}`);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to save");
      throw err;
    }
  };

  // If editing a file, show the editor
  const activeFile = files.find((f) => f.filename === editingFile);
  if (activeFile) {
    return (
      <ContextFileEditor
        file={activeFile}
        onSave={(content) => handleSave(activeFile.filename, content)}
        onBack={() => setEditingFile(null)}
        addToast={addToast}
      />
    );
  }

  if (loading) {
    return (
      <SectionCard title="Knowledge (.doable/)">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="h-8 w-8 animate-pulse rounded bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Knowledge (.doable/)"
        description="Knowledge files guide the AI's behavior when editing your project. Each file serves a different purpose."
      >
        {/* Token budget */}
        {stats && (
          <div className="mb-5 rounded-lg bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {stats.totalFiles} files, {stats.estimatedTokens.toLocaleString()} tokens
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  stats.budgetUsedPercent > 80
                    ? "text-amber-600"
                    : "text-muted-foreground"
                )}
              >
                {stats.budgetUsedPercent}% of budget used
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  stats.budgetUsedPercent > 95
                    ? "bg-red-500"
                    : stats.budgetUsedPercent > 80
                      ? "bg-amber-500"
                      : "bg-primary"
                )}
                style={{
                  width: `${Math.min(100, stats.budgetUsedPercent)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        <div className="space-y-2">
          {files.map((file) => {
            const Icon = FILE_ICONS[file.filename] ?? FileText;
            const hasContent = file.content.trim().length > 10;

            return (
              <button
                key={file.filename}
                onClick={() => setEditingFile(file.filename)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 group"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    hasContent ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      hasContent ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {hasContent
                      ? `${file.content.length} characters`
                      : "Empty -- click to edit"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      hasContent ? "bg-emerald-500" : "bg-muted-foreground/30"
                    )}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Refresh */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => void fetchFiles()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Context File Editor ────────────────────────────────────

function ContextFileEditor({
  file,
  onSave,
  onBack,
  addToast,
}: {
  file: ContextFile;
  onSave: (content: string) => Promise<void>;
  onBack: () => void;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [content, setContent] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const dirty = content !== file.content;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(file.content);
  }, [file.filename, file.content]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(content);
    } catch {
      // Toast already shown by parent
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      void handleSave();
    }
  };

  const Icon = FILE_ICONS[file.filename] ?? FileText;

  return (
    <div className="rounded-xl border" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-md p-1.5 transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{file.filename}</span>
          {dirty && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {content.length} chars
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              dirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full bg-background p-4 text-sm font-mono leading-relaxed focus:outline-none resize-none"
        rows={20}
        placeholder="Start writing..."
        spellCheck={false}
      />

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          Last updated:{" "}
          {new Date(file.updatedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span className="text-muted-foreground/60">Ctrl+S to save</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM DOMAIN TAB
// ═══════════════════════════════════════════════════════════════

function DomainTab({
  project,
  addToast,
}: {
  project: ApiProject;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [customDomains, setCustomDomains] = useState<ApiCustomDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // TODO: derive from workspace plan — for now check if project has published_url (allow for testing)
  const isPro = true; // Will be gated by backend anyway

  // Fetch custom domains on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiListCustomDomains(project.id);
        if (!cancelled) setCustomDomains(res.data);
      } catch {
        // Silently fail — domains panel just shows empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [project.id]);

  // Auto-poll pending domains every 15 seconds
  useEffect(() => {
    const hasPending = customDomains.some(
      (d) => d.status === "pending" || d.status === "verifying" || d.status === "ssl_pending"
    );
    if (!hasPending) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiListCustomDomains(project.id);
        setCustomDomains(res.data);
      } catch {
        // ignore
      }
    }, 15_000);

    return () => clearInterval(interval);
  }, [project.id, customDomains]);

  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    setAdding(true);
    try {
      const res = await apiAddCustomDomain(project.id, domain);
      setCustomDomains((prev) => [res.data, ...prev]);
      setNewDomain("");
      addToast("success", `Domain ${domain} added. Configure your DNS records below.`);
    } catch (err: any) {
      addToast("error", err?.body?.error ?? "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (domainId: string) => {
    setVerifyingId(domainId);
    try {
      const res = await apiVerifyCustomDomain(domainId);
      setCustomDomains((prev) =>
        prev.map((d) => (d.id === domainId ? res.data : d))
      );
      if (res.data.status === "active") {
        addToast("success", `${res.data.domain} is now active!`);
      } else if (res.data.status === "failed") {
        addToast("error", res.data.verification_errors ?? "Verification failed");
      }
    } catch (err: any) {
      addToast("error", err?.body?.error ?? "Verification check failed");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRemove = async (domainId: string) => {
    setRemovingId(domainId);
    try {
      await apiRemoveCustomDomain(domainId);
      setCustomDomains((prev) => prev.filter((d) => d.id !== domainId));
      addToast("success", "Domain removed");
    } catch (err: any) {
      addToast("error", err?.body?.error ?? "Failed to remove domain");
    } finally {
      setRemovingId(null);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  type StatusInfo = { label: string; color: string; icon: React.ReactNode };
  const defaultStatus: StatusInfo = {
    label: "Waiting for DNS",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    icon: <Clock className="h-3 w-3" />,
  };
  const statusConfig: Record<string, StatusInfo> = {
    pending: defaultStatus,
    verifying: {
      label: "Verifying",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    ssl_pending: {
      label: "SSL Provisioning",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    active: {
      label: "Active",
      color: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
      icon: <ShieldCheck className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      color: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    removing: {
      label: "Removing",
      color: "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
  };

  return (
    <div className="space-y-6">
      {/* Default Domain */}
      <SectionCard title="Default Domain" description="Your project is always accessible at its .doable.me subdomain.">
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Default URL</p>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">
              {project.slug}.doable.me
            </p>
          </div>
          <a
            href={`https://${project.slug}.doable.me`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Visit
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </SectionCard>

      {/* Custom Domain */}
      <SectionCard title="Custom Domain" description="Serve your published site from your own domain name.">
        {!isPro ? (
          /* Pro gate — keep the existing Crown/upgrade UI */
          <div className="flex flex-col items-center rounded-lg border-2 border-dashed p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <Crown className="h-6 w-6 text-amber-600 dark:text-amber-300" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Pro+ Feature</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Custom domains are available on the Pro plan and above. Upgrade
              your workspace to connect your own domain.
            </p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Crown className="h-4 w-4" />
              Upgrade to Pro
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Add domain form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !adding && handleAddDomain()}
                placeholder="app.example.com"
                className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                onClick={handleAddDomain}
                disabled={!newDomain.trim() || adding}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Domain
              </button>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Domain list */}
            {!loading && customDomains.length === 0 && (
              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                <Globe className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No custom domains configured. Add one above to get started.
                </p>
              </div>
            )}

            {!loading &&
              customDomains.map((d) => {
                const status = statusConfig[d.status] ?? defaultStatus;
                const isVerifying = verifyingId === d.id;
                const isRemoving = removingId === d.id;

                return (
                  <div key={d.id} className="rounded-lg border p-4 space-y-4">
                    {/* Domain header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <p className="font-mono text-sm font-medium">{d.domain}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.status === "active" && (
                          <a
                            href={`https://${d.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            Visit
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {d.status !== "active" && d.status !== "removing" && (
                          <button
                            onClick={() => handleVerify(d.id)}
                            disabled={isVerifying}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            {isVerifying ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Verify
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(d.id)}
                          disabled={isRemoving}
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {isRemoving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* DNS instructions (show when not active) */}
                    {d.status !== "active" && d.status !== "removing" && (
                      <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium">Configure DNS</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Add this CNAME record in your Cloudflare DNS dashboard with the proxy (orange cloud) enabled.
                          </p>
                        </div>
                        <div className="overflow-hidden rounded-md border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="px-3 py-2 text-left font-medium">Type</th>
                                <th className="px-3 py-2 text-left font-medium">Name</th>
                                <th className="px-3 py-2 text-left font-medium">Target</th>
                                <th className="w-10 px-2 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="px-3 py-2 font-mono">CNAME</td>
                                <td className="px-3 py-2 font-mono">{d.domain}</td>
                                <td className="px-3 py-2 font-mono text-xs break-all">{d.cname_target}</td>
                                <td className="px-2 py-2">
                                  <button
                                    onClick={() => copyToClipboard(d.cname_target, `cname-${d.id}`)}
                                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                    title="Copy target"
                                  >
                                    {copiedField === `cname-${d.id}` ? (
                                      <Check className="h-3 w-3 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Your domain must be on Cloudflare DNS (free). The CNAME must be proxied (orange cloud ON).
                          After adding the record, click Verify above.
                        </p>
                      </div>
                    )}

                    {/* Error message */}
                    {d.verification_errors && d.status === "failed" && (
                      <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-xs text-destructive">{d.verification_errors}</p>
                      </div>
                    )}

                    {/* Active state — SSL info */}
                    {d.status === "active" && (
                      <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                        <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-xs font-medium text-green-700 dark:text-green-300">
                            Domain Active — SSL and routing configured via Cloudflare
                          </p>
                          <p className="text-xs text-green-600/70 dark:text-green-400/70">
                            HTTPS certificate managed by Cloudflare. Auto-renews.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ENVIRONMENTS TAB
// ═══════════════════════════════════════════════════════════════

function EnvironmentsTab({ project }: { project: ApiProject }) {
  const [environments, setEnvironments] = useState<Array<{
    id: string; name: string; icon: string; color: string; description: string;
    is_template: boolean; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const workspaceId = project.workspace_id;

  useEffect(() => {
    if (!workspaceId) { setLoading(false); return; }
    apiFetch<{ data: typeof environments }>(`/workspaces/${workspaceId}/environments`)
      .then((res) => setEnvironments(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const COLOR_MAP: Record<string, string> = {
    blue: "bg-blue-500", green: "bg-green-500", purple: "bg-purple-500",
    orange: "bg-orange-500", pink: "bg-pink-500", yellow: "bg-yellow-500",
    red: "bg-red-500", teal: "bg-teal-500",
  };

  // Deployment environments (static)
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

// ═══════════════════════════════════════════════════════════════
// DANGER ZONE TAB
// ═══════════════════════════════════════════════════════════════

function DangerTab({
  project,
  addToast,
}: {
  project: ApiProject;
  addToast: (type: "success" | "error", msg: string) => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");

  const handleDelete = async () => {
    if (deleteConfirm !== project.name) return;
    setDeleting(true);
    try {
      await apiDeleteProject(project.id);
      addToast("success", "Project deleted successfully");
      // Redirect after a brief delay
      setTimeout(() => {
        window.location.href = "/projects";
      }, 1000);
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Failed to delete project");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Transfer Project */}
      <div className="rounded-xl border border-amber-200 p-6 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <ArrowRightLeft className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Transfer Project</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Transfer this project to another workspace. The project will be
              moved along with all its files, settings, and deployment history.
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <label
                  htmlFor="transfer-email"
                  className="text-sm font-medium"
                >
                  Destination workspace owner email
                </label>
                <input
                  id="transfer-email"
                  type="email"
                  value={transferEmail}
                  onChange={(e) => setTransferEmail(e.target.value)}
                  placeholder="owner@example.com"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <button
                disabled={!transferEmail.trim() || !transferEmail.includes("@")}
                onClick={() =>
                  addToast(
                    "success",
                    "Transfer request sent. The recipient will receive an email to accept."
                  )
                }
                className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transfer Project
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Project */}
      <div className="rounded-xl border border-destructive/30 p-6">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-destructive">
              Delete Project
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete this project and all its deployments, files,
              and data. This action cannot be undone.
            </p>

            {!showDeleteDialog ? (
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                <Trash2 className="h-4 w-4" />
                Delete This Project
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">
                  Are you absolutely sure?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will permanently delete{" "}
                  <strong className="text-foreground">{project.name}</strong>{" "}
                  and all associated data. Type the project name below to
                  confirm.
                </p>

                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="delete-confirm"
                      className="text-sm font-medium"
                    >
                      Type{" "}
                      <span className="font-mono text-destructive">
                        {project.name}
                      </span>{" "}
                      to confirm
                    </label>
                    <input
                      id="delete-confirm"
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={project.name}
                      className="flex h-10 w-full rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleDelete()}
                      disabled={
                        deleteConfirm !== project.name || deleting
                      }
                      className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {deleting
                        ? "Deleting..."
                        : "I understand, delete this project"}
                    </button>
                    <button
                      onClick={() => {
                        setShowDeleteDialog(false);
                        setDeleteConfirm("");
                      }}
                      className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
