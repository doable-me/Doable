"use client";

import { useState, useCallback } from "react";
import {
  ChevronDown, ChevronRight, Loader2, Star, Copy, Trash2,
  Pencil, FileText, Sparkles, BookOpen, Brain, Plug, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { getColorClass, ScopeBadge, ItemList, RefPicker } from "./env-shared";
import { EditMetaForm, InstructionsSection } from "./env-forms";

// ─── Default Environment Card ───────────────────────────────

export function DefaultEnvironmentCard({ workspaceId }: { workspaceId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<DefaultItems | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (items) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: null; isCustom: false; items: DefaultItems }>(
        `/workspaces/${workspaceId}/environments-default`,
      );
      if (!res.isCustom && res.items) setItems(res.items);
    } finally { setLoading(false); }
  }, [workspaceId, items]);

  const handleToggle = () => { if (!expanded) void load(); setExpanded(!expanded); };
  const totalCount = items ? items.skills.length + items.rules.length + items.knowledge.length + items.connectors.length : null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5">
      <button onClick={handleToggle} className="flex w-full items-center gap-3 p-3 text-left">
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-lg">🌐</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Workspace Defaults</span>
            <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">Auto</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Items available to all environments</p>
        </div>
        {totalCount !== null && <span className="text-xs text-muted-foreground whitespace-nowrap">{totalCount} items</span>}
      </button>
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2">
          {loading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : items ? (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">Workspace-level items automatically included in all projects unless overridden by a project environment.</p>
              <ItemList title="Skills" icon={<Sparkles className="h-3.5 w-3.5" />} items={items.skills.map((s) => ({ name: s.skill_name, sub: s.skill_content.slice(0, 50) }))} />
              <ItemList title="Rules" icon={<BookOpen className="h-3.5 w-3.5" />} items={items.rules.map((r) => ({ name: r.rule_name, sub: r.content.slice(0, 50) }))} />
              <ItemList title="Knowledge" icon={<Brain className="h-3.5 w-3.5" />} items={items.knowledge.map((k) => ({ name: k.filename, sub: k.content.slice(0, 50) }))} emptyMessage="None — add workspace knowledge in Workspace Settings" />
              <ItemList title="Connectors" icon={<Plug className="h-3.5 w-3.5" />} items={items.connectors.map((c) => ({ name: c.name, sub: c.transport_type }))} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Custom Environment Card ────────────────────────────────

export function EnvironmentCard({
  env, workspaceId, isDefault, onDelete, onClone, onSetDefault, hooks,
}: {
  env: Environment; workspaceId: string; isDefault: boolean;
  onDelete: () => void; onClone: () => void; onSetDefault: () => void;
  hooks: ReturnType<typeof useEnvironments>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EnvironmentWithItems | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<ContextSkill[]>([]);
  const [availableRules, setAvailableRules] = useState<ContextRule[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<Connector[]>([]);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const [d, defaults] = await Promise.all([hooks.getEnvironment(env.id), hooks.getDefaultInfo()]);
      setDetail(d);
      const items = defaults.items ?? { skills: [], rules: [], knowledge: [], connectors: [] };
      if (defaults.isCustom) {
        const wsItems = await apiFetch<{ data: null; isCustom: false; items: DefaultItems }>(`/workspaces/${workspaceId}/environments-default`);
        if (wsItems.items) { setAvailableSkills(wsItems.items.skills); setAvailableRules(wsItems.items.rules); setAvailableConnectors(wsItems.items.connectors); }
      } else { setAvailableSkills(items.skills); setAvailableRules(items.rules); setAvailableConnectors(items.connectors); }
    } finally { setLoadingDetail(false); }
  }, [env.id, hooks, workspaceId]);

  const reloadDetail = useCallback(async () => { const d = await hooks.getEnvironment(env.id); setDetail(d); }, [env.id, hooks]);
  const handleToggle = () => { if (!expanded) void loadDetail(); setExpanded(!expanded); };
  const itemCount = detail ? detail.skills.length + detail.rules.length + detail.instructions.length + detail.knowledge.length + detail.connectors.length : null;

  return (
    <div className={cn("rounded-lg border transition-colors", isDefault ? "border-primary/40 bg-primary/5" : "hover:border-foreground/20")}>
      <button onClick={handleToggle} className="flex w-full items-center gap-3 p-3 text-left">
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-lg text-white", getColorClass(env.color))}>{env.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{env.name}</span>
            <ScopeBadge scope={env.scope} />
            {isDefault && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">Default</Badge>}
            {env.is_template && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Template</Badge>}
          </div>
          {env.description && <p className="text-xs text-muted-foreground truncate">{env.description}</p>}
        </div>
        {itemCount !== null && <span className="text-xs text-muted-foreground whitespace-nowrap">{itemCount} items</span>}
      </button>
      {expanded && (
        <div className="border-t px-3 pb-3">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : detail ? (
            <div className="space-y-3 pt-3">
              {editingMeta ? (
                <EditMetaForm env={env} onSave={async (data) => { await hooks.updateEnvironment(env.id, data); setEditingMeta(false); }} onCancel={() => setEditingMeta(false)} />
              ) : (
                <button onClick={() => setEditingMeta(true)} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3 w-3" /> Edit name, icon & color
                </button>
              )}
              <RefPicker<ContextSkill> title="Skills" icon={<Sparkles className="h-3.5 w-3.5" />}
                available={availableSkills} included={detail.skills} getLabel={(s) => s.skill_name} getSubLabel={(s) => s.skill_content.slice(0, 40)}
                onAdd={async (id) => { await hooks.addSkillRef(env.id, id); await reloadDetail(); }}
                onRemove={async (id) => { await hooks.removeSkillRef(env.id, id); await reloadDetail(); }} />
              <RefPicker<ContextRule> title="Rules" icon={<BookOpen className="h-3.5 w-3.5" />}
                available={availableRules} included={detail.rules} getLabel={(r) => r.rule_name} getSubLabel={(r) => r.content.slice(0, 40)}
                onAdd={async (id) => { await hooks.addRuleRef(env.id, id); await reloadDetail(); }}
                onRemove={async (id) => { await hooks.removeRuleRef(env.id, id); await reloadDetail(); }} />
              <ItemList title="Knowledge" icon={<Brain className="h-3.5 w-3.5" />}
                items={detail.knowledge.map((k) => ({ name: k.filename, sub: `${k.content.length} chars` }))} emptyMessage="No knowledge files"
                onRemove={async (i) => { const k = detail.knowledge[i]; if (k) { await hooks.removeKnowledge(env.id, k.filename); await reloadDetail(); } }} />
              <RefPicker<Connector> title="Connectors" icon={<Plug className="h-3.5 w-3.5" />}
                available={availableConnectors} included={detail.connectors} getLabel={(c) => c.name} getSubLabel={(c) => c.transport_type}
                onAdd={async (id) => { await hooks.addConnectorRef(env.id, id); await reloadDetail(); }}
                onRemove={async (id) => { await hooks.removeConnectorRef(env.id, id); await reloadDetail(); }} />
              <InstructionsSection instructions={detail.instructions} envId={env.id} hooks={hooks} onReload={reloadDetail} />
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                {!isDefault && (
                  <button onClick={onSetDefault} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-primary/10 hover:border-primary/30">
                    <Star className="h-3 w-3" /> Set as Default
                  </button>
                )}
                <button onClick={onClone} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
                  <Copy className="h-3 w-3" /> Clone
                </button>
                <button
                  onClick={async () => {
                    try {
                      const res = await apiFetch<{ data: unknown }>(`/workspaces/${workspaceId}/environments/${env.id}/export`);
                      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url;
                      a.download = `${env.name.toLowerCase().replace(/\s+/g, "-")}-environment.json`;
                      a.click(); URL.revokeObjectURL(url);
                    } catch (err) { console.error("Export failed:", err); }
                  }}
                  className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <FileText className="h-3 w-3" /> Export
                </button>
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-destructive">Sure?</span>
                    <button onClick={onDelete} className="rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground">Yes</button>
                    <button onClick={() => setConfirmDelete(false)} className="rounded border px-2 py-1 text-xs">No</button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
