"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, X, AlertCircle, RefreshCw, LayoutGrid, FileText, Copy, Boxes, Store, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { useEnvironments, type Environment } from "./use-environments";
import { getColorClass } from "./env-shared";
import { CreateEnvironmentForm } from "./env-forms";
import { DefaultEnvironmentCard, EnvironmentCard } from "./env-cards";
import { ProjectEnvironmentView } from "./env-project-view";
import { useMarketplaceInstalls } from "@/modules/marketplace/use-marketplace";

// ─── Installed-from-Marketplace section ─────────────────────

function InstalledMarketplaceListings({ workspaceId, onChange }: { workspaceId: string; onChange: () => void }) {
  const { installs, loading, uninstall, refresh } = useMarketplaceInstalls(workspaceId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleUninstall = async (listingId: string) => {
    setBusyId(listingId);
    try {
      await uninstall(listingId);
      // Also refresh the parent environments list — uninstall deletes
      // the cloned environment row, so the panel below should drop it.
      onChange();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return null;
  if (installs.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Store className="h-3.5 w-3.5 text-violet-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Installed from Marketplace</h3>
          <Badge variant="secondary" className="text-[10px]">{installs.length}</Badge>
        </div>
        <button onClick={() => void refresh()} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Refresh">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <ul className="divide-y">
        {installs.map((inst) => (
          <li key={inst.id} className="flex items-center gap-3 px-3 py-2.5">
            <Store className="h-4 w-4 shrink-0 text-violet-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {inst.listing_title ?? "Marketplace listing"}
              </p>
              <p className="text-xs text-muted-foreground">
                v{inst.version} · installed {new Date(inst.installed_at).toLocaleDateString()}
                {inst.is_modified && <span className="ml-1.5 text-amber-400">· modified</span>}
              </p>
            </div>
            <button
              onClick={() => void handleUninstall(inst.listing_id)}
              disabled={busyId === inst.listing_id}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-50"
              title="Uninstall — removes the cloned environment from this workspace"
            >
              {busyId === inst.listing_id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Uninstall
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Template Gallery Dialog ────────────────────────────────

interface TemplateEnv { id: string; name: string; description: string; icon: string; color: string; }

function TemplateGallery({ workspaceId, open, onClose, onCloned }: {
  workspaceId: string; open: boolean; onClose: () => void; onCloned: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateEnv[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch<{ data: TemplateEnv[] }>("/environments/templates")
      .then((res) => setTemplates(res.data)).catch(() => setTemplates([])).finally(() => setLoading(false));
  }, [open]);

  const handleUse = async (t: TemplateEnv) => {
    setCloning(t.id);
    try { await apiFetch(`/${workspaceId}/environments/${t.id}/clone`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); onCloned(); onClose(); }
    finally { setCloning(null); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /><h3 className="text-sm font-semibold">Environment Templates</h3></div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <LayoutGrid className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No templates available yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Templates will appear here once created by your team.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => (
                <div key={t.id} className="flex flex-col rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-sm", getColorClass(t.color), "bg-opacity-20")}>{t.icon || "📦"}</div>
                    <span className="text-sm font-medium truncate">{t.name}</span>
                    <div className={cn("ml-auto h-2 w-2 rounded-full shrink-0", getColorClass(t.color))} />
                  </div>
                  {t.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{t.description}</p>}
                  <button onClick={() => void handleUse(t)} disabled={cloning === t.id}
                    className="mt-auto flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                    {cloning === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} Use Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Workspace Environments View ────────────────────────────

function WorkspaceEnvironmentsView({ workspaceId }: { workspaceId: string }) {
  const hooks = useEnvironments(workspaceId);
  const { environments, loading, error, refresh, createEnvironment, deleteEnvironment, cloneEnvironment, setDefault } = hooks;
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [defaultEnvId, setDefaultEnvId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    void hooks.getDefaultInfo().then((info) => { setDefaultEnvId(info.isCustom && info.data ? info.data.id : null); });
  }, [workspaceId, hooks]);

  const handleCreate = async (data: { name: string; description?: string; icon?: string; color?: string }) => { await createEnvironment(data); setShowCreate(false); };
  const handleSetDefault = async (envId: string) => { await setDefault(envId); setDefaultEnvId(envId); };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4" /><h2 className="text-sm font-semibold">Environments</h2>
          <Badge variant="secondary" className="text-[10px]">{environments.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void refresh()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
          <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"><LayoutGrid className="h-3.5 w-3.5" /> Templates</button>
          <label className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted cursor-pointer">
            <FileText className="h-3.5 w-3.5" /> Import
            <input type="file" accept=".json" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                try { const text = await file.text(); const bundle = JSON.parse(text);
                  await apiFetch(`/workspaces/${workspaceId}/environments/import`, { method: "POST", body: JSON.stringify(bundle) }); void refresh();
                } catch (err) { console.error("Import failed:", err); }
                e.target.value = "";
              }} />
          </label>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Environments bundle workspace skills, rules, knowledge, and connectors into reusable presets.
          The <strong>default</strong> environment includes all workspace items automatically.
        </p>
        <InstalledMarketplaceListings workspaceId={workspaceId} onChange={() => void refresh()} />
        {showCreate && <CreateEnvironmentForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <AlertCircle className="h-4 w-4 text-destructive" /><span className="text-xs text-destructive">{error}</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {!defaultEnvId && <DefaultEnvironmentCard workspaceId={workspaceId} />}
            {environments.map((env) => (
              <EnvironmentCard key={env.id} env={env} workspaceId={workspaceId} isDefault={defaultEnvId === env.id} hooks={hooks}
                onDelete={() => void deleteEnvironment(env.id)} onClone={() => void cloneEnvironment(env.id)} onSetDefault={() => void handleSetDefault(env.id)} />
            ))}
            {environments.length === 0 && !showCreate && (
              <div className="flex flex-col items-center rounded-lg border-2 border-dashed p-6 text-center">
                <p className="text-xs text-muted-foreground">Create a custom environment to bundle a specific subset of your workspace items.</p>
                <button onClick={() => setShowCreate(true)} className="mt-3 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Create Environment
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <TemplateGallery workspaceId={workspaceId} open={showTemplates} onClose={() => setShowTemplates(false)} onCloned={() => void refresh()} />
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────

interface EnvironmentsPanelProps { workspaceId: string; projectId?: string; }

export function EnvironmentsPanel({ workspaceId, projectId }: EnvironmentsPanelProps) {
  if (projectId) return <ProjectEnvironmentView workspaceId={workspaceId} projectId={projectId} />;
  return <WorkspaceEnvironmentsView workspaceId={workspaceId} />;
}

export default EnvironmentsPanel;
