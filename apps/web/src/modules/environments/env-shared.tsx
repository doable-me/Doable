"use client";

import { useState, useEffect } from "react";
import {
  Pencil, X, Check, Loader2, Plus,
  CheckSquare, Square, Sparkles, BookOpen, Brain,
  Plug, FileText, Boxes, Key,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ─── Constants ──────────────────────────────────────────────

export const COLOR_OPTIONS = [
  { value: "blue", class: "bg-blue-500" },
  { value: "green", class: "bg-green-500" },
  { value: "purple", class: "bg-purple-500" },
  { value: "orange", class: "bg-orange-500" },
  { value: "pink", class: "bg-pink-500" },
  { value: "yellow", class: "bg-yellow-500" },
  { value: "red", class: "bg-red-500" },
  { value: "teal", class: "bg-teal-500" },
];

export const ICON_OPTIONS = ["🔧", "🚀", "💻", "🎨", "📦", "🔬", "🎯", "⚡", "🌐", "🛠️", "📝", "🤖"];

export function getColorClass(color: string) {
  return COLOR_OPTIONS.find((c) => c.value === color)?.class ?? "bg-blue-500";
}

export type EnvTab = "knowledge" | "skills" | "integrations" | "variables" | "settings";

export const ENV_TABS: { key: EnvTab; label: string; icon: React.ReactNode }[] = [
  { key: "integrations", label: "Integrations", icon: <Plug className="h-3.5 w-3.5" /> },
  { key: "knowledge", label: "Knowledge", icon: <Brain className="h-3.5 w-3.5" /> },
  { key: "skills", label: "Skills", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "variables", label: "Variables", icon: <Key className="h-3.5 w-3.5" /> },
  { key: "settings", label: "Settings", icon: <Boxes className="h-3.5 w-3.5" /> },
];

export const ENV_PANEL_MODE_KEY = "doable:env-panel-mode";

// ─── Inline Edit ────────────────────────────────────────────

export function InlineEdit({
  value, onSave, multiline, placeholder, className,
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

// ─── Scope Badge ────────────────────────────────────────────

export function ScopeBadge({ scope }: { scope: string }) {
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

// ─── Item List ──────────────────────────────────────────────

export function ItemList({ title, icon, items, emptyMessage, onRemove }: {
  title: string; icon: React.ReactNode; items: { name: string; sub: string }[];
  emptyMessage?: string; onRemove?: (index: number) => void;
}) {
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
                <button onClick={() => onRemove(i)} className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all" title="Remove">
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

// ─── Ref Picker ─────────────────────────────────────────────

export function RefPicker<T extends { id: string }>({
  title, icon, available, included, getLabel, getSubLabel, onAdd, onRemove,
}: {
  title: string; icon: React.ReactNode;
  available: T[]; included: T[];
  getLabel: (item: T) => string; getSubLabel?: (item: T) => string;
  onAdd: (id: string) => Promise<void>; onRemove: (id: string) => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const includedIds = new Set(included.map((i) => i.id));
  const notIncluded = available.filter((a) => !includedIds.has(a.id));

  const handleToggle = async (id: string, isIncluded: boolean) => {
    setBusy(id);
    try { if (isIncluded) await onRemove(id); else await onAdd(id); } finally { setBusy(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon} {title} <span className="text-[10px]">({included.length})</span>
        </div>
        <button onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
          {showPicker ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showPicker ? "Done" : "Edit"}
        </button>
      </div>

      {!showPicker ? (
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
                <button key={item.id} onClick={() => void handleToggle(item.id, isIn)} disabled={isBusy}
                  className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors",
                    isIn ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-muted-foreground")}>
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    : isIn ? <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                    : <Square className="h-3.5 w-3.5 shrink-0" />}
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
