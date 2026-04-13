"use client";

import { useState } from "react";
import { Plus, X, Loader2, Save, Check, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_OPTIONS, ICON_OPTIONS, InlineEdit } from "./env-shared";
import type { useEnvironments } from "./use-environments";

// ─── Create Environment Form ────────────────────────────────

export function CreateEnvironmentForm({
  onSubmit, onCancel,
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

// ─── Edit Metadata Form ─────────────────────────────────────

export function EditMetaForm({ env, onSave, onCancel }: {
  env: { name: string; description: string; icon: string; color: string };
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

// ─── Instructions Section ───────────────────────────────────

export function InstructionsSection({
  instructions, envId, hooks, onReload,
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
          <FileText className="h-3.5 w-3.5" /> Custom Instructions <span className="text-[10px]">({instructions.length})</span>
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
