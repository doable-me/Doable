"use client";

import { useState, useCallback, useEffect } from "react";
import { Boxes, Loader2, AlertCircle, RefreshCw, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import {
  useEnvironments,
  type Environment,
  type EnvironmentWithItems,
  type DefaultItems,
  type ContextSkill,
  type ContextRule,
  type Connector,
} from "./use-environments";
import { ScopeBadge, ENV_TABS, ENV_PANEL_MODE_KEY } from "./env-shared";
import { KnowledgeTab, SkillsTab, SettingsTab } from "./env-tabs";
import { VariablesTab } from "./env-variables-tab";
import { IntegrationsPanel } from "@/modules/integrations/integrations-panel";
import type { EnvTab } from "./env-shared";

export function ProjectEnvironmentView({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const hooks = useEnvironments(workspaceId, { projectId });
  const { environments, loading, error, refresh } = hooks;
  const [activeTab, setActiveTab] = useState<EnvTab>("integrations");
  const [detached, setDetached] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ENV_PANEL_MODE_KEY) === "detached";
  });

  const toggleDetached = useCallback(() => {
    setDetached((prev) => { const next = !prev; localStorage.setItem(ENV_PANEL_MODE_KEY, next ? "detached" : "inline"); return next; });
  }, []);

  const [detail, setDetail] = useState<EnvironmentWithItems | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [allEnvs, setAllEnvs] = useState<Environment[]>([]);
  const [projectEnvId, setProjectEnvId] = useState<string | null>(null);
  const [availableSkills, setAvailableSkills] = useState<ContextSkill[]>([]);
  const [availableRules, setAvailableRules] = useState<ContextRule[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<Connector[]>([]);

  const projectEnv = environments[0] ?? null;

  useEffect(() => {
    if (!workspaceId || !projectId) return;
    Promise.all([
      apiFetch<{ data: Environment[] }>(`/workspaces/${workspaceId}/environments`),
      apiFetch<{ data: { environment_id: string } | null }>(`/projects/${projectId}/environment`).catch(() => ({ data: null })),
    ]).then(([envRes, projEnvRes]) => { setAllEnvs(envRes.data); setProjectEnvId(projEnvRes.data?.environment_id ?? null); }).catch(() => {});
  }, [workspaceId, projectId]);

  const loadDetail = useCallback(async () => {
    if (!projectEnv) return;
    setLoadingDetail(true);
    try {
      const [d, defaults] = await Promise.all([hooks.getEnvironment(projectEnv.id), hooks.getDefaultInfo()]);
      setDetail(d);
      const items = defaults.items ?? { skills: [], rules: [], knowledge: [], connectors: [] };
      if (defaults.isCustom) {
        const wsItems = await apiFetch<{ data: null; isCustom: false; items: DefaultItems }>(`/workspaces/${workspaceId}/environments-default`);
        if (wsItems.items) { setAvailableSkills(wsItems.items.skills); setAvailableRules(wsItems.items.rules); setAvailableConnectors(wsItems.items.connectors); }
      } else { setAvailableSkills(items.skills); setAvailableRules(items.rules); setAvailableConnectors(items.connectors); }
    } finally { setLoadingDetail(false); }
  }, [projectEnv, hooks, workspaceId]);

  useEffect(() => { if (projectEnv && !detail) void loadDetail(); }, [projectEnv, detail, loadDetail]);

  const reloadDetail = useCallback(async () => { if (!projectEnv) return; const d = await hooks.getEnvironment(projectEnv.id); setDetail(d); }, [projectEnv, hooks]);

  const panelContent = (
    <div className={cn("flex flex-col", detached ? "h-full" : "h-full")}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Environment</h2>
          {projectEnv && <ScopeBadge scope={projectEnv.scope} />}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { void refresh(); setDetail(null); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={toggleDetached} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={detached ? "Dock to sidebar" : "Open as popup"}>
            {detached ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {detached && (
            <button onClick={toggleDetached} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex border-b px-1 overflow-x-auto">
        {ENV_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30")}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 mb-3">
            <AlertCircle className="h-4 w-4 text-destructive" /><span className="text-xs text-destructive">{error}</span>
          </div>
        )}
        {(loading || loadingDetail) && !detail ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : detail && projectEnv ? (
          <>
            {activeTab === "knowledge" && <KnowledgeTab envId={projectEnv.id} knowledge={detail.knowledge} hooks={hooks} onReload={reloadDetail} />}
            {activeTab === "skills" && <SkillsTab envId={projectEnv.id} detail={detail} availableSkills={availableSkills} availableRules={availableRules} hooks={hooks} onReload={reloadDetail} />}
            {activeTab === "integrations" && (
              <div className="-mx-3 -mt-3 flex flex-col" style={{ height: "calc(100% + 1.5rem)" }}>
                <IntegrationsPanel workspaceId={workspaceId} projectId={projectId} variant="panel" />
              </div>
            )}
            {activeTab === "variables" && <VariablesTab workspaceId={workspaceId} projectId={projectId} />}
            {activeTab === "settings" && <SettingsTab workspaceId={workspaceId} projectId={projectId} projectEnv={projectEnv} allEnvs={allEnvs} projectEnvId={projectEnvId} setProjectEnvId={setProjectEnvId} />}
          </>
        ) : !loading && (
          <div className="flex flex-col items-center py-8 text-center">
            <Boxes className="h-8 w-8 text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground">No environment loaded</p>
          </div>
        )}
      </div>
    </div>
  );

  if (detached) {
    return (
      <Dialog open onOpenChange={() => toggleDetached()}>
        <DialogContent className="max-w-4xl w-[90vw] h-[85vh] max-h-[85vh] p-0 overflow-hidden flex flex-col">{panelContent}</DialogContent>
      </Dialog>
    );
  }
  return panelContent;
}
