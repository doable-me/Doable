"use client";

import { useState } from "react";
import {
  Plus, X, Loader2, Check, Pencil, FileText,
  Sparkles, BookOpen, Brain, Star, Boxes,
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
  type KnowledgeFile,
  type Connector,
} from "./use-environments";
import { getColorClass, ScopeBadge, RefPicker } from "./env-shared";
import { InstructionsSection } from "./env-forms";
import { DefaultEnvironmentCard } from "./env-cards";

// ─── Knowledge Tab ──────────────────────────────────────────

export function KnowledgeTab({
  envId, knowledge, hooks, onReload,
}: {
  envId: string; knowledge: KnowledgeFile[];
  hooks: ReturnType<typeof useEnvironments>; onReload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const handleAdd = async () => {
    if (!filename.trim()) return;
    setSaving(true);
    try { await hooks.addKnowledge(envId, filename.trim(), content); await onReload(); setAdding(false); setFilename(""); setContent(""); } finally { setSaving(false); }
  };
  const handleUpdate = async (fname: string) => {
    setSavingEdit(true);
    try { await hooks.updateKnowledge(envId, fname, editContent); await onReload(); setEditingFile(null); } finally { setSavingEdit(false); }
  };
  const handleRemove = async (fname: string) => { await hooks.removeKnowledge(envId, fname); await onReload(); };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{knowledge.length} file{knowledge.length !== 1 ? "s" : ""}</span>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />} {adding ? "Cancel" : "Add file"}
        </button>
      </div>
      {adding && (
        <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
          <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="knowledge.md" autoFocus
            className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="# Knowledge&#10;&#10;Add context about your project..." rows={6}
            className="w-full rounded border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-none" />
          <div className="flex justify-end gap-1">
            <button onClick={() => setAdding(false)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !filename.trim()} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Add
            </button>
          </div>
        </div>
      )}
      {knowledge.length === 0 && !adding && (
        <div className="flex flex-col items-center py-8 text-center">
          <Brain className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No knowledge files yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">Add files to give your AI context about this project.</p>
        </div>
      )}
      <div className="space-y-1">
        {knowledge.map((k) => (
          <div key={k.id} className="rounded-md border hover:border-foreground/20 transition-colors">
            <div className="flex items-center gap-2 px-3 py-2 group">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium truncate flex-1">{k.filename}</span>
              <span className="text-[10px] text-muted-foreground">{k.content.length} chars</span>
              <button onClick={() => { setEditingFile(editingFile === k.filename ? null : k.filename); setEditContent(k.content); }}
                className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground" title="Edit">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={() => void handleRemove(k.filename)}
                className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive" title="Remove">
                <X className="h-3 w-3" />
              </button>
            </div>
            {editingFile === k.filename && (
              <div className="border-t px-3 py-2 space-y-2">
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={8}
                  className="w-full rounded border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-none" />
                <div className="flex justify-end gap-1">
                  <button onClick={() => setEditingFile(null)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Cancel</button>
                  <button onClick={() => void handleUpdate(k.filename)} disabled={savingEdit}
                    className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
                    {savingEdit && <Loader2 className="h-3 w-3 animate-spin" />} <Check className="h-3 w-3" /> Save
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Skills Tab ─────────────────────────────────────────────

export function SkillsTab({
  envId, detail, availableSkills, availableRules, hooks, onReload,
}: {
  envId: string; detail: EnvironmentWithItems;
  availableSkills: ContextSkill[]; availableRules: ContextRule[];
  hooks: ReturnType<typeof useEnvironments>; onReload: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <RefPicker<ContextSkill> title="Skills" icon={<Sparkles className="h-3.5 w-3.5" />}
        available={availableSkills} included={detail.skills} getLabel={(s) => s.skill_name} getSubLabel={(s) => s.skill_content.slice(0, 40)}
        onAdd={async (id) => { await hooks.addSkillRef(envId, id); await onReload(); }}
        onRemove={async (id) => { await hooks.removeSkillRef(envId, id); await onReload(); }} />
      <RefPicker<ContextRule> title="Rules" icon={<BookOpen className="h-3.5 w-3.5" />}
        available={availableRules} included={detail.rules} getLabel={(r) => r.rule_name} getSubLabel={(r) => r.content.slice(0, 40)}
        onAdd={async (id) => { await hooks.addRuleRef(envId, id); await onReload(); }}
        onRemove={async (id) => { await hooks.removeRuleRef(envId, id); await onReload(); }} />
      <InstructionsSection instructions={detail.instructions} envId={envId} hooks={hooks} onReload={onReload} />
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────

export function SettingsTab({
  workspaceId, projectId, projectEnv, allEnvs, projectEnvId, setProjectEnvId,
}: {
  workspaceId: string; projectId: string;
  projectEnv: Environment | null; allEnvs: Environment[];
  projectEnvId: string | null; setProjectEnvId: (id: string | null) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);

  const handleAssign = async (envId: string | null) => {
    setLoadingAssign(true);
    try {
      if (envId) {
        await apiFetch(`/projects/${projectId}/environment`, { method: "PUT", body: JSON.stringify({ environmentId: envId }) });
        setProjectEnvId(envId);
      } else {
        await apiFetch(`/projects/${projectId}/environment`, { method: "DELETE" });
        setProjectEnvId(null);
      }
    } catch (err) { console.error("Failed to assign environment:", err); }
    finally { setLoadingAssign(false); setShowPicker(false); }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Star className="h-3.5 w-3.5" /> Active Environment</div>
          <button onClick={() => setShowPicker(!showPicker)} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
            {showPicker ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />} {showPicker ? "Cancel" : "Change"}
          </button>
        </div>
        {!showPicker ? (
          <div className="rounded-lg border p-3">
            {projectEnvId ? (() => {
              const assigned = (projectEnv && projectEnvId === projectEnv.id) ? projectEnv : allEnvs.find(e => e.id === projectEnvId);
              return assigned ? (
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-lg text-white", getColorClass(assigned.color))}>{assigned.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold truncate">{assigned.name}</span><ScopeBadge scope={assigned.scope} /></div>
                    {assigned.description && <p className="text-xs text-muted-foreground truncate">{assigned.description}</p>}
                  </div>
                </div>
              ) : <p className="text-xs text-muted-foreground">Custom environment (loading...)</p>;
            })() : (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-lg">🌐</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Workspace Default</span>
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">Auto</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Inheriting workspace skills, rules & connectors</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/10 p-2 space-y-1 max-h-64 overflow-y-auto">
            <button onClick={() => void handleAssign(null)} disabled={loadingAssign}
              className={cn("flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors", !projectEnvId ? "bg-primary/10" : "hover:bg-muted/60")}>
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/20 text-sm">🌐</div>
              <div className="flex-1 min-w-0"><span className="text-xs font-medium">Workspace Default</span><p className="text-[10px] text-muted-foreground">Inherit all workspace items</p></div>
              {!projectEnvId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
            {allEnvs.filter(e => e.scope !== 'project').map((env) => (
              <button key={env.id} onClick={() => void handleAssign(env.id)} disabled={loadingAssign}
                className={cn("flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors", projectEnvId === env.id ? "bg-primary/10" : "hover:bg-muted/60")}>
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-sm text-white", getColorClass(env.color))}>{env.icon}</div>
                <div className="flex-1 min-w-0"><span className="text-xs font-medium truncate block">{env.name}</span>{env.description && <p className="text-[10px] text-muted-foreground truncate">{env.description}</p>}</div>
                <ScopeBadge scope={env.scope} />
                {projectEnvId === env.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))}
            {allEnvs.filter(e => e.scope !== 'project').length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">No custom environments yet. Create one from Workspace Settings.</p>
            )}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Workspace Defaults</div>
        <DefaultEnvironmentCard workspaceId={workspaceId} />
      </div>
    </div>
  );
}
