"use client";

import { useState, useCallback } from "react";
import {
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  X,
  Shield,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Skill, Rule } from "./use-skills";

// ─── Types ──────────────────────────────────────────────────

export type ScopeType = "workspace" | "project" | "user";

const SCOPE_VARIANTS: Record<ScopeType, "default" | "secondary" | "outline"> = {
  workspace: "default",
  project: "secondary",
  user: "outline",
};

// ─── Inline Create Form ─────────────────────────────────────

export function InlineCreateForm({
  label,
  placeholder,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  onSubmit: (name: string, content: string, scope: ScopeType, description?: string, autoInvoke?: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<ScopeType>("workspace");
  const [autoInvoke, setAutoInvoke] = useState(true);
  const [saving, setSaving] = useState(false);
  const isSkill = label === "Skill";

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      onSubmit(name.trim(), content, scope, isSkill ? description : undefined, isSkill ? autoInvoke : undefined);
    } finally {
      setSaving(false);
    }
  }, [name, description, content, scope, autoInvoke, isSkill, onSubmit]);

  return (
    <div className="border rounded-md bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold">New {label}</span>
        <button
          onClick={onCancel}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`My ${label}`}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Scope
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeType)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          >
            <option value="workspace">Workspace</option>
            <option value="project">Project</option>
            <option value="user">User</option>
          </select>
        </div>
        {isSkill && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Description <span className="text-muted-foreground/50">(when to use this skill)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Use when building React components with accessibility..."
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-invoke-create"
                checked={autoInvoke}
                onChange={(e) => setAutoInvoke(e.target.checked)}
                className="rounded border-input"
              />
              <label htmlFor="auto-invoke-create" className="text-xs text-muted-foreground">
                Auto-invoke when prompt matches
              </label>
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 resize-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !name.trim()}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skill Card ─────────────────────────────────────────────

export function SkillCard({
  item,
  type,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: Skill | Rule;
  type: "skill" | "rule";
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (content: string, description?: string, autoInvoke?: boolean) => void;
  onDelete: () => void;
}) {
  const itemName = type === "skill" ? (item as Skill).skill_name : (item as Rule).rule_name;
  const itemContent = type === "skill" ? (item as Skill).skill_content : (item as Rule).content;
  const itemDescription = type === "skill" ? (item as Skill).description ?? "" : "";
  const itemAutoInvoke = type === "skill" ? (item as Skill).auto_invoke ?? true : true;
  const [editContent, setEditContent] = useState(itemContent);
  const [editDescription, setEditDescription] = useState(itemDescription);
  const [editAutoInvoke, setEditAutoInvoke] = useState(itemAutoInvoke);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      onUpdate(editContent, type === "skill" ? editDescription : undefined, type === "skill" ? editAutoInvoke : undefined);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [editContent, editDescription, editAutoInvoke, type, onUpdate]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
    setConfirmDelete(false);
  }, [confirmDelete, onDelete]);

  const handleContentChange = useCallback(
    (value: string) => {
      setEditContent(value);
      setDirty(value !== itemContent || editDescription !== itemDescription || editAutoInvoke !== itemAutoInvoke);
    },
    [itemContent, itemDescription, itemAutoInvoke, editDescription, editAutoInvoke]
  );

  const Icon = type === "skill" ? Lightbulb : Shield;

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Card header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{itemName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {type === "skill" && itemDescription
              ? itemDescription
              : itemContent
                ? `${itemContent.length} chars`
                : "Empty -- click to edit"}
          </p>
        </div>
        {type === "skill" && !itemAutoInvoke && (
          <Badge variant="outline" className="text-[10px] shrink-0 mr-1">
            manual
          </Badge>
        )}
        <Badge
          variant={SCOPE_VARIANTS[item.scope]}
          className="text-[10px] shrink-0"
        >
          {item.scope}
        </Badge>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t bg-muted/20">
          <div className="p-3 space-y-3">
            {type === "skill" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => {
                      setEditDescription(e.target.value);
                      setDirty(editContent !== itemContent || e.target.value !== itemDescription || editAutoInvoke !== itemAutoInvoke);
                    }}
                    placeholder="When to use this skill..."
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`auto-invoke-${item.id}`}
                    checked={editAutoInvoke}
                    onChange={(e) => {
                      setEditAutoInvoke(e.target.checked);
                      setDirty(editContent !== itemContent || editDescription !== itemDescription || e.target.checked !== itemAutoInvoke);
                    }}
                    className="rounded border-input"
                  />
                  <label htmlFor={`auto-invoke-${item.id}`} className="text-xs text-muted-foreground">
                    Auto-invoke when prompt matches
                  </label>
                </div>
              </>
            )}
            <textarea
              value={editContent}
              onChange={(e) => handleContentChange(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 resize-y placeholder:text-muted-foreground"
              placeholder={
                type === "skill"
                  ? "---\nname: my-skill\ntrigger: auto\n---\n\nSkill content in markdown..."
                  : "Rule content..."
              }
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-3 py-2 border-t">
            <button
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                dirty
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </button>
            <button
              onClick={handleDelete}
              onBlur={() => setConfirmDelete(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                confirmDelete
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              )}
            >
              {confirmDelete ? (
                <>
                  <AlertCircle className="h-3 w-3" />
                  Confirm
                </>
              ) : (
                <>
                  <Trash2 className="h-3 w-3" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
