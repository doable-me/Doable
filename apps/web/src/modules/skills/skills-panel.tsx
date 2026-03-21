"use client";

import { useState, useCallback } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  RefreshCw,
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
import {
  useSkills,
  type Skill,
  type Rule,
} from "./use-skills";

// ─── Types ──────────────────────────────────────────────────

interface SkillsPanelProps {
  workspaceId: string;
  projectId?: string;
}

type ScopeType = "workspace" | "project" | "user";

// ─── Scope Badge ────────────────────────────────────────────

const SCOPE_VARIANTS: Record<ScopeType, "default" | "secondary" | "outline"> = {
  workspace: "default",
  project: "secondary",
  user: "outline",
};

// ─── Inline Create Form ─────────────────────────────────────

function InlineCreateForm({
  label,
  placeholder,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  onSubmit: (name: string, content: string, scope: ScopeType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<ScopeType>("workspace");
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      onSubmit(name.trim(), content, scope);
    } finally {
      setSaving(false);
    }
  }, [name, content, scope, onSubmit]);

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

function SkillCard({
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
  onUpdate: (content: string) => void;
  onDelete: () => void;
}) {
  const itemName = type === "skill" ? (item as Skill).skill_name : (item as Rule).rule_name;
  const itemContent = type === "skill" ? (item as Skill).skill_content : (item as Rule).content;
  const [editContent, setEditContent] = useState(itemContent);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      onUpdate(editContent);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [editContent, onUpdate]);

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
      setDirty(value !== itemContent);
    },
    [itemContent]
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
            {itemContent
              ? `${itemContent.length} chars`
              : "Empty -- click to edit"}
          </p>
        </div>
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
          <div className="p-3">
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

// ─── Section Header ─────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
  expanded,
  onToggle,
  onAdd,
}: {
  icon: typeof BookOpen;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-1 py-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">({count})</span>
      </button>
      <button
        onClick={onAdd}
        className="p-1 rounded-md hover:bg-muted transition-colors"
        title={`Add ${title.toLowerCase().slice(0, -1)}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────

export const SkillsPanel = ({ workspaceId, projectId }: SkillsPanelProps) => {
  const {
    skills,
    rules,
    loading,
    error,
    refresh,
    createSkill,
    updateSkill,
    deleteSkill,
    createRule,
    updateRule,
    deleteRule,
  } = useSkills(workspaceId, projectId);

  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [skillsSectionOpen, setSkillsSectionOpen] = useState(true);
  const [rulesSectionOpen, setRulesSectionOpen] = useState(true);

  const handleCreateSkill = useCallback(
    (name: string, content: string, scope: ScopeType) => {
      void createSkill({ skillName: name, skillContent: content, scope, projectId }).then(() =>
        setShowSkillForm(false)
      );
    },
    [createSkill, projectId]
  );

  const handleCreateRule = useCallback(
    (name: string, content: string, scope: ScopeType) => {
      void createRule({ ruleName: name, content, filePatterns: [], scope, projectId }).then(() =>
        setShowRuleForm(false)
      );
    },
    [createRule, projectId]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Skills & Rules</h3>
        </div>
        <button
          onClick={() => void refresh()}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", loading && "animate-spin")}
          />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border-b">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-3 space-y-1">
          {/* Loading state */}
          {loading && skills.length === 0 && rules.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Loading...
            </div>
          )}

          {/* ── Skills Section ─────────────────────────────── */}
          <SectionHeader
            icon={Lightbulb}
            title="Skills"
            count={skills.length}
            expanded={skillsSectionOpen}
            onToggle={() => setSkillsSectionOpen((v) => !v)}
            onAdd={() => {
              setSkillsSectionOpen(true);
              setShowSkillForm(true);
            }}
          />

          {skillsSectionOpen && (
            <div className="space-y-2 pl-1">
              {/* Skill create form */}
              {showSkillForm && (
                <InlineCreateForm
                  label="Skill"
                  placeholder={"---\nname: my-skill\ntrigger: auto\n---\n\nSkill content here..."}
                  onSubmit={handleCreateSkill}
                  onCancel={() => setShowSkillForm(false)}
                />
              )}

              {/* Skill list */}
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  item={skill}
                  type="skill"
                  expanded={expandedSkillId === skill.id}
                  onToggle={() =>
                    setExpandedSkillId((prev) =>
                      prev === skill.id ? null : skill.id
                    )
                  }
                  onUpdate={(content) =>
                    void updateSkill(skill.id, content)
                  }
                  onDelete={() => void deleteSkill(skill.id)}
                />
              ))}

              {/* Empty state */}
              {!loading && skills.length === 0 && !showSkillForm && (
                <div className="flex flex-col items-center py-6 text-center">
                  <Lightbulb className="h-6 w-6 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No skills yet. Skills give your AI reusable capabilities.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="border-t my-2" />

          {/* ── Rules Section ──────────────────────────────── */}
          <SectionHeader
            icon={Shield}
            title="Rules"
            count={rules.length}
            expanded={rulesSectionOpen}
            onToggle={() => setRulesSectionOpen((v) => !v)}
            onAdd={() => {
              setRulesSectionOpen(true);
              setShowRuleForm(true);
            }}
          />

          {rulesSectionOpen && (
            <div className="space-y-2 pl-1">
              {/* Rule create form */}
              {showRuleForm && (
                <InlineCreateForm
                  label="Rule"
                  placeholder="Always respond in a friendly tone.\nNever include raw SQL in responses."
                  onSubmit={handleCreateRule}
                  onCancel={() => setShowRuleForm(false)}
                />
              )}

              {/* Rule list */}
              {rules.map((rule) => (
                <SkillCard
                  key={rule.id}
                  item={rule}
                  type="rule"
                  expanded={expandedRuleId === rule.id}
                  onToggle={() =>
                    setExpandedRuleId((prev) =>
                      prev === rule.id ? null : rule.id
                    )
                  }
                  onUpdate={(content) =>
                    void updateRule(rule.id, content)
                  }
                  onDelete={() => void deleteRule(rule.id)}
                />
              ))}

              {/* Empty state */}
              {!loading && rules.length === 0 && !showRuleForm && (
                <div className="flex flex-col items-center py-6 text-center">
                  <Shield className="h-6 w-6 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No rules yet. Rules guide how your AI behaves.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
