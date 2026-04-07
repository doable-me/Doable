"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Copy,
  Sparkles,
  FileText,
  Plug,
  BookOpen,
  Boxes,
  Star,
  Pencil,
  Check,
  Brain,
  CheckSquare,
  Square,
  LayoutGrid,
  Key,
  Eye,
  EyeOff,
  Globe,
  Shield,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { IntegrationsPanel } from "@/modules/integrations/integrations-panel";

// ─── Constants ──────────────────────────────────────────────

interface EnvironmentsPanelProps {
  workspaceId: string;
  projectId?: string;
}

const COLOR_OPTIONS = [
  { value: "blue", class: "bg-blue-500" },
  { value: "green", class: "bg-green-500" },
  { value: "purple", class: "bg-purple-500" },
  { value: "orange", class: "bg-orange-500" },
  { value: "pink", class: "bg-pink-500" },
  { value: "yellow", class: "bg-yellow-500" },
  { value: "red", class: "bg-red-500" },
  { value: "teal", class: "bg-teal-500" },
];

const ICON_OPTIONS = ["🔧", "🚀", "💻", "🎨", "📦", "🔬", "🎯", "⚡", "🌐", "🛠️", "📝", "🤖"];

function getColorClass(color: string) {
  return COLOR_OPTIONS.find((c) => c.value === color)?.class ?? "bg-blue-500";
}

// ─── Inline Edit ────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  multiline,
  placeholder,
  className,
}: {
  value: string;
  onSave: (val: string) => Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); setEditing(false); } finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className={cn("group/edit flex items-center gap-1 text-left rounded px-1 -mx-1 hover:bg-muted/60 min-w-0", className)} title="Click to edit">
        <span className="truncate">{value || <span className="text-muted-foreground/50 italic">{placeholder ?? "Empty"}</span>}</span>
        <Pencil className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40 opacity-0 group-hover/edit:opacity-100" />
      </button>
    );
  }

  if (multiline) {
    return (
      <div className="space-y-1">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus rows={4}
          className="w-full rounded-md border border-ring bg-background px-2 py-1 text-xs font-mono outline-none resize-none"
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }} />
        <div className="flex justify-end gap-1">
          <button onClick={() => setEditing(false)} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
          <button onClick={commit} disabled={saving} className="rounded bg-primary p-0.5 text-primary-foreground disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
        className="flex-1 rounded border border-ring bg-background px-1.5 py-0.5 text-xs outline-none min-w-0"
        onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") setEditing(false); }} />
      <button onClick={() => setEditing(false)} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
      <button onClick={commit} disabled={saving} className="rounded bg-primary p-0.5 text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ─── Create Environment Form ────────────────────────────────

function CreateEnvironmentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { name: string; description?: string; icon?: string; color?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🔧");
  const [color, setColor] = useState("blue");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSubmit({ name: name.trim(), description: description.trim() || undefined, icon, color }); } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">New Environment</span>
        <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex gap-2">
          <div className="flex flex-col items-center gap-1">
            <label className="block text-xs font-medium text-muted-foreground">Icon</label>
            <select value={icon} onChange={(e) => setIcon(e.target.value)} className="h-9 w-14 rounded-md border bg-background text-center text-lg">
              {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. React + Supabase" autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Full-stack environment with React, Tailwind, and Supabase tools"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Color</label>
          <div className="flex gap-1.5">
            {COLOR_OPTIONS.map((c) => (
              <button key={c.value} onClick={() => setColor(c.value)}
                className={cn("h-6 w-6 rounded-full transition-all", c.class, color === c.value ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "opacity-60 hover:opacity-100")} />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            <Save className="h-3 w-3" /> Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ref Picker: Select workspace items to include ──────────

function RefPicker<T extends { id: string }>({
  title,
  icon,
  available,
  included,
  getLabel,
  getSubLabel,
  onAdd,
  onRemove,
}: {
  title: string;
  icon: React.ReactNode;
  available: T[];
  included: T[];
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  onAdd: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const includedIds = new Set(included.map((i) => i.id));
  const notIncluded = available.filter((a) => !includedIds.has(a.id));

  const handleToggle = async (id: string, isIncluded: boolean) => {
    setBusy(id);
    try {
      if (isIncluded) await onRemove(id);
      else await onAdd(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}
          {title}
          <span className="text-[10px]">({included.length})</span>
        </div>
        <button onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
          {showPicker ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showPicker ? "Done" : "Edit"}
        </button>
      </div>

      {!showPicker ? (
        // Compact view — just show included items
        included.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60 italic pl-5">None selected</p>
        ) : (
          <div className="space-y-0.5 pl-1">
            {included.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-muted/40 group">
                <span className="font-medium truncate flex-1">{getLabel(item)}</span>
                {getSubLabel && <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{getSubLabel(item)}</span>}
              </div>
            ))}
          </div>
        )
      ) : (
        // Picker view — checkboxes for all available items
        <div className="rounded-md border bg-muted/10 p-2 space-y-0.5 max-h-48 overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60 italic text-center py-2">
              No {title.toLowerCase()} in workspace. Create them in the {title} panel first.
            </p>
          ) : (
            available.map((item) => {
              const isIn = includedIds.has(item.id);
              const isBusy = busy === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => void handleToggle(item.id, isIn)}
                  disabled={isBusy}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors",
                    isIn ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-muted-foreground",
                  )}
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : isIn ? (
                    <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Square className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="font-medium truncate">{getLabel(item)}</span>
                  {getSubLabel && <span className="text-[10px] text-muted-foreground truncate ml-auto">{getSubLabel(item)}</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Instructions Section (snapshot, not refs) ──────────────

function InstructionsSection({
  instructions,
  envId,
  hooks,
  onReload,
}: {
  instructions: { id: string; filename: string; content: string }[];
  envId: string;
  hooks: ReturnType<typeof useEnvironments>;
  onReload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await hooks.addInstruction(envId, name.trim(), content); await onReload(); setAdding(false); setName(""); setContent(""); } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Custom Instructions
          <span className="text-[10px]">({instructions.length})</span>
        </div>
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {instructions.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground/60 italic pl-5">No custom instructions</p>
      )}

      {instructions.map((instr) => (
        <div key={instr.id} className="group flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-muted/40">
          <InlineEdit
            value={instr.filename}
            onSave={async (val) => { await hooks.updateInstruction(envId, instr.id, { filename: val }); await onReload(); }}
            className="flex-1 text-xs font-medium min-w-0"
          />
          <button onClick={async () => { await hooks.removeInstruction(envId, instr.id); await onReload(); }}
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {adding && (
        <div className="rounded-md border bg-muted/20 p-2 space-y-2 mt-1">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="coding-standards.md" autoFocus
            className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="# Instructions\n\nAlways..." rows={4}
            className="w-full rounded border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-none" />
          <div className="flex justify-end gap-1">
            <button onClick={() => setAdding(false)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !name.trim()} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit Metadata Form ─────────────────────────────────────

function EditMetaForm({ env, onSave, onCancel }: {
  env: Environment;
  onSave: (data: { name?: string; description?: string; icon?: string; color?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(env.name);
  const [description, setDescription] = useState(env.description);
  const [icon, setIcon] = useState(env.icon);
  const [color, setColor] = useState(env.color);
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Edit Environment</span>
        <button onClick={onCancel} className="rounded p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
      </div>
      <div className="flex gap-2">
        <select value={icon} onChange={(e) => setIcon(e.target.value)} className="h-8 w-12 rounded border bg-background text-center text-lg">
          {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
        className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
      <div className="flex gap-1.5">
        {COLOR_OPTIONS.map((c) => (
          <button key={c.value} onClick={() => setColor(c.value)}
            className={cn("h-5 w-5 rounded-full", c.class, color === c.value ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : "opacity-50 hover:opacity-100")} />
        ))}
      </div>
      <div className="flex justify-end gap-1">
        <button onClick={onCancel} className="rounded border px-2 py-1 text-xs hover:bg-muted">Cancel</button>
        <button onClick={async () => { setSaving(true); try { await onSave({ name, description, icon, color }); } finally { setSaving(false); } }}
          disabled={saving} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
        </button>
      </div>
    </div>
  );
}

// ─── Default Environment Card (virtual) ─────────────────────

function DefaultEnvironmentCard({ workspaceId }: { workspaceId: string }) {
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
    } finally {
      setLoading(false);
    }
  }, [workspaceId, items]);

  const handleToggle = () => {
    if (!expanded) void load();
    setExpanded(!expanded);
  };

  const totalCount = items
    ? items.skills.length + items.rules.length + items.knowledge.length + items.connectors.length
    : null;

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
              <p className="text-[11px] text-muted-foreground">
                Workspace-level items automatically included in all projects unless overridden by a project environment.
              </p>

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

function ItemList({ title, icon, items, emptyMessage, onRemove }: { title: string; icon: React.ReactNode; items: { name: string; sub: string }[]; emptyMessage?: string; onRemove?: (index: number) => void }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
        {icon} {title} <span className="text-[10px]">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60 italic pl-5">{emptyMessage ?? "None configured"}</p>
      ) : (
        <div className="pl-1 space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 text-xs group">
              <span className="font-medium truncate">{item.name}</span>
              <span className="text-[10px] text-muted-foreground truncate ml-auto max-w-[120px]">{item.sub}</span>
              {onRemove && (
                <button
                  onClick={() => onRemove(i)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Template Gallery Dialog ────────────────────────────────

interface TemplateEnv {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

function TemplateGallery({
  workspaceId,
  open,
  onClose,
  onCloned,
}: {
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onCloned: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateEnv[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch<{ data: TemplateEnv[] }>("/environments/templates")
      .then((res) => setTemplates(res.data))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [open]);

  const handleUse = async (t: TemplateEnv) => {
    setCloning(t.id);
    try {
      await apiFetch(`/${workspaceId}/environments/${t.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      onCloned();
      onClose();
    } finally {
      setCloning(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Environment Templates</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
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
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-sm", getColorClass(t.color), "bg-opacity-20")}>
                      {t.icon || "📦"}
                    </div>
                    <span className="text-sm font-medium truncate">{t.name}</span>
                    <div className={cn("ml-auto h-2 w-2 rounded-full shrink-0", getColorClass(t.color))} />
                  </div>
                  {t.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{t.description}</p>
                  )}
                  <button
                    onClick={() => void handleUse(t)}
                    disabled={cloning === t.id}
                    className="mt-auto flex items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {cloning === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                    Use Template
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

// ─── Custom Environment Card ────────────────────────────────

function EnvironmentCard({
  env,
  workspaceId,
  isDefault,
  onDelete,
  onClone,
  onSetDefault,
  hooks,
}: {
  env: Environment;
  workspaceId: string;
  isDefault: boolean;
  onDelete: () => void;
  onClone: () => void;
  onSetDefault: () => void;
  hooks: ReturnType<typeof useEnvironments>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<EnvironmentWithItems | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);

  // Available workspace items for pickers
  const [availableSkills, setAvailableSkills] = useState<ContextSkill[]>([]);
  const [availableRules, setAvailableRules] = useState<ContextRule[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<Connector[]>([]);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const [d, defaults] = await Promise.all([
        hooks.getEnvironment(env.id),
        hooks.getDefaultInfo(),
      ]);
      setDetail(d);
      // Available items = whatever is at workspace level
      const items = defaults.items ?? { skills: [], rules: [], knowledge: [], connectors: [] };
      // When custom default is set, we still need workspace items for the picker
      if (defaults.isCustom) {
        // Fetch workspace items directly
        const wsItems = await apiFetch<{ data: null; isCustom: false; items: DefaultItems }>(
          `/workspaces/${workspaceId}/environments-default`,
        );
        if (wsItems.items) {
          setAvailableSkills(wsItems.items.skills);
          setAvailableRules(wsItems.items.rules);
          setAvailableConnectors(wsItems.items.connectors);
        }
      } else {
        setAvailableSkills(items.skills);
        setAvailableRules(items.rules);
        setAvailableConnectors(items.connectors);
      }
    } finally {
      setLoadingDetail(false);
    }
  }, [env.id, hooks, workspaceId]);

  const reloadDetail = useCallback(async () => {
    const d = await hooks.getEnvironment(env.id);
    setDetail(d);
  }, [env.id, hooks]);

  const handleToggle = () => {
    if (!expanded) void loadDetail();
    setExpanded(!expanded);
  };

  const itemCount = detail
    ? detail.skills.length + detail.rules.length + detail.instructions.length + detail.knowledge.length + detail.connectors.length
    : null;

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
              {/* Edit metadata */}
              {editingMeta ? (
                <EditMetaForm env={env} onSave={async (data) => { await hooks.updateEnvironment(env.id, data); setEditingMeta(false); }} onCancel={() => setEditingMeta(false)} />
              ) : (
                <button onClick={() => setEditingMeta(true)} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3 w-3" /> Edit name, icon & color
                </button>
              )}

              {/* Skills picker */}
              <RefPicker<ContextSkill>
                title="Skills"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                available={availableSkills}
                included={detail.skills}
                getLabel={(s) => s.skill_name}
                getSubLabel={(s) => s.skill_content.slice(0, 40)}
                onAdd={async (id) => { await hooks.addSkillRef(env.id, id); await reloadDetail(); }}
                onRemove={async (id) => { await hooks.removeSkillRef(env.id, id); await reloadDetail(); }}
              />

              {/* Rules picker */}
              <RefPicker<ContextRule>
                title="Rules"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                available={availableRules}
                included={detail.rules}
                getLabel={(r) => r.rule_name}
                getSubLabel={(r) => r.content.slice(0, 40)}
                onAdd={async (id) => { await hooks.addRuleRef(env.id, id); await reloadDetail(); }}
                onRemove={async (id) => { await hooks.removeRuleRef(env.id, id); await reloadDetail(); }}
              />

              {/* Knowledge (directly owned by environment) */}
              <ItemList
                title="Knowledge"
                icon={<Brain className="h-3.5 w-3.5" />}
                items={detail.knowledge.map((k) => ({ name: k.filename, sub: `${k.content.length} chars` }))}
                emptyMessage="No knowledge files"
                onRemove={async (i) => { const k = detail.knowledge[i]; if (k) { await hooks.removeKnowledge(env.id, k.filename); await reloadDetail(); } }}
              />

              {/* Connectors picker */}
              <RefPicker<Connector>
                title="Connectors"
                icon={<Plug className="h-3.5 w-3.5" />}
                available={availableConnectors}
                included={detail.connectors}
                getLabel={(c) => c.name}
                getSubLabel={(c) => c.transport_type}
                onAdd={async (id) => { await hooks.addConnectorRef(env.id, id); await reloadDetail(); }}
                onRemove={async (id) => { await hooks.removeConnectorRef(env.id, id); await reloadDetail(); }}
              />

              {/* Instructions (snapshot) */}
              <InstructionsSection
                instructions={detail.instructions}
                envId={env.id}
                hooks={hooks}
                onReload={reloadDetail}
              />

              {/* Actions */}
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
                      const res = await apiFetch<{ data: unknown }>(
                        `/workspaces/${workspaceId}/environments/${env.id}/export`,
                      );
                      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${env.name.toLowerCase().replace(/\s+/g, "-")}-environment.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      console.error("Export failed:", err);
                    }
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

// ─── Scope Badge ────────────────────────────────────────────

function ScopeBadge({ scope }: { scope: string }) {
  const colors: Record<string, string> = {
    workspace: "bg-blue-500/15 text-blue-500 border-blue-500/20",
    project: "bg-green-500/15 text-green-500 border-green-500/20",
    user: "bg-purple-500/15 text-purple-500 border-purple-500/20",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", colors[scope] ?? "")}>
      {scope}
    </Badge>
  );
}

// ─── Project Environment Tab Types ──────────────────────────

type EnvTab = "knowledge" | "skills" | "integrations" | "variables" | "settings";

const ENV_TABS: { key: EnvTab; label: string; icon: React.ReactNode }[] = [
  { key: "integrations", label: "Integrations", icon: <Plug className="h-3.5 w-3.5" /> },
  { key: "knowledge", label: "Knowledge", icon: <Brain className="h-3.5 w-3.5" /> },
  { key: "skills", label: "Skills", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "variables", label: "Variables", icon: <Key className="h-3.5 w-3.5" /> },
  { key: "settings", label: "Settings", icon: <Boxes className="h-3.5 w-3.5" /> },
];

const ENV_PANEL_MODE_KEY = "doable:env-panel-mode";

// ─── Knowledge Tab ──────────────────────────────────────────

function KnowledgeTab({
  envId,
  knowledge,
  hooks,
  onReload,
}: {
  envId: string;
  knowledge: KnowledgeFile[];
  hooks: ReturnType<typeof useEnvironments>;
  onReload: () => Promise<void>;
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
    try {
      await hooks.addKnowledge(envId, filename.trim(), content);
      await onReload();
      setAdding(false);
      setFilename("");
      setContent("");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (fname: string) => {
    setSavingEdit(true);
    try {
      await hooks.updateKnowledge(envId, fname, editContent);
      await onReload();
      setEditingFile(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRemove = async (fname: string) => {
    await hooks.removeKnowledge(envId, fname);
    await onReload();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{knowledge.length} file{knowledge.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {adding ? "Cancel" : "Add file"}
        </button>
      </div>

      {adding && (
        <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="knowledge.md"
            autoFocus
            className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="# Knowledge&#10;&#10;Add context about your project..."
            rows={6}
            className="w-full rounded border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div className="flex justify-end gap-1">
            <button onClick={() => setAdding(false)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !filename.trim()}
              className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
            >
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
              <button
                onClick={() => { setEditingFile(editingFile === k.filename ? null : k.filename); setEditContent(k.content); }}
                className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                title="Edit"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => void handleRemove(k.filename)}
                className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {editingFile === k.filename && (
              <div className="border-t px-3 py-2 space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  className="w-full rounded border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <div className="flex justify-end gap-1">
                  <button onClick={() => setEditingFile(null)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Cancel</button>
                  <button
                    onClick={() => void handleUpdate(k.filename)}
                    disabled={savingEdit}
                    className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                  >
                    {savingEdit && <Loader2 className="h-3 w-3 animate-spin" />}
                    <Check className="h-3 w-3" /> Save
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

function SkillsTab({
  envId,
  detail,
  availableSkills,
  availableRules,
  hooks,
  onReload,
}: {
  envId: string;
  detail: EnvironmentWithItems;
  availableSkills: ContextSkill[];
  availableRules: ContextRule[];
  hooks: ReturnType<typeof useEnvironments>;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <RefPicker<ContextSkill>
        title="Skills"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        available={availableSkills}
        included={detail.skills}
        getLabel={(s) => s.skill_name}
        getSubLabel={(s) => s.skill_content.slice(0, 40)}
        onAdd={async (id) => { await hooks.addSkillRef(envId, id); await onReload(); }}
        onRemove={async (id) => { await hooks.removeSkillRef(envId, id); await onReload(); }}
      />
      <RefPicker<ContextRule>
        title="Rules"
        icon={<BookOpen className="h-3.5 w-3.5" />}
        available={availableRules}
        included={detail.rules}
        getLabel={(r) => r.rule_name}
        getSubLabel={(r) => r.content.slice(0, 40)}
        onAdd={async (id) => { await hooks.addRuleRef(envId, id); await onReload(); }}
        onRemove={async (id) => { await hooks.removeRuleRef(envId, id); await onReload(); }}
      />
      <InstructionsSection
        instructions={detail.instructions}
        envId={envId}
        hooks={hooks}
        onReload={onReload}
      />
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────

function SettingsTab({
  workspaceId,
  projectId,
  projectEnv,
  allEnvs,
  projectEnvId,
  setProjectEnvId,
}: {
  workspaceId: string;
  projectId: string;
  projectEnv: Environment | null;
  allEnvs: Environment[];
  projectEnvId: string | null;
  setProjectEnvId: (id: string | null) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);

  const handleAssign = async (envId: string | null) => {
    setLoadingAssign(true);
    try {
      if (envId) {
        await apiFetch(`/projects/${projectId}/environment`, {
          method: "PUT",
          body: JSON.stringify({ environmentId: envId }),
        });
        setProjectEnvId(envId);
      } else {
        await apiFetch(`/projects/${projectId}/environment`, { method: "DELETE" });
        setProjectEnvId(null);
      }
    } catch (err) {
      console.error("Failed to assign environment:", err);
    } finally {
      setLoadingAssign(false);
      setShowPicker(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Active environment assignment */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Star className="h-3.5 w-3.5" />
            Active Environment
          </div>
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showPicker ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
            {showPicker ? "Cancel" : "Change"}
          </button>
        </div>

        {!showPicker ? (
          <div className="rounded-lg border p-3">
            {projectEnvId ? (
              (() => {
                const assigned = (projectEnv && projectEnvId === projectEnv.id) ? projectEnv : allEnvs.find(e => e.id === projectEnvId);
                return assigned ? (
                  <div className="flex items-center gap-3">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-lg text-white", getColorClass(assigned.color))}>{assigned.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{assigned.name}</span>
                        <ScopeBadge scope={assigned.scope} />
                      </div>
                      {assigned.description && <p className="text-xs text-muted-foreground truncate">{assigned.description}</p>}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Custom environment (loading...)</p>
                );
              })()
            ) : (
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
            <button
              onClick={() => void handleAssign(null)}
              disabled={loadingAssign}
              className={cn(
                "flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors",
                !projectEnvId ? "bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/20 text-sm">🌐</div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">Workspace Default</span>
                <p className="text-[10px] text-muted-foreground">Inherit all workspace items</p>
              </div>
              {!projectEnvId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
            {allEnvs.filter(e => e.scope !== 'project').map((env) => (
              <button
                key={env.id}
                onClick={() => void handleAssign(env.id)}
                disabled={loadingAssign}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors",
                  projectEnvId === env.id ? "bg-primary/10" : "hover:bg-muted/60",
                )}
              >
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-md text-sm text-white", getColorClass(env.color))}>{env.icon}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">{env.name}</span>
                  {env.description && <p className="text-[10px] text-muted-foreground truncate">{env.description}</p>}
                </div>
                <ScopeBadge scope={env.scope} />
                {projectEnvId === env.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))}
            {allEnvs.filter(e => e.scope !== 'project').length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-3">
                No custom environments yet. Create one from Workspace Settings.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Workspace defaults */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" />
          Workspace Defaults
        </div>
        <DefaultEnvironmentCard workspaceId={workspaceId} />
      </div>
    </div>
  );
}

// ─── Environment Variables Tab ──────────────────────────────

interface EnvVar {
  id: string;
  key: string;
  is_secret: boolean;
  target: string;
  description: string | null;
  scope: "workspace" | "project";
  created_at: string;
  updated_at: string;
}

const TARGET_OPTIONS = [
  { value: "all", label: "All" },
  { value: "development", label: "Development" },
  { value: "preview", label: "Preview" },
  { value: "production", label: "Production" },
] as const;

function VariablesTab({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [projectVars, setProjectVars] = useState<EnvVar[]>([]);
  const [workspaceVars, setWorkspaceVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [showInherited, setShowInherited] = useState(true);

  // New var form
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newTarget, setNewTarget] = useState<string>("all");
  const [newSecret, setNewSecret] = useState(false);
  const [newDescription, setNewDescription] = useState("");

  // Edit form
  const [editValue, setEditValue] = useState("");
  const [editTarget, setEditTarget] = useState<string>("all");
  const [editDescription, setEditDescription] = useState("");

  const loadVars = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, wsRes] = await Promise.all([
        apiFetch<{ data: EnvVar[] }>(`/projects/${projectId}/env-vars`),
        apiFetch<{ data: EnvVar[] }>(`/workspaces/${workspaceId}/env-vars`),
      ]);
      setProjectVars(projRes.data);
      setWorkspaceVars(wsRes.data);
    } catch {
      // silently fail, vars are optional
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceId]);

  useEffect(() => { void loadVars(); }, [loadVars]);

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/projects/${projectId}/env-vars`, {
        method: "POST",
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue,
          target: newTarget,
          is_secret: newSecret,
          description: newDescription.trim() || undefined,
        }),
      });
      setAdding(false);
      setNewKey("");
      setNewValue("");
      setNewTarget("all");
      setNewSecret(false);
      setNewDescription("");
      await loadVars();
    } catch {
      // TODO: show error
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (varId: string) => {
    setSaving(true);
    try {
      await apiFetch(`/projects/${projectId}/env-vars/${varId}`, {
        method: "PUT",
        body: JSON.stringify({
          value: editValue || undefined,
          target: editTarget,
          description: editDescription.trim() || undefined,
        }),
      });
      setEditingId(null);
      await loadVars();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (varId: string) => {
    try {
      await apiFetch(`/projects/${projectId}/env-vars/${varId}`, { method: "DELETE" });
      await loadVars();
    } catch {
      // silently fail
    }
  };

  const revealValue = async (varId: string) => {
    if (revealedValues[varId]) {
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[varId];
        return next;
      });
      return;
    }
    try {
      const res = await apiFetch<{ data: { value: string } }>(`/env-vars/${varId}/value`);
      setRevealedValues((prev) => ({ ...prev, [varId]: res.data.value }));
    } catch {
      // silently fail
    }
  };

  const startEdit = (v: EnvVar) => {
    setEditingId(v.id);
    setEditValue("");
    setEditTarget(v.target);
    setEditDescription(v.description ?? "");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Inherited vars = workspace vars whose keys aren't overridden by project vars
  const projectKeys = new Set(projectVars.map((v) => v.key));
  const inheritedVars = workspaceVars.filter((v) => !projectKeys.has(v.key));

  return (
    <div className="space-y-3">
      {/* Add new */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Variable
        </button>
      ) : (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="KEY_NAME"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
              className="rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
              autoFocus
            />
            <select
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-xs"
            >
              {TARGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <input
            placeholder="Value"
            type={newSecret ? "password" : "text"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
          />
          <input
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <button
                type="button"
                onClick={() => setNewSecret(!newSecret)}
                className="text-muted-foreground hover:text-foreground"
              >
                {newSecret ? <Shield className="h-3.5 w-3.5 text-amber-500" /> : <Globe className="h-3.5 w-3.5" />}
              </button>
              {newSecret ? "Secret (masked after save)" : "Plaintext"}
            </label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setAdding(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !newKey.trim() || !newValue.trim()}
                className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project vars */}
      {projectVars.length === 0 && inheritedVars.length === 0 && !adding && (
        <div className="flex flex-col items-center py-6 text-center">
          <Key className="h-6 w-6 text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No environment variables</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Variables are injected into dev server and builds
          </p>
        </div>
      )}

      {projectVars.map((v) => (
        <div key={v.id} className="rounded-lg border bg-card">
          {editingId === v.id ? (
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">{v.key}</span>
                <select
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                  className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px]"
                >
                  {TARGET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <input
                placeholder="New value (leave blank to keep)"
                type={v.is_secret ? "password" : "text"}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
              />
              <input
                placeholder="Description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setEditingId(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                <button onClick={() => handleUpdate(v.id)} disabled={saving} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium truncate">{v.key}</span>
                  {v.is_secret && <Shield className="h-3 w-3 text-amber-500 shrink-0" />}
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{v.target}</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  {v.is_secret
                    ? (revealedValues[v.id] ?? "••••••••")
                    : (revealedValues[v.id] ?? "••••••••")
                  }
                </div>
                {v.description && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{v.description}</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => revealValue(v.id)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted" title="Toggle value">
                  {revealedValues[v.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
                <button onClick={() => startEdit(v)} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted" title="Edit">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => handleDelete(v.id)} className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted" title="Delete">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Inherited workspace vars */}
      {inheritedVars.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowInherited(!showInherited)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            {showInherited ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Inherited from workspace ({inheritedVars.length})
          </button>
          {showInherited && inheritedVars.map((v) => (
            <div key={v.id} className="rounded-lg border border-dashed bg-muted/30 mb-1.5">
              <div className="flex items-center gap-2 p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground truncate">{v.key}</span>
                    {v.is_secret && <Shield className="h-3 w-3 text-amber-500/60 shrink-0" />}
                    <Badge variant="outline" className="text-[10px] px-1 py-0 opacity-60">{v.target}</Badge>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">inherited</Badge>
                  </div>
                  {v.description && (
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">{v.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project-focused Environment View ───────────────────────

function ProjectEnvironmentView({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const hooks = useEnvironments(workspaceId, { projectId });
  const { environments, loading, error, refresh } = hooks;
  const [activeTab, setActiveTab] = useState<EnvTab>("integrations");
  const [detached, setDetached] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ENV_PANEL_MODE_KEY) === "detached";
  });

  const toggleDetached = useCallback(() => {
    setDetached((prev) => {
      const next = !prev;
      localStorage.setItem(ENV_PANEL_MODE_KEY, next ? "detached" : "inline");
      return next;
    });
  }, []);
  const [detail, setDetail] = useState<EnvironmentWithItems | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [allEnvs, setAllEnvs] = useState<Environment[]>([]);
  const [projectEnvId, setProjectEnvId] = useState<string | null>(null);

  // Available workspace items for pickers
  const [availableSkills, setAvailableSkills] = useState<ContextSkill[]>([]);
  const [availableRules, setAvailableRules] = useState<ContextRule[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<Connector[]>([]);

  const projectEnv = environments[0] ?? null;

  // Load workspace envs and current assignment
  useEffect(() => {
    if (!workspaceId || !projectId) return;
    Promise.all([
      apiFetch<{ data: Environment[] }>(`/workspaces/${workspaceId}/environments`),
      apiFetch<{ data: { environment_id: string } | null }>(`/projects/${projectId}/environment`).catch(() => ({ data: null })),
    ]).then(([envRes, projEnvRes]) => {
      setAllEnvs(envRes.data);
      setProjectEnvId(projEnvRes.data?.environment_id ?? null);
    }).catch(() => {});
  }, [workspaceId, projectId]);

  // Load environment detail + workspace items for pickers
  const loadDetail = useCallback(async () => {
    if (!projectEnv) return;
    setLoadingDetail(true);
    try {
      const [d, defaults] = await Promise.all([
        hooks.getEnvironment(projectEnv.id),
        hooks.getDefaultInfo(),
      ]);
      setDetail(d);
      const items = defaults.items ?? { skills: [], rules: [], knowledge: [], connectors: [] };
      if (defaults.isCustom) {
        const wsItems = await apiFetch<{ data: null; isCustom: false; items: DefaultItems }>(
          `/workspaces/${workspaceId}/environments-default`,
        );
        if (wsItems.items) {
          setAvailableSkills(wsItems.items.skills);
          setAvailableRules(wsItems.items.rules);
          setAvailableConnectors(wsItems.items.connectors);
        }
      } else {
        setAvailableSkills(items.skills);
        setAvailableRules(items.rules);
        setAvailableConnectors(items.connectors);
      }
    } finally {
      setLoadingDetail(false);
    }
  }, [projectEnv, hooks, workspaceId]);

  // Auto-load detail when project env is available
  useEffect(() => {
    if (projectEnv && !detail) void loadDetail();
  }, [projectEnv, detail, loadDetail]);

  const reloadDetail = useCallback(async () => {
    if (!projectEnv) return;
    const d = await hooks.getEnvironment(projectEnv.id);
    setDetail(d);
  }, [projectEnv, hooks]);

  const panelContent = (
    <div className={cn("flex flex-col", detached ? "h-full" : "h-full")}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Environment</h2>
          {projectEnv && <ScopeBadge scope={projectEnv.scope} />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { void refresh(); setDetail(null); }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleDetached}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={detached ? "Dock to sidebar" : "Open as popup"}
          >
            {detached ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {detached && (
            <button
              onClick={toggleDetached}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-1 overflow-x-auto">
        {ENV_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 mb-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}

        {(loading || loadingDetail) && !detail ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : detail && projectEnv ? (
          <>
            {activeTab === "knowledge" && (
              <KnowledgeTab envId={projectEnv.id} knowledge={detail.knowledge} hooks={hooks} onReload={reloadDetail} />
            )}
            {activeTab === "skills" && (
              <SkillsTab envId={projectEnv.id} detail={detail} availableSkills={availableSkills} availableRules={availableRules} hooks={hooks} onReload={reloadDetail} />
            )}
            {activeTab === "integrations" && (
              <div className="-mx-3 -mt-3 flex flex-col" style={{ height: "calc(100% + 1.5rem)" }}>
                <IntegrationsPanel workspaceId={workspaceId} projectId={projectId} variant="panel" />
              </div>
            )}
            {activeTab === "variables" && (
              <VariablesTab workspaceId={workspaceId} projectId={projectId} />
            )}
            {activeTab === "settings" && (
              <SettingsTab workspaceId={workspaceId} projectId={projectId} projectEnv={projectEnv} allEnvs={allEnvs} projectEnvId={projectEnvId} setProjectEnvId={setProjectEnvId} />
            )}
          </>
        ) : !loading && (
          <div className="flex flex-col items-center py-8 text-center">
            <Boxes className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No environment loaded</p>
          </div>
        )}
      </div>
    </div>
  );

  if (detached) {
    return (
      <Dialog open onOpenChange={() => toggleDetached()}>
        <DialogContent
          className="max-w-4xl w-[90vw] h-[85vh] max-h-[85vh] p-0 overflow-hidden flex flex-col"
        >
          {panelContent}
        </DialogContent>
      </Dialog>
    );
  }

  return panelContent;
}

// ─── Main Panel ─────────────────────────────────────────────

export function EnvironmentsPanel({ workspaceId, projectId }: EnvironmentsPanelProps) {
  // When projectId is provided (editor context), show project-focused view
  if (projectId) {
    return <ProjectEnvironmentView workspaceId={workspaceId} projectId={projectId} />;
  }

  // Workspace-level view (workspace settings)
  return <WorkspaceEnvironmentsView workspaceId={workspaceId} />;
}

function WorkspaceEnvironmentsView({ workspaceId }: { workspaceId: string }) {
  const hooks = useEnvironments(workspaceId);
  const { environments, loading, error, refresh, createEnvironment, deleteEnvironment, cloneEnvironment, setDefault } = hooks;
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [defaultEnvId, setDefaultEnvId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    void hooks.getDefaultInfo().then((info) => {
      setDefaultEnvId(info.isCustom && info.data ? info.data.id : null);
    });
  }, [workspaceId, hooks]);

  const handleCreate = async (data: { name: string; description?: string; icon?: string; color?: string }) => {
    await createEnvironment(data);
    setShowCreate(false);
  };

  const handleSetDefault = async (envId: string) => {
    await setDefault(envId);
    setDefaultEnvId(envId);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Environments</h2>
          <Badge variant="secondary" className="text-[10px]">{environments.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => void refresh()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
            <LayoutGrid className="h-3.5 w-3.5" /> Templates
          </button>
          <label className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted cursor-pointer">
            <FileText className="h-3.5 w-3.5" /> Import
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const bundle = JSON.parse(text);
                  await apiFetch(`/workspaces/${workspaceId}/environments/import`, {
                    method: "POST",
                    body: JSON.stringify(bundle),
                  });
                  void refresh();
                } catch (err) {
                  console.error("Import failed:", err);
                }
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Environments bundle workspace skills, rules, knowledge, and connectors into reusable presets.
          The <strong>default</strong> environment includes all workspace items automatically.
        </p>

        {showCreate && <CreateEnvironmentForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />}

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {/* Default environment (always shown) */}
            {!defaultEnvId && <DefaultEnvironmentCard workspaceId={workspaceId} />}

            {/* Custom environments */}
            {environments.map((env) => (
              <EnvironmentCard
                key={env.id}
                env={env}
                workspaceId={workspaceId}
                isDefault={defaultEnvId === env.id}
                hooks={hooks}
                onDelete={() => void deleteEnvironment(env.id)}
                onClone={() => void cloneEnvironment(env.id)}
                onSetDefault={() => void handleSetDefault(env.id)}
              />
            ))}

            {environments.length === 0 && !showCreate && (
              <div className="flex flex-col items-center rounded-lg border-2 border-dashed p-6 text-center">
                <p className="text-xs text-muted-foreground">
                  Create a custom environment to bundle a specific subset of your workspace items.
                </p>
                <button onClick={() => setShowCreate(true)}
                  className="mt-3 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-3.5 w-3.5" /> Create Environment
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <TemplateGallery
        workspaceId={workspaceId}
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onCloned={() => void refresh()}
      />
    </div>
  );
}

export default EnvironmentsPanel;
