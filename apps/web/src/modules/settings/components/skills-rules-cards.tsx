"use client";

import { useState } from "react";
import {
  Trash2,
  Loader2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Skill, Rule } from "../hooks/use-skills-rules";

// ─── Inline Edit ───────────────────────────────────────

export function InlineEdit({
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

  const commit = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); setEditing(false); } finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <button onClick={() => { setDraft(value); setEditing(true); }} className={cn("group/edit flex items-center gap-1 text-left rounded px-1 -mx-1 hover:bg-muted/60 min-w-0", className)} title="Click to edit">
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

// ─── Skill Card ────────────────────────────────────────

export function SkillCard({
  skill,
  onUpdate,
  onDelete,
}: {
  skill: Skill;
  onUpdate: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(skill.id); } finally { setDeleting(false); setConfirmDelete(false); }
  };

  return (
    <div className="rounded-lg border bg-card transition-colors hover:border-muted-foreground/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{skill.skill_name}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{skill.scope}</Badge>
          </div>
          {!expanded && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{skill.skill_content}</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2.5 space-y-2">
          <InlineEdit
            value={skill.skill_content}
            onSave={async (val) => onUpdate(skill.id, val)}
            multiline
            placeholder="Skill content..."
            className="text-xs"
          />
          <div className="flex justify-end">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Delete this skill?</span>
                <button onClick={() => setConfirmDelete(false)} className="rounded border px-2 py-0.5 text-xs hover:bg-muted">Cancel</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-xs text-destructive-foreground disabled:opacity-50">
                  {deleting && <Loader2 className="h-3 w-3 animate-spin" />} Delete
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Skill Form ─────────────────────────────────

export function CreateSkillForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { skillName: string; skillContent: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try { await onSubmit({ skillName: name.trim(), skillContent: content.trim() }); } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">New Skill</span>
        <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. React Best Practices" autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Content</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe what this skill teaches the AI..." rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground resize-none" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim() || !content.trim()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            <Save className="h-3 w-3" /> Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rule Card ─────────────────────────────────────────

export function RuleCard({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: Rule;
  onUpdate: (id: string, content: string, filePatterns?: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingPatterns, setEditingPatterns] = useState(false);
  const [patternsDraft, setPatternsDraft] = useState(rule.file_patterns.join(", "));
  const [savingPatterns, setSavingPatterns] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(rule.id); } finally { setDeleting(false); setConfirmDelete(false); }
  };

  const handleSavePatterns = async () => {
    const patterns = patternsDraft.split(",").map((p) => p.trim()).filter(Boolean);
    setSavingPatterns(true);
    try { await onUpdate(rule.id, rule.content, patterns); setEditingPatterns(false); } finally { setSavingPatterns(false); }
  };

  return (
    <div className="rounded-lg border bg-card transition-colors hover:border-muted-foreground/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{rule.rule_name}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{rule.scope}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {rule.file_patterns.length > 0 ? (
              rule.file_patterns.map((p) => (
                <Badge key={p} variant="secondary" className="text-[10px] font-mono">{p}</Badge>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground/50 italic">No file patterns</span>
            )}
          </div>
          {!expanded && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{rule.content}</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2.5 space-y-2">
          {/* File patterns editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">File Patterns</span>
              <button onClick={() => { setPatternsDraft(rule.file_patterns.join(", ")); setEditingPatterns(!editingPatterns); }}
                className="text-[10px] text-muted-foreground hover:text-foreground">
                {editingPatterns ? "Cancel" : "Edit"}
              </button>
            </div>
            {editingPatterns ? (
              <div className="flex items-center gap-1">
                <input type="text" value={patternsDraft} onChange={(e) => setPatternsDraft(e.target.value)}
                  placeholder="*.tsx, *.ts, src/**/*.js"
                  className="flex-1 rounded border border-ring bg-background px-1.5 py-0.5 text-xs font-mono outline-none min-w-0"
                  onKeyDown={(e) => { if (e.key === "Enter") void handleSavePatterns(); if (e.key === "Escape") setEditingPatterns(false); }} />
                <button onClick={handleSavePatterns} disabled={savingPatterns} className="rounded bg-primary p-0.5 text-primary-foreground disabled:opacity-50">
                  {savingPatterns ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {rule.file_patterns.length > 0 ? (
                  rule.file_patterns.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px] font-mono">{p}</Badge>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground/50 italic">No file patterns — applies to all files</span>
                )}
              </div>
            )}
          </div>

          {/* Content editor */}
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Content</span>
            <InlineEdit
              value={rule.content}
              onSave={async (val) => onUpdate(rule.id, val)}
              multiline
              placeholder="Rule content..."
              className="text-xs mt-1"
            />
          </div>

          <div className="flex justify-end">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Delete this rule?</span>
                <button onClick={() => setConfirmDelete(false)} className="rounded border px-2 py-0.5 text-xs hover:bg-muted">Cancel</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-xs text-destructive-foreground disabled:opacity-50">
                  {deleting && <Loader2 className="h-3 w-3 animate-spin" />} Delete
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Rule Form ──────────────────────────────────

export function CreateRuleForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { ruleName: string; content: string; filePatterns: string[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [patterns, setPatterns] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !content.trim()) return;
    const filePatterns = patterns.split(",").map((p) => p.trim()).filter(Boolean);
    setSaving(true);
    try { await onSubmit({ ruleName: name.trim(), content: content.trim(), filePatterns }); } finally { setSaving(false); }
  };

  return (
    <div className="rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">New Rule</span>
        <button onClick={onCancel} className="rounded-md p-1 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TypeScript Conventions" autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">File Patterns <span className="font-normal text-muted-foreground">(comma-separated, optional)</span></label>
          <input type="text" value={patterns} onChange={(e) => setPatterns(e.target.value)} placeholder="*.tsx, *.ts, src/**/*.js"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Content</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe the rule the AI should follow..." rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground resize-none" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim() || !content.trim()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            <Save className="h-3 w-3" /> Create
          </button>
        </div>
      </div>
    </div>
  );
}
